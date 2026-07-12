import { CommonActions, useFocusEffect, usePreventRemove } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Chip } from '../components/Chip';
import { Icon } from '../components/Icon';
import { PillButton } from '../components/PillButton';
import { ScreenHeader } from '../components/ScreenHeader';
import { SetFieldInputs } from '../components/SetFieldInputs';
import {
  addExerciseToRoutine,
  addRoutineSet,
  deleteRoutine,
  deleteRoutineSet,
  getRoutineDetail,
  removeRoutineExercise,
  reorderRoutineExercises,
  updateRoutine,
  updateRoutineExercise,
  updateRoutineSet,
} from '../db/repositories/routines';
import type { RoutineDetail, RoutineExerciseDetail, RoutineSet } from '../db/types';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { useTheme } from '../theme/ThemeContext';
import { NAME_MAX_LENGTH, NOTES_MAX_LENGTH, validateText } from '../validation/textInput';
import {
  effectiveTrackingType,
  fieldsFor,
  parseNonNegativeInteger,
  parseNonNegativeNumber,
  SetFieldKey,
  TRACKING_LABELS,
  TRACKING_TYPES,
} from '../domain/setFields';

const INTEGER_FIELDS = new Set<SetFieldKey>(['reps', 'duration']);

type Props = NativeStackScreenProps<RootStackParamList, 'RoutineEditor'>;
type NavigationAction = Parameters<Props['navigation']['dispatch']>[0];

const SET_COLUMN: Record<SetFieldKey, keyof RoutineSet> = {
  weight: 'target_weight',
  reps: 'target_reps',
  duration: 'target_duration_seconds',
  distance: 'target_distance_meters',
};

