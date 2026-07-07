import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import {
  getRecordsForExercise,
  recalcRecordsForExercise,
} from '../db/repositories/personalRecords';
import {
  addExerciseToWorkout,
  addSet,
  deleteLoggedSet,
  finishWorkout,
  getWorkoutDetail,
  updateLoggedSet,
} from '../db/repositories/workouts';
import type { WorkoutDetail, WorkoutExerciseDetail } from '../db/types';
import type { RootStackParamList } from '../navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'ActiveWorkout'>;

export function ActiveWorkoutScreen({ route, navigation }: Props) {
  const { workoutId } = route.params;
  const [detail, setDetail] = useState<WorkoutDetail | null>(null);

  const reload = useCallback(() => {
    getWorkoutDetail(workoutId).then(setDetail);
  }, [workoutId]);

  useFocusEffect(reload);

  function patchExercise(
    weId: string,
    fn: (we: WorkoutExerciseDetail) => WorkoutExerciseDetail
  ) {
    setDetail((prev) =>
      prev ? { ...prev, exercises: prev.exercises.map((w) => (w.id === weId ? fn(w) : w)) } : prev
    );
  }

  function handleAddExercise() {
    navigation.navigate('ExerciseLibrary', {
      mode: 'pick',
      onPick: async (exercise) => {
        await addExerciseToWorkout(workoutId, exercise.id);
        reload();
      },
    });
  }

  async function handleAddSet(we: WorkoutExerciseDetail) {
    const created = await addSet(we.id);
    patchExercise(we.id, (w) => ({ ...w, sets: [...w.sets, created] }));
  }

  function editSetField(
    weId: string,
    setId: string,
    field: 'weight' | 'reps',
    raw: string
  ) {
    const value = raw.trim() === '' ? null : Number(raw);
    if (value !== null && Number.isNaN(value)) return;
    patchExercise(weId, (w) => ({
      ...w,
      sets: w.sets.map((s) => (s.id === setId ? { ...s, [field]: value } : s)),
    }));
    updateLoggedSet(setId, { [field]: value });
  }

  async function toggleComplete(we: WorkoutExerciseDetail, setId: string, completed: boolean) {
    patchExercise(we.id, (w) => ({
      ...w,
      sets: w.sets.map((s) => (s.id === setId ? { ...s, completed } : s)),
    }));
    await updateLoggedSet(setId, { completed });
    if (completed) await checkForPr(we.exercise.id);
  }

  async function checkForPr(exerciseId: string) {
    const before = await getRecordsForExercise(exerciseId);
    await recalcRecordsForExercise(exerciseId);
    const after = await getRecordsForExercise(exerciseId);
    const beforeMap = new Map(before.map((r) => [r.record_type, r.value]));
    const improved = after.filter((r) => {
      const prev = beforeMap.get(r.record_type);
      return prev === undefined || r.value > prev;
    });
    if (improved.length > 0) {
      Alert.alert('New PR! 🎉', improved.map((r) => `${label(r.record_type)}: ${round(r.value)}`).join('\n'));
    }
  }

  async function removeSet(weId: string, setId: string) {
    await deleteLoggedSet(setId);
    patchExercise(weId, (w) => ({ ...w, sets: w.sets.filter((s) => s.id !== setId) }));
  }

  function handleFinish() {
    Alert.alert('Finish workout', 'Mark this workout as complete?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Finish',
        onPress: async () => {
          await finishWorkout(workoutId);
          navigation.popToTop();
        },
      },
    ]);
  }

  if (!detail) return null;

  return (
    <FlatList
      style={styles.container}
      data={detail.exercises}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={<Text style={styles.title}>{detail.name}</Text>}
      renderItem={({ item }) => (
        <View style={styles.exercise}>
          <Text style={styles.exerciseName}>{item.exercise.name}</Text>
          {item.sets.map((set, index) => (
            <View key={set.id} style={styles.setRow}>
              <Text style={styles.setIndex}>{index + 1}</Text>
              <TextInput
                style={styles.setInput}
                value={set.weight?.toString() ?? ''}
                onChangeText={(t) => editSetField(item.id, set.id, 'weight', t)}
                placeholder="kg"
                keyboardType="numeric"
              />
              <Text style={styles.times}>×</Text>
              <TextInput
                style={styles.setInput}
                value={set.reps?.toString() ?? ''}
                onChangeText={(t) => editSetField(item.id, set.id, 'reps', t)}
                placeholder="reps"
                keyboardType="numeric"
              />
              <Pressable
                style={[styles.check, set.completed && styles.checkDone]}
                onPress={() => toggleComplete(item, set.id, !set.completed)}
              >
                <Text style={[styles.checkText, set.completed && styles.checkTextDone]}>✓</Text>
              </Pressable>
              <Pressable onPress={() => removeSet(item.id, set.id)}>
                <Text style={styles.remove}>✕</Text>
              </Pressable>
            </View>
          ))}
          <Pressable style={styles.addSet} onPress={() => handleAddSet(item)}>
            <Text style={styles.addSetText}>+ Add set</Text>
          </Pressable>
        </View>
      )}
      ListFooterComponent={
        <View>
          <Pressable style={styles.addExercise} onPress={handleAddExercise}>
            <Text style={styles.addExerciseText}>+ Add exercise</Text>
          </Pressable>
          <Pressable style={styles.finish} onPress={handleFinish}>
            <Text style={styles.finishText}>Finish Workout</Text>
          </Pressable>
        </View>
      }
    />
  );
}

function label(recordType: string): string {
  return { max_weight: 'Max weight', max_reps: 'Max reps', max_volume: 'Max volume', est_1rm: 'Est. 1RM' }[
    recordType
  ] ?? recordType;
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  title: { fontSize: 22, fontWeight: '700', padding: 16 },
  exercise: { paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, borderTopColor: '#eee' },
  exerciseName: { fontSize: 16, fontWeight: '600' },
  setRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 8 },
  setIndex: { width: 20, color: '#888' },
  setInput: {
    width: 60,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
    textAlign: 'center',
    fontSize: 15,
  },
  times: { color: '#888' },
  check: {
    width: 36,
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ccc',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkDone: { backgroundColor: '#0a7', borderColor: '#0a7' },
  checkText: { color: '#ccc', fontWeight: '700' },
  checkTextDone: { color: '#fff' },
  remove: { color: '#c00', fontSize: 16 },
  addSet: { marginTop: 10 },
  addSetText: { color: '#0a7', fontSize: 14, fontWeight: '600' },
  addExercise: { margin: 16, marginBottom: 8, paddingVertical: 14, borderRadius: 12, backgroundColor: '#1a1a1a', alignItems: 'center' },
  addExerciseText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  finish: { marginHorizontal: 16, marginBottom: 24, paddingVertical: 14, borderRadius: 12, backgroundColor: '#0a7', alignItems: 'center' },
  finishText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
