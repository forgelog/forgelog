import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card } from '../components/Card';
import { currentWeekDays, localDateKey, monthLabel } from '../domain/dates';
import { listWorkouts } from '../db/repositories/workouts';
import type { Workout } from '../db/types';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { useTheme } from '../theme/ThemeContext';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export function HistoryScreen() {
  const c = useTheme();
  const navigation = useNavigation<Nav>();
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let current = true;
      setLoading(true);
      setLoadFailed(false);
      listWorkouts()
        .then((rows) => {
          if (current) setWorkouts(rows);
        })
        .catch(() => {
          if (!current) return;
          setWorkouts([]);
          setLoadFailed(true);
        })
        .finally(() => {
          if (current) setLoading(false);
        });
      return () => {
        current = false;
      };
    }, [])
  );

  const workoutDates = useMemo(
    () => new Set(workouts.map((w) => localDateKey(new Date(w.started_at)))),
    [workouts]
  );

  const weekDays = useMemo(() => currentWeekDays(new Date()), []);

  const groups = useMemo(() => groupByMonth(workouts), [workouts]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: c.bg }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.title, { color: c.fg }]}>History</Text>

        <View style={styles.weekStrip}>
          {weekDays.map((day, i) => {
            const key = localDateKey(day);
            const hasWorkout = workoutDates.has(key);
            const isToday = key === localDateKey(new Date());
            return (
              <View key={key} style={styles.dayColumn}>
                <Text style={[styles.dayLabel, { color: c.sub }]}>{DAY_LABELS[i]}</Text>
                <View
                  style={[
                    styles.dayCircle,
                    {
                      backgroundColor: hasWorkout ? c.accent : c.fill,
                      borderColor: isToday ? c.accent : 'transparent',
                      borderWidth: isToday ? 2 : 0,
                    },
                  ]}
                >
                  <Text style={{ color: hasWorkout ? '#fff' : c.sub, fontSize: 12, fontWeight: '600' }}>
                    {day.getDate()}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>

        {loading ? (
          <Text style={[styles.empty, { color: c.sub }]}>Loading history...</Text>
        ) : loadFailed ? (
          <Text style={[styles.empty, { color: c.sub }]}>Could not load workout history.</Text>
        ) : workouts.length === 0 ? (
          <Text style={[styles.empty, { color: c.sub }]}>No finished workouts yet.</Text>
        ) : (
          groups.map((group) => (
            <View key={group.month}>
              <Text style={[styles.monthHeader, { color: c.sub }]}>{group.month}</Text>
              {group.workouts.map((item) => (
                <Card key={item.id} style={styles.workoutCard}>
                  <Pressable
                    onPress={() => navigation.navigate('WorkoutDetail', { workoutId: item.id })}
                    accessibilityLabel={`Open workout ${item.name}`}
                    accessibilityRole="button"
                  >
                    <Text style={[styles.name, { color: c.fg }]}>{item.name}</Text>
                    <Text style={[styles.meta, { color: c.sub }]}>
                      {formatDate(item.started_at)} · {formatDuration(item.started_at, item.ended_at)}
                    </Text>
                  </Pressable>
                </Card>
              ))}
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

type MonthGroup = { month: string; workouts: Workout[] };

function groupByMonth(workouts: Workout[]): MonthGroup[] {
  const map = new Map<string, Workout[]>();
  for (const w of workouts) {
    const month = monthLabel(new Date(w.started_at));
    if (!map.has(month)) map.set(month, []);
    map.get(month)!.push(w);
  }
  return [...map.entries()].map(([month, ws]) => ({ month, workouts: ws }));
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function formatDuration(startIso: string, endIso: string | null): string {
  if (!endIso) return 'in progress';
  const mins = Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 60000);
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16 },
  title: { fontSize: 24, fontWeight: '700', marginBottom: 16 },
  weekStrip: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 24 },
  dayColumn: { alignItems: 'center', gap: 6 },
  dayLabel: { fontSize: 11, fontWeight: '600' },
  dayCircle: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  empty: { textAlign: 'center', marginTop: 24 },
  monthHeader: { fontSize: 13, fontWeight: '700', marginBottom: 8, marginTop: 8, textTransform: 'uppercase' },
  workoutCard: { marginBottom: 10 },
  name: { fontSize: 16, fontWeight: '700' },
  meta: { marginTop: 4, fontSize: 13 },
});
