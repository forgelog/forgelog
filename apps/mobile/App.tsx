import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { AppState, Platform } from 'react-native';

import { checkForOsRestore } from './src/application/restore';
import { fileInstallationMarker } from './src/backup/installationMarker';
import { RootNavigator } from './src/navigation/RootNavigator';
import {
  initWearSync,
  publishSyncSnapshot,
  refreshWorkoutMailbox,
} from './src/sync/wearSync';
import { ThemeProvider } from './src/theme/ThemeContext';

// OS backup is Android-only for now; iOS restore detection is deferred.
const needsRestoreCheck = Platform.OS === 'android';

let restoreCheck: Promise<void> | null = null;

// Memoized so a remounted effect never races two marker writes.
function runRestoreCheck(): Promise<void> {
  restoreCheck ??= checkForOsRestore(fileInstallationMarker).then(
    () => undefined,
    () => {
      // Detection is best-effort; a failed check retries on the next launch.
    }
  );
  return restoreCheck;
}

export default function App() {
  const [restoreChecked, setRestoreChecked] = useState(!needsRestoreCheck);

  useEffect(() => {
    if (restoreChecked) return;
    let cancelled = false;
    void runRestoreCheck().then(() => {
      if (!cancelled) setRestoreChecked(true);
    });
    return () => {
      cancelled = true;
    };
  }, [restoreChecked]);

  useEffect(() => {
    if (!restoreChecked) return;
    initWearSync();
    publishSyncSnapshot();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refreshWorkoutMailbox();
    });
    return () => subscription.remove();
  }, [restoreChecked]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <KeyboardProvider>
        <ThemeProvider>{restoreChecked ? <RootNavigator /> : null}</ThemeProvider>
        <StatusBar style="auto" />
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}
