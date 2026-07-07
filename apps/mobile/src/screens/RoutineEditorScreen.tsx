import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

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
import { id } from '../db/id';
import type { RoutineDetail, RoutineExerciseDetail, RoutineSet } from '../db/types';
import type { RootStackParamList } from '../navigation/RootNavigator';
import {
  effectiveTrackingType,
  FIELD_PLACEHOLDER,
  fieldsFor,
  SetFieldKey,
  TRACKING_LABELS,
  TRACKING_TYPES,
} from './setFields';

type Props = NativeStackScreenProps<RootStackParamList, 'RoutineEditor'>;

const SET_COLUMN: Record<SetFieldKey, keyof RoutineSet> = {
  weight: 'target_weight',
  reps: 'target_reps',
  duration: 'target_duration_seconds',
  distance: 'target_distance_meters',
};

export function RoutineEditorScreen({ route, navigation }: Props) {
  const { routineId } = route.params;
  const [detail, setDetail] = useState<RoutineDetail | null>(null);
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');

  const reload = useCallback(() => {
    getRoutineDetail(routineId).then((d) => {
      setDetail(d);
      if (d) {
        setName(d.name);
        setNotes(d.notes ?? '');
      }
    });
  }, [routineId]);

  useFocusEffect(reload);

  function handleAddExercise() {
    navigation.navigate('ExerciseLibrary', {
      mode: 'pick',
      onPick: async (exercise) => {
        await addExerciseToRoutine(routineId, exercise.id);
        reload();
      },
    });
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
    const value = raw.trim() === '' ? null : Number(raw);
    if (value !== null && Number.isNaN(value)) return;
    patchExercise(rexId, (r) => ({
      ...r,
      sets: r.sets.map((s) => (s.id === setId ? { ...s, [column]: value } : s)),
    }));
    updateRoutineSet(setId, { [column]: value });
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
    const value = raw.trim() === '' ? null : Number(raw);
    if (value !== null && Number.isNaN(value)) return;
    patchExercise(rexId, (r) => ({ ...r, rest_seconds: value }));
    updateRoutineExercise(rexId, { rest_seconds: value });
  }

  function cycleTrackingType(rex: RoutineExerciseDetail) {
    const current = effectiveTrackingType(rex.tracking_type, rex.exercise.tracking_type);
    const next = TRACKING_TYPES[(TRACKING_TYPES.indexOf(current) + 1) % TRACKING_TYPES.length];
    patchExercise(rex.id, (r) => ({ ...r, tracking_type: next }));
    updateRoutineExercise(rex.id, { tracking_type: next });
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

  // Superset with the previous exercise: share a group id. Toggling off clears it.
  async function toggleSuperset(index: number) {
    if (!detail || index === 0) return;
    const prev = detail.exercises[index - 1];
    const curr = detail.exercises[index];
    const grouped = curr.superset_group_id != null && curr.superset_group_id === prev.superset_group_id;
    if (grouped) {
      await updateRoutineExercise(curr.id, { superset_group_id: null });
    } else {
      const groupId = prev.superset_group_id ?? id();
      await updateRoutineExercise(prev.id, { superset_group_id: groupId });
      await updateRoutineExercise(curr.id, { superset_group_id: groupId });
    }
    reload();
  }

  if (!detail) return null;

  return (
    <FlatList
      style={styles.container}
      data={detail.exercises}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={
        <View style={styles.header}>
          <TextInput
            style={styles.nameInput}
            value={name}
            onChangeText={setName}
            onBlur={() => updateRoutine(routineId, { name })}
            placeholder="Routine name"
          />
          <TextInput
            style={styles.notesInput}
            value={notes}
            onChangeText={setNotes}
            onBlur={() => updateRoutine(routineId, { notes: notes.trim() || null })}
            placeholder="Notes"
            multiline
          />
        </View>
      }
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
              <View style={styles.headerActions}>
                <Pressable onPress={() => move(index, -1)}>
                  <Text style={styles.moveBtn}>↑</Text>
                </Pressable>
                <Pressable onPress={() => move(index, 1)}>
                  <Text style={styles.moveBtn}>↓</Text>
                </Pressable>
                <Pressable onPress={() => handleRemoveExercise(item)}>
                  <Text style={styles.remove}>Remove</Text>
                </Pressable>
              </View>
            </View>

            <View style={styles.metaRow}>
              <Pressable style={styles.metaChip} onPress={() => cycleTrackingType(item)}>
                <Text style={styles.metaChipText}>{TRACKING_LABELS[trackingType]}</Text>
              </Pressable>
              {index > 0 ? (
                <Pressable
                  style={[styles.metaChip, supersetWithPrev && styles.metaChipOn]}
                  onPress={() => toggleSuperset(index)}
                >
                  <Text style={[styles.metaChipText, supersetWithPrev && styles.metaChipTextOn]}>
                    Superset
                  </Text>
                </Pressable>
              ) : null}
              <View style={styles.restBox}>
                <Text style={styles.restLabel}>Rest</Text>
                <TextInput
                  style={styles.restInput}
                  value={item.rest_seconds?.toString() ?? ''}
                  onChangeText={(t) => editRest(item.id, t)}
                  placeholder="sec"
                  keyboardType="numeric"
                />
              </View>
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
                <Pressable onPress={() => removeSet(item.id, set.id)}>
                  <Text style={styles.remove}>✕</Text>
                </Pressable>
              </View>
            ))}
            <Pressable style={styles.addSet} onPress={() => addSet(item)}>
              <Text style={styles.addSetText}>+ Add set</Text>
            </Pressable>
          </View>
        );
      }}
      ListFooterComponent={
        <Pressable style={styles.addExercise} onPress={handleAddExercise}>
          <Text style={styles.addExerciseText}>+ Add exercise</Text>
        </Pressable>
      }
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: { padding: 16, gap: 8 },
  nameInput: { fontSize: 22, fontWeight: '700' },
  notesInput: { fontSize: 14, color: '#444', minHeight: 20 },
  exercise: { paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, borderTopColor: '#eee' },
  supersetTag: { color: '#0a7', fontSize: 12, fontWeight: '600', marginBottom: 4 },
  exerciseHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  exerciseName: { fontSize: 16, fontWeight: '600', flex: 1 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  moveBtn: { fontSize: 18, color: '#666' },
  remove: { color: '#c00', fontSize: 13 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  metaChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14, backgroundColor: '#f0f0f0' },
  metaChipOn: { backgroundColor: '#0a7' },
  metaChipText: { fontSize: 12, color: '#333' },
  metaChipTextOn: { color: '#fff' },
  restBox: { flexDirection: 'row', alignItems: 'center', gap: 6, marginLeft: 'auto' },
  restLabel: { fontSize: 12, color: '#888' },
  restInput: {
    width: 52,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
    textAlign: 'center',
    fontSize: 14,
  },
  setRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 8 },
  setIndex: { width: 20, color: '#888' },
  setInput: {
    width: 72,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
    textAlign: 'center',
    fontSize: 15,
  },
  addSet: { marginTop: 10 },
  addSetText: { color: '#0a7', fontSize: 14, fontWeight: '600' },
  addExercise: { margin: 16, paddingVertical: 14, borderRadius: 12, backgroundColor: '#1a1a1a', alignItems: 'center' },
  addExerciseText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
