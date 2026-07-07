import { useEffect, useState } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { getWorkoutDetail } from '../db/repositories/workouts';
import type { WorkoutDetail } from '../db/types';
import type { RootStackParamList } from '../navigation/RootNavigator';

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
      <Text style={styles.date}>{new Date(detail.started_at).toLocaleString()}</Text>
      {detail.exercises.map((we) => (
        <View key={we.id} style={styles.exercise}>
          <Text style={styles.exerciseName}>{we.exercise.name}</Text>
          {we.sets.map((set, index) => (
            <View key={set.id} style={styles.setRow}>
              <Text style={styles.setIndex}>{index + 1}</Text>
              <Text style={styles.setText}>
                {set.weight ?? '–'} kg × {set.reps ?? '–'}
              </Text>
              <Text style={[styles.status, set.completed && styles.done]}>
                {set.completed ? 'done' : 'skipped'}
              </Text>
            </View>
          ))}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  title: { fontSize: 22, fontWeight: '700', paddingHorizontal: 16, paddingTop: 16 },
  date: { paddingHorizontal: 16, paddingBottom: 8, color: '#666' },
  exercise: { paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, borderTopColor: '#eee' },
  exerciseName: { fontSize: 16, fontWeight: '600' },
  setRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6, gap: 12 },
  setIndex: { width: 20, color: '#888' },
  setText: { fontSize: 15, flex: 1 },
  status: { fontSize: 13, color: '#999' },
  done: { color: '#0a7', fontWeight: '600' },
});
