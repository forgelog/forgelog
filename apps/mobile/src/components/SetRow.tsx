import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../theme/ThemeContext';

type Props = {
  index: number;
  fields: ReactNode[];
  trailing?: ReactNode;
  completed?: boolean;
};

export function SetRow({ index, fields, trailing, completed }: Props) {
  const c = useTheme();
  return (
    <View
      style={[
        styles.row,
        completed ? { backgroundColor: c.asoft, borderRadius: 10 } : null,
      ]}
    >
      <Text style={[styles.index, { color: c.sub }]}>{index}</Text>
      <View style={styles.fields}>{fields}</View>
      {trailing}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  index: { width: 26, textAlign: 'center', fontSize: 13 },
  fields: { flex: 1, flexDirection: 'row', gap: 8 },
});
