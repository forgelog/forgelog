import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';

import { getDb, resetDbForTests } from '../../db/index';
import {
  addExerciseToRoutine,
  addRoutineSet,
  createRoutine,
} from '../../db/repositories/routines';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import { RoutineEditorScreen } from '../RoutineEditorScreen';

type TestParamList = RootStackParamList & {
  Home: undefined;
};

const Stack = createNativeStackNavigator<TestParamList>();

function HomeStub() {
  return <Text>Home screen</Text>;
}

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

test('closing a new routine removes its persisted exercise and set', async () => {
  const routine = await createRoutine('New Routine');
  const routineExercise = await addExerciseToRoutine(routine.id, 'ex1');
  await addRoutineSet(routineExercise.id, { target_weight: 80, target_reps: 8 });

  const editor = await render(
    <NavigationContainer
      initialState={{
        routes: [
          { name: 'Home' },
          { name: 'RoutineEditor', params: { routineId: routine.id, isNew: true } },
        ],
        index: 1,
      }}
    >
      <Stack.Navigator>
        <Stack.Screen name="Home" component={HomeStub} />
        <Stack.Screen name="RoutineEditor" component={RoutineEditorScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );

  await waitFor(() => expect(editor.getByLabelText('Close')).toBeTruthy());
  await act(async () => fireEvent.press(editor.getByLabelText('Close')));
  await waitFor(() => expect(editor.getByText('Home screen')).toBeTruthy());

  const db = await getDb();
  const routineCount = await db.getFirstAsync<{ n: number }>(
    'SELECT COUNT(*) AS n FROM routines WHERE id = $id',
    { $id: routine.id }
  );
  const exerciseCount = await db.getFirstAsync<{ n: number }>(
    'SELECT COUNT(*) AS n FROM routine_exercises WHERE id = $id',
    { $id: routineExercise.id }
  );
  const setCount = await db.getFirstAsync<{ n: number }>(
    'SELECT COUNT(*) AS n FROM routine_sets WHERE routine_exercise_id = $id',
    { $id: routineExercise.id }
  );
  expect(routineCount?.n).toBe(0);
  expect(exerciseCount?.n).toBe(0);
  expect(setCount?.n).toBe(0);
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
