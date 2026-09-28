# Backup and Restore Plan

Status: proposed. Scope: `apps/mobile` (phone). The Wear OS app stays a mirror of the phone and is not backed up.

ForgeLog stores everything in one on-device SQLite database (`forgelog-v1.db`). Nothing leaves the device except phone-to-watch sync. This plan adds three backup channels in order. Each phase ships on its own, and the earlier phases are built so the later ones slot in without rework.

| Phase | Channel | What it covers |
| --- | --- | --- |
| 1 | OS backup (Android Auto Backup and device-to-device transfer) | Reinstall and new-phone setup, with no user action |
| 2 | Versioned JSON export/import | Moving between Android and iOS, restoring an older copy, user-owned files |
| 3 | Automatic backup to the user's cloud (Drive `appDataFolder` / iCloud) | Lost phone when the user never exported, restoring from a chosen date |

## Design principles (all phases)

1. **Two restore paths, one post-restore routine.** Phase 1 restores the raw DB file. Phases 2 and 3 restore a JSON snapshot. Every path finishes by calling the same `completeRestore()` application use case, which resets watch transport state and recomputes derived data.
2. **Phase 1 backs up only files it explicitly includes.** The Android backup rules list what to back up. Anything added later (export staging files, cloud tokens, caches) is left out unless someone deliberately adds it.
3. **The snapshot format is a contract, not a table dump.** Phases 2 and 3 use one versioned JSON format that lives in `data/contracts`, gets validated with `ajv`, and has its own fixtures. It is shaped around domain concepts rather than SQL tables, so schema migrations don't force a format change.
4. **Restores never happen silently.** Phase 1 restores are detected and recorded. Phases 2 and 3 always ask the user to confirm before replacing data.
5. **Layering follows `CLAUDE.md`.** Pure serialization and upgrade logic goes in `src/domain`, SQL in `src/db/repositories`, transactional use cases in `src/application`, file and cloud transport in a new `src/backup` directory (a peer of `src/sync`), and UI in `src/screens`.

---

## Phase 1: OS-level backup

### Current state

Backup is disabled in three places, and all three have to change:

- `apps/mobile/plugins/withAndroidReleaseSigning.js` (`withAndroidSecurityDefaults`) forces `android:allowBackup="false"` on the app manifest.
- `apps/mobile/modules/wear-sync/android/src/main/AndroidManifest.xml` sets `android:allowBackup="false"` on the library's `<application>`. That attribute merges into the app manifest, and once the app sets a different value the manifest merger reports a conflict.
- `apps/wearos/app/src/main/AndroidManifest.xml` sets `allowBackup="false"`. **This one stays off**: watch data is rebuilt from the phone.

iOS already includes the app container in iCloud device backups by default. No watch pairs with iOS, so the restored-sync-state problem below applies only to Android. iOS needs no changes in this phase.

### What gets backed up

expo-sqlite stores databases in `<filesDir>/SQLite/`. The backup rules include only:

- `file` domain, `SQLite/forgelog-v1.db`, plus its `-wal` and `-shm` sidecars. A WAL-mode database without its WAL file can lose committed transactions or restore corrupted.

Everything else is left out because it isn't in the include list: cache directories (always excluded by Android), SharedPreferences (including any future `expo-secure-store` data, whose Keystore key can't be restored anyway), the installation marker described below, and future `backups/` staging directories.

Rules:

- `res/xml/forgelog_backup_rules.xml` (Android 11 and lower, `android:fullBackupContent`): `<full-backup-content>` with the `<include>` entries above.
- `res/xml/forgelog_data_extraction_rules.xml` (Android 12+, `android:dataExtractionRules`): the same includes under both `<cloud-backup disableIfNoEncryptionCapabilities="true">` and `<device-transfer>`. Requiring encryption for cloud backup is recommended because body measurements are health-adjacent data.

### Handling a restored database

A restored DB brings back the old phone's transport state:

- `workout_mailbox_state`: outbound intent and pending watch receipt for a watch the new phone may not be paired with.
- `workout_replica_state` and `active_workout_overlay`: may include an in-progress workout from whenever the last backup ran.

