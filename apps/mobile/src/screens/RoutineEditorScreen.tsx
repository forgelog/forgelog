import { CommonActions, usePreventRemove } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Icon } from '../components/Icon';
import { KeyboardAwareListScrollView } from '../components/KeyboardAwareListScrollView';
import { PillButton } from '../components/PillButton';
import { ScreenHeader } from '../components/ScreenHeader';
import { SetFieldInputs } from '../components/SetFieldInputs';
import { mobileStore } from '../db/mobileStore';
import {
  addExerciseToDraft,
  addSetToDraft,
  createEmptyRoutineDraft,
  moveExerciseInDraft,
  removeExerciseFromDraft,
  removeSetFromDraft,
  routineDetailToDraft,
  updateDraftName,
  updateDraftNotes,
  updateDraftSetField,
  validateRoutineDraft,
  type RoutineDraft,
  type RoutineExerciseDraft,
  type RoutineSetDraft,
} from '../domain/routineDraft';
import { getRoutineTemplate, routineTemplateToDraft } from '../domain/routineTemplates';
import {
  fieldsForExerciseType,
  requireExerciseType,
  type ExerciseTypeFieldDescriptor,
  type SetFieldKey,
} from '../domain/setFields';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { useTheme } from '../theme/ThemeContext';
import { NAME_MAX_LENGTH, NOTES_MAX_LENGTH, validateText } from '../validation/textInput';

type Props = NativeStackScreenProps<RootStackParamList, 'RoutineEditor'>;
type NavigationAction = Parameters<Props['navigation']['dispatch']>[0];

type RoutineEditorMode =
  | { kind: 'create'; templateId?: string }
  | { kind: 'edit'; routineId: string };

type RoutineDraftController = {
  state: {
    draft: RoutineDraft | null;
    loading: boolean;
    loadFailed: boolean;
    dirty: boolean;
    submitting: boolean;
    nameError: string | null;
    notesError: string | null;
  };
  actions: {
    updateName(value: string): void;
    updateNotes(value: string): void;
    addPickedExercise(exerciseId: string): Promise<void>;
    addSet(exerciseLocalId: string): void;
    removeSet(exerciseLocalId: string, setLocalId: string): void;
    removeExercise(exerciseLocalId: string): void;
    moveExercise(index: number, delta: number): void;
    updateSetField(
      exerciseLocalId: string,
      setLocalId: string,
      field: ExerciseTypeFieldDescriptor,
      raw: string
    ): void;
    save(): Promise<boolean>;
    close(): void;
    openExercisePicker(): void;
    openExerciseDetails(exerciseId: string): void;
  };
  meta: {
    mode: RoutineEditorMode;
  };
};

const RoutineDraftContext = createContext<RoutineDraftController | null>(null);

const SET_COLUMN: Record<SetFieldKey, keyof RoutineSetDraft> = {
  weight: 'target_weight',
  reps: 'target_reps',
  duration: 'target_duration_seconds',
  distance: 'target_distance_meters',
};

export function RoutineEditorScreen({ route, navigation }: Props) {
  const routineId = route.params?.routineId;
  const templateId = route.params?.templateId;
  const pickedExerciseId = route.params?.pickedExerciseId;
  const mode: RoutineEditorMode = useMemo(
    () => (routineId ? { kind: 'edit', routineId } : { kind: 'create', templateId }),
    [routineId, templateId]
  );

  return mode.kind === 'edit' ? (
    <EditRoutineEditor mode={mode} pickedExerciseId={pickedExerciseId} navigation={navigation} />
  ) : (
    <CreateRoutineEditor mode={mode} pickedExerciseId={pickedExerciseId} navigation={navigation} />
  );
}

type EditorWrapperProps = Readonly<{
  mode: RoutineEditorMode;
  pickedExerciseId?: string;
  navigation: Props['navigation'];
}>;

function CreateRoutineEditor({ mode, pickedExerciseId, navigation }: EditorWrapperProps) {
  return (
    <RoutineDraftProvider mode={mode} pickedExerciseId={pickedExerciseId} navigation={navigation}>
      <RoutineDraftFrame />
    </RoutineDraftProvider>
  );
}

function EditRoutineEditor({ mode, pickedExerciseId, navigation }: EditorWrapperProps) {
  return (
    <RoutineDraftProvider mode={mode} pickedExerciseId={pickedExerciseId} navigation={navigation}>
      <RoutineDraftFrame />
    </RoutineDraftProvider>
  );
}

type RoutineDraftProviderProps = Readonly<{
  children: ReactNode;
  mode: RoutineEditorMode;
  pickedExerciseId?: string;
  navigation: Props['navigation'];
}>;

