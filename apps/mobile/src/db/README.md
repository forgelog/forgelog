# Mobile persistence boundaries

`src/db` owns SQLite connection setup, schema migration, SQL execution, row mapping, and persistence types. Other layers should depend on the narrowest approved entry point below.

## Import rules

| Import              | Production code allowed to use it                                                        | Purpose                                                                                                                          |
| ------------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `db/index`          | `src/db` infrastructure only                                                             | Open the singleton connection, initialize the schema, and create transaction-bound stores.                                       |
| `db/orm`            | `src/db/repositories/*`                                                                  | Drizzle table mappings and the executor-bound ORM adapter. `internal-docs/schema.sql` remains the migration source of truth.     |
| `db/repositories/*` | Other modules inside `src/db`                                                            | Compose executor-injected SQL operations. Repositories must never import `db/index` or acquire the global connection themselves. |
| `db/mobileStore`    | `src/application`, `src/screens`, `src/theme`, `src/sync`, and other app-facing adapters | UI-safe persistence facade backed by the default database connection. Its transaction runner is application-only.                |
| `db/types`          | Current UI, application, and persistence code                                            | Shared persisted model shapes. Moving public models out of `src/db` is a separate cleanup.                                       |

Tests may import `db/index` to create/reset an in-memory database and may import a repository directly when that repository is the subject under test. Screen, theme, and sync tests should prefer mocking or calling `mobileStore`; legacy repository mocks remain permitted while those tests are migrated.

## Layer responsibilities

- Application use cases, screens, theme code, and sync transport must not import `db/index` or `db/repositories/*`. They use `mobileStore` or another application use case.
- Application use cases own multi-repository workflows and run atomic workflows through `runInMobileStoreTransaction`.
- `mobileStore` resolves the default connection and exposes UI-safe persistence operations. Low-level workout and personal-record mutations are available only on the transaction-bound store supplied to application use cases.
- `completeSet`, `uncompleteSet`, `updateSetAndRecomputeRecords`, `deleteSet`, `deleteExerciseFromWorkout`, `discardWorkout`, and `startOrResumeWorkout` in `src/application/activeWorkout.ts` are the public, invariant-preserving workout mutation API.
- `runInMobileStoreTransaction` creates transaction-bound stores backed by Expo's exclusive transaction handle on native platforms. Web retains Expo's non-exclusive fallback because exclusive transactions are not supported there. Screens, theme code, and sync transport must not import it.
- Repository functions receive a `DatabaseExecutor` from their caller. They contain persistence queries and row mapping but do not open connections or transactions. New ORM migrations should follow the routines repository pattern while unmigrated repositories may continue to use SQL directly.
- Database initialization, schema generation, migrations, and seeding remain internal to `src/db`.

The ESLint configuration enforces the production UI/theme/sync boundary and prevents repositories from importing the global database entry point.
