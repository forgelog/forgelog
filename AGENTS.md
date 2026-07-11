# ForgeLog Agent Guide

## Repo Map

- `apps/mobile`: Expo React Native app in TypeScript.
- `apps/wearos`: Wear OS app in Kotlin and Jetpack Compose.
- `data/contracts`: Shared sync schema and fixtures. Treat this as the contract source of truth for both suites.
- `apps/mobile/modules/wear-sync`: Expo native bridge for phone-to-watch sync.
- `internal-docs/schema.sql`: Source SQL schema for the mobile generated schema file.

## Mobile Layers

- `src/domain`: Pure logic with no persistence, navigation, or React dependencies.
- `src/db`: SQLite setup, schema, seed data, and persistence types.
- `src/db/repositories`: SQL-backed repository APIs. Keep SQL details here.
- `src/application`: Transactional use cases that coordinate repositories.
- `src/screens`: React Native UI and navigation-facing screen behavior.
- `src/sync`: Transport payloads, sync orchestration, and payload validation.
- `src/validation`: Input parsing and sanitization helpers.
- `src/test-utils`: Shared test helpers. Do not place helpers under `__tests__`.

## Mobile Tests

- Default to real in-memory DB tests for new behavior. `__mocks__/expo-sqlite.js` uses `better-sqlite3`.
- Screen files use `<Screen>.test.tsx` for the mocked legacy style.
- Real DB navigation flows use `<Screen>.flows.test.tsx`.
- Do not mix hoisted `jest.mock()` screen tests with real DB flow tests in the same file.
- Prefer user-visible assertions over repository mock-call assertions in new screen coverage.
- Put pure logic tests next to domain code under `src/domain/__tests__`.
- Repository tests live beside their repository under `src/db/repositories/__tests__`.
- Use `src/test-utils/db.ts`, `src/test-utils/render.tsx`, and `src/test-utils/async.ts` for helpers shared by multiple tests.
- Contract fixtures in `data/contracts/fixtures` and the `validatorDrift` guard are the interim protection until schema codegen exists.

## Generated Files

- `apps/mobile/src/db/schema.ts` is generated from `internal-docs/schema.sql`.
- Never hand-edit generated schema output.
- Run `cd apps/mobile && npm run generate:schema` after schema SQL changes.
- Run `cd apps/mobile && npm run check:generated` to verify generated output is current.

## Mobile Commands

- `cd apps/mobile && npm test`
- `cd apps/mobile && npm run typecheck`
- `cd apps/mobile && npm run lint`
- `cd apps/mobile && npm run test:e2e`
- `cd apps/mobile && npm test -- --ci --coverage`
- `cd apps/mobile && npm run check:coverage`

## Wear OS Tests

- UI lives in `apps/wearos/app/src/main/java/dev/bishnoi/forgelog/wear/ui`.
- Pure Wear logic lives in `apps/wearos/app/src/main/java/dev/bishnoi/forgelog/wear/logic`.
- Per-screen Compose tests live in the matching `androidTest` package.
- Shared Compose test rule extensions live in `ComposeTestHelpers.kt`.
- Unit tests: `cd apps/wearos && ./gradlew testDebugUnitTest`.
- Compose androidTest compile: `cd apps/wearos && ./gradlew compileDebugAndroidTestKotlin`.
- Full instrumented verification runs through the Gradle managed device task in CI.

## Sync Contracts

- Both apps consume the contract shape from `data/contracts`.
- When sync payloads change, update the schema, fixtures, validators, and both mobile and Wear tests together.
- Keep version-skew and malformed-payload fixtures current.

## Working Rules

- Keep changes scoped to the layer that owns the behavior.
- Move pure calculations into `domain` or Wear `logic` before reusing them from UI or repositories.
- Preserve existing test style when reorganizing; do not convert mocked tests to real DB tests as part of a file move.
- Prefer small focused files with one obvious subject over phase- or plan-history test names.
- Before opening a PR, run the focused tests for the touched area, then the broader mobile or Wear commands above.