function RoutineDraftProvider({
  children,
  mode,
  pickedExerciseId,
  navigation,
}: RoutineDraftProviderProps) {
  const [draft, setDraft] = useState<RoutineDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [notesError, setNotesError] = useState<string | null>(null);

  const nextLocalId = useRef(0);
  const pendingRemovalAction = useRef<NavigationAction | null>(null);
  const exitPromptOpen = useRef(false);
  const submittingRef = useRef(false);
  const pendingPickedExerciseIds = useRef<string[]>([]);
  const processingPickedExercises = useRef(false);

  const makeLocalId = useCallback(() => `routine-draft-${nextLocalId.current++}`, []);

  useEffect(() => {
    let active = true;
    nextLocalId.current = 0;

    if (mode.kind === 'create' && !mode.templateId) {
      void Promise.resolve().then(() => {
        if (!active) return;
        setDraft(createEmptyRoutineDraft());
        setDirty(false);
        setLoading(false);
        setLoadFailed(false);
        setNameError(null);
        setNotesError(null);
      });
      return () => {
        active = false;
      };
    }

    void (async () => {
      setLoading(true);
      setLoadFailed(false);
      setNameError(null);
      setNotesError(null);
      try {
        if (mode.kind === 'create') {
          const template = getRoutineTemplate(mode.templateId as string);
          if (!template) throw new Error('Routine template not found');
          const exercises = await Promise.all(
            template.exercises.map(({ exerciseId }) => mobileStore.exercises.get(exerciseId))
          );
          if (!active) return;
          setDraft(
            routineTemplateToDraft(
              template,
              exercises.filter((exercise) => exercise !== null),
              makeLocalId
            )
          );
          setDirty(false);
          return;
        }
        const detail = await mobileStore.routines.getDetail(mode.routineId);
        if (!active) return;
        if (!detail) {
          setDraft(null);
          setLoadFailed(true);
          return;
        }
        setDraft(routineDetailToDraft(detail, makeLocalId));
        setDirty(false);
      } catch {
        if (!active) return;
        setDraft(null);
        setLoadFailed(true);
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [makeLocalId, mode]);

  usePreventRemove(dirty || submitting, ({ data }) => {
    if (submitting) {
      Alert.alert('Save in progress', 'Wait for the routine to finish saving before leaving.');
      return;
    }
    if (exitPromptOpen.current) return;
    exitPromptOpen.current = true;
    Alert.alert('Discard changes?', 'You have unsaved changes. Discard them?', [
      {
        text: 'Keep editing',
        style: 'cancel',
        onPress: () => {
          exitPromptOpen.current = false;
        },
      },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: () => {
          pendingRemovalAction.current = data.action;
          setDirty(false);
        },
      },
    ]);
  });

  useEffect(() => {
    if (dirty || submitting || !pendingRemovalAction.current) return;
    const action = pendingRemovalAction.current;
    pendingRemovalAction.current = null;
    exitPromptOpen.current = false;
    navigation.dispatch(action);
  }, [dirty, navigation, submitting]);

  const updateDraft = useCallback((update: (current: RoutineDraft) => RoutineDraft) => {
    if (submittingRef.current) return;
    setDraft((current) => {
      if (!current) return current;
      const next = update(current);
      if (next !== current) setDirty(true);
      return next;
    });
  }, []);

  const updateName = useCallback((value: string) => {
    if (submittingRef.current) return;
    setNameError(
      validateText(value, {
        required: true,
        maxLength: NAME_MAX_LENGTH,
        fieldLabel: 'Routine name',
      }).error
    );
    updateDraft((current) => updateDraftName(current, value));
  }, [updateDraft]);

  const updateNotes = useCallback((value: string) => {
    if (submittingRef.current) return;
    setNotesError(
      validateText(value, {
        maxLength: NOTES_MAX_LENGTH,
        fieldLabel: 'Notes',
        multiline: true,
      }).error
    );
    updateDraft((current) => updateDraftNotes(current, value));
  }, [updateDraft]);

  const addPickedExercise = useCallback(async (exerciseId: string) => {
    if (submittingRef.current) return;
    try {
      const exercise = await mobileStore.exercises.get(exerciseId);
      if (!exercise) {
        Alert.alert('Save failed', 'Could not add exercise.');
        return;
      }
      setDraft((current) => {
        if (!current || submittingRef.current) return current;
        setDirty(true);
        return addExerciseToDraft(current, exercise, makeLocalId);
      });
    } catch {
      Alert.alert('Save failed', 'Could not add exercise.');
    }
  }, [makeLocalId]);

  useEffect(() => {
    if (!pickedExerciseId) return;
    navigation.setParams({ pickedExerciseId: undefined });
    if (!draft) {
      pendingPickedExerciseIds.current.push(pickedExerciseId);
      return;
    }
    void Promise.resolve().then(() => addPickedExercise(pickedExerciseId));
  }, [addPickedExercise, draft, navigation, pickedExerciseId]);

  useEffect(() => {
    if (!draft || processingPickedExercises.current || pendingPickedExerciseIds.current.length === 0) {
      return;
    }
    const exerciseIds = pendingPickedExerciseIds.current.splice(0);
    processingPickedExercises.current = true;
    void (async () => {
      for (const exerciseId of exerciseIds) {
        await addPickedExercise(exerciseId);
      }
      processingPickedExercises.current = false;
    })();
  }, [addPickedExercise, draft]);

  const addSet = useCallback((exerciseLocalId: string) => {
    updateDraft((current) => addSetToDraft(current, exerciseLocalId, makeLocalId));
  }, [makeLocalId, updateDraft]);

  const removeSet = useCallback((exerciseLocalId: string, setLocalId: string) => {
    updateDraft((current) => removeSetFromDraft(current, exerciseLocalId, setLocalId));
  }, [updateDraft]);

  const removeExercise = useCallback((exerciseLocalId: string) => {
    updateDraft((current) => removeExerciseFromDraft(current, exerciseLocalId));
  }, [updateDraft]);

  const moveExercise = useCallback((index: number, delta: number) => {
    updateDraft((current) => moveExerciseInDraft(current, index, delta));
  }, [updateDraft]);

  const updateSetField = useCallback(
    (exerciseLocalId: string, setLocalId: string, field: ExerciseTypeFieldDescriptor, raw: string) => {
      updateDraft((current) => updateDraftSetField(current, exerciseLocalId, setLocalId, field, raw));
    },
    [updateDraft]
  );

  const save = useCallback(async () => {
    if (!draft || submittingRef.current) return false;
    submittingRef.current = true;
    setSubmitting(true);

    const result = validateRoutineDraft(draft);
    setNameError(result.errors.name);
    setNotesError(result.errors.notes);
    if (!result.ok) {
      submittingRef.current = false;
      setSubmitting(false);
      if (result.errors.name) {
        Alert.alert('Name required', 'Give this routine a name before saving.');
      } else if (result.errors.notes) {
        Alert.alert('Save failed', 'Fix the highlighted fields before saving.');
      } else if (result.errors.exercises) {
        Alert.alert('No exercises', 'Add at least one exercise before saving.');
      }
      return false;
    }

    try {
      await mobileStore.routines.saveDraft(result.value);
      const action = CommonActions.goBack();
      pendingRemovalAction.current = action;
      submittingRef.current = false;
      setSubmitting(false);
      setDirty(false);
      return true;
    } catch {
      submittingRef.current = false;
      setSubmitting(false);
      Alert.alert('Save failed', 'Could not save routine.');
      return false;
    }
  }, [draft]);

  const close = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  const openExercisePicker = useCallback(() => {
    if (submittingRef.current) return;
    navigation.navigate('ExerciseLibrary', { mode: 'pick', returnTo: 'RoutineEditor' });
  }, [navigation]);

  const openExerciseDetails = useCallback(
    (exerciseId: string) => navigation.navigate('ExerciseDetail', { exerciseId }),
    [navigation]
  );

  const controller = useMemo<RoutineDraftController>(
    () => ({
      state: { draft, loading, loadFailed, dirty, submitting, nameError, notesError },
      actions: {
        updateName,
        updateNotes,
        addPickedExercise,
        addSet,
        removeSet,
        removeExercise,
        moveExercise,
        updateSetField,
        save,
        close,
        openExercisePicker,
        openExerciseDetails,
      },
      meta: { mode },
    }),
    [
      addPickedExercise,
      addSet,
      close,
      dirty,
      draft,
      loadFailed,
      loading,
      mode,
      nameError,
      notesError,
      openExercisePicker,
      openExerciseDetails,
      removeExercise,
      removeSet,
      save,
      submitting,
      updateName,
      updateNotes,
      updateSetField,
      moveExercise,
    ]
  );

  return <RoutineDraftContext.Provider value={controller}>{children}</RoutineDraftContext.Provider>;
}

function useRoutineDraft() {
  const controller = useContext(RoutineDraftContext);
  if (!controller) throw new Error('useRoutineDraft must be used inside RoutineDraftProvider');
  return controller;
}

function RoutineDraftFrame() {
  const c = useTheme();
  const {
    state: { draft, loading, loadFailed, submitting },
    actions,
    meta,
  } = useRoutineDraft();

  const renderItem = useCallback(
    ({ item, index }: { item: RoutineExerciseDraft; index: number }) => (
      <RoutineExerciseDraftItem item={item} index={index} />
    ),
    []
  );

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: c.bg }]}>
        <ActivityIndicator accessibilityLabel="Loading routine" />
      </View>
    );
  }

  if (loadFailed || !draft) {
    return (
      <View style={[styles.container, { backgroundColor: c.bg }]}>
        <ScreenHeader
          title={meta.mode.kind === 'create' ? 'Create Routine' : 'Edit Routine'}
          onLeadingPress={actions.close}
        />
        <View style={styles.centeredContent}>
          <Text style={[styles.emptyText, { color: c.sub }]}>Could not load routine.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: c.bg }]}>
      <ScreenHeader
        title={meta.mode.kind === 'create' ? 'Create Routine' : 'Edit Routine'}
        onLeadingPress={actions.close}
        trailing={
          <PillButton
            label={submitting ? 'Saving...' : 'Save'}
            onPress={actions.save}
            variant="filled"
            disabled={submitting}
          />
        }
      />
      <FlatList
        data={draft.exercises}
        keyExtractor={(item) => item.localId}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={<RoutineDraftFields />}
        renderItem={renderItem}
        renderScrollComponent={KeyboardAwareListScrollView}
        testID="routine-keyboard-aware-scroll-view"
        ListFooterComponent={
          <PillButton
            label="+ Add Exercise"
            onPress={actions.openExercisePicker}
            variant="dark"
            disabled={submitting}
            style={styles.addExercise}
            accessibilityLabel="Add Exercise"
            testID="routine-add-exercise"
          />
        }
      />
    </View>
  );
}

