import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../theme/ThemeContext';
import { Icon } from './Icon';

type Props = Readonly<{
  title: string;
  onLeadingPress: () => void;
  leading?: 'close' | 'back';
  trailing?: ReactNode;
}>;

export function ScreenHeader({ title, onLeadingPress, leading = 'close', trailing }: Props) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.row, { borderBottomColor: c.sep, paddingTop: insets.top + 14 }]}>
      <Pressable
        onPress={onLeadingPress}
        hitSlop={8}
        accessibilityLabel={leading === 'close' ? 'Close' : 'Back'}
      >
        <Icon name={leading === 'close' ? 'close' : 'arrow-left'} />
      </Pressable>
      <Text style={[styles.title, { color: c.fg }]} numberOfLines={1}>
        {title}
      </Text>
      {trailing ?? <View style={styles.spacer} />}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  title: { flex: 1, fontSize: 18, fontWeight: '700' },
  spacer: { width: 24 },
});
