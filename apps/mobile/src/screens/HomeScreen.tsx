import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { getActiveWorkout, startWorkout } from '../db/repositories/workouts';
import type { Workout } from '../db/types';
import type { RootStackParamList } from '../navigation/RootNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

export function HomeScreen({ navigation }: Props) {
  const [active, setActive] = useState<Workout | null>(null);

  useFocusEffect(
    useCallback(() => {
      getActiveWorkout().then(setActive);
    }, [])
  );

  async function handleWorkout() {
    const workout = active ?? (await startWorkout({}));
    navigation.navigate('ActiveWorkout', { workoutId: workout.id });
  }

  return (
    <View style={styles.container}>
      <Pressable style={styles.primary} onPress={handleWorkout}>
        <Text style={styles.primaryText}>{active ? 'Resume Workout' : 'Start Workout'}</Text>
      </Pressable>
      <Pressable style={styles.button} onPress={() => navigation.navigate('RoutineList')}>
        <Text style={styles.buttonText}>Routines</Text>
      </Pressable>
      <Pressable style={styles.button} onPress={() => navigation.navigate('ExerciseLibrary')}>
        <Text style={styles.buttonText}>Exercise Library</Text>
      </Pressable>
      <Pressable style={styles.button} onPress={() => navigation.navigate('History')}>
        <Text style={styles.buttonText}>History</Text>
      </Pressable>
      <Pressable style={styles.button} onPress={() => navigation.navigate('Progress')}>
        <Text style={styles.buttonText}>Progress</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  primary: {
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 12,
    backgroundColor: '#0a7',
  },
  primaryText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  button: {
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#1a1a1a',
    minWidth: 220,
    alignItems: 'center',
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