The rules work on whole files, so these tables can't be excluded individually. Instead the app detects a restore and cleans up after it:

1. **Installation marker.** A small JSON file `{ installation_id }` in the document directory, left out of the backup rules. It is written on first launch.
2. **Migration 6: `backup_state` table**, a single row with `id = 0`:
   ```sql
   CREATE TABLE backup_state (
     id                  INTEGER PRIMARY KEY CHECK (id = 0),
     installation_id     TEXT,     -- installation that last opened this DB
     last_restored_at    TEXT,     -- when a restore was last detected or performed
     last_restore_source TEXT CHECK (last_restore_source IN ('os', 'file', 'cloud'))
   );
   ```
   The `'file'` and `'cloud'` values are for Phases 2 and 3. Adding columns later is an append-only migration.
3. **Startup check** (`src/application/restoreDetection.ts`, run after `getDb()`):
   | Marker file | `backup_state.installation_id` | Meaning | Action |
   | --- | --- | --- | --- |
   | missing | null | Fresh install | Write marker, store its ID |
   | missing | set | **Restored by the OS** | `completeRestore('os')`, write marker, store its ID |
   | present | different ID | Restored by the OS onto an install that already had a marker (rare) | Same as above |
   | present | same ID | Normal launch | Nothing |
4. **`completeRestore(source)`** in `src/application/restore.ts`, one exclusive transaction. It is reused unchanged in Phases 2 and 3:
   - Reset `workout_mailbox_state` to its initial row, the same values migration 4 inserts.
   - Apply the active-workout policy (open question 1).
   - Record `last_restored_at` and `last_restore_source`.
   - After commit, trigger a full sync-snapshot push so a paired watch rebuilds from the restored phone.

A false-positive restore detection (for example, the marker file deleted by hand) must be harmless: `completeRestore` only resets transport state, which the phone can rebuild. Tests must cover this.

### Phase 1 work breakdown

**PR 1: Restore detection (backup still off, so this ships with no effect)**
- Add the `expo-file-system` dependency. Phase 2 needs it too.
- Migration 6 (`backup_state`) in `src/db/index.ts`, plus a repository `src/db/repositories/backupState.ts`.
- `src/backup/installationMarker.ts` (file I/O only).
- `src/application/restoreDetection.ts` and `src/application/restore.ts` (`completeRestore`).
- Real in-memory DB tests for every row of the detection table, for an idempotent second run, for mailbox reset contents, and for the active-workout policy.

**PR 2: Turn on Android backup**
- Delete `android:allowBackup` from the `wear-sync` library manifest. Libraries shouldn't make this decision for the app.
- Replace the `allowBackup = 'false'` override in `withAndroidSecurityDefaults` with a new plugin, `plugins/withAndroidBackupRules.js`, that sets `allowBackup="true"`, `fullBackupContent`, and `dataExtractionRules`, and writes both XML files into `res/xml`. Keep the manifest-edit logic in a pure exported function so Jest can test it without prebuild.
- CI: after `expo prebuild` and a Gradle build in `mobile.yml`, assert that the merged release manifest contains `allowBackup="true"` and both rules attributes. Otherwise a future library that sets `allowBackup="false"` would quietly turn backup back off.
- Update `docs/privacy-policy.md`: data may be included in the user's Android backup to their Google account, encrypted, and never sent to ForgeLog.

