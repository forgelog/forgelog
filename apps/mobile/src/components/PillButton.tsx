import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '../theme/ThemeContext';

type Variant = 'filled' | 'outlined' | 'dark';

type Props = {
  label: string;
  onPress: () => void;
  variant?: Variant;
  icon?: ReactNode;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
};

export function PillButton({ label, onPress, variant = 'filled', icon, style, disabled }: Props) {
  const c = useTheme();

  const backgroundColor =
    variant === 'filled' ? c.accent : variant === 'dark' ? c.fg : 'transparent';
  const borderColor = variant === 'outlined' ? c.chipbd : backgroundColor;
  const textColor = variant === 'outlined' ? c.fg : variant === 'dark' ? c.bg : '#fff';

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
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
