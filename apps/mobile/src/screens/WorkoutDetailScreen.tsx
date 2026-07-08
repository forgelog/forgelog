import { useNavigation } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { ScreenHeader } from '../components/ScreenHeader';
import { SupersetTag } from '../components/SupersetTag';
import { getWorkoutDetail } from '../db/repositories/workouts';
import type { LoggedSet, WorkoutDetail } from '../db/types';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { useTheme } from '../theme/ThemeContext';
import { fieldsFor } from './setFields';

type Props = NativeStackScreenProps<RootStackParamList, 'WorkoutDetail'>;

export function WorkoutDetailScreen({ route }: Props) {
  const { workoutId } = route.params;
  const c = useTheme();
  const navigation = useNavigation();
  const [detail, setDetail] = useState<WorkoutDetail | null>(null);

  useEffect(() => {
    getWorkoutDetail(workoutId).then(setDetail);
  }, [workoutId]);

  if (!detail) return null;

  const volume = totalVolume(detail);

  return (
    <View style={[styles.container, { backgroundColor: c.bg }]}>
      <ScreenHeader title={detail.name} leading="back" onLeadingPress={() => navigation.goBack()} />
      <ScrollView>
        <Text style={[styles.date, { color: c.sub }]}>
          {formatDate(detail.started_at)} · {formatDuration(detail.started_at, detail.ended_at)} ·{' '}
          {round(volume)} kg
        </Text>
        {detail.notes ? <Text style={[styles.notes, { color: c.fg }]}>{detail.notes}</Text> : null}
        {detail.exercises.map((we, index) => {
          const supersetWithPrev =
            index > 0 &&
            we.superset_group_id != null &&
            we.superset_group_id === detail.exercises[index - 1].superset_group_id;
          return (
            <View key={we.id} style={[styles.exercise, { borderTopColor: c.sep }]}>
              {supersetWithPrev ? <SupersetTag /> : null}
              <Text style={[styles.exerciseName, { color: c.fg }]}>{we.exercise.name}</Text>
              {we.sets.map((set, i) => (
                <View key={set.id} style={styles.setRow}>
                  <Text style={[styles.setIndex, { color: c.sub }]}>{i + 1}</Text>
                  <Text style={[styles.setText, { color: c.fg }]}>
                    {formatSet(we.tracking_type ?? we.exercise.tracking_type, set)}
                  </Text>
                  <View
                    style={[
                      styles.badge,
                      { backgroundColor: set.completed ? c.asoft : c.fill },
                    ]}
                  >
                    <Text
                      style={[
                        styles.badgeText,
                        { color: set.completed ? c.accent : c.sub },
                      ]}
                    >
                      {set.completed ? 'Done' : 'Skipped'}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

function totalVolume(detail: WorkoutDetail): number {
  let sum = 0;
  for (const we of detail.exercises) {
    for (const set of we.sets) {
      if (set.completed && set.weight != null && set.reps != null) {
        sum += set.weight * set.reps;
      }
    }
  }
  return sum;
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

function formatSet(trackingType: string | null, set: LoggedSet): string {
  return fieldsFor(trackingType)
    .map((field) => {
      switch (field) {
        case 'weight':
          return `${set.weight ?? '–'} kg`;
        case 'reps':
          return `${set.reps ?? '–'} reps`;
        case 'duration':
          return `${set.duration_seconds ?? '–'} s`;
        case 'distance':
          return `${set.distance_meters ?? '–'} m`;
      }
    })
    .join(' × ');
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
  date: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, fontSize: 13 },
  notes: { paddingHorizontal: 16, paddingBottom: 8, fontSize: 14 },
  exercise: { paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1 },
  exerciseName: { fontSize: 16, fontWeight: '700' },
  setRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6, gap: 12 },
  setIndex: { width: 20, fontSize: 13 },
  setText: { fontSize: 15, flex: 1 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  badgeText: { fontSize: 12, fontWeight: '700' },
});