**Manual verification** (write it up in the PR, since it can't run in CI):
1. Log workouts, then run `adb shell bmgr backupnow dev.bishnoi.forgelog.mobile`.
2. Uninstall and reinstall. Data should be present, `backup_state.last_restore_source = 'os'`, and the watch should resync.
3. Repeat with an in-progress workout to check the active-workout policy.
4. Check the backup size with `adb shell dumpsys backup`. It should be far below 25 MB.

---

## Phase 2: Versioned JSON export and import

### Contract

Add `data/contracts/backup.schema.json`, separate from `sync.schema.json` because it has a different lifecycle and different consumers.

```jsonc
{
  "format": "forgelog-backup",          // constant; identifies the file
  "format_version": 1,                  // integer; see versioning rules
  "snapshot_id": "uuid",                // unique per export (Phase 3 uses it to skip duplicate uploads)
  "exported_at": "2026-09-28T10:00:00Z",
  "content_sha256": "hex",              // hash of canonical `data`; Phase 3 uses it to compare with the cloud
  "source": {
    "app_version": "0.1.5",
    "platform": "android",
    "db_schema_version": 6              // informational only, never used for decisions
  },
  "data": {
    "profile": { /* units, bodyweight, theme, … */ },
    "custom_exercises": [ /* full rows; is_custom = 1 and history placeholders */ ],
    "routines": [ { "id": "…", "name": "…", "exercises": [ { "exercise_id": "…", "sets": [ … ] } ] } ],
    "workouts": [ { "id": "…", "started_at": "…", "ended_at": "…", "exercises": [ { "exercise_id": "…", "sets": [ … ] } ] } ],
    "workout_overrides": [ { "workout_id": "…", "name_override": "…", "deleted": false } ],
    "measurements": [ { "id": "…", "type": "bodyweight", "value": 80.5, "measured_at": "…" } ]
  }
}
```

**Included:** user-authored data only, in canonical units (kg, cm, %) as stored.

**Excluded, because it's derived or device-specific:**
- `personal_records` and `personal_record_events`: recomputed on import with the existing `backfillPersonalRecordState`.
- Seeded exercises: they have stable IDs from `exercises.seed.json` (for example `Ab_Crunch_Machine`), so the snapshot refers to them by ID. Import fails validation if a referenced ID is neither in the current seed nor in `custom_exercises`.
- `measurement_types`: seeded by migration 2.
- `workout_replica_state`, `workout_mailbox_state`, `active_workout_overlay`: transport state.
- The active (unfinished) workout (open question 1).

Workouts and routines are nested (workout → exercises → sets), not one array per table. Future table splits or renames then stay inside the repository mapping and don't change the format.

### Versioning rules

- `format_version` is a single integer, and importers read every version up to and including the current one.
- **Adding an optional field** keeps the same version. Importers ignore unknown fields in known versions, so older apps can still read the file.
- **Anything else** (renamed, removed, or newly required fields, or a changed meaning) bumps the version and adds a pure upgrade step, `upgradeV1toV2(snapshot)`, in `src/domain/backup/upgrades.ts`. Import runs the chain from the file's version up to current.
- A file with a version newer than the app supports is rejected with "This backup was made by a newer ForgeLog. Update the app to restore it." It is never partially imported.
- `db_schema_version` is never used for decisions. The DB schema and the backup format change independently.

### Validation (mirrors the sync contract)

1. **Structure:** ajv against `backup.schema.json`.
2. **Meaning:** a pure function in `src/domain/backup/validate.ts` checks unique IDs, that every `exercise_id` resolves, that numbers are finite and non-negative where the DB `CHECK`s require it, and that timestamps parse.
3. **Drift guard:** extend the existing `validatorDrift` pattern so the schema, TypeScript types, and fixtures can't drift apart.
4. **Fixtures** in `data/contracts/fixtures/`: `backup-v1.json`, `backup-v1-minimal.json` (empty data), `malformed-backup.json`, `future-version-backup.json`, `backup-v1-dangling-exercise.json`.

### Restore semantics

- **Replace everything.** Merging brings ID-collision and conflict problems that aren't worth solving for a backup feature.
- Flow: pick file → parse → upgrade → validate → show a summary ("42 workouts, 6 routines, 120 measurements from 12 Sep 2026. This replaces all data on this phone.") → confirm → **write a safety snapshot of the current data to the cache directory** → one exclusive transaction that clears user tables, inserts the snapshot, and recomputes PRs → `completeRestore('file')`.
- If anything fails, the transaction rolls back and the current data is untouched. The safety snapshot allows an "Undo restore" action for the rest of the session.

### Layering

| Layer | File | Responsibility |
| --- | --- | --- |
| `data/contracts` | `backup.schema.json`, fixtures | Source of truth for the format |
| `src/domain/backup` | `format.ts`, `serialize.ts`, `upgrades.ts`, `validate.ts`, `hash.ts` | Pure: types, canonical JSON, upgrade chain, meaning checks |
| `src/db/repositories` | `backupSnapshot.ts` | `readAllUserData(db)` and `replaceAllUserData(db, data)`; all SQL stays here |
| `src/application` | `backup.ts` | `exportSnapshot()`, `importSnapshot()`, which calls `completeRestore('file')` |
| `src/backup` | `fileTransport.ts` | Write to a staging dir, share via `expo-sharing`, pick via `expo-document-picker` |
| `src/screens` | `SettingsScreen.tsx` | "Backup & restore" section: Export, Import, last backup/restore info |

New dependencies: `expo-sharing`, `expo-document-picker` (`expo-file-system` comes in Phase 1).

File name: `forgelog-backup-YYYY-MM-DD.json`. Compression isn't needed at current sizes and can be added later as a transport-level concern without a format bump.

### Phase 2 work breakdown

- **PR 3: Contract and domain.** Schema, fixtures, serializer, upgrade scaffold, meaning validation, drift guard. Pure tests only.
- **PR 4: Repository and application.** `readAllUserData`/`replaceAllUserData` and export/import use cases, with real in-memory DB tests: a **round trip** (seed data → export → import into a fresh DB → export again, compared byte for byte excluding `snapshot_id` and `exported_at`), rollback on a mid-insert failure, PR recompute, and `completeRestore` being called.
- **PR 5: UI and transport.** Settings section, share and picker integration, confirmation and summary sheet, a `SettingsScreen.flows.test.tsx` real-DB flow, and a Maestro flow for export (import goes through the system picker and is checked manually).
- Optional follow-up: CSV export of workouts and sets for spreadsheets. Export only, not a restore format.

---

## Phase 3: Automatic backup to the user's cloud (outline)

A detailed plan comes after Phase 2 ships. The earlier phases already provide:

- **Transport interface** in `src/backup/destination.ts`: `list()`, `upload(snapshot)`, `download(id)`, `delete(id)`. Phase 2's file transport is the first implementation. Google Drive `appDataFolder` and iCloud come later.
- **Snapshot content:** unchanged. Uploads are the same JSON. `snapshot_id` and `content_sha256` let the scheduler skip unchanged uploads and let restore compare local and remote copies.
- **Scheduler:** back up after a workout finishes (reliable on both platforms) plus an opportunistic daily run via `expo-background-task`. Keep the last N snapshots.
- **"Newer backup available" prompt:** after an OS restore (`last_restore_source = 'os'`) or on first launch of a fresh install, compare the newest remote `exported_at` with local data and offer a restore through the same `importSnapshot()` path (`completeRestore('cloud')`).
- **Secrets:** OAuth tokens go in `expo-secure-store`. They're automatically left out of OS backup because Phase 1 includes only listed files.
- **Privacy policy:** update again for the cloud destination.

---

## Open questions

1. **Restored in-progress workout.** Should a restore (any source) keep it (user can resume or discard; phone-only because the mailbox is reset) or discard it? **Recommendation: discard for OS restores**, since it's at least hours old and likely already finished on the old phone, and leave it out of JSON snapshots.
2. **Watch backup.** Keep `allowBackup="false"` on Wear OS? **Recommendation: yes**, the watch rebuilds from the phone.
3. **Encryption-only cloud backup** (`disableIfNoEncryptionCapabilities="true"`). Recommended for health-adjacent data. The trade-off is no OS backup on devices without a screen lock.
4. **iOS scope.** iCloud device backup already works. Should Phase 2 export/import be tested and shipped on iOS in the same release, or Android first?

## Definition of done for every PR

- Scoped to the owning layer, as described in `CLAUDE.md`.
- Append-only migrations, with no edits to `src/db/schema.ts`.
- Focused tests first, then `pnpm test`, `pnpm run typecheck`, and `pnpm run lint` in `apps/mobile`.
- Contract changes update the schema, fixtures, validators, and tests together.
