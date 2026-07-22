import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { mobileStore } from '../db/mobileStore';
import { ActiveWorkoutScreen } from '../screens/ActiveWorkoutScreen';
import { EditProfileScreen } from '../screens/EditProfileScreen';
import { ExerciseDetailScreen } from '../screens/ExerciseDetailScreen';
import { ExerciseLibraryScreen } from '../screens/ExerciseLibraryScreen';
import { MeasurementsScreen } from '../screens/MeasurementsScreen';
import { OnboardingScreen } from '../screens/OnboardingScreen';
import { RecordMeasurementsScreen } from '../screens/RecordMeasurementsScreen';
import { RoutineDetailScreen } from '../screens/RoutineDetailScreen';
import { RoutineEditorScreen } from '../screens/RoutineEditorScreen';
import { WorkoutDetailScreen } from '../screens/WorkoutDetailScreen';
import { MainTabs } from './MainTabs';

export type RootStackParamList = {
  MainTabs: undefined;
  ActiveWorkout: { workoutId: string; pickedExerciseId?: string };
  EditProfile: undefined;
  ExerciseDetail: { exerciseId: string };
  ExerciseLibrary:
    { mode?: 'browse' | 'pick'; returnTo?: 'ActiveWorkout' | 'RoutineEditor' } | undefined;
  Measurements: undefined;
  RecordMeasurements: undefined;
  RoutineDetail: { routineId: string };
  RoutineEditor: { routineId?: string; templateId?: string; pickedExerciseId?: string };
  WorkoutDetail: { workoutId: string };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  const [onboardingComplete, setOnboardingComplete] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    mobileStore.profile
      .hasCompletedOnboarding()
      .then((complete) => {
        if (!cancelled) setOnboardingComplete(complete);
      })
      .catch(() => {
        if (!cancelled) setOnboardingComplete(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (onboardingComplete === null) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator accessibilityLabel="Loading ForgeLog" />
      </View>
    );
  }

  if (!onboardingComplete) {
    return <OnboardingScreen onComplete={() => setOnboardingComplete(true)} />;
  }

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
        <Stack.Screen name="Measurements" component={MeasurementsScreen} />
        <Stack.Screen name="RecordMeasurements" component={RecordMeasurementsScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
