import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Icon } from '../components/Icon';
import { ScreenHeader } from '../components/ScreenHeader';
import { Select } from '../components/Select';
import { listEquipment, listExercises, listMuscleGroups } from '../db/repositories/exercises';
import type { Exercise } from '../db/types';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { useTheme } from '../theme/ThemeContext';

type Props = NativeStackScreenProps<RootStackParamList, 'ExerciseLibrary'>;

export function ExerciseLibraryScreen({ route, navigation }: Props) {
  const c = useTheme();
  const mode = route.params?.mode ?? 'browse';
  const returnTo = route.params?.returnTo;

  const [search, setSearch] = useState('');
  const [muscleGroup, setMuscleGroup] = useState<string | null>(null);
  const [muscleGroups, setMuscleGroups] = useState<string[]>([]);
  const [equipment, setEquipment] = useState<string | null>(null);
  const [equipmentList, setEquipmentList] = useState<string[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    listMuscleGroups().then(setMuscleGroups);
    listEquipment().then(setEquipmentList);
  }, []);

  useEffect(() => {
    let active = true;
    const handle = setTimeout(() => {
      listExercises({
        search: search.trim() || undefined,
        muscleGroup: muscleGroup ?? undefined,
        equipment: equipment ?? undefined,
      })
        .then((rows) => {
          if (!active) return;
          setExercises(rows);
          setError(false);
        })
        .catch(() => {
          if (!active) return;
          setExercises([]);
          setError(true);
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 200);
    return () => {
      active = false;
      clearTimeout(handle);
    };
  }, [search, muscleGroup, equipment]);

  const count = useMemo(() => exercises.length, [exercises]);

  function resetForFilterChange() {
    setLoading(true);
    setError(false);
  }

  function handleSearchChange(value: string) {
    if (value === search) return;
    resetForFilterChange();
    setSearch(value);
  }

  function handleMuscleGroupChange(value: string | null) {
    if (value === muscleGroup) return;
    resetForFilterChange();
    setMuscleGroup(value);
  }

  function handleEquipmentChange(value: string | null) {
    if (value === equipment) return;
    resetForFilterChange();
    setEquipment(value);
  }

  function handlePress(exercise: Exercise) {
    if (mode === 'pick' && returnTo === 'ActiveWorkout') {
      navigation.navigate('ActiveWorkout', { pickedExerciseId: exercise.id } as any, { merge: true, pop: true });
    } else if (mode === 'pick' && returnTo === 'RoutineEditor') {
      navigation.navigate('RoutineEditor', { pickedExerciseId: exercise.id } as any, { merge: true, pop: true });
    } else {
      navigation.navigate('ExerciseDetail', { exerciseId: exercise.id });
    }
  }

  return (
    <View style={[styles.container, { backgroundColor: c.bg }]}>
      <ScreenHeader
        title={mode === 'pick' ? 'Add exercise' : 'Exercises'}
        onLeadingPress={() => navigation.goBack()}
      />
      <View style={[styles.search, { backgroundColor: c.fill }]}>
        <Icon name="magnify" variant="sub" size={20} />
        <TextInput
          style={[styles.searchInput, { color: c.fg }]}
          placeholder="Search exercises"
          placeholderTextColor={c.sub}
          value={search}
          onChangeText={handleSearchChange}
          autoCorrect={false}
          clearButtonMode="while-editing"
          accessibilityLabel="Search exercises"
          testID="exercise-search-input"
        />
      </View>
      <View style={styles.filters}>
        <Select label="Muscle group" value={muscleGroup} options={muscleGroups} onChange={handleMuscleGroupChange} />
        <Select label="Equipment" value={equipment} options={equipmentList} onChange={handleEquipmentChange} />
      </View>
      {loading ? (
        <ActivityIndicator style={styles.loader} accessibilityLabel="Loading exercises" />
      ) : (
        <FlatList
          data={exercises}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={<Text style={[styles.count, { color: c.sub }]}>{count} exercises</Text>}
          ListEmptyComponent={
            <Text style={[styles.empty, { color: c.sub }]}>
              {error ? 'Could not load exercises.' : 'No exercises match your filters.'}
            </Text>
          }
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <Pressable
              style={styles.row}
              onPress={() => handlePress(item)}
              accessibilityLabel={`${mode === 'pick' ? 'Select' : 'Open'} ${item.name}`}
              accessibilityRole="button"
              testID={`exercise-row-${item.id}`}
            >
              {item.images[0] ? (
                <Image source={{ uri: item.images[0] }} style={styles.thumb} />
              ) : (
                <View style={[styles.thumb, { backgroundColor: c.fill }]} />
              )}
              <View style={styles.rowText}>
                <Text style={[styles.name, { color: c.fg }]} numberOfLines={1} ellipsizeMode="tail">
                  {item.name}
                </Text>
                <Text style={[styles.meta, { color: c.sub }]}>
                  {item.muscle_group} · {item.equipment}
                </Text>
              </View>
              {mode === 'pick' ? (
                <Pressable
                  hitSlop={8}
                  onPress={() => navigation.navigate('ExerciseDetail', { exerciseId: item.id })}
                >
                  <Icon name="information-outline" variant="sub" size={20} />
                </Pressable>
              ) : (
                <Icon name="chevron-right" variant="sub" size={20} />
              )}
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    margin: 12,
    paddingHorizontal: 12,
    height: 44,
    borderRadius: 12,
  },
  searchInput: { flex: 1, fontSize: 16 },
  filters: { flexDirection: 'row', gap: 10, paddingHorizontal: 12, paddingBottom: 12 },
  loader: { marginTop: 24 },
  count: { paddingHorizontal: 16, paddingBottom: 8, fontSize: 13 },
  empty: { textAlign: 'center', marginTop: 24, paddingHorizontal: 16 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  thumb: { width: 56, height: 56, borderRadius: 8 },
  rowText: { marginLeft: 12, flex: 1, minWidth: 0 },
  name: { fontSize: 16, fontWeight: '600' },
  meta: { marginTop: 2, fontSize: 13, textTransform: 'capitalize' },
});
