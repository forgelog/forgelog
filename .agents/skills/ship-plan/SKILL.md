---
name: ship-plan
description: End-to-end workflow for implementing, reviewing, testing, and merging a plan
version: 1.0.0
---

Complete workflow for shipping a planned feature or fix: branch → implement with TDD → peer review → emulator verify → PR → CodeRabbit → merge.

## Project context

- **Mobile app** (Expo/React Native): `apps/mobile/` — package `dev.bishnoi.forgelog.mobile`
- **Wear OS app** (Kotlin/Gradle): `apps/wearos/` — package `dev.bishnoi.forgelog.mobile` (same package, different AVD)
- **Android AVD**: `Pixel_8` — use for mobile app
- **Wear OS AVD**: `Wear_OS_5` — use for wearos app
- Both AVDs share the same package name, so always install to the right one

## Step 1 — Create a branch

```bash
git checkout main && git pull
git checkout -b <feature-branch-name>
```

Branch naming: `feat/<topic>`, `fix/<topic>`, `chore/<topic>`.

## Step 2 — Implement with TDD

Follow TDD strictly for every change:

1. Write a failing test that validates the desired behaviour
2. Run the test — confirm it fails
3. Write only enough code to make it pass
4. Run the test — confirm it passes
5. Refactor if needed, keeping tests green

**Mobile tests** (run from `apps/mobile/`):

```bash
cd apps/mobile && npx jest            # all tests
cd apps/mobile && npx jest <pattern>  # single file/pattern
```

**Wear OS tests** (run from `apps/wearos/`):

```bash
cd apps/wearos && ./gradlew test                       # unit tests
cd apps/wearos && ./gradlew connectedAndroidTest       # instrumented (needs AVD running)
```

Keep iterating until all existing and new tests pass.

## Step 3 — Peer review (unbiased agent)

Spawn a fresh subagent with no context from the current session to review the diff:

```
Agent({
  description: "Peer review of implementation diff",
  subagent_type: "code-reviewer",
  prompt: `Review the following diff for correctness bugs, simplification opportunities, and efficiency issues.
Context: <brief description of the feature/fix>
Diff:
<paste git diff output>

Report only findings that are real defects or clear improvements. Ignore style nits.`
})
```

Work only on **confirmed/plausible findings** — skip anything vague or subjective. Rerun tests after applying fixes.

## Step 4 — Verify in emulator

Only needed for non-trivial or UI changes.

**Start the correct AVD first:**

```bash
# Mobile
emulator -avd Pixel_8 &

# Wear OS
emulator -avd Wear_OS_5 &
```

**Install and run — Mobile:**

```bash
cd apps/mobile
npx expo run:android
```

Expo installs to the running `Pixel_8` AVD automatically. Exercise the affected flow in the emulator and confirm the golden path works.

**Install and run — Wear OS:**

```bash
cd apps/wearos
./gradlew installDebug
```

`adb` targets the running `Wear_OS_5` AVD. If both AVDs are running simultaneously, specify the device:

```bash
adb -s <wear_os_serial> shell am start -n dev.bishnoi.forgelog.mobile/.MainActivity
```

Get serials with `adb devices`.

## Step 5 — Commit and push

Review staged files carefully before committing:

```bash
git diff --stat HEAD   # see what changed
git add <specific files only>
git commit -m "<concise message>"
git push -u origin <branch>
```

Do not use `git add -A` or `git add .` — stage files individually.

## Step 6 — Create PR

```bash
gh pr create --title "<short title under 70 chars>" --body "$(cat <<'EOF'
## Summary
- <bullet points>

## Test plan
- [ ] Unit tests pass
- [ ] Verified in emulator (if applicable)
EOF
)"
```

## Step 7 — Wait for CodeRabbit review

CodeRabbit auto-posts review comments after PR creation. Wait for it to finish — typically 2–5 minutes.

```bash
# Poll until review comments appear
gh pr view --comments
```

Work on **valid findings only** — skip false positives and nits. Apply fixes, rerun tests, and if changes are non-trivial, re-verify in the emulator. Then push:

```bash
git push
```

## Step 8 — Wait for CI and merge

```bash
# Watch CI status
gh pr checks --watch

# Once all checks are green:
gh pr merge --squash --delete-branch
```

Then sync local main:

```bash
git checkout main && git pull
```
