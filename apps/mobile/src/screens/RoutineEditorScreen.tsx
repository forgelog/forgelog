import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Chip } from '../components/Chip';
import { Icon } from '../components/Icon';
import { PillButton } from '../components/PillButton';
import { ScreenHeader } from '../components/ScreenHeader';
import {
  addExerciseToRoutine,
  addRoutineSet,
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
  FIELD_PLACEHOLDER,
  fieldsFor,
  parseNonNegativeInteger,
  parseNonNegativeNumber,
  SetFieldKey,
  TRACKING_LABELS,
  TRACKING_TYPES,
} from '../domain/setFields';

const INTEGER_FIELDS: SetFieldKey[] = ['reps', 'duration'];

type Props = NativeStackScreenProps<RootStackParamList, 'RoutineEditor'>;

const SET_COLUMN: Record<SetFieldKey, keyof RoutineSet> = {
  weight: 'target_weight',
  reps: 'target_reps',
  duration: 'target_duration_seconds',
  distance: 'target_distance_meters',
};

export function RoutineEditorScreen({ route, navigation }: Props) {
  const { routineId, pickedExerciseId } = route.params;
  const c = useTheme();
  const [detail, setDetail] = useState<RoutineDetail | null>(null);
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [notesError, setNotesError] = useState<string | null>(null);

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
    const last = rex.sets[rex.sets.length - 1];
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
    const value = INTEGER_FIELDS.includes(field)
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
      navigation.goBack();
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
        onLeadingPress={handleDone}
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
        renderItem={({ item, index }) => {
          const trackingType = effectiveTrackingType(item.tracking_type, item.exercise.tracking_type);
          const fields = fieldsFor(trackingType);
          return (
            <View style={[styles.exercise, { borderTopColor: c.sep }]}>
              <View style={styles.exerciseHeader}>
                <Text
                  style={[styles.exerciseName, { color: c.fg }]}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  {item.exercise.name}
                </Text>
                <View style={styles.headerActions}>
                  <Pressable onPress={() => move(index, -1)} hitSlop={8}>
                    <Icon name="chevron-up" variant="sub" size={20} />
                  </Pressable>
                  <Pressable onPress={() => move(index, 1)} hitSlop={8}>
                    <Icon name="chevron-down" variant="sub" size={20} />
                  </Pressable>
                </View>
              </View>

              <View style={styles.metaRow}>
                <Chip
                  label={TRACKING_LABELS[trackingType]}
                  onPress={() => cycleTrackingType(item)}
                  accessibilityLabel={`Tracking type for ${item.exercise.name}: ${TRACKING_LABELS[trackingType]}`}
                  testID={`routine-exercise-${index}-tracking-type`}
                />
                <View style={styles.restBox}>
                  <Text style={[styles.restLabel, { color: c.sub }]}>Rest</Text>
                  <TextInput
                    style={[styles.restInput, { backgroundColor: c.fill, color: c.fg }]}
                    value={item.rest_seconds?.toString() ?? ''}
                    onChangeText={(t) => editRest(item.id, t)}
                    placeholder="sec"
                    placeholderTextColor={c.sub}
                    keyboardType="numeric"
                    accessibilityLabel={`Rest seconds for ${item.exercise.name}`}
                    testID={`routine-exercise-${index}-rest`}
                  />
                </View>
              </View>

              {item.sets.map((set, i) => (
                <View key={set.id} style={styles.setRow}>
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
                      accessibilityLabel={`Routine set ${i + 1} ${field} for ${item.exercise.name}`}
                      testID={`routine-set-${index}-${i}-${field}`}
                    />
                  ))}
                  <Pressable
                    onPress={() => removeSet(item.id, set.id)}
                    hitSlop={8}
                    accessibilityLabel={`Remove set ${i + 1} from ${item.exercise.name}`}
                    accessibilityRole="button"
                    testID={`routine-set-${index}-${i}-remove`}
                  >
                    <Icon name="close" variant="sub" size={18} />
                  </Pressable>
                </View>
              ))}
              <Pressable
                style={styles.addSet}
                onPress={() => addSet(item)}
                accessibilityLabel={`Add set to ${item.exercise.name}`}
                accessibilityRole="button"
                testID={`routine-exercise-${index}-add-set`}
              >
                <Text style={[styles.addSetText, { color: c.accent }]}>+ Add set</Text>
              </Pressable>
              <Pressable
                style={styles.removeExercise}
                onPress={() => handleRemoveExercise(item)}
                accessibilityLabel={`Remove ${item.exercise.name}`}
                accessibilityRole="button"
                testID={`routine-exercise-${index}-remove`}
              >
                <Text style={[styles.removeExerciseText, { color: c.danger }]}>Remove exercise</Text>
              </Pressable>
            </View>
          );
        }}
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
