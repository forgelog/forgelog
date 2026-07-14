# Mobile Database Improvement Checklist

Tracking checklist for the Expo SQLite database in `apps/mobile`.

Wear OS persistence is intentionally out of scope. Complete items in order unless a task explicitly has no dependency on an earlier phase. Prefer one focused pull request per checkbox or tightly related group.

## Definition of done for every database change

- [ ] Keep SQL in `src/db` and multi-repository orchestration in `src/application`.
- [ ] Update `internal-docs/schema.sql` when the current schema changes.
- [ ] Run `cd apps/mobile && pnpm run generate:schema` after schema changes.
- [ ] Add or update a migration for existing installs.
- [ ] Add real in-memory SQLite tests for the changed behavior.
- [ ] Run focused tests, then `pnpm run check:generated`, `pnpm run typecheck`, `pnpm run lint`, and `pnpm test`.

## 1. Establish the persistence boundary

- [x] Define a minimal database executor interface shared by the database connection and transaction handles.
- [x] Make repository operations accept an executor instead of reacquiring the global database internally.
- [x] Add a transaction API that supplies a transaction-bound facade/store to its callback.
- [x] Use Expo's exclusive transaction handle for application writes that must be isolated.
- [x] Move the remaining raw SQL in `src/application/activeWorkout.ts` into the owning repository modules.
- [x] Decide and document which layers may import `db/index`, repository modules, and `mobileStore`.
- [x] Add an ESLint restriction or architecture test that prevents screens, theme code, and sync transport from bypassing the approved entry point.
- [ ] Curate the public facade so invariant-breaking primitives are not available to UI callers.
- [ ] Keep safe use cases such as completing a set, deleting a set, and discarding a workout as the public mutation API.

### Acceptance checks

- [x] No production code outside the approved persistence layer imports `db/index` or `db/repositories/*`.
- [x] No transaction callback calls a repository that silently reacquires the global database.
- [ ] Concurrent transaction tests demonstrate isolation and rollback behavior.

## 2. Make migrations release-safe

- [ ] Replace the conditional migration chain with ordered, numbered migrations.
- [ ] Update `PRAGMA user_version` atomically with each successful migration.
- [ ] Ensure a failed migration can be retried without duplicate-column or partial-schema failures.
- [ ] Record which schema versions have shipped to real users and must remain upgradeable.
- [ ] Decide how installs below schema version 7 will be handled without the current destructive rebuild.
- [ ] Remove or tightly gate `rebuildDevSchema` so release builds cannot erase user data.
- [ ] Add migration fixtures for every supported starting version through the latest version.
- [ ] Add failure-injection tests that interrupt a migration and reopen the database.
- [ ] Run `PRAGMA foreign_key_check` after migrations in tests.
- [ ] Keep fresh-schema creation and migrated schemas structurally equivalent.

### Acceptance checks

- [ ] Every supported historical database upgrades to the latest version without data loss.
- [ ] Reopening after an interrupted migration succeeds.
- [ ] Fresh and migrated schemas pass the same schema assertions.

## 3. Enforce workout and transaction invariants

- [ ] Enforce at most one active workout at the database level.
- [ ] Make start-or-resume a single transactional operation that handles the uniqueness race.
- [ ] Add a concurrent start test using two overlapping calls.
- [ ] Derive an exercise ID from the set or workout-exercise row instead of accepting a separate caller-supplied ID for record recomputation.
- [ ] Make set completion and personal-record recomputation one atomic use case.
- [ ] Make set deletion, workout-exercise deletion, and workout deletion atomic with record maintenance.
- [ ] Review `personal_records.logged_set_id` deletion behavior and choose an explicit `ON DELETE` policy.
- [ ] Check affected-row counts where a missing target should be treated as an error rather than a silent no-op.

### Acceptance checks

- [ ] Concurrent starts cannot create duplicate active workouts.
- [ ] A failed record recomputation rolls back the associated workout mutation.
- [ ] Public mutations cannot leave the personal-record cache inconsistent.

## 4. Correct historical bodyweight calculations

- [ ] Choose the historical snapshot location, preferably `workouts.bodyweight_kg`.
- [ ] Add the schema column and a non-destructive migration/backfill policy.
- [ ] Snapshot the current profile bodyweight when a workout starts.
- [ ] Use each workout's bodyweight snapshot when computing historical volume and estimated 1RM.
- [ ] Define behavior for old workouts whose bodyweight snapshot is unknown.
- [ ] Ensure editing the current profile does not retroactively rewrite historical bodyweight metrics.
- [ ] Add weighted- and assisted-bodyweight tests spanning multiple workouts and profile weight changes.

