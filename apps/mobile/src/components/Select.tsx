import { useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../theme/ThemeContext';
import { Icon } from './Icon';

type Props = {
  label: string;
  value: string | null;
  options: string[];
  onChange: (value: string | null) => void;
};

export function Select({ label, value, options, onChange }: Props) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);

  const allOptions = ['All', ...options];

  return (
    <>
      <Pressable
        style={[styles.field, { borderColor: c.chipbd }]}
        onPress={() => setOpen(true)}
        accessibilityLabel={`${label} filter`}
        accessibilityRole="button"
      >
        <View style={styles.fieldText}>
          <Text style={[styles.label, { color: c.sub }]}>{label}</Text>
          <Text style={[styles.value, { color: c.fg }]} numberOfLines={1}>
            {value ?? 'All'}
          </Text>
        </View>
        <Icon name="chevron-down" variant="sub" size={20} />
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable
            style={[
              styles.sheet,
              { backgroundColor: c.card, paddingBottom: insets.bottom + 16 },
            ]}
          >
            <Text style={[styles.sheetTitle, { color: c.fg }]}>{label}</Text>
            <FlatList
              data={allOptions}
              keyExtractor={(item) => item}
              style={styles.list}
              renderItem={({ item }) => {
                const optionValue = item === 'All' ? null : item;
                const selected = value === optionValue;
                return (
                  <Pressable
                    style={styles.option}
                    onPress={() => {
                      onChange(optionValue);
                      setOpen(false);
                    }}
                    accessibilityLabel={`Select ${label} ${item}`}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                  >
                    <Text style={[styles.optionText, { color: c.fg }]}>{item}</Text>
                    {selected ? <Icon name="check" variant="accent" size={20} /> : null}
                  </Pressable>
                );
              }}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  field: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  fieldText: { flex: 1 },
  label: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase' },
  value: { fontSize: 15, fontWeight: '600', marginTop: 2, textTransform: 'capitalize' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 16, maxHeight: '70%' },
  sheetTitle: { fontSize: 16, fontWeight: '700', paddingHorizontal: 20, paddingBottom: 8 },
  list: { paddingHorizontal: 20 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
  },
  optionText: { fontSize: 16, textTransform: 'capitalize' },
});
