import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Card } from '../components/Card';
import { Icon } from '../components/Icon';
import { ScreenHeader } from '../components/ScreenHeader';
import { mobileStore, type CurrentMeasurement } from '../db/mobileStore';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { useTheme } from '../theme/ThemeContext';

type Props = NativeStackScreenProps<RootStackParamList, 'Measurements'>;

export function MeasurementsScreen({ navigation }: Props) {
  const c = useTheme();
  const [measurements, setMeasurements] = useState<CurrentMeasurement[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setError(null);
      mobileStore.measurements
        .listCurrent()
        .then((rows) => {
          if (!cancelled) setMeasurements(rows);
        })
        .catch(() => {
          if (!cancelled) setError('Could not load measurements.');
        });
      return () => {
        cancelled = true;
      };
    }, [])
  );

  return (
    <View style={[styles.container, { backgroundColor: c.bg }]}>
      <ScreenHeader
        title="Measurements"
        leading="back"
        onLeadingPress={() => navigation.goBack()}
        trailing={
          <Pressable
            onPress={() => navigation.navigate('RecordMeasurements')}
            hitSlop={8}
            accessibilityLabel="Record measurements"
            accessibilityRole="button"
          >
            <Icon name="plus" variant="accent" size={26} />
          </Pressable>
        }
      />
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
        {error ? <Text style={[styles.message, { color: c.danger }]}>{error}</Text> : null}
        {!error && measurements === null ? (
          <ActivityIndicator accessibilityLabel="Loading measurements" color={c.accent} />
        ) : null}
        {measurements ? (
          <Card style={styles.card}>
            {measurements.map((measurement, index) => (
              <View
                key={measurement.id}
                style={[
                  styles.row,
                  index > 0 ? { borderTopColor: c.sep, borderTopWidth: 1 } : null,
                ]}
              >
                <Text style={[styles.name, { color: c.fg }]}>{measurement.name}</Text>
                <View style={styles.valueColumn}>
                  <Text
                    selectable
                    style={[styles.value, { color: measurement.current ? c.fg : c.sub }]}
                  >
                    {measurement.current
                      ? `${formatValue(measurement.current.canonicalValue)} ${measurement.canonicalUnit}`
                      : 'Not recorded'}
                  </Text>
                  {measurement.current ? (
                    <Text selectable style={[styles.date, { color: c.sub }]}>
                      {formatDate(measurement.current.measuredAt)}
                    </Text>
                  ) : null}
                </View>
              </View>
            ))}
          </Card>
        ) : null}
      </ScrollView>
    </View>
  );
}

function formatValue(value: number): string {
  return String(Math.round(value * 100) / 100);
}

function formatDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString();
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },
  card: { paddingVertical: 0 },
  row: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    paddingVertical: 10,
  },
  name: { flex: 1, fontSize: 15, fontWeight: '600' },
  valueColumn: { alignItems: 'flex-end' },
  value: { fontSize: 15, fontWeight: '600', fontVariant: ['tabular-nums'] },
  date: { fontSize: 12, marginTop: 2, fontVariant: ['tabular-nums'] },
  message: { textAlign: 'center', paddingVertical: 24 },
});