### Acceptance checks

- [ ] Historical PR results remain stable after the current profile weight changes.
- [ ] New workouts consistently capture the intended bodyweight value.

## 5. Strengthen schema constraints

- [ ] Add `CHECK` constraints for stored booleans such as `is_custom` and `completed`.
- [ ] Add `CHECK` constraints for set types, record types, theme mode, and other closed enums.
- [ ] Add appropriate non-negative or range constraints for positions, reps, durations, distances, rest time, weight, and RPE.
- [ ] Define and enforce the relationship between `completed` and `completed_at` for new data.
- [ ] Decide whether parent/position pairs must be unique for routines, exercises, and sets.
- [ ] If positions become unique, make reordering safe with a two-phase or equivalent update strategy.
- [ ] Add indexes required by foreign-key child columns used during deletes.
- [ ] Add constraint tests for malformed direct writes and invalid sync payloads.

## 6. Remove N+1 and unbounded reads

- [ ] Batch routine detail loading instead of querying the exercise and sets once per routine exercise.
- [ ] Replace `listRoutineSummaries` detail hydration with an aggregate or batched query.
- [ ] Batch workout detail loading instead of querying each exercise and its sets separately.
- [ ] Batch sync snapshot reads rather than loading every routine and record individually.
- [ ] Apply the `getSessionsForExercise` limit in SQL before loading sets and events.
- [ ] Add keyset or bounded pagination to workout history.
- [ ] Avoid loading all historical dates and sets when only summary data is needed.
- [ ] Add representative query-count or performance regression tests.

## 7. Add query-oriented indexes

- [ ] Add an index for routine ordering.
- [ ] Change routine-exercise lookup to an index on `(routine_id, position)`.
- [ ] Change routine-set lookup to an index on `(routine_exercise_id, position)`.
- [ ] Change workout-exercise lookup to an index on `(workout_id, position)`.
- [ ] Change logged-set lookup to an index on `(workout_exercise_id, position)`.
- [ ] Add indexes needed by exercise-history and previous-session queries.
- [ ] Add missing indexes for `workouts.routine_id` and personal-record foreign-key lookups.
- [ ] Verify important plans with `EXPLAIN QUERY PLAN` and confirm unnecessary temporary sorts are gone.
- [ ] Benchmark before adding search-specific indexing for the exercise catalog.

## 8. Improve schema-to-TypeScript safety

- [ ] Separate raw SQLite row types from application/domain models.
- [ ] Replace broad `string` fields with domain unions where values are constrained.
- [ ] Centralize exercise row mapping instead of duplicating it across repositories.
- [ ] Avoid `SELECT *` in stable public queries; select and alias required columns explicitly.
- [ ] Add safe parsing and validation for JSON-backed columns.
- [ ] Reduce duplication between SQL enum constraints, TypeScript unions, validators, and sync contracts.
- [ ] Evaluate lightweight query/type generation before considering a full ORM migration.

## 9. Version exercise seed data

- [ ] Replace the "any seeded row exists" shortcut with a seed/catalog version.
- [ ] Insert newly added catalog exercises for existing users.
- [ ] Define which seeded fields may be corrected by a catalog update.
- [ ] Never overwrite custom exercises or user-owned data during catalog updates.
- [ ] Add tests for first install, catalog additions, catalog corrections, and interrupted seeding.

## 10. Operational hardening

- [ ] Evaluate WAL mode for the mobile connection and document the decision.
- [ ] Configure and test lock/busy handling if multiple SQLite connections are introduced.
- [ ] Decide how a rejected database initialization promise can be retried without restarting the app.
- [ ] Add database-open diagnostics that do not expose personal workout data.
- [ ] Add periodic integrity checks only if they have a clear recovery path and acceptable startup cost.
- [ ] Document backup/export expectations before adding cloud synchronization.

## Deferred / explicitly out of scope

- [ ] Wear OS database removal and JSON persistence design.
- [ ] Wear OS snapshot replacement and outbox durability.
- [ ] Backend or Supabase synchronization schema.
- [ ] Full ORM adoption unless raw SQL maintenance becomes a demonstrated problem.
