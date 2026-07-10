import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Chip } from '../components/Chip';
import { Icon } from '../components/Icon';
import { PillButton } from '../components/PillButton';
import { ScreenHeader } from '../components/ScreenHeader';
import {
  completeSet,
  deleteSet,
  discardWorkout,
  uncompleteSet,
} from '../application/activeWorkout';
import {
  addExerciseToWorkout,
  addSet,
  finishWorkout,
  getPreviousSessionSets,
  getWorkoutDetail,
  hasCompletedSet,
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
  formatCompactSet,
  hasLoggedValue,
  parseNonNegativeInteger,
  parseNonNegativeNumber,
  resolveRestSeconds,
  SetFieldKey,
  TRACKING_LABELS,
  TRACKING_TYPES,
} from './setFields';

const INTEGER_FIELDS: SetFieldKey[] = ['reps', 'duration'];

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
  const [prevSets, setPrevSets] = useState<Record<string, LoggedSet[]>>({});

  const reload = useCallback(() => {
    getWorkoutDetail(workoutId).then((d) => {
      setDetail(d);
      if (!d) return;
      Promise.all(
        d.exercises.map(async (we) => [
          we.exercise.id,
          await getPreviousSessionSets(we.exercise.id, workoutId),
        ] as const)
      ).then((entries) => setPrevSets(Object.fromEntries(entries)));
    });
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

  async function cycleTrackingType(we: WorkoutExerciseDetail) {
    const current = effectiveTrackingType(we.tracking_type, we.exercise.tracking_type);
    const next = TRACKING_TYPES[(TRACKING_TYPES.indexOf(current) + 1) % TRACKING_TYPES.length];
    patchExercise(we.id, (w) => ({ ...w, tracking_type: next }));
    try {
      await updateWorkoutExercise(we.id, { tracking_type: next });
    } catch {
      Alert.alert('Save failed', 'Could not save tracking type change.');
      reload();
    }
  }

  async function editSetField(weId: string, setId: string, field: SetFieldKey, raw: string) {
    const column = SET_COLUMN[field];
    const value = INTEGER_FIELDS.includes(field)
      ? parseNonNegativeInteger(raw)
      : parseNonNegativeNumber(raw);
    if (value === undefined) return;
    patchExercise(weId, (w) => ({
      ...w,
      sets: w.sets.map((s) => (s.id === setId ? { ...s, [column]: value } : s)),
    }));
    try {
      await updateLoggedSet(setId, { [column]: value });
    } catch {
      Alert.alert('Save failed', 'Could not save field value.');
      reload();
    }
  }

  async function toggleComplete(we: WorkoutExerciseDetail, setId: string, completed: boolean) {
    if (completed) {
      const set = we.sets.find((s) => s.id === setId);
      const trackingType = effectiveTrackingType(we.tracking_type, we.exercise.tracking_type);
      if (!set || !hasLoggedValue(trackingType, set)) {
        Alert.alert('Missing values', 'Enter reps (or time) before marking this set complete.');
        return;
      }
    }
    patchExercise(we.id, (w) => ({
      ...w,
      sets: w.sets.map((s) => (s.id === setId ? { ...s, completed } : s)),
    }));
    try {
      if (completed) {
        const { improvedRecords } = await completeSet(setId, we.exercise.id);
        setRestRemaining(resolveRestSeconds(we.rest_seconds));
        if (improvedRecords.length > 0) {
          setPrSetIds((prev) => new Set(prev).add(setId));
          Alert.alert(
            'New PR! 🎉',
            improvedRecords.map((r) => `${label(r.record_type)}: ${round(r.value)}`).join('\n')
          );
        }
      } else {
        await uncompleteSet(setId, we.exercise.id);
        setPrSetIds((prev) => {
          const next = new Set(prev);
          next.delete(setId);
          return next;
        });
      }
    } catch {
      Alert.alert('Save failed', 'Could not save set status.');
      reload();
    }
  }

  async function removeSet(weId: string, setId: string) {
    patchExercise(weId, (w) => ({ ...w, sets: w.sets.filter((s) => s.id !== setId) }));
    try {
      await deleteSet(setId, detail!.exercises.find((we) => we.id === weId)!.exercise.id);
    } catch {
      Alert.alert('Save failed', 'Could not delete set.');
      reload();
    }
  }

  function handleFinish() {
    if (!detail || !hasCompletedSet(detail.exercises)) {
      Alert.alert('No sets completed', 'Complete at least one set before finishing.');
      return;
    }
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

  function handleDiscard() {
    Alert.alert('Discard workout', 'This workout will be permanently deleted.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: async () => {
          try {
            await discardWorkout(workoutId);
            navigation.popToTop();
          } catch {
            Alert.alert('Save failed', 'Could not discard workout.');
          }
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
        trailing={
          <View style={styles.headerActions}>
            <Pressable onPress={handleDiscard} hitSlop={8}>
              <Icon name="trash-can-outline" variant="sub" size={20} />
            </Pressable>
            <PillButton label="Finish" onPress={handleFinish} variant="filled" />
          </View>
        }
      />
      <Text style={[styles.timer, { color: c.accent }]}>{formatTime(elapsed)}</Text>
      <FlatList
        data={detail.exercises}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) => {
          const trackingType = effectiveTrackingType(item.tracking_type, item.exercise.tracking_type);
          const fields = fieldsFor(trackingType);
          return (
            <View style={[styles.exercise, { borderTopColor: c.sep }]}>
              <View style={styles.exerciseHeader}>
                <Pressable
                  style={styles.exerciseNameRow}
                  onPress={() => navigation.navigate('ExerciseDetail', { exerciseId: item.exercise.id })}
                  hitSlop={8}
                >
                  <Text
                    style={[styles.exerciseName, { color: c.fg }]}
                    numberOfLines={1}
                    ellipsizeMode="tail"
                  >
                    {item.exercise.name}
                  </Text>
                  <Icon name="information-outline" variant="sub" size={18} />
                </Pressable>
                <Chip label={TRACKING_LABELS[trackingType]} onPress={() => cycleTrackingType(item)} />
              </View>
              <View style={styles.columnHeader}>
                <Text style={[styles.columnLabel, { color: c.sub, width: 26, textAlign: 'center' }]}>
                  SET
                </Text>
                <Text style={[styles.columnLabel, { color: c.sub, width: 52, textAlign: 'center' }]}>
                  PREV
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
                  <Text style={[styles.prevValue, { color: c.sub }]} numberOfLines={1}>
                    {(() => {
                      const prev = prevSets[item.exercise.id]?.[i];
                      return (prev ? formatCompactSet(trackingType, prev) : null) ?? '–';
                    })()}
                  </Text>
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
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  timer: { fontSize: 28, fontWeight: '700', textAlign: 'center', paddingVertical: 8, fontVariant: ['tabular-nums'] },
  exercise: { paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1 },
  exerciseHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  exerciseNameRow: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 6 },
  exerciseName: { fontSize: 16, fontWeight: '700', flexShrink: 1 },
  columnHeader: { flexDirection: 'row', gap: 8, marginTop: 10, paddingLeft: 0 },
  columnLabel: { fontSize: 11, fontWeight: '700' },
  setRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 8, paddingVertical: 4 },
  setIndex: { width: 26, textAlign: 'center' },
  prevValue: { width: 52, textAlign: 'center', fontSize: 13 },
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
