import { Pressable, StyleSheet, Text } from 'react-native';

import { useTheme } from '../theme/ThemeContext';
import { Icon } from './Icon';

type Props = Readonly<{
  label: string;
  selected?: boolean;
  onPress: () => void;
  showCheck?: boolean;
  accessibilityLabel?: string;
  testID?: string;
}>;

export function Chip({ label, selected, onPress, showCheck, accessibilityLabel, testID }: Props) {
  const c = useTheme();

  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      testID={testID}
      style={[
        styles.chip,
        {
          borderColor: selected ? c.accent : c.chipbd,
          backgroundColor: selected ? c.asoft : 'transparent',
        },
      ]}
    >
      {selected && showCheck ? <Icon name="check" size={14} variant="accent" /> : null}
      <Text style={[styles.text, { color: selected ? c.accent : c.fg }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    borderWidth: 1,
  },
  text: { fontSize: 13, fontWeight: '600', textTransform: 'capitalize' },
});
