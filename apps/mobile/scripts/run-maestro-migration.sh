#!/usr/bin/env bash
set -euo pipefail

APP_ID="${APP_ID:-dev.bishnoi.forgelog.mobile}"
PREVIOUS_APK_ASSET="${PREVIOUS_APK_ASSET:-forgelog-mobile-release.apk}"
SEED_FLOW="${MIGRATION_SEED_FLOW:-.maestro/migration-seed-v0.1.yaml}"
VERIFY_FLOW="${MIGRATION_VERIFY_FLOW:-.maestro/migration.yaml}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MOBILE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ROOT_DIR="$(cd "$MOBILE_DIR/../.." && pwd)"

CURRENT_APK="${CURRENT_APK:-${1:-}}"
PREVIOUS_APK="${PREVIOUS_APK:-}"
RELEASE_TAG="${RELEASE_TAG:-}"
OUTPUT_DIR="${MAESTRO_OUTPUT_DIR:-$ROOT_DIR/artifacts/maestro-migration}"

if [[ -z "$CURRENT_APK" ]]; then
  echo "CURRENT_APK or first argument must point to the APK that should upgrade the previous install." >&2
  exit 2
fi

if [[ ! -f "$CURRENT_APK" ]]; then
  echo "Current APK not found: $CURRENT_APK" >&2
  exit 2
fi

if [[ -n "${MAESTRO_CMD:-}" ]]; then
  # shellcheck disable=SC2206
  MAESTRO=($MAESTRO_CMD)
elif command -v maestro >/dev/null 2>&1; then
  MAESTRO=(maestro)
elif command -v mise >/dev/null 2>&1; then
  MAESTRO=(mise exec maestro -- maestro)
else
  echo "maestro is required. Install it with mise or set MAESTRO_CMD." >&2
  exit 2
fi

TMP_DIR="$(mktemp -d)"
cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

if [[ -z "$PREVIOUS_APK" ]]; then
  if ! command -v gh >/dev/null 2>&1; then
    echo "gh is required to download $PREVIOUS_APK_ASSET when PREVIOUS_APK is not set." >&2
    exit 2
  fi

  mkdir -p "$TMP_DIR/previous"
  if [[ -n "$RELEASE_TAG" ]]; then
    gh release download "$RELEASE_TAG" --pattern "$PREVIOUS_APK_ASSET" --dir "$TMP_DIR/previous" --clobber
  else
    gh release download --pattern "$PREVIOUS_APK_ASSET" --dir "$TMP_DIR/previous" --clobber
  fi
  PREVIOUS_APK="$TMP_DIR/previous/$PREVIOUS_APK_ASSET"
fi

if [[ ! -f "$PREVIOUS_APK" ]]; then
  echo "Previous APK not found: $PREVIOUS_APK" >&2
  exit 2
fi

mkdir -p "$OUTPUT_DIR/seed" "$OUTPUT_DIR/verify"

echo "Installing previous APK: $PREVIOUS_APK"
adb uninstall "$APP_ID" >/dev/null 2>&1 || true
adb install -r "$PREVIOUS_APK"

echo "Seeding upgrade data with $SEED_FLOW"
(
  cd "$MOBILE_DIR"
  "${MAESTRO[@]}" test \
    --format JUNIT \
    --output "$OUTPUT_DIR/seed/junit.xml" \
    --debug-output "$OUTPUT_DIR/seed/debug" \
    --test-output-dir "$OUTPUT_DIR/seed/test-output" \
    "$SEED_FLOW"
)

echo "Upgrading to current APK: $CURRENT_APK"
adb install -r "$CURRENT_APK"

echo "Verifying migrated data with $VERIFY_FLOW"
(
  cd "$MOBILE_DIR"
  "${MAESTRO[@]}" test \
    --format JUNIT \
    --output "$OUTPUT_DIR/verify/junit.xml" \
    --debug-output "$OUTPUT_DIR/verify/debug" \
    --test-output-dir "$OUTPUT_DIR/verify/test-output" \
    "$VERIFY_FLOW"
)
