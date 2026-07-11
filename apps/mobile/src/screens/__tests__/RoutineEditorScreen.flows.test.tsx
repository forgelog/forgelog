import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { render, waitFor } from '@testing-library/react-native';

import { getDb, resetDbForTests } from '../../db/index';
import { createRoutine } from '../../db/repositories/routines';
import { RoutineEditorScreen } from '../RoutineEditorScreen';

type TestParamList = { RoutineEditor: { routineId: string; pickedExerciseId?: string } };

const Stack = createNativeStackNavigator<TestParamList>();

async function insertExercise(exerciseId = 'ex1') {
  const db = await getDb();
  await db.runAsync(
    `INSERT OR IGNORE INTO exercises (id, name, muscle_group, equipment, tracking_type, is_custom)
     VALUES ($id, 'Bench Press', 'chest', 'barbell', 'weight_reps', 1)`,
    { $id: exerciseId }
  );
}

beforeEach(async () => {
  resetDbForTests();
  await insertExercise();
});

test('pickedExerciseId in params adds the exercise to the routine', async () => {
  const routine = await createRoutine('Push Day');

  await render(
    <NavigationContainer>
      <Stack.Navigator>
        <Stack.Screen
          name="RoutineEditor"
          component={RoutineEditorScreen}
          initialParams={{ routineId: routine.id, pickedExerciseId: 'ex1' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );

  const db = await getDb();
  await waitFor(async () => {
    const row = await db.getFirstAsync<{ n: number }>(
      'SELECT COUNT(*) AS n FROM routine_exercises WHERE routine_id = $rid AND exercise_id = $eid',
      { $rid: routine.id, $eid: 'ex1' }
    );
    expect(row?.n).toBe(1);
  });
});
