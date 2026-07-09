import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Appearance, type ColorSchemeName } from 'react-native';

import { getThemeMode, setThemeMode as persistThemeMode, type ThemeMode } from '../db/repositories/profile';
import { darkColors, lightColors, type ColorScheme } from './colors';

export type { ThemeMode };

type SystemScheme = ColorSchemeName | null | undefined;

export function resolveColors(mode: ThemeMode, systemScheme: SystemScheme): ColorScheme {
  const effective = mode === 'system' ? systemScheme : mode;
  return effective === 'dark' ? darkColors : lightColors;
}

type ThemeContextValue = ColorScheme & {
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
};

const defaultValue: ThemeContextValue = {
  ...lightColors,
  themeMode: 'system',
  setThemeMode: () => {},
};

const ThemeContext = createContext<ThemeContextValue>(defaultValue);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeMode, setThemeModeState] = useState<ThemeMode>('system');
  const [systemScheme, setSystemScheme] = useState<SystemScheme>(Appearance.getColorScheme());

  useEffect(() => {
    getThemeMode().then(setThemeModeState);
  }, []);

  useEffect(() => {
    const subscription = Appearance.addChangeListener(({ colorScheme }) => {
      setSystemScheme(colorScheme);
    });
    return () => subscription.remove();
  }, []);

  const setThemeMode = useCallback((mode: ThemeMode) => {
    setThemeModeState(mode);
    persistThemeMode(mode).catch((error) => {
      console.error('Failed to persist theme mode', error);
    });
  }, []);

  const colors = useMemo(() => resolveColors(themeMode, systemScheme), [themeMode, systemScheme]);

  const value = useMemo<ThemeContextValue>(
    () => ({ ...colors, themeMode, setThemeMode }),
    [colors, themeMode, setThemeMode]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
