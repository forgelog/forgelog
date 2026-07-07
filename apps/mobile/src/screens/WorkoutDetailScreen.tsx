import { useEffect, useState } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { getWorkoutDetail } from '../db/repositories/workouts';
import type { LoggedSet, WorkoutDetail } from '../db/types';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { fieldsFor } from './setFields';

type Props = NativeStackScreenProps<RootStackParamList, 'WorkoutDetail'>;

export function WorkoutDetailScreen({ route }: Props) {
  const { workoutId } = route.params;
  const [detail, setDetail] = useState<WorkoutDetail | null>(null);

  useEffect(() => {
    getWorkoutDetail(workoutId).then(setDetail);
  }, [workoutId]);

  if (!detail) return null;

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>{detail.name}</Text>
      <Text style={styles.date}>
        {new Date(detail.started_at).toLocaleString()} · {formatDuration(detail.started_at, detail.ended_at)}
      </Text>
      {detail.notes ? <Text style={styles.notes}>{detail.notes}</Text> : null}
      {detail.exercises.map((we, index) => {
        const supersetWithPrev =
          index > 0 &&
          we.superset_group_id != null &&
          we.superset_group_id === detail.exercises[index - 1].superset_group_id;
        return (
        <View key={we.id} style={styles.exercise}>
          {supersetWithPrev ? <Text style={styles.supersetTag}>⛓ superset</Text> : null}
          <Text style={styles.exerciseName}>{we.exercise.name}</Text>
          {we.sets.map((set, i) => (
            <View key={set.id} style={styles.setRow}>
              <Text style={styles.setIndex}>{i + 1}</Text>
              <Text style={styles.setText}>
                {formatSet(we.tracking_type ?? we.exercise.tracking_type, set)}
              </Text>
              <Text style={[styles.status, set.completed && styles.done]}>
                {set.completed ? 'done' : 'skipped'}
              </Text>
            </View>
          ))}
        </View>
        );
      })}
    </ScrollView>
  );
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

function formatDuration(startIso: string, endIso: string | null): string {
  if (!endIso) return 'in progress';
  const mins = Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 60000);
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  title: { fontSize: 22, fontWeight: '700', paddingHorizontal: 16, paddingTop: 16 },
  date: { paddingHorizontal: 16, paddingBottom: 8, color: '#666' },
  notes: { paddingHorizontal: 16, paddingBottom: 8, color: '#444', fontSize: 14 },
  exercise: { paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, borderTopColor: '#eee' },
  supersetTag: { color: '#0a7', fontSize: 12, fontWeight: '600', marginBottom: 4 },
  exerciseName: { fontSize: 16, fontWeight: '600' },
  setRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6, gap: 12 },
  setIndex: { width: 20, color: '#888' },
  setText: { fontSize: 15, flex: 1 },
  status: { fontSize: 13, color: '#999' },
  done: { color: '#0a7', fontWeight: '600' },
});
