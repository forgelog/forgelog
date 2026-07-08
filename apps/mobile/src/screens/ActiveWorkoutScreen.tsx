import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Chip } from '../components/Chip';
import { Icon } from '../components/Icon';
import { PillButton } from '../components/PillButton';
import { ScreenHeader } from '../components/ScreenHeader';
import { SupersetTag } from '../components/SupersetTag';
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
import { useTheme } from '../theme/ThemeContext';
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
  const c = useTheme();
  const [detail, setDetail] = useState<WorkoutDetail | null>(null);
  const [restRemaining, setRestRemaining] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [prSetIds, setPrSetIds] = useState<Set<string>>(new Set());

  const reload = useCallback(() => {
    getWorkoutDetail(workoutId).then(setDetail);
  }, [workoutId]);

  useFocusEffect(reload);

  const startedAt = detail?.started_at;

  useEffect(() => {
    if (!startedAt) return;
    const startedAtMs = new Date(startedAt).getTime();
    const tick = () => setElapsed(Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000)));
    tick();
    const handle = setInterval(tick, 1000);
    return () => clearInterval(handle);
  }, [startedAt]);

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
      await checkForPr(we.exercise.id, setId);
    } else {
      setPrSetIds((prev) => {
        const next = new Set(prev);
        next.delete(setId);
        return next;
      });
    }
  }

  async function checkForPr(exerciseId: string, setId: string) {
    const before = await getRecordsForExercise(exerciseId);
    await recalcRecordsForExercise(exerciseId);
    const after = await getRecordsForExercise(exerciseId);
    const beforeMap = new Map(before.map((r) => [r.record_type, r.value]));
    const improved = after.filter((r) => {
      const prev = beforeMap.get(r.record_type);
      return prev === undefined || r.value > prev;
    });
    if (improved.length > 0) {
      setPrSetIds((prev) => new Set(prev).add(setId));
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
    <View style={[styles.container, { backgroundColor: c.bg }]}>
      <ScreenHeader
        title={detail.name}
        onLeadingPress={() => navigation.goBack()}
        trailing={<PillButton label="Finish" onPress={handleFinish} variant="filled" />}
      />
      <Text style={[styles.timer, { color: c.accent }]}>{formatTime(elapsed)}</Text>
      <FlatList
        data={detail.exercises}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) => {
          const trackingType = effectiveTrackingType(item.tracking_type, item.exercise.tracking_type);
          const fields = fieldsFor(trackingType);
          const supersetWithPrev =
            index > 0 &&
            item.superset_group_id != null &&
            item.superset_group_id === detail.exercises[index - 1].superset_group_id;
          return (
            <View style={[styles.exercise, { borderTopColor: c.sep }]}>
              {supersetWithPrev ? <SupersetTag /> : null}
              <View style={styles.exerciseHeader}>
                <Text style={[styles.exerciseName, { color: c.fg }]}>{item.exercise.name}</Text>
                <Chip label={TRACKING_LABELS[trackingType]} onPress={() => cycleTrackingType(item)} />
              </View>
              <View style={styles.columnHeader}>
                <Text style={[styles.columnLabel, { color: c.sub, width: 26, textAlign: 'center' }]}>
                  SET
                </Text>
                {fields.map((field) => (
                  <Text key={field} style={[styles.columnLabel, { color: c.sub, flex: 1, textAlign: 'center' }]}>
                    {field.toUpperCase()}
                  </Text>
                ))}
              </View>
              {item.sets.map((set, i) => (
                <View
                  key={set.id}
                  style={[
                    styles.setRow,
                    set.completed ? { backgroundColor: c.asoft, borderRadius: 10 } : null,
                  ]}
                >
                  <Text style={[styles.setIndex, { color: c.sub }]}>{i + 1}</Text>
                  {fields.map((field) => (
                    <TextInput
                      key={field}
                      style={[styles.setInput, { backgroundColor: c.fill, color: c.fg }]}
                      value={(set[SET_COLUMN[field]] as number | null)?.toString() ?? ''}
                      onChangeText={(t) => editSetField(item.id, set.id, field, t)}
                      placeholder={FIELD_PLACEHOLDER[field]}
                      placeholderTextColor={c.sub}
                      keyboardType="numeric"
                    />
                  ))}
                  {prSetIds.has(set.id) ? <Text style={styles.prBadge}>🏆</Text> : null}
                  <Pressable
                    style={[
                      styles.check,
                      { borderColor: c.chipbd },
                      set.completed && { backgroundColor: c.accent, borderColor: c.accent },
                    ]}
                    onPress={() => toggleComplete(item, set.id, !set.completed)}
                  >
                    <Icon name="check" size={18} color={set.completed ? '#fff' : c.sub} />
                  </Pressable>
                  <Pressable onPress={() => removeSet(item.id, set.id)} hitSlop={8}>
                    <Icon name="close" variant="sub" size={16} />
                  </Pressable>
                </View>
              ))}
              <Pressable style={styles.addSet} onPress={() => handleAddSet(item)}>
                <Text style={[styles.addSetText, { color: c.accent }]}>+ Add set</Text>
              </Pressable>
            </View>
          );
        }}
        ListFooterComponent={
          <PillButton
            label="Add Exercise"
            onPress={handleAddExercise}
            variant="outlined"
            style={styles.addExercise}
          />
        }
      />
      {restRemaining != null && restRemaining > 0 ? (
        <View style={[styles.restBar, { backgroundColor: c.fg }]}>
          <Text style={[styles.restText, { color: c.bg }]}>Rest {formatTime(restRemaining)}</Text>
          <View style={styles.restActions}>
            <Pressable onPress={() => setRestRemaining((r) => (r ?? 0) + 15)}>
              <Text style={[styles.restAction, { color: c.accent }]}>+15s</Text>
            </Pressable>
            <Pressable onPress={() => setRestRemaining(null)}>
              <Text style={[styles.restAction, { color: c.accent }]}>Skip</Text>
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
  container: { flex: 1 },
  timer: { fontSize: 28, fontWeight: '700', textAlign: 'center', paddingVertical: 8, fontVariant: ['tabular-nums'] },
  exercise: { paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1 },
  exerciseHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  exerciseName: { fontSize: 16, fontWeight: '700', flex: 1 },
  columnHeader: { flexDirection: 'row', gap: 8, marginTop: 10, paddingLeft: 0 },
  columnLabel: { fontSize: 11, fontWeight: '700' },
  setRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 8, paddingVertical: 4 },
  setIndex: { width: 26, textAlign: 'center' },
  setInput: {
    flex: 1,
    height: 36,
    borderRadius: 8,
    textAlign: 'center',
    fontSize: 15,
  },
  prBadge: { fontSize: 16 },
  check: {
    width: 36,
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addSet: { marginTop: 10 },
  addSetText: { fontSize: 14, fontWeight: '600' },
  addExercise: { margin: 16, marginBottom: 8 },
  restBar: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  restText: { fontSize: 16, fontWeight: '700' },
  restActions: { flexDirection: 'row', gap: 16 },
  restAction: { fontSize: 14, fontWeight: '700' },
});
