import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { ActiveWorkoutScreen } from '../screens/ActiveWorkoutScreen';
import { EditProfileScreen } from '../screens/EditProfileScreen';
import { ExerciseDetailScreen } from '../screens/ExerciseDetailScreen';
import { ExerciseLibraryScreen } from '../screens/ExerciseLibraryScreen';
import { RoutineDetailScreen } from '../screens/RoutineDetailScreen';
import { RoutineEditorScreen } from '../screens/RoutineEditorScreen';
import { WorkoutDetailScreen } from '../screens/WorkoutDetailScreen';
import { MainTabs } from './MainTabs';

export type RootStackParamList = {
  MainTabs: undefined;
  ActiveWorkout: { workoutId: string; pickedExerciseId?: string };
  EditProfile: undefined;
  ExerciseDetail: { exerciseId: string };
  ExerciseLibrary: { mode?: 'browse' | 'pick'; returnTo?: 'ActiveWorkout' | 'RoutineEditor' } | undefined;
  RoutineDetail: { routineId: string };
  RoutineEditor: { routineId?: string; pickedExerciseId?: string };
  WorkoutDetail: { workoutId: string };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName="MainTabs" screenOptions={{ headerShown: false }}>
        <Stack.Screen name="MainTabs" component={MainTabs} />
        <Stack.Screen name="ExerciseLibrary" component={ExerciseLibraryScreen} />
        <Stack.Screen name="ExerciseDetail" component={ExerciseDetailScreen} />
        <Stack.Screen name="RoutineDetail" component={RoutineDetailScreen} />
        <Stack.Screen name="RoutineEditor" component={RoutineEditorScreen} />
        <Stack.Screen name="ActiveWorkout" component={ActiveWorkoutScreen} />
        <Stack.Screen name="WorkoutDetail" component={WorkoutDetailScreen} />
        <Stack.Screen name="EditProfile" component={EditProfileScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
