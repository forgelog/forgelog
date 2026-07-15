# Contributing

## Manual Testing in an Emulator

### Running the app

```bash
# iOS
cd apps/mobile && pnpm run ios

# Android
cd apps/mobile && pnpm run android
```

After the first native build, you can skip the rebuild and just start the JS bundler:

```bash
cd apps/mobile && pnpm start
# then press i (iOS) or a (Android)
```

---

### iOS Simulator

```bash
# List simulators
xcrun simctl list devices

# Boot
xcrun simctl boot "iPhone 16"

# Open the Simulator app
open -a Simulator

# Shutdown
xcrun simctl shutdown "iPhone 16"

# Reset (erase all content)
xcrun simctl erase "iPhone 16"

# Create a new simulator
xcrun simctl create "My iPhone 16" "iPhone 16" "iOS-18-5"

# List available device types and runtimes
xcrun simctl list devicetypes
xcrun simctl list runtimes

# Delete
xcrun simctl delete "iPhone 16"
```

---

### Android Emulator

CI uses **Pixel 7 · API 34 · x86_64 · google_apis** — match this locally for the closest parity.

```bash
# List AVDs
emulator -list-avds

# Start emulator
emulator -avd <avd_name>

# Cold boot (no snapshot restore)
emulator -avd <avd_name> -no-snapshot-load

# Wipe data (factory reset)
emulator -avd <avd_name> -wipe-data

# List running devices
adb devices

# Reboot running emulator
adb reboot

# Kill running emulator
adb emu kill
```

**Create an AVD matching CI:**

```bash
# Install the system image
sdkmanager "system-images;android-34;google_apis;x86_64"

# Create AVD
avdmanager create avd \
  --name "Pixel_7_API_34" \
  --device "pixel_7" \
  --package "system-images;android-34;google_apis;x86_64"

# Delete AVD
avdmanager delete avd --name "Pixel_7_API_34"
```

Make sure `$ANDROID_HOME/emulator` and `$ANDROID_HOME/platform-tools` are on your `$PATH`.
