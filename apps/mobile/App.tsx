import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { AppState } from 'react-native';

import { RootNavigator } from './src/navigation/RootNavigator';
import {
  initWearSync,
  publishSyncSnapshot,
  refreshWorkoutMailbox,
} from './src/sync/wearSync';
import { ThemeProvider } from './src/theme/ThemeContext';

export default function App() {
  useEffect(() => {
    initWearSync();
    publishSyncSnapshot();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refreshWorkoutMailbox();
    });
    return () => subscription.remove();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <KeyboardProvider>
        <ThemeProvider>
          <RootNavigator />
        </ThemeProvider>
        <StatusBar style="auto" />
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}
