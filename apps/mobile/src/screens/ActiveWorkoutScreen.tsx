import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '../components/Icon';
import { PillButton } from '../components/PillButton';
import { ScreenHeader } from '../components/ScreenHeader';
import { SetFieldInputs } from '../components/SetFieldInputs';
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
} from '../db/repositories/workouts';
import type { LoggedSet, WorkoutDetail, WorkoutExerciseDetail } from '../db/types';
import {
  fieldsForExerciseType,
  formatCompactSet,
  hasLoggedValue,
  parseSetFieldValue,
  requireExerciseType,
  resolveRestSeconds,
  type ExerciseType,
  type ExerciseTypeFieldDescriptor,
  type SetFieldKey,
} from '../domain/setFields';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { useTheme } from '../theme/ThemeContext';

type Props = NativeStackScreenProps<RootStackParamList, 'ActiveWorkout'>;

const SET_COLUMN: Record<SetFieldKey, keyof LoggedSet> = {
  weight: 'weight',
  reps: 'reps',
  duration: 'duration_seconds',
  distance: 'distance_meters',
};

export function ActiveWorkoutScreen({ route, navigation }: Props) {
  const { workoutId, pickedExerciseId } = route.params;
  const c = useTheme();
  const [detail, setDetail] = useState<WorkoutDetail | null>(null);
  const [restRemaining, setRestRemaining] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [prSetIds, setPrSetIds] = useState<Set<string>>(new Set());
  const [prevSets, setPrevSets] = useState<Record<string, LoggedSet[]>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const reloadRequestId = useRef(0);

  const reload = useCallback(() => {
    let current = true;
    const requestId = reloadRequestId.current + 1;
    reloadRequestId.current = requestId;
    const isCurrent = () => current && reloadRequestId.current === requestId;
    setLoading(true);
    setLoadError(null);
    getWorkoutDetail(workoutId)
      .then(async (d) => {
        if (!isCurrent()) return;
        if (!d) {
          setDetail(null);
          setPrevSets({});
          setLoadError('Workout not found.');
          return;
        }
        const entries = await Promise.all(
          d.exercises.map(async (we) => [
            we.exercise.id,
            await getPreviousSessionSets(we.exercise.id, workoutId),
          ] as const)
        );
        if (!isCurrent()) return;
        setDetail(d);
        setPrevSets(Object.fromEntries(entries));
      })
      .catch(() => {
        if (!isCurrent()) return;
        setDetail(null);
        setPrevSets({});
        setLoadError('Could not load workout.');
      })
      .finally(() => {
        if (isCurrent()) setLoading(false);
      });
    return () => {
      current = false;
      reloadRequestId.current += 1;
    };
  }, [workoutId]);

  useFocusEffect(reload);

  useEffect(() => {
    if (!pickedExerciseId) return;
    navigation.setParams({ pickedExerciseId: undefined });
    addExerciseToWorkout(workoutId, pickedExerciseId)
      .then(() => reload())
      .catch(() => {
        Alert.alert('Save failed', 'Could not add exercise.');
        reload();
      });
  }, [pickedExerciseId, workoutId, reload, navigation]);

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
    navigation.navigate('ExerciseLibrary', { mode: 'pick', returnTo: 'ActiveWorkout' });
  }

  async function handleAddSet(we: WorkoutExerciseDetail) {
    const created = await addSet(we.id);
    patchExercise(we.id, (w) => ({ ...w, sets: [...w.sets, created] }));
  }

  async function editSetField(
    weId: string,
    setId: string,
    field: ExerciseTypeFieldDescriptor,
    raw: string
  ) {
    const column = SET_COLUMN[field.key];
    const value = parseSetFieldValue(field, raw);
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
      const exerciseType = requireExerciseType(we.exercise_type);
      if (!set || !hasLoggedValue(exerciseType, set)) {
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
    const exerciseId = detail?.exercises.find((we) => we.id === weId)?.exercise.id;
    if (!exerciseId) return;
    patchExercise(weId, (w) => ({ ...w, sets: w.sets.filter((s) => s.id !== setId) }));
    try {
      await deleteSet(setId, exerciseId);
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

  if (loading) {
    return (
      <View style={[styles.container, styles.center, { backgroundColor: c.bg }]}>
        <Text style={[styles.empty, { color: c.sub }]}>Loading workout...</Text>
      </View>
    );
  }

  if (loadError || !detail) {
    return (
      <View style={[styles.container, { backgroundColor: c.bg }]}>
        <ScreenHeader title="Workout" onLeadingPress={() => navigation.goBack()} />
        <Text style={[styles.empty, { color: c.sub }]}>{loadError ?? 'Workout not found.'}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: c.bg }]}>
      <ScreenHeader
        title={detail.name}
        onLeadingPress={() => navigation.goBack()}
        trailing={
          <View style={styles.headerActions}>
            <Pressable
              onPress={handleDiscard}
              hitSlop={8}
              accessibilityLabel="Discard workout"
              accessibilityRole="button"
            >
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
        renderItem={({ item, index }) => (
          <ActiveWorkoutExerciseItem
            item={item}
            index={index}
            prevSets={prevSets}
            prSetIds={prSetIds}
            onOpenExercise={(exerciseId) => navigation.navigate('ExerciseDetail', { exerciseId })}
            onEditSetField={editSetField}
            onToggleComplete={toggleComplete}
            onRemoveSet={removeSet}
            onAddSet={handleAddSet}
          />
        )}
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

type ActiveWorkoutExerciseItemProps = Readonly<{
  item: WorkoutExerciseDetail;
  index: number;
  prevSets: Record<string, LoggedSet[]>;
  prSetIds: Set<string>;
  onOpenExercise: (exerciseId: string) => void;
  onEditSetField: (
    weId: string,
    setId: string,
    field: ExerciseTypeFieldDescriptor,
    raw: string
  ) => void;
  onToggleComplete: (item: WorkoutExerciseDetail, setId: string, completed: boolean) => void;
  onRemoveSet: (weId: string, setId: string) => void;
  onAddSet: (item: WorkoutExerciseDetail) => void;
}>;

function ActiveWorkoutExerciseItem({
  item,
  index,
  prevSets,
  prSetIds,
  onOpenExercise,
  onEditSetField,
  onToggleComplete,
  onRemoveSet,
  onAddSet,
}: ActiveWorkoutExerciseItemProps) {
  const c = useTheme();
  const exerciseType = requireExerciseType(item.exercise_type);
  const fields = fieldsForExerciseType(exerciseType);

  return (
    <View style={[styles.exercise, { borderTopColor: c.sep }]}>
      <View style={styles.exerciseHeader}>
        <Pressable
          style={styles.exerciseNameRow}
          onPress={() => onOpenExercise(item.exercise.id)}
          hitSlop={8}
        >
          <Text style={[styles.exerciseName, { color: c.fg }]} numberOfLines={1} ellipsizeMode="tail">
            {item.exercise.name}
          </Text>
          <Icon name="information-outline" variant="sub" size={18} />
        </Pressable>
      </View>
      <View style={styles.columnHeader}>
        <Text style={[styles.columnLabel, { color: c.sub, width: 26, textAlign: 'center' }]}>SET</Text>
        <Text style={[styles.columnLabel, { color: c.sub, width: 52, textAlign: 'center' }]}>PREV</Text>
        {fields.map((field) => (
          <Text key={field.key} style={[styles.columnLabel, { color: c.sub, flex: 1, textAlign: 'center' }]}>
            {field.columnLabel.toUpperCase()}
          </Text>
        ))}
      </View>
      {item.sets.map((set, setIndex) => (
        <ActiveWorkoutSetRow
          key={set.id}
          set={set}
          setIndex={setIndex}
          exerciseIndex={index}
          exercise={item}
          fields={fields}
          previousSet={prevSets[item.exercise.id]?.[setIndex]}
          exerciseType={exerciseType}
          isPersonalRecord={prSetIds.has(set.id)}
          onEditSetField={onEditSetField}
          onToggleComplete={onToggleComplete}
          onRemoveSet={onRemoveSet}
        />
      ))}
      <Pressable
        style={styles.addSet}
        onPress={() => onAddSet(item)}
        accessibilityLabel={`Add set to ${item.exercise.name}`}
        accessibilityRole="button"
        testID={`workout-exercise-${index}-add-set`}
      >
        <Text style={[styles.addSetText, { color: c.accent }]}>+ Add set</Text>
      </Pressable>
    </View>
  );
}

type ActiveWorkoutSetRowProps = Readonly<{
  set: LoggedSet;
  setIndex: number;
  exerciseIndex: number;
  exercise: WorkoutExerciseDetail;
  fields: readonly ExerciseTypeFieldDescriptor[];
  previousSet?: LoggedSet;
  exerciseType: ExerciseType;
  isPersonalRecord: boolean;
  onEditSetField: (
    weId: string,
    setId: string,
    field: ExerciseTypeFieldDescriptor,
    raw: string
  ) => void;
  onToggleComplete: (item: WorkoutExerciseDetail, setId: string, completed: boolean) => void;
  onRemoveSet: (weId: string, setId: string) => void;
}>;

function ActiveWorkoutSetRow({
  set,
  setIndex,
  exerciseIndex,
  exercise,
  fields,
  previousSet,
  exerciseType,
  isPersonalRecord,
  onEditSetField,
  onToggleComplete,
  onRemoveSet,
}: ActiveWorkoutSetRowProps) {
  const c = useTheme();
  const previousValue = previousSet ? formatCompactSet(exerciseType, previousSet) : '–';
  const completedIconColor = set.completed ? '#fff' : c.sub;

  return (
    <View
      style={[
        styles.setRow,
        set.completed ? { backgroundColor: c.asoft, borderRadius: 10 } : null,
      ]}
    >
      <Text style={[styles.setIndex, { color: c.sub }]}>{setIndex + 1}</Text>
      <Text style={[styles.prevValue, { color: c.sub }]} numberOfLines={1}>
        {previousValue}
      </Text>
      <SetFieldInputs
        fields={fields}
        inputStyle={styles.setInput}
        valueForField={(field) => (set[SET_COLUMN[field]] as number | null)?.toString() ?? ''}
        onChangeField={(field, text) => onEditSetField(exercise.id, set.id, field, text)}
        accessibilityLabelForField={(field) =>
          `Workout set ${setIndex + 1} ${field.inputLabel} for ${exercise.exercise.name}`
        }
        testIDForField={(field) => `workout-set-${exerciseIndex}-${setIndex}-${field}`}
      />
      {isPersonalRecord ? <Text style={styles.prBadge}>🏆</Text> : null}
      <Pressable
        style={[
          styles.check,
          { borderColor: c.chipbd },
          set.completed && { backgroundColor: c.accent, borderColor: c.accent },
        ]}
        onPress={() => onToggleComplete(exercise, set.id, !set.completed)}
        accessibilityLabel={`${set.completed ? 'Uncomplete' : 'Complete'} set ${setIndex + 1} for ${exercise.exercise.name}`}
        accessibilityRole="button"
        testID={`workout-set-${exerciseIndex}-${setIndex}-complete`}
      >
        <Icon name="check" size={18} color={completedIconColor} />
      </Pressable>
      <Pressable
        onPress={() => onRemoveSet(exercise.id, set.id)}
        hitSlop={8}
        accessibilityLabel={`Remove set ${setIndex + 1} from ${exercise.exercise.name}`}
        accessibilityRole="button"
        testID={`workout-set-${exerciseIndex}-${setIndex}-remove`}
      >
        <Icon name="close" variant="sub" size={16} />
      </Pressable>
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
  center: { justifyContent: 'center' },
  empty: { textAlign: 'center', marginTop: 24, paddingHorizontal: 16 },
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
