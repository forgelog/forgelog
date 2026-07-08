import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useState } from 'react';
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
  updateWorkoutExercise,
} from '../db/repositories/workouts';
import type { LoggedSet, WorkoutDetail, WorkoutExerciseDetail } from '../db/types';
import type { RootStackParamList } from '../navigation/RootNavigator';
import {
  effectiveTrackingType,
  FIELD_PLACEHOLDER,
  fieldsFor,
  resolveRestSeconds,
  SetFieldKey,
  TRACKING_LABELS,
  TRACKING_TYPES,
} from './setFields';

type Props = NativeStackScreenProps<RootStackParamList, 'ActiveWorkout'>;

const SET_COLUMN: Record<SetFieldKey, keyof LoggedSet> = {
  weight: 'weight',
  reps: 'reps',
  duration: 'duration_seconds',
  distance: 'distance_meters',
};

export function ActiveWorkoutScreen({ route, navigation }: Props) {
  const { workoutId } = route.params;
  const [detail, setDetail] = useState<WorkoutDetail | null>(null);
  const [restRemaining, setRestRemaining] = useState<number | null>(null);

  const reload = useCallback(() => {
    getWorkoutDetail(workoutId).then(setDetail);
  }, [workoutId]);

  useFocusEffect(reload);

  useEffect(() => {
    if (restRemaining == null || restRemaining <= 0) return;
    const handle = setTimeout(
      () => setRestRemaining((r) => (r == null || r <= 1 ? null : r - 1)),
      1000
    );
    return () => clearTimeout(handle);
  }, [restRemaining]);

  function patchExercise(weId: string, fn: (we: WorkoutExerciseDetail) => WorkoutExerciseDetail) {
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

  function cycleTrackingType(we: WorkoutExerciseDetail) {
    const current = effectiveTrackingType(we.tracking_type, we.exercise.tracking_type);
    const next = TRACKING_TYPES[(TRACKING_TYPES.indexOf(current) + 1) % TRACKING_TYPES.length];
    patchExercise(we.id, (w) => ({ ...w, tracking_type: next }));
    updateWorkoutExercise(we.id, { tracking_type: next });
  }

  function editSetField(weId: string, setId: string, field: SetFieldKey, raw: string) {
    const column = SET_COLUMN[field];
    const value = raw.trim() === '' ? null : Number(raw);
    if (value !== null && Number.isNaN(value)) return;
    patchExercise(weId, (w) => ({
      ...w,
      sets: w.sets.map((s) => (s.id === setId ? { ...s, [column]: value } : s)),
    }));
    updateLoggedSet(setId, { [column]: value });
  }

  async function toggleComplete(we: WorkoutExerciseDetail, setId: string, completed: boolean) {
    patchExercise(we.id, (w) => ({
      ...w,
      sets: w.sets.map((s) => (s.id === setId ? { ...s, completed } : s)),
    }));
    await updateLoggedSet(setId, { completed });
    if (completed) {
      setRestRemaining(resolveRestSeconds(we.rest_seconds));
      await checkForPr(we.exercise.id);
    }
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
      Alert.alert(
        'New PR! 🎉',
        improved.map((r) => `${label(r.record_type)}: ${round(r.value)}`).join('\n')
      );
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
    <View style={styles.container}>
      <FlatList
        data={detail.exercises}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={<Text style={styles.title}>{detail.name}</Text>}
        renderItem={({ item, index }) => {
          const trackingType = effectiveTrackingType(item.tracking_type, item.exercise.tracking_type);
          const fields = fieldsFor(trackingType);
          const supersetWithPrev =
            index > 0 &&
            item.superset_group_id != null &&
            item.superset_group_id === detail.exercises[index - 1].superset_group_id;
          return (
            <View style={styles.exercise}>
              {supersetWithPrev ? <Text style={styles.supersetTag}>⛓ superset</Text> : null}
              <View style={styles.exerciseHeader}>
                <Text style={styles.exerciseName}>{item.exercise.name}</Text>
                <Pressable style={styles.typeChip} onPress={() => cycleTrackingType(item)}>
                  <Text style={styles.typeChipText}>{TRACKING_LABELS[trackingType]}</Text>
                </Pressable>
              </View>
              {item.sets.map((set, i) => (
                <View key={set.id} style={styles.setRow}>
                  <Text style={styles.setIndex}>{i + 1}</Text>
                  {fields.map((field) => (
                    <TextInput
                      key={field}
                      style={styles.setInput}
                      value={(set[SET_COLUMN[field]] as number | null)?.toString() ?? ''}
                      onChangeText={(t) => editSetField(item.id, set.id, field, t)}
                      placeholder={FIELD_PLACEHOLDER[field]}
                      keyboardType="numeric"
                    />
                  ))}
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
          );
        }}
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
      {restRemaining != null && restRemaining > 0 ? (
        <View style={styles.restBar}>
          <Text style={styles.restText}>Rest {formatTime(restRemaining)}</Text>
          <View style={styles.restActions}>
            <Pressable onPress={() => setRestRemaining((r) => (r ?? 0) + 15)}>
              <Text style={styles.restAction}>+15s</Text>
            </Pressable>
            <Pressable onPress={() => setRestRemaining(null)}>
              <Text style={styles.restAction}>Skip</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function label(recordType: string): string {
  return (
    { max_weight: 'Max weight', max_reps: 'Max reps', max_volume: 'Max volume', est_1rm: 'Est. 1RM' }[
      recordType
    ] ?? recordType
  );
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  title: { fontSize: 22, fontWeight: '700', padding: 16 },
  exercise: { paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, borderTopColor: '#eee' },
  supersetTag: { color: '#0a7', fontSize: 12, fontWeight: '600', marginBottom: 4 },
  exerciseHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  exerciseName: { fontSize: 16, fontWeight: '600', flex: 1 },
  typeChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14, backgroundColor: '#f0f0f0' },
  typeChipText: { fontSize: 12, color: '#333' },
  setRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 8 },
  setIndex: { width: 20, color: '#888' },
  setInput: {
    width: 66,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
    textAlign: 'center',
    fontSize: 15,
  },
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
  restBar: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  restText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  restActions: { flexDirection: 'row', gap: 16 },
  restAction: { color: '#0a7', fontSize: 14, fontWeight: '700' },
});