export function RoutineEditorScreen({ route, navigation }: Props) {
  const { routineId, pickedExerciseId, isNew } = route.params;
  const c = useTheme();
  const [detail, setDetail] = useState<RoutineDetail | null>(null);
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [notesError, setNotesError] = useState<string | null>(null);
  const [discardNewRoutineOnExit, setDiscardNewRoutineOnExit] = useState(Boolean(isNew));
  const pendingRemovalAction = useRef<NavigationAction | null>(null);
  const discardInProgress = useRef(false);

  const reload = useCallback(() => {
    getRoutineDetail(routineId).then((d) => {
      setDetail(d);
      if (d) {
        setName(d.name);
        setNotes(d.notes ?? '');
        setNameError(null);
        setNotesError(null);
      }
    });
  }, [routineId]);

  useFocusEffect(reload);

  usePreventRemove(discardNewRoutineOnExit, ({ data }) => {
    if (discardInProgress.current) return;
    discardInProgress.current = true;
    deleteRoutine(routineId)
      .then(() => {
        pendingRemovalAction.current = data.action;
        setDiscardNewRoutineOnExit(false);
      })
      .catch(() => {
        discardInProgress.current = false;
        Alert.alert('Close failed', 'Could not discard the new routine.');
      });
  });

  useEffect(() => {
    if (discardNewRoutineOnExit || !pendingRemovalAction.current) return;
    const action = pendingRemovalAction.current;
    pendingRemovalAction.current = null;
    navigation.dispatch(action);
  }, [discardNewRoutineOnExit, navigation]);

  useEffect(() => {
    if (!pickedExerciseId) return;
    navigation.setParams({ pickedExerciseId: undefined });
    addExerciseToRoutine(routineId, pickedExerciseId)
      .then(() => reload())
      .catch(() => {
        Alert.alert('Save failed', 'Could not add exercise.');
        reload();
      });
  }, [pickedExerciseId, routineId, reload, navigation]);

  async function saveName() {
    const result = validateText(name, {
      required: true,
      maxLength: NAME_MAX_LENGTH,
      fieldLabel: 'Routine name',
    });
    setNameError(result.error);
    if (result.error) return;
    setName(result.value);
    try {
      await updateRoutine(routineId, { name: result.value });
    } catch {
      Alert.alert('Save failed', 'Could not save routine name.');
      reload();
    }
  }

  async function saveNotes() {
    const result = validateText(notes, {
      maxLength: NOTES_MAX_LENGTH,
      fieldLabel: 'Notes',
      multiline: true,
    });
    setNotesError(result.error);
    if (result.error) return;
    setNotes(result.value);
    try {
      await updateRoutine(routineId, { notes: result.value || null });
    } catch {
      Alert.alert('Save failed', 'Could not save notes.');
      reload();
    }
  }

  function handleAddExercise() {
    navigation.navigate('ExerciseLibrary', { mode: 'pick', returnTo: 'RoutineEditor' });
  }

  function patchExercise(rexId: string, fn: (rex: RoutineExerciseDetail) => RoutineExerciseDetail) {
    setDetail((prev) =>
      prev ? { ...prev, exercises: prev.exercises.map((r) => (r.id === rexId ? fn(r) : r)) } : prev
    );
  }

  async function addSet(rex: RoutineExerciseDetail) {
    const last = rex.sets.at(-1);
    const created = await addRoutineSet(rex.id, {
      target_weight: last?.target_weight ?? null,
      target_reps: last?.target_reps ?? null,
      target_duration_seconds: last?.target_duration_seconds ?? null,
      target_distance_meters: last?.target_distance_meters ?? null,
    });
    patchExercise(rex.id, (r) => ({ ...r, sets: [...r.sets, created] }));
  }

  function editSetField(rexId: string, setId: string, field: SetFieldKey, raw: string) {
    const column = SET_COLUMN[field];
    const value = INTEGER_FIELDS.has(field)
      ? parseNonNegativeInteger(raw)
      : parseNonNegativeNumber(raw);
    if (value === undefined) return;
    patchExercise(rexId, (r) => ({
      ...r,
      sets: r.sets.map((s) => (s.id === setId ? { ...s, [column]: value } : s)),
    }));
    updateRoutineSet(setId, { [column]: value }).catch(() => {
      Alert.alert('Save failed', 'Could not save set value.');
      reload();
    });
  }

  async function removeSet(rexId: string, setId: string) {
    await deleteRoutineSet(setId);
    patchExercise(rexId, (r) => ({ ...r, sets: r.sets.filter((s) => s.id !== setId) }));
  }

  async function handleRemoveExercise(rex: RoutineExerciseDetail) {
    await removeRoutineExercise(rex.id);
    setDetail((prev) =>
      prev ? { ...prev, exercises: prev.exercises.filter((r) => r.id !== rex.id) } : prev
    );
  }

  function editRest(rexId: string, raw: string) {
    const value = parseNonNegativeInteger(raw);
    if (value === undefined) return;
    patchExercise(rexId, (r) => ({ ...r, rest_seconds: value }));
    updateRoutineExercise(rexId, { rest_seconds: value }).catch(() => {
      Alert.alert('Save failed', 'Could not save rest time.');
      reload();
    });
  }

  function cycleTrackingType(rex: RoutineExerciseDetail) {
    const current = effectiveTrackingType(rex.tracking_type, rex.exercise.tracking_type);
    const next = TRACKING_TYPES[(TRACKING_TYPES.indexOf(current) + 1) % TRACKING_TYPES.length];
    patchExercise(rex.id, (r) => ({ ...r, tracking_type: next }));
    updateRoutineExercise(rex.id, { tracking_type: next }).catch(() => {
      Alert.alert('Save failed', 'Could not save tracking type.');
      reload();
    });
  }

  async function move(index: number, delta: number) {
    if (!detail) return;
    const target = index + delta;
    if (target < 0 || target >= detail.exercises.length) return;
    const reordered = [...detail.exercises];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    setDetail({ ...detail, exercises: reordered });
    await reorderRoutineExercises(reordered.map((r) => r.id));
  }

  function handleClose() {
    navigation.goBack();
  }

  async function handleDone() {
    if (!detail) return;
    const nameResult = validateText(name, {
      required: true,
      maxLength: NAME_MAX_LENGTH,
      fieldLabel: 'Routine name',
    });
    setNameError(nameResult.error);
    if (nameResult.error) {
      Alert.alert('Name required', 'Give this routine a name before saving.');
      return;
    }
    const notesResult = validateText(notes, {
      maxLength: NOTES_MAX_LENGTH,
      fieldLabel: 'Notes',
      multiline: true,
    });
    setNotesError(notesResult.error);
    if (notesResult.error) return;
    if (detail.exercises.length === 0) {
      Alert.alert('No exercises', 'Add at least one exercise before saving.');
      return;
    }
    try {
      await updateRoutine(routineId, {
        name: nameResult.value,
        notes: notesResult.value || null,
      });
      setName(nameResult.value);
      setNotes(notesResult.value);
      if (isNew) {
        pendingRemovalAction.current = CommonActions.goBack();
        setDiscardNewRoutineOnExit(false);
      } else {
        navigation.goBack();
      }
    } catch {
      Alert.alert('Save failed', 'Could not save routine.');
      reload();
    }
  }

  if (!detail) return null;

  return (
    <View style={[styles.container, { backgroundColor: c.bg }]}>
      <ScreenHeader
        title="Edit routine"
        onLeadingPress={handleClose}
        trailing={<PillButton label="Save" onPress={handleDone} variant="filled" />}
      />
      <FlatList
        data={detail.exercises}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <View style={styles.header}>
            <TextInput
              style={[styles.nameInput, { color: c.fg, borderBottomColor: c.accent }]}
              value={name}
              onChangeText={setName}
              onBlur={saveName}
              placeholder="Routine name"
              placeholderTextColor={c.sub}
              maxLength={NAME_MAX_LENGTH}
              accessibilityLabel="Routine name"
              testID="routine-name-input"
            />
            {nameError ? (
              <Text style={[styles.errorText, { color: c.danger }]}>{nameError}</Text>
            ) : null}
            <TextInput
              style={[styles.notesInput, { color: c.sub }]}
              value={notes}
              onChangeText={setNotes}
              onBlur={saveNotes}
              placeholder="Notes"
              placeholderTextColor={c.sub}
              multiline
              maxLength={NOTES_MAX_LENGTH}
              accessibilityLabel="Routine notes"
              testID="routine-notes-input"
            />
            {notesError ? (
              <Text style={[styles.errorText, { color: c.danger }]}>{notesError}</Text>
            ) : null}
          </View>
        }
        renderItem={({ item, index }) => (
          <RoutineExerciseEditorItem
            item={item}
            index={index}
            onMove={move}
            onCycleTrackingType={cycleTrackingType}
            onEditRest={editRest}
            onEditSetField={editSetField}
            onRemoveSet={removeSet}
            onAddSet={addSet}
            onRemoveExercise={handleRemoveExercise}
          />
        )}
        ListFooterComponent={
          <PillButton
            label="+ Add Exercise"
            onPress={handleAddExercise}
            variant="dark"
            style={styles.addExercise}
            accessibilityLabel="Add Exercise"
            testID="routine-add-exercise"
          />
        }
      />
    </View>
  );
}