function RoutineDraftFields() {
  const c = useTheme();
  const {
    state: { draft, nameError, notesError, submitting },
    actions,
  } = useRoutineDraft();

  if (!draft) return null;

  return (
    <View style={styles.header}>
      <TextInput
        style={[styles.nameInput, { color: c.fg, borderBottomColor: c.accent }]}
        value={draft.name}
        onChangeText={actions.updateName}
        placeholder="Routine name"
        placeholderTextColor={c.sub}
        maxLength={NAME_MAX_LENGTH}
        editable={!submitting}
        accessibilityState={submitting ? { disabled: true } : undefined}
        accessibilityLabel="Routine name"
        testID="routine-name-input"
      />
      {nameError ? (
        <Text style={[styles.errorText, { color: c.danger }]}>{nameError}</Text>
      ) : null}
      <TextInput
        style={[styles.notesInput, { color: c.sub }]}
        value={draft.notes}
        onChangeText={actions.updateNotes}
        placeholder="Notes"
        placeholderTextColor={c.sub}
        multiline
        maxLength={NOTES_MAX_LENGTH}
        editable={!submitting}
        accessibilityState={submitting ? { disabled: true } : undefined}
        accessibilityLabel="Routine notes"
        testID="routine-notes-input"
      />
      {notesError ? (
        <Text style={[styles.errorText, { color: c.danger }]}>{notesError}</Text>
      ) : null}
    </View>
  );
}

