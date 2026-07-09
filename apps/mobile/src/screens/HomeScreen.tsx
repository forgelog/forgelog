import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card } from '../components/Card';
import { Icon } from '../components/Icon';
import { PillButton } from '../components/PillButton';
import {
  createRoutine,
  deleteRoutine,
  listRoutineSummaries,
  RoutineSummary,
} from '../db/repositories/routines';
import { getActiveWorkout, startWorkout } from '../db/repositories/workouts';
import type { Workout } from '../db/types';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { useTheme } from '../theme/ThemeContext';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function HomeScreen() {
  const c = useTheme();
  const navigation = useNavigation<Nav>();
  const [active, setActive] = useState<Workout | null>(null);
  const [routines, setRoutines] = useState<RoutineSummary[]>([]);

  const reload = useCallback(() => {
    getActiveWorkout().then(setActive);
    listRoutineSummaries().then(setRoutines);
  }, []);

  useFocusEffect(reload);

  async function handleStartEmpty() {
    const workout = active ?? (await startWorkout({}));
    navigation.navigate('ActiveWorkout', { workoutId: workout.id });
  }

  async function handleStartRoutine(routine: RoutineSummary) {
    const workout = await startWorkout({ routineId: routine.id });
    navigation.navigate('ActiveWorkout', { workoutId: workout.id });
  }

  async function handleCreateRoutine() {
    const routine = await createRoutine('New Routine');
    navigation.navigate('RoutineEditor', { routineId: routine.id });
  }

  function confirmDelete(routine: RoutineSummary) {
    Alert.alert('Delete routine', `Delete "${routine.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteRoutine(routine.id);
          reload();
        },
      },
    ]);
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: c.bg }]}>
      <FlatList
        data={routines}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View>
            <Text style={[styles.title, { color: c.fg }]}>Workout</Text>
            <PillButton
              label={active ? 'Resume Workout' : 'Start Empty Workout'}
              onPress={handleStartEmpty}
              variant="filled"
              style={styles.startButton}
            />
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: c.fg }]}>My Routines</Text>
              <Pressable
                style={[styles.addButton, { backgroundColor: c.accent }]}
                onPress={handleCreateRoutine}
              >
                <Icon name="plus" color="#fff" size={20} />
              </Pressable>
            </View>
          </View>
        }
        ListEmptyComponent={
          <Text style={[styles.empty, { color: c.sub }]}>No routines yet. Create one above.</Text>
        }
        renderItem={({ item }) => (
          <Card style={styles.routineCard}>
            <Pressable
              style={styles.routineTouchable}
              onPress={() => navigation.navigate('RoutineEditor', { routineId: item.id })}
              onLongPress={() => confirmDelete(item)}
            >
              <View style={styles.routineText}>
                <Text
                  style={[styles.routineName, { color: c.fg }]}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  {item.name}
                </Text>
                <Text style={[styles.routineMeta, { color: c.sub }]}>
                  {item.exerciseCount} exercises
                  {item.muscles.length ? ` · ${item.muscles.join(', ')}` : ''}
                </Text>
              </View>
              <PillButton label="Start" onPress={() => handleStartRoutine(item)} variant="filled" />
              <Pressable hitSlop={8} onPress={() => confirmDelete(item)}>
                <Icon name="dots-vertical" variant="sub" size={20} />
              </Pressable>
            </Pressable>
          </Card>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  listContent: { padding: 16, gap: 12 },
  title: { fontSize: 24, fontWeight: '700', marginBottom: 16 },
  startButton: { marginBottom: 24 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionTitle: { fontSize: 16, fontWeight: '700' },
  addButton: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  empty: { textAlign: 'center', marginTop: 24 },
  routineCard: { marginBottom: 0 },
  routineTouchable: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  routineText: { flex: 1, minWidth: 0 },
  routineName: { fontSize: 16, fontWeight: '700' },
  routineMeta: { marginTop: 4, fontSize: 13 },
});
