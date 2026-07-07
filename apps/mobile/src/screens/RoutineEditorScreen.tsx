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
  updateRoutine,
  updateRoutineSet,
} from '../db/repositories/routines';
import type { RoutineDetail, RoutineExerciseDetail } from '../db/types';
import type { RootStackParamList } from '../navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'RoutineEditor'>;

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

  // Mutate one routine exercise's set list in local state without a full reload,
  // so editing a field never remounts sibling inputs.
  function patchExercise(rexId: string, fn: (rex: RoutineExerciseDetail) => RoutineExerciseDetail) {
    setDetail((prev) =>
      prev
        ? { ...prev, exercises: prev.exercises.map((r) => (r.id === rexId ? fn(r) : r)) }
        : prev
    );
  }

  async function addSet(rex: RoutineExerciseDetail) {
    const last = rex.sets[rex.sets.length - 1];
    const created = await addRoutineSet(rex.id, {
      target_weight: last?.target_weight ?? null,
      target_reps: last?.target_reps ?? null,
    });
    patchExercise(rex.id, (r) => ({ ...r, sets: [...r.sets, created] }));
  }

  function editSetField(
    rexId: string,
    setId: string,
    field: 'target_weight' | 'target_reps',
    raw: string
  ) {
    const value = raw.trim() === '' ? null : Number(raw);
    if (value !== null && Number.isNaN(value)) return;
    patchExercise(rexId, (r) => ({
      ...r,
      sets: r.sets.map((s) => (s.id === setId ? { ...s, [field]: value } : s)),
    }));
    updateRoutineSet(setId, { [field]: value });
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
      renderItem={({ item }) => (
        <View style={styles.exercise}>
          <View style={styles.exerciseHeader}>
            <Text style={styles.exerciseName}>{item.exercise.name}</Text>
            <Pressable onPress={() => handleRemoveExercise(item)}>
              <Text style={styles.remove}>Remove</Text>
            </Pressable>
          </View>
          {item.sets.map((set, index) => (
            <View key={set.id} style={styles.setRow}>
              <Text style={styles.setIndex}>{index + 1}</Text>
              <TextInput
                style={styles.setInput}
                value={set.target_weight?.toString() ?? ''}
                onChangeText={(t) => editSetField(item.id, set.id, 'target_weight', t)}
                placeholder="kg"
                keyboardType="numeric"
              />
              <Text style={styles.times}>×</Text>
              <TextInput
                style={styles.setInput}
                value={set.target_reps?.toString() ?? ''}
                onChangeText={(t) => editSetField(item.id, set.id, 'target_reps', t)}
                placeholder="reps"
                keyboardType="numeric"
              />
              <Pressable onPress={() => removeSet(item.id, set.id)}>
                <Text style={styles.remove}>✕</Text>
              </Pressable>
            </View>
          ))}
          <Pressable style={styles.addSet} onPress={() => addSet(item)}>
            <Text style={styles.addSetText}>+ Add set</Text>
          </Pressable>
        </View>
      )}
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
  exerciseHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  exerciseName: { fontSize: 16, fontWeight: '600' },
  remove: { color: '#c00', fontSize: 13 },
  setRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 8 },
  setIndex: { width: 20, color: '#888' },
  setInput: {
    width: 64,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
    textAlign: 'center',
    fontSize: 15,
  },
  times: { color: '#888' },
  addSet: { marginTop: 10 },
  addSetText: { color: '#0a7', fontSize: 14, fontWeight: '600' },
  addExercise: { margin: 16, paddingVertical: 14, borderRadius: 12, backgroundColor: '#1a1a1a', alignItems: 'center' },
  addExerciseText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