type RoutineExerciseEditorItemProps = Readonly<{
  item: RoutineExerciseDetail;
  index: number;
  onMove: (index: number, delta: number) => void;
  onCycleTrackingType: (item: RoutineExerciseDetail) => void;
  onEditRest: (rexId: string, raw: string) => void;
  onEditSetField: (rexId: string, setId: string, field: SetFieldKey, raw: string) => void;
  onRemoveSet: (rexId: string, setId: string) => void;
  onAddSet: (item: RoutineExerciseDetail) => void;
  onRemoveExercise: (item: RoutineExerciseDetail) => void;
}>;

function RoutineExerciseEditorItem({
  item,
  index,
  onMove,
  onCycleTrackingType,
  onEditRest,
  onEditSetField,
  onRemoveSet,
  onAddSet,
  onRemoveExercise,
}: RoutineExerciseEditorItemProps) {
  const c = useTheme();
  const trackingType = effectiveTrackingType(item.tracking_type, item.exercise.tracking_type);
  const fields = fieldsFor(trackingType);

  return (
    <View style={[styles.exercise, { borderTopColor: c.sep }]}>
      <View style={styles.exerciseHeader}>
        <Text style={[styles.exerciseName, { color: c.fg }]} numberOfLines={1} ellipsizeMode="tail">
          {item.exercise.name}
        </Text>
        <View style={styles.headerActions}>
          <Pressable onPress={() => onMove(index, -1)} hitSlop={8}>
            <Icon name="chevron-up" variant="sub" size={20} />
          </Pressable>
          <Pressable onPress={() => onMove(index, 1)} hitSlop={8}>
            <Icon name="chevron-down" variant="sub" size={20} />
          </Pressable>
        </View>
      </View>

      <View style={styles.metaRow}>
        <Chip
          label={TRACKING_LABELS[trackingType]}
          onPress={() => onCycleTrackingType(item)}
          accessibilityLabel={`Tracking type for ${item.exercise.name}: ${TRACKING_LABELS[trackingType]}`}
          testID={`routine-exercise-${index}-tracking-type`}
        />
        <View style={styles.restBox}>
          <Text style={[styles.restLabel, { color: c.sub }]}>Rest</Text>
          <TextInput
            style={[styles.restInput, { backgroundColor: c.fill, color: c.fg }]}
            value={item.rest_seconds?.toString() ?? ''}
            onChangeText={(text) => onEditRest(item.id, text)}
            placeholder="sec"
            placeholderTextColor={c.sub}
            keyboardType="numeric"
            accessibilityLabel={`Rest seconds for ${item.exercise.name}`}
            testID={`routine-exercise-${index}-rest`}
          />
        </View>
      </View>

      {item.sets.map((set, setIndex) => (
        <RoutineSetEditorRow
          key={set.id}
          set={set}
          setIndex={setIndex}
          exerciseIndex={index}
          exercise={item}
          fields={fields}
          onEditSetField={onEditSetField}
          onRemoveSet={onRemoveSet}
        />
      ))}
      <Pressable
        style={styles.addSet}
        onPress={() => onAddSet(item)}
        accessibilityLabel={`Add set to ${item.exercise.name}`}
        accessibilityRole="button"
        testID={`routine-exercise-${index}-add-set`}
      >
        <Text style={[styles.addSetText, { color: c.accent }]}>+ Add set</Text>
      </Pressable>
      <Pressable
        style={styles.removeExercise}
        onPress={() => onRemoveExercise(item)}
        accessibilityLabel={`Remove ${item.exercise.name}`}
        accessibilityRole="button"
        testID={`routine-exercise-${index}-remove`}
      >
        <Text style={[styles.removeExerciseText, { color: c.danger }]}>Remove exercise</Text>
      </Pressable>
    </View>
  );
}