type RoutineExerciseDraftItemProps = Readonly<{
  item: RoutineExerciseDraft;
  index: number;
}>;

function RoutineExerciseDraftItem({ item, index }: RoutineExerciseDraftItemProps) {
  const c = useTheme();
  const {
    state: { submitting },
    actions,
  } = useRoutineDraft();
  const exerciseType = requireExerciseType(item.exercise_type);
  const fields = fieldsForExerciseType(exerciseType);

  return (
    <View style={[styles.exercise, { borderTopColor: c.sep }]}>
      <View style={styles.exerciseHeader}>
        <Pressable
          style={styles.exerciseNameRow}
          onPress={() => actions.openExerciseDetails(item.exercise.id)}
          disabled={submitting}
          hitSlop={8}
          accessibilityState={submitting ? { disabled: true } : undefined}
          accessibilityLabel={`View ${item.exercise.name} details`}
          accessibilityRole="button"
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
        <View style={styles.headerActions}>
          <Pressable
            onPress={() => actions.moveExercise(index, -1)}
            disabled={submitting}
            hitSlop={8}
            accessibilityState={submitting ? { disabled: true } : undefined}
            accessibilityLabel={`Move ${item.exercise.name} up`}
            accessibilityRole="button"
            testID={`routine-exercise-${index}-move-up`}
          >
            <Icon name="chevron-up" variant="sub" size={20} />
          </Pressable>
          <Pressable
            onPress={() => actions.moveExercise(index, 1)}
            disabled={submitting}
            hitSlop={8}
            accessibilityState={submitting ? { disabled: true } : undefined}
            accessibilityLabel={`Move ${item.exercise.name} down`}
            accessibilityRole="button"
            testID={`routine-exercise-${index}-move-down`}
          >
            <Icon name="chevron-down" variant="sub" size={20} />
          </Pressable>
        </View>
      </View>
      {item.sets.map((set, setIndex) => (
        <RoutineSetDraftRow
          key={set.localId}
          set={set}
          setIndex={setIndex}
          exerciseIndex={index}
          exercise={item}
          fields={fields}
          disabled={submitting}
        />
      ))}
      <Pressable
        style={styles.addSet}
        onPress={() => actions.addSet(item.localId)}
        disabled={submitting}
        accessibilityState={submitting ? { disabled: true } : undefined}
        accessibilityLabel={`Add set to ${item.exercise.name}`}
        accessibilityRole="button"
        testID={`routine-exercise-${index}-add-set`}
      >
        <Text style={[styles.addSetText, { color: c.accent }]}>+ Add set</Text>
      </Pressable>
      <Pressable
        style={styles.removeExercise}
        onPress={() => actions.removeExercise(item.localId)}
        disabled={submitting}
        accessibilityState={submitting ? { disabled: true } : undefined}
        accessibilityLabel={`Remove ${item.exercise.name}`}
        accessibilityRole="button"
        testID={`routine-exercise-${index}-remove`}
      >
        <Text style={[styles.removeExerciseText, { color: c.danger }]}>Remove exercise</Text>
      </Pressable>
    </View>
  );
}

