import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import type { Exercise } from '../db/types';
import { ActiveWorkoutScreen } from '../screens/ActiveWorkoutScreen';
import { ExerciseLibraryScreen } from '../screens/ExerciseLibraryScreen';
import { RoutineEditorScreen } from '../screens/RoutineEditorScreen';
import { WorkoutDetailScreen } from '../screens/WorkoutDetailScreen';
import { MainTabs } from './MainTabs';

export type RootStackParamList = {
  MainTabs: undefined;
  ActiveWorkout: { workoutId: string };
  ExerciseLibrary: { mode?: 'browse' | 'pick'; onPick?: (exercise: Exercise) => void } | undefined;
  RoutineEditor: { routineId: string };
  WorkoutDetail: { workoutId: string };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName="MainTabs" screenOptions={{ headerShown: false }}>
        <Stack.Screen name="MainTabs" component={MainTabs} />
        <Stack.Screen name="ExerciseLibrary" component={ExerciseLibraryScreen} />
        <Stack.Screen name="RoutineEditor" component={RoutineEditorScreen} />
        <Stack.Screen name="ActiveWorkout" component={ActiveWorkoutScreen} />
        <Stack.Screen name="WorkoutDetail" component={WorkoutDetailScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