type RoutineSetEditorRowProps = Readonly<{
  set: RoutineSet;
  setIndex: number;
  exerciseIndex: number;
  exercise: RoutineExerciseDetail;
  fields: SetFieldKey[];
  onEditSetField: (rexId: string, setId: string, field: SetFieldKey, raw: string) => void;
  onRemoveSet: (rexId: string, setId: string) => void;
}>;

function RoutineSetEditorRow({
  set,
  setIndex,
  exerciseIndex,
  exercise,
  fields,
  onEditSetField,
  onRemoveSet,
}: RoutineSetEditorRowProps) {
  const c = useTheme();

  return (
    <View style={styles.setRow}>
      <Text style={[styles.setIndex, { color: c.sub }]}>{setIndex + 1}</Text>
      <SetFieldInputs
        fields={fields}
        inputStyle={styles.setInput}
        valueForField={(field) => (set[SET_COLUMN[field]] as number | null)?.toString() ?? ''}
        onChangeField={(field, text) => onEditSetField(exercise.id, set.id, field, text)}
        accessibilityLabelForField={(field) =>
          `Routine set ${setIndex + 1} ${field} for ${exercise.exercise.name}`
        }
        testIDForField={(field) => `routine-set-${exerciseIndex}-${setIndex}-${field}`}
      />
      <Pressable
        onPress={() => onRemoveSet(exercise.id, set.id)}
        hitSlop={8}
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
  header: { padding: 16, gap: 8 },
  nameInput: { fontSize: 22, fontWeight: '700', borderBottomWidth: 2, paddingBottom: 6 },
  notesInput: { fontSize: 14, minHeight: 20 },
  errorText: { fontSize: 12, marginTop: -4 },
  exercise: { paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1 },
  exerciseHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  exerciseName: { fontSize: 16, fontWeight: '700', flex: 1, minWidth: 0 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, flexWrap: 'wrap' },
  restBox: { flexDirection: 'row', alignItems: 'center', gap: 6, marginLeft: 'auto' },
  restLabel: { fontSize: 12 },
  restInput: { width: 52, height: 32, borderRadius: 8, textAlign: 'center', fontSize: 14 },
  setRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 8 },
  setIndex: { width: 20, fontSize: 13 },
  setInput: { width: 72, height: 36, borderRadius: 8, textAlign: 'center', fontSize: 15 },
  addSet: { marginTop: 10 },
  addSetText: { fontSize: 14, fontWeight: '600' },
  removeExercise: { marginTop: 8 },
  removeExerciseText: { fontSize: 13, fontWeight: '600' },
  addExercise: { margin: 16 },
});
