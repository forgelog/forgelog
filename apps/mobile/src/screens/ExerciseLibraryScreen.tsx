import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { listEquipment, listExercises, listMuscleGroups } from '../db/repositories/exercises';
import type { Exercise } from '../db/types';
import type { RootStackParamList } from '../navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'ExerciseLibrary'>;

export function ExerciseLibraryScreen({ route, navigation }: Props) {
  const mode = route.params?.mode ?? 'browse';
  const onPick = route.params?.onPick;

  const [search, setSearch] = useState('');
  const [muscleGroup, setMuscleGroup] = useState<string | null>(null);
  const [muscleGroups, setMuscleGroups] = useState<string[]>([]);
  const [equipment, setEquipment] = useState<string | null>(null);
  const [equipmentList, setEquipmentList] = useState<string[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listMuscleGroups().then(setMuscleGroups);
    listEquipment().then(setEquipmentList);
  }, []);

  useEffect(() => {
    let active = true;
    const handle = setTimeout(async () => {
      setLoading(true);
      const rows = await listExercises({
        search: search.trim() || undefined,
        muscleGroup: muscleGroup ?? undefined,
        equipment: equipment ?? undefined,
      });
      if (active) {
        setExercises(rows);
        setLoading(false);
      }
    }, 200);
    return () => {
      active = false;
      clearTimeout(handle);
    };
  }, [search, muscleGroup, equipment]);

  const count = useMemo(() => exercises.length, [exercises]);

  function handlePress(exercise: Exercise) {
    if (mode === 'pick' && onPick) {
      onPick(exercise);
      navigation.goBack();
    }
  }

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.search}
        placeholder="Search exercises"
        value={search}
        onChangeText={setSearch}
        autoCorrect={false}
        clearButtonMode="while-editing"
      />
      <ChipRow options={muscleGroups} selected={muscleGroup} onSelect={setMuscleGroup} />
      <ChipRow options={equipmentList} selected={equipment} onSelect={setEquipment} />
      {loading ? (
        <ActivityIndicator style={styles.loader} />
      ) : (
        <FlatList
          data={exercises}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={<Text style={styles.count}>{count} exercises</Text>}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <Pressable
              style={styles.row}
              onPress={() => handlePress(item)}
              disabled={mode === 'browse'}
            >
              {item.images[0] ? (
                <Image source={{ uri: item.images[0] }} style={styles.thumb} />
              ) : (
                <View style={[styles.thumb, styles.thumbPlaceholder]} />
              )}
              <View style={styles.rowText}>
                <Text style={styles.name}>{item.name}</Text>
                <Text style={styles.meta}>
                  {item.muscle_group} · {item.equipment}
                </Text>
              </View>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

function ChipRow({
  options,
  selected,
  onSelect,
}: {
  options: string[];
  selected: string | null;
  onSelect: (value: string | null) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.chipsScroll}
      contentContainerStyle={styles.chips}
      keyboardShouldPersistTaps="handled"
    >
      {['All', ...options].map((label) => {
        const value = label === 'All' ? null : label;
        const isSelected = selected === value;
        return (
          <Pressable
            key={label}
            style={[styles.chip, isSelected && styles.chipSelected]}
            onPress={() => onSelect(value)}
          >
            <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>{label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  search: {
    margin: 12,
    paddingHorizontal: 12,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#f0f0f0',
    fontSize: 16,
  },
  chipsScroll: { flexGrow: 0 },
  chips: { paddingHorizontal: 12, paddingBottom: 8, gap: 8, alignItems: 'center' },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#f0f0f0',
  },
  chipSelected: { backgroundColor: '#1a1a1a' },
  chipText: { fontSize: 13, color: '#333', textTransform: 'capitalize' },
  chipTextSelected: { color: '#fff' },
  loader: { marginTop: 24 },
  count: { paddingHorizontal: 16, paddingBottom: 8, color: '#888', fontSize: 13 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  thumb: { width: 56, height: 56, borderRadius: 8, backgroundColor: '#eee' },
  thumbPlaceholder: { backgroundColor: '#e0e0e0' },
  rowText: { marginLeft: 12, flex: 1 },
  name: { fontSize: 16, fontWeight: '600' },
  meta: { marginTop: 2, color: '#666', fontSize: 13, textTransform: 'capitalize' },
});
