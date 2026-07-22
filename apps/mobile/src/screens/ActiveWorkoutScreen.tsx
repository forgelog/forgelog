import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { BottomSheet, BottomSheetView } from '@expo/ui/community/bottom-sheet';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '../components/Icon';
import { KeyboardAwareListScrollView } from '../components/KeyboardAwareListScrollView';
import { PillButton } from '../components/PillButton';
import { ScreenHeader } from '../components/ScreenHeader';
import { SetFieldInputs } from '../components/SetFieldInputs';
import {
  completeSet,
  deleteExerciseFromWorkout,
  deleteSet,
  discardWorkout,
  finishWorkoutWithRoutineAction,
  getWorkoutFinishPlan,
  uncompleteSet,
  updateSetAndRecomputeRecords,
  type WorkoutFinishAction,
} from '../application/activeWorkout';
import { FinishWorkoutSheet, type FinishWorkoutSheetState } from '../components/FinishWorkoutSheet';
import { mobileStore, type LoggedSetValueUpdate } from '../db/mobileStore';
import type {
  LoggedSet,
  PersonalRecordEvent,
  WorkoutDetail,
  WorkoutExerciseDetail,
} from '../db/types';
import { formatElapsed } from '../domain/elapsed';
import {
  fieldsForExerciseType,
  formatCompactSet,
  hasLoggedValue,
  parseSetFieldValue,
  requireExerciseType,
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

const PERSONAL_RECORD_TOAST_DURATION_MS = 3000;

type PersonalRecordNotice = {
  id: number;
  title: string;
  detail: string;
};

type ExerciseOptionsState = {
  exercise: WorkoutExerciseDetail;
  closing?: boolean;
};

export function ActiveWorkoutScreen({ route, navigation }: Props) {
  const { workoutId, pickedExerciseId } = route.params;
  const c = useTheme();
  const [detail, setDetail] = useState<WorkoutDetail | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [prSetIds, setPrSetIds] = useState<Set<string>>(new Set());
  const [prevSets, setPrevSets] = useState<Record<string, LoggedSet[]>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [personalRecordNotice, setPersonalRecordNotice] = useState<PersonalRecordNotice | null>(
    null
  );
  const [toastTop, setToastTop] = useState<number | null>(null);
  const [exerciseOptions, setExerciseOptions] = useState<ExerciseOptionsState | null>(null);
  const [finishSheet, setFinishSheet] = useState<FinishWorkoutSheetState | null>(null);
  const [preparingFinish, setPreparingFinish] = useState(false);
  const reloadRequestId = useRef(0);
  const personalRecordNoticeId = useRef(0);
  const reorderPending = useRef(false);
  const exerciseListRef = useRef<FlatList<WorkoutExerciseDetail> | null>(null);
  const previousExerciseCount = useRef<number | null>(null);
  const pickedExerciseIdRef = useRef(pickedExerciseId);

  const reload = useCallback((options: { showLoading?: boolean } = {}) => {
    const { showLoading = true } = options;
    let current = true;
    const requestId = reloadRequestId.current + 1;
    reloadRequestId.current = requestId;
    const isCurrent = () => current && reloadRequestId.current === requestId;
    if (showLoading) setLoading(true);
    setLoadError(null);
    mobileStore.workouts
      .getDetail(workoutId)
      .then(async (d) => {
        if (!isCurrent()) return;
        if (!d) {
          setDetail(null);
          setPrevSets({});
          setLoadError('Workout not found.');
          return;
        }
        const entries = await Promise.all(
          d.exercises.map(
            async (we) =>
              [
                we.exercise.id,
                await mobileStore.workouts.getPreviousExerciseSets(we.exercise.id, workoutId),
              ] as const
          )
        );
        const recordEvents = await mobileStore.records.getEventsForWorkout(workoutId);
        if (!isCurrent()) return;
        setDetail(d);
        setPrevSets(Object.fromEntries(entries));
        setPrSetIds(eventSetIds(recordEvents));
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

  useEffect(() => {
    pickedExerciseIdRef.current = pickedExerciseId;
  }, [pickedExerciseId]);

  useFocusEffect(
    useCallback(() => reload({ showLoading: !pickedExerciseIdRef.current }), [reload])
  );

  useEffect(() => {
    if (loading) return;
    if (!detail) {
      previousExerciseCount.current = null;
      return;
    }
    const exerciseCount = detail.exercises.length;
    const previousCount = previousExerciseCount.current;
    previousExerciseCount.current = exerciseCount;
    if (previousCount === null || exerciseCount <= previousCount) return;
    exerciseListRef.current?.scrollToIndex({
      index: exerciseCount - 1,
      animated: true,
      viewPosition: 1,
    });
  }, [detail, loading]);

  const showPersonalRecordToast = useCallback((recordEvents: PersonalRecordEvent[]) => {
    personalRecordNoticeId.current += 1;
    setPersonalRecordNotice({
      id: personalRecordNoticeId.current,
      ...noticeForRecordEvents(recordEvents),
    });
  }, []);

  const dismissPersonalRecordToast = useCallback((noticeId: number) => {
    setPersonalRecordNotice((current) => (current?.id === noticeId ? null : current));
  }, []);

  const handleTimerLayout = useCallback((event: LayoutChangeEvent) => {
    const nextTop = event.nativeEvent.layout.y + event.nativeEvent.layout.height + 8;
    setToastTop((currentTop) => (currentTop === nextTop ? currentTop : nextTop));
  }, []);

  useEffect(() => {
    if (!pickedExerciseId) return;
    navigation.setParams({ pickedExerciseId: undefined });
    mobileStore.workouts
      .addExercise(workoutId, pickedExerciseId)
      .then(() => reload({ showLoading: false }))
      .catch(() => {
        Alert.alert('Save failed', 'Could not add exercise.');
        reload({ showLoading: false });
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

  function patchExercise(weId: string, fn: (we: WorkoutExerciseDetail) => WorkoutExerciseDetail) {
    setDetail((prev) =>
      prev ? { ...prev, exercises: prev.exercises.map((w) => (w.id === weId ? fn(w) : w)) } : prev
    );
  }

  function handleAddExercise() {
    navigation.navigate('ExerciseLibrary', { mode: 'pick', returnTo: 'ActiveWorkout' });
  }

  async function handleAddSet(we: WorkoutExerciseDetail) {
    const created = await mobileStore.workouts.addSet(we.id);
    patchExercise(we.id, (w) => ({ ...w, sets: [...w.sets, created] }));
  }

  function moveExercise(exerciseId: string, delta: -1 | 1) {
    if (reorderPending.current || !detail) return;
    const index = detail.exercises.findIndex((exercise) => exercise.id === exerciseId);
    const targetIndex = index + delta;
    if (index < 0 || targetIndex < 0 || targetIndex >= detail.exercises.length) return;
    reorderPending.current = true;
    setDetail((current) => {
      if (!current) return current;
      const currentIndex = current.exercises.findIndex((exercise) => exercise.id === exerciseId);
      const currentTargetIndex = currentIndex + delta;
      if (
        currentIndex < 0 ||
        currentTargetIndex < 0 ||
        currentTargetIndex >= current.exercises.length
      ) {
        return current;
      }
      const exercises = [...current.exercises];
      [exercises[currentIndex], exercises[currentTargetIndex]] = [
        exercises[currentTargetIndex],
        exercises[currentIndex],
      ];
      return { ...current, exercises };
    });
    void mobileStore.workouts
      .moveExercise(exerciseId, delta)
      .catch(() => {
        Alert.alert('Save failed', 'Could not reorder exercise.');
        reload();
      })
      .finally(() => {
        reorderPending.current = false;
      });
  }

  async function editSetField(
    weId: string,
    exerciseId: string,
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
      await updateSetAndRecomputeRecords(setId, exerciseId, {
        [column]: value,
      } as LoggedSetValueUpdate);
      await refreshPrSetIds(workoutId, setPrSetIds);
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
        const { recordEvents } = await completeSet(setId, we.exercise.id);
        await refreshPrSetIds(workoutId, setPrSetIds);
        if (recordEvents.length > 0) {
          showPersonalRecordToast(recordEvents);
        }
      } else {
        await uncompleteSet(setId, we.exercise.id);
        await refreshPrSetIds(workoutId, setPrSetIds);
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
      await refreshPrSetIds(workoutId, setPrSetIds);
    } catch {
      Alert.alert('Save failed', 'Could not delete set.');
      reload();
    }
  }

  function showExerciseOptions(exercise: WorkoutExerciseDetail) {
    setExerciseOptions({ exercise });
  }

  function closeExerciseOptions() {
    setExerciseOptions((current) => (current ? { ...current, closing: true } : current));
  }

  async function removeExercise(exercise: WorkoutExerciseDetail) {
    try {
      await deleteExerciseFromWorkout(exercise.id, exercise.exercise.id);
      await refreshPrSetIds(workoutId, setPrSetIds);
      setDetail((current) =>
        current
          ? { ...current, exercises: current.exercises.filter((item) => item.id !== exercise.id) }
          : current
      );
    } catch {
      Alert.alert('Save failed', 'Could not remove exercise.');
      reload();
    }
  }

  function confirmRemoveExercise(exercise: WorkoutExerciseDetail) {
    closeExerciseOptions();
    Alert.alert('Remove exercise', `Remove ${exercise.exercise.name} from this workout?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => removeExercise(exercise),
      },
    ]);
  }

  async function handleFinish() {
    if (!detail || !mobileStore.workouts.hasCompletedSet(detail.exercises)) {
      Alert.alert('No sets completed', 'Complete at least one set before finishing.');
      return;
    }
    setPreparingFinish(true);
    try {
      const plan = await getWorkoutFinishPlan(workoutId);
      setFinishSheet({
        plan,
        routineName: plan.kind === 'freestyle' ? plan.suggestedName : '',
      });
    } catch {
      Alert.alert('Finish failed', 'Could not prepare this workout for finishing.');
    } finally {
      setPreparingFinish(false);
    }
  }

  function closeFinishSheet() {
    setFinishSheet((current) => (current ? { ...current, closing: true } : current));
  }

  async function finishWithAction(action: WorkoutFinishAction) {
    setFinishSheet((current) =>
      current ? { ...current, saving: true, error: undefined } : current
    );
    try {
      await finishWorkoutWithRoutineAction(workoutId, action);
      navigation.popToTop();
    } catch {
      setFinishSheet((current) =>
        current
          ? {
              ...current,
              saving: false,
              error: 'Could not finish this workout. Your workout is still active.',
            }
          : current
      );
    }
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
            <PillButton
              label={preparingFinish ? 'Loading...' : 'Finish'}
              onPress={handleFinish}
              variant="filled"
              disabled={preparingFinish}
            />
          </View>
        }
      />
      <Text style={[styles.timer, { color: c.accent }]} onLayout={handleTimerLayout}>
        {formatElapsed(elapsed)}
      </Text>
      <FlatList
        ref={exerciseListRef}
        data={detail.exercises}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item, index }) => (
          <ActiveWorkoutExerciseItem
            item={item}
            index={index}
            prevSets={prevSets}
            prSetIds={prSetIds}
            onOpenExercise={(exerciseId) => navigation.navigate('ExerciseDetail', { exerciseId })}
            onMoveExercise={moveExercise}
            onOpenOptions={showExerciseOptions}
            onEditSetField={editSetField}
            onToggleComplete={toggleComplete}
            onRemoveSet={removeSet}
            onAddSet={handleAddSet}
          />
        )}
        renderScrollComponent={KeyboardAwareListScrollView}
        onScrollToIndexFailed={() => exerciseListRef.current?.scrollToEnd({ animated: true })}
        testID="workout-keyboard-aware-scroll-view"
        ListFooterComponent={
          <PillButton
            label="Add Exercise"
            onPress={handleAddExercise}
            variant="outlined"
            style={styles.addExercise}
          />
        }
      />
      <ExerciseOptionsSheet
        state={exerciseOptions}
        onClose={closeExerciseOptions}
        onClosed={() => setExerciseOptions(null)}
        onRemove={confirmRemoveExercise}
      />
      <FinishWorkoutSheet
        state={finishSheet}
        onClose={closeFinishSheet}
        onClosed={() => setFinishSheet(null)}
        onNameChange={(routineName) =>
          setFinishSheet((current) => (current ? { ...current, routineName } : current))
        }
        onFinish={finishWithAction}
      />
      {personalRecordNotice ? (
        <PersonalRecordToast
          notice={personalRecordNotice}
          top={toastTop}
          onHidden={dismissPersonalRecordToast}
        />
      ) : null}
    </View>
  );
}

type PersonalRecordToastProps = Readonly<{
  notice: PersonalRecordNotice;
  top: number | null;
  onHidden: (noticeId: number) => void;
}>;

function PersonalRecordToast({ notice, top, onHidden }: PersonalRecordToastProps) {
  const c = useTheme();
  const [opacity] = useState(() => new Animated.Value(0));
  const [translateY] = useState(() => new Animated.Value(-12));

  useEffect(() => {
    opacity.setValue(0);
    translateY.setValue(-12);
    const enter = Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 180, useNativeDriver: true }),
    ]);
    let exit: Animated.CompositeAnimation | undefined;
    enter.start();
    const timeout = setTimeout(() => {
      exit = Animated.parallel([
        Animated.timing(opacity, { toValue: 0, duration: 180, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: -8, duration: 180, useNativeDriver: true }),
      ]);
      exit.start(({ finished }) => {
        if (finished) onHidden(notice.id);
      });
    }, PERSONAL_RECORD_TOAST_DURATION_MS);

    return () => {
      clearTimeout(timeout);
      enter.stop();
      exit?.stop();
    };
  }, [notice.id, onHidden, opacity, translateY]);

  return (
    <View pointerEvents="none" style={[styles.toastLayer, { top: top ?? 128 }]}>
      <Animated.View
        accessibilityLabel={`${notice.title}. ${notice.detail}`}
        accessibilityLiveRegion="polite"
        style={[
          styles.toast,
          {
            backgroundColor: c.card,
            borderColor: c.accent,
            opacity,
            transform: [{ translateY }],
          },
        ]}
        testID="personal-record-toast"
      >
        <View style={[styles.toastIcon, { backgroundColor: c.accent }]}>
          <Icon name="trophy-outline" color={c.bg} size={18} />
        </View>
        <View style={styles.toastCopy}>
          <Text style={[styles.toastTitle, { color: c.fg }]}>{notice.title}</Text>
          <Text style={[styles.toastDetail, { color: c.sub }]} numberOfLines={1}>
            {notice.detail}
          </Text>
        </View>
      </Animated.View>
    </View>
  );
}

type ActiveWorkoutExerciseItemProps = Readonly<{
  item: WorkoutExerciseDetail;
  index: number;
  prevSets: Record<string, LoggedSet[]>;
  prSetIds: Set<string>;
  onOpenExercise: (exerciseId: string) => void;
  onMoveExercise: (exerciseId: string, delta: -1 | 1) => void;
  onOpenOptions: (exercise: WorkoutExerciseDetail) => void;
  onEditSetField: (
    weId: string,
    exerciseId: string,
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
  onMoveExercise,
  onOpenOptions,
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
          accessibilityLabel={`View ${item.exercise.name} details`}
          accessibilityRole="button"
        >
          <Text
            style={[styles.exerciseName, { color: c.fg }]}
            numberOfLines={1}
            ellipsizeMode="tail"
            testID={`workout-exercise-${index}-name`}
          >
            {item.exercise.name}
          </Text>
          <Icon name="information-outline" variant="sub" size={18} />
        </Pressable>
        <View style={styles.exerciseHeaderActions}>
          <Pressable
            onPress={() => onMoveExercise(item.id, -1)}
            hitSlop={8}
            accessibilityLabel={`Move ${item.exercise.name} up`}
            accessibilityRole="button"
            testID={`workout-exercise-${index}-move-up`}
          >
            <Icon name="chevron-up" variant="sub" size={20} />
          </Pressable>
          <Pressable
            onPress={() => onMoveExercise(item.id, 1)}
            hitSlop={8}
            accessibilityLabel={`Move ${item.exercise.name} down`}
            accessibilityRole="button"
            testID={`workout-exercise-${index}-move-down`}
          >
            <Icon name="chevron-down" variant="sub" size={20} />
          </Pressable>
          <Pressable
            onPress={() => onOpenOptions(item)}
            hitSlop={8}
            accessibilityLabel={`Exercise options ${item.exercise.name}`}
            accessibilityRole="button"
            testID={`workout-exercise-${index}-options`}
          >
            <Icon name="dots-vertical" variant="sub" size={20} />
          </Pressable>
        </View>
      </View>
      <View style={styles.columnHeader}>
        <Text style={[styles.columnLabel, styles.setColumn, { color: c.sub }]}>SET</Text>
        <Text style={[styles.columnLabel, styles.previousColumn, { color: c.sub }]}>PREV</Text>
        <View style={styles.fieldColumns}>
          {fields.map((field) => (
            <Text
              key={field.key}
              style={[styles.columnLabel, styles.fieldColumnLabel, { color: c.sub }]}
            >
              {field.columnLabel.toUpperCase()}
            </Text>
          ))}
        </View>
        <View style={styles.actionsSpacer} />
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

type ExerciseOptionsSheetProps = Readonly<{
  state: ExerciseOptionsState | null;
  onClose: () => void;
  onClosed: () => void;
  onRemove: (exercise: WorkoutExerciseDetail) => void;
}>;

function ExerciseOptionsSheet({ state, onClose, onClosed, onRemove }: ExerciseOptionsSheetProps) {
  const c = useTheme();

  if (!state) return null;

  const { exercise } = state;
  return (
    <BottomSheet
      index={state.closing ? -1 : 0}
      enableDynamicSizing
      enablePanDownToClose
      onClose={onClosed}
      backgroundStyle={{ backgroundColor: c.card }}
    >
      <BottomSheetView style={styles.sheet}>
        <SafeAreaView edges={['bottom']} style={styles.sheetSafeArea}>
          <View testID="workout-exercise-options-sheet">
            <View style={styles.sheetHeader}>
              <Text style={[styles.sheetTitle, { color: c.fg }]} numberOfLines={1}>
                {exercise.exercise.name}
              </Text>
            </View>
            <Pressable
              style={[styles.sheetAction, { borderTopColor: c.sep }]}
              onPress={() => onRemove(exercise)}
              accessibilityLabel={`Remove ${exercise.exercise.name} from workout`}
              accessibilityRole="button"
              testID="workout-exercise-action-remove"
            >
              <Icon name="trash-can-outline" color={c.danger} size={20} />
              <Text style={[styles.sheetActionText, { color: c.danger }]}>Remove exercise</Text>
            </Pressable>
            <Pressable
              style={[styles.sheetCancel, { backgroundColor: c.fill }]}
              onPress={onClose}
              accessibilityLabel="Cancel exercise options"
              accessibilityRole="button"
            >
              <Text style={[styles.sheetCancelText, { color: c.fg }]}>Cancel</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </BottomSheetView>
    </BottomSheet>
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
    exerciseId: string,
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
      style={[styles.setRow, set.completed ? { backgroundColor: c.asoft, borderRadius: 10 } : null]}
    >
      <Text style={[styles.setIndex, { color: c.sub }]}>{setIndex + 1}</Text>
      <Text style={[styles.prevValue, { color: c.sub }]} numberOfLines={1}>
        {previousValue}
      </Text>
      <SetFieldInputs
        fields={fields}
        containerStyle={styles.fieldColumns}
        inputStyle={styles.setInput}
        valueForField={(field) => set[SET_COLUMN[field]] as number | null}
        onChangeField={(field, text) =>
          onEditSetField(exercise.id, exercise.exercise.id, set.id, field, text)
        }
        accessibilityLabelForField={(field) =>
          `Workout set ${setIndex + 1} ${field.inputLabel} for ${exercise.exercise.name}`
        }
        testIDForField={(field) => `workout-set-${exerciseIndex}-${setIndex}-${field}`}
      />
      {isPersonalRecord ? <Text style={styles.prBadge}>PR</Text> : null}
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

function label(recordType: string): string {
  return (
    {
      max_weight: 'Max weight',
      max_reps: 'Max reps',
      max_volume: 'Max volume',
      est_1rm: 'Est. 1RM',
    }[recordType] ?? recordType
  );
}

function noticeForRecordEvents(
  recordEvents: PersonalRecordEvent[]
): Omit<PersonalRecordNotice, 'id'> {
  if (recordEvents.length === 1) {
    const [event] = recordEvents;
    return {
      title: 'New personal record',
      detail: `${label(event.record_type)} · ${formatRecordValue(event)}`,
    };
  }
  return {
    title: `${recordEvents.length} new personal records`,
    detail: recordEvents.map((event) => label(event.record_type)).join(' · '),
  };
}

function formatRecordValue(event: PersonalRecordEvent): string {
  const value = round(event.value);
  if (event.record_type === 'max_reps') return `${value} reps`;
  if (event.record_type === 'max_volume') return `${value} kg volume`;
  return `${value} kg`;
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

function eventSetIds(events: { logged_set_id: string | null }[]): Set<string> {
  return new Set(events.flatMap((event) => (event.logged_set_id ? [event.logged_set_id] : [])));
}

async function refreshPrSetIds(
  workoutId: string,
  setIds: (ids: Set<string>) => void
): Promise<void> {
  setIds(eventSetIds(await mobileStore.records.getEventsForWorkout(workoutId)));
}

const styles = StyleSheet.create({
  container: { flex: 1, position: 'relative' },
  center: { justifyContent: 'center' },
  empty: { textAlign: 'center', marginTop: 24, paddingHorizontal: 16 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  timer: {
    fontSize: 28,
    fontWeight: '700',
    textAlign: 'center',
    paddingVertical: 8,
    fontVariant: ['tabular-nums'],
  },
  toastLayer: {
    position: 'absolute',
    left: 12,
    right: 12,
    zIndex: 1,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 60,
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
  },
  toastIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toastCopy: { flex: 1, minWidth: 0 },
  toastTitle: { fontSize: 15, fontWeight: '700' },
  toastDetail: { marginTop: 2, fontSize: 13 },
  exercise: { paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1 },
  exerciseHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  exerciseNameRow: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 6 },
  exerciseName: { fontSize: 16, fontWeight: '700', flexShrink: 1 },
  exerciseHeaderActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sheet: { paddingHorizontal: 16, paddingTop: 8 },
  sheetSafeArea: { gap: 4 },
  sheetHeader: {
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 8,
  },
  sheetTitle: { maxWidth: '100%', fontSize: 17, fontWeight: '700', textAlign: 'center' },
  sheetAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 52,
    borderTopWidth: 1,
  },
  sheetActionText: { fontSize: 16, fontWeight: '600' },
  sheetCancel: {
    minHeight: 48,
    borderRadius: 14,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    marginBottom: 8,
  },
  sheetCancelText: { fontSize: 16, fontWeight: '700' },
  columnHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  columnLabel: { fontSize: 11, fontWeight: '700' },
  setColumn: { width: 26, textAlign: 'center' },
  previousColumn: { width: 52, textAlign: 'center' },
  fieldColumns: { flex: 1, minWidth: 0, flexDirection: 'row', gap: 8 },
  fieldColumnLabel: { flex: 1, textAlign: 'center' },
  actionsSpacer: { width: 60 },
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
});