type RoutineSetDraftRowProps = Readonly<{
  set: RoutineSetDraft;
  setIndex: number;
  exerciseIndex: number;
  exercise: RoutineExerciseDraft;
  fields: readonly ExerciseTypeFieldDescriptor[];
  disabled: boolean;
}>;

function RoutineSetDraftRow({
  set,
  setIndex,
  exerciseIndex,
  exercise,
  fields,
  disabled,
}: RoutineSetDraftRowProps) {
  const { actions } = useRoutineDraft();
  const c = useTheme();

  return (
    <View style={styles.setRow}>
      <Text style={[styles.setIndex, { color: c.sub }]}>{setIndex + 1}</Text>
      <SetFieldInputs
        fields={fields}
        inputStyle={styles.setInput}
        valueForField={(field) => set[SET_COLUMN[field]] as number | null}
        onChangeField={(field, text) =>
          actions.updateSetField(exercise.localId, set.localId, field, text)
        }
        editable={!disabled}
        accessibilityLabelForField={(field) =>
          `Routine set ${setIndex + 1} ${field.inputLabel} for ${exercise.exercise.name}`
        }
        testIDForField={(field) => `routine-set-${exerciseIndex}-${setIndex}-${field}`}
      />
      <Pressable
        onPress={() => actions.removeSet(exercise.localId, set.localId)}
        disabled={disabled}
        hitSlop={8}
        accessibilityState={disabled ? { disabled: true } : undefined}
        accessibilityLabel={`Remove set ${setIndex + 1} from ${exercise.exercise.name}`}
        accessibilityRole="button"
        testID={`routine-set-${exerciseIndex}-${setIndex}-remove`}
      >
        <Icon name="close" variant="sub" size={18} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  centeredContent: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontSize: 14 },
  header: { padding: 16, gap: 8 },
  nameInput: { fontSize: 22, fontWeight: '700', borderBottomWidth: 2, paddingBottom: 6 },
  notesInput: { fontSize: 14, minHeight: 20 },
  errorText: { fontSize: 12, marginTop: -4 },
  exercise: { paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1 },
  exerciseHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  exerciseNameRow: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 6 },
  exerciseName: { fontSize: 16, fontWeight: '700', flexShrink: 1 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  setRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 8 },
  setIndex: { width: 20, fontSize: 13 },
  setInput: { width: 72, height: 36, borderRadius: 8, textAlign: 'center', fontSize: 15 },
  addSet: { marginTop: 10 },
  addSetText: { fontSize: 14, fontWeight: '600' },
  removeExercise: { marginTop: 8 },
  removeExerciseText: { fontSize: 13, fontWeight: '600' },
  addExercise: { margin: 16 },
});
