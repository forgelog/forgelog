import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '../theme/ThemeContext';

type Variant = 'filled' | 'outlined' | 'dark';

type Props = Readonly<{
  label: string;
  onPress: () => void;
  variant?: Variant;
  icon?: ReactNode;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
  accessibilityLabel?: string;
  testID?: string;
}>;

export function PillButton({
  label,
  onPress,
  variant = 'filled',
  icon,
  style,
  disabled,
  accessibilityLabel,
  testID,
}: Props) {
  const c = useTheme();

  let backgroundColor = 'transparent';
  if (variant === 'filled') {
    backgroundColor = c.accent;
  } else if (variant === 'dark') {
    backgroundColor = c.fg;
  }
  const borderColor = variant === 'outlined' ? c.chipbd : backgroundColor;
  let textColor = '#fff';
  if (variant === 'outlined') {
    textColor = c.fg;
  } else if (variant === 'dark') {
    textColor = c.bg;
  }

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityRole="button"
      testID={testID}
      style={[
        styles.base,
        { backgroundColor, borderColor, opacity: disabled ? 0.5 : 1 },
        style,
      ]}
    >
      {icon}
      <Text style={[styles.text, { color: textColor }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 999,
    borderWidth: 1,
  },
  text: { fontSize: 15, fontWeight: '700' },
});
