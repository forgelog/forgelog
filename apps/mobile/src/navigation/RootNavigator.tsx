import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import type { Exercise } from '../db/types';
import { ActiveWorkoutScreen } from '../screens/ActiveWorkoutScreen';
import { ExerciseLibraryScreen } from '../screens/ExerciseLibraryScreen';
import { HistoryScreen } from '../screens/HistoryScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { ProgressScreen } from '../screens/ProgressScreen';
import { RoutineEditorScreen } from '../screens/RoutineEditorScreen';
import { RoutineListScreen } from '../screens/RoutineListScreen';
import { WorkoutDetailScreen } from '../screens/WorkoutDetailScreen';

export type RootStackParamList = {
  Home: undefined;
  ActiveWorkout: { workoutId: string };
  History: undefined;
  Progress: undefined;
  ExerciseLibrary: { mode?: 'browse' | 'pick'; onPick?: (exercise: Exercise) => void } | undefined;
  RoutineList: undefined;
  RoutineEditor: { routineId: string };
  WorkoutDetail: { workoutId: string };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName="Home">
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen
          name="ExerciseLibrary"
          component={ExerciseLibraryScreen}
          options={{ title: 'Exercises' }}
        />
        <Stack.Screen
          name="RoutineList"
          component={RoutineListScreen}
          options={{ title: 'Routines' }}
        />
        <Stack.Screen
          name="RoutineEditor"
          component={RoutineEditorScreen}
          options={{ title: 'Edit Routine' }}
        />
        <Stack.Screen
          name="ActiveWorkout"
          component={ActiveWorkoutScreen}
          options={{ title: 'Workout' }}
        />
        <Stack.Screen name="History" component={HistoryScreen} />
        <Stack.Screen
          name="WorkoutDetail"
          component={WorkoutDetailScreen}
          options={{ title: 'Workout' }}
        />
        <Stack.Screen name="Progress" component={ProgressScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
