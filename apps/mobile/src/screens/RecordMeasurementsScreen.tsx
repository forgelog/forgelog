import DateTimePicker from '@react-native-community/datetimepicker';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Card } from '../components/Card';
import { Icon } from '../components/Icon';
import { ScreenHeader } from '../components/ScreenHeader';
import { mobileStore, type CurrentMeasurement } from '../db/mobileStore';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { useTheme } from '../theme/ThemeContext';
import { toIsoDate } from '../validation/numericInput';

type Props = NativeStackScreenProps<RootStackParamList, 'RecordMeasurements'>;
type FieldValues = Record<string, string>;
type FieldErrors = Record<string, string | undefined>;

export function RecordMeasurementsScreen({ navigation }: Props) {
  const c = useTheme();
  const [types, setTypes] = useState<CurrentMeasurement[]>([]);
  const [values, setValues] = useState<FieldValues>({});
  const [date, setDate] = useState(() => new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      mobileStore.measurements
        .listCurrent()
        .then((rows) => {
          if (!cancelled) setTypes(rows);
        })
        .catch(() => {
          if (!cancelled) setGeneralError('Could not load measurement types.');
        });
      return () => {
        cancelled = true;
      };
    }, [])
  );

  function updateValue(typeId: string, value: string) {
    setValues((current) => ({ ...current, [typeId]: value }));
    setErrors((current) => ({ ...current, [typeId]: undefined }));
    setGeneralError(null);
  }

  async function handleSave() {
    if (saving || types.length === 0) return;

    const nextErrors: FieldErrors = {};
    const entries = types.flatMap((type) => {
      const text = values[type.id]?.trim() ?? '';
      if (!text) return [];
      const parsed = Number(text.replace(',', '.'));
      if (!Number.isFinite(parsed)) {
        nextErrors[type.id] = `${type.name} must be a number.`;
        return [];
      }
      if (parsed < 0) {
        nextErrors[type.id] = `${type.name} must be zero or greater.`;
        return [];
      }
      return [{ measurementTypeId: type.id, canonicalValue: parsed }];
    });

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    if (entries.length === 0) {
      setGeneralError('Enter at least one measurement.');
      return;
    }

    setSaving(true);
    setGeneralError(null);
    try {
      await mobileStore.measurements.record({ measuredAt: toIsoDate(date), values: entries });
      navigation.goBack();
    } catch (error) {
      setGeneralError(error instanceof Error ? error.message : 'Could not save measurements.');
      setSaving(false);
    }
  }

  return (
    <View style={[styles.container, { backgroundColor: c.bg }]}>
      <ScreenHeader
        title="Record Measurements"
        leading="close"
        onLeadingPress={() => navigation.goBack()}
        trailing={
          <Pressable
            onPress={handleSave}
            hitSlop={8}
            accessibilityLabel="Save measurements"
            accessibilityRole="button"
            accessibilityState={{ disabled: saving || types.length === 0 }}
            disabled={saving || types.length === 0}
          >
            <Icon name="check" variant="accent" size={24} />
          </Pressable>
        }
      />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {generalError ? (
          <Text selectable style={[styles.error, { color: c.danger }]}>
            {generalError}
          </Text>
        ) : null}

        <Text style={[styles.sectionLabel, { color: c.sub }]}>Date</Text>
        <Pressable
          style={[styles.dateRow, { backgroundColor: c.card }]}
          onPress={() => setShowDatePicker(true)}
          accessibilityLabel="Measurement date"
          accessibilityRole="button"
        >
          <Text selectable style={[styles.dateValue, { color: c.fg }]}>
            {date.toLocaleDateString()}
          </Text>
          <Icon name="calendar-blank-outline" variant="sub" size={20} />
        </Pressable>
        {showDatePicker ? (
          <>
            <DateTimePicker
              value={date}
              mode="date"
              maximumDate={new Date()}
              onChange={(event, selectedDate) => {
                if (Platform.OS === 'android') setShowDatePicker(false);
                if (event.type === 'set' && selectedDate) setDate(selectedDate);
              }}
            />
            {Platform.OS === 'ios' ? (
              <Pressable onPress={() => setShowDatePicker(false)} style={styles.doneButton}>
                <Text style={{ color: c.accent, fontWeight: '600' }}>Done</Text>
              </Pressable>
            ) : null}
          </>
        ) : null}

        <Text style={[styles.sectionLabel, { color: c.sub }]}>Measurements</Text>
        <Card style={styles.measurementCard}>
          {types.map((type, index) => (
            <View key={type.id}>
              <View
                style={[
                  styles.measurementRow,
                  index > 0 ? { borderTopColor: c.sep, borderTopWidth: 1 } : null,
                ]}
              >
                <Text style={[styles.measurementName, { color: c.fg }]}>{type.name}</Text>
                <View style={styles.inputColumn}>
                  <TextInput
                    value={values[type.id] ?? ''}
                    onChangeText={(value) => updateValue(type.id, value)}
                    keyboardType="decimal-pad"
                    placeholder="—"
                    placeholderTextColor={c.sub}
                    style={[styles.input, { color: c.fg, borderColor: c.sep }]}
                    textAlign="right"
                    accessibilityLabel={`${type.name} in ${type.canonicalUnit}`}
                    testID={`measurement-${type.id.replaceAll('_', '-')}-input`}
                  />
                  <Text style={[styles.unit, { color: c.sub }]}>{type.canonicalUnit}</Text>
                </View>
              </View>
              {errors[type.id] ? (
                <Text selectable style={[styles.fieldError, { color: c.danger }]}>
                  {errors[type.id]}
                </Text>
              ) : null}
            </View>
          ))}
        </Card>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 40, gap: 8 },
  sectionLabel: { fontSize: 13, fontWeight: '600', marginTop: 8 },
  dateRow: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 16,
    paddingHorizontal: 16,
  },
  dateValue: { fontSize: 15, fontWeight: '600', fontVariant: ['tabular-nums'] },
  doneButton: { alignSelf: 'flex-end', paddingVertical: 8, paddingHorizontal: 4 },
  measurementCard: { paddingVertical: 0 },
  measurementRow: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    paddingVertical: 8,
  },
  measurementName: { flex: 1, fontSize: 15, fontWeight: '600' },
  inputColumn: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: {
    width: 92,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 15,
    fontVariant: ['tabular-nums'],
  },
  unit: { width: 22, fontSize: 13 },
  error: { fontSize: 13 },
  fieldError: { fontSize: 12, paddingBottom: 8, textAlign: 'right' },
});
