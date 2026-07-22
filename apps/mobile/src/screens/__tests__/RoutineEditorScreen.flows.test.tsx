import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import type { ComponentProps } from 'react';
import { Alert, Text } from 'react-native';

import { getDb, resetDbForTests } from '../../db/index';
import { mobileStore } from '../../db/mobileStore';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import { latestAlertButtons } from '../../test-utils/async';
import { RoutineEditorScreen } from '../RoutineEditorScreen';

const { getDetail: getRoutineDetail, saveDraft: saveRoutineDraft } = mobileStore.routines;

type TestParamList = RootStackParamList & {
  Home: undefined;
};

const Stack = createNativeStackNavigator<TestParamList>();

function HomeStub() {
  return <Text>Home screen</Text>;
}

function RoutineEditorWithPickedParam(props: ComponentProps<typeof RoutineEditorScreen>) {
  return (
    <>
      <RoutineEditorScreen {...props} />
      <Text onPress={() => props.navigation.setParams({ pickedExerciseId: 'ex2' })}>
        Inject picked exercise
      </Text>
    </>
  );
}

async function insertExercise(exerciseId = 'ex1', name = 'Bench Press') {
  const db = await getDb();
  // todo: audit pending
  await db.runAsync(
    `INSERT OR IGNORE INTO exercises (id, name, muscle_group, equipment, exercise_type, is_custom)
     VALUES ($id, $name, 'chest', 'barbell', 'weight_reps', 1)`,
    { $id: exerciseId, $name: name }
  );
}

async function countRows(table: string) {
  const db = await getDb();
  // todo: audit pending
  const row = await db.getFirstAsync<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`);
  return row?.n ?? 0;
}

function renderEditor(
  params: RootStackParamList['RoutineEditor'],
  editor: typeof RoutineEditorScreen = RoutineEditorScreen
) {
  return render(
    <NavigationContainer
      initialState={{ routes: [{ name: 'Home' }, { name: 'RoutineEditor', params }], index: 1 }}
    >
      <Stack.Navigator>
        <Stack.Screen name="Home" component={HomeStub} />
        <Stack.Screen name="RoutineEditor" component={editor} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

beforeEach(async () => {
  resetDbForTests();
  jest.restoreAllMocks();
  await insertExercise('ex1', 'Bench Press');
  await insertExercise('ex2', 'Squat');
});

test('new routine close without Save creates no DB rows', async () => {
  const editor = await renderEditor({});

  await waitFor(() => expect(editor.getByLabelText('Close')).toBeTruthy());
  await act(async () => fireEvent.press(editor.getByLabelText('Close')));

  await waitFor(() => expect(editor.getByText('Home screen')).toBeTruthy());
  await expect(countRows('routines')).resolves.toBe(0);
  await expect(countRows('routine_exercises')).resolves.toBe(0);
});

test('new routine with a picked exercise can be discarded without DB writes', async () => {
  const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  const editor = await renderEditor({ pickedExerciseId: 'ex1' });

  await waitFor(() => expect(editor.getByText('Bench Press')).toBeTruthy());
  await act(async () => fireEvent.press(editor.getByLabelText('Close')));
  const discard = latestAlertButtons(alertSpy).find((button) => button.text === 'Discard');
  await act(async () => discard?.onPress?.());

  await waitFor(() => expect(editor.getByText('Home screen')).toBeTruthy());
  await expect(countRows('routines')).resolves.toBe(0);
  await expect(countRows('routine_exercises')).resolves.toBe(0);
});

test('new routine with a picked exercise saves the routine and children', async () => {
  const editor = await renderEditor({ pickedExerciseId: 'ex1' });

  await waitFor(() => expect(editor.getByText('Bench Press')).toBeTruthy());
  await act(async () =>
    fireEvent.changeText(editor.getByLabelText('Routine name'), '  Push Day  ')
  );
  await act(async () => fireEvent.press(editor.getByLabelText('Add set to Bench Press')));
  const weightInput = editor.getByTestId('routine-set-0-0-weight');
  await act(async () => fireEvent(weightInput, 'focus'));
  await act(async () => fireEvent.changeText(weightInput, '80'));
  await act(async () => fireEvent.changeText(weightInput, '80.'));
  expect(weightInput.props.value).toBe('80.');
  await act(async () => fireEvent.changeText(weightInput, '80.5'));
  await act(async () => fireEvent.changeText(editor.getByTestId('routine-set-0-0-reps'), '8'));
  await act(async () => fireEvent.press(editor.getByText('Save')));

  await waitFor(() => expect(editor.getByText('Home screen')).toBeTruthy());
  const db = await getDb();
  // todo: audit pending
  const row = await db.getFirstAsync<{ id: string }>('SELECT id FROM routines');
  expect(row?.id).toBeTruthy();
  const saved = await getRoutineDetail(row?.id as string);
  expect(saved).toMatchObject({
    name: 'Push Day',
    exercises: [
      expect.objectContaining({
        exercise_id: 'ex1',
        sets: [expect.objectContaining({ target_weight: 80.5, target_reps: 8 })],
      }),
    ],
  });
});

test('existing routine edits can be discarded without changing the DB', async () => {
  const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  const routine = await saveRoutineDraft({
    name: 'Original',
    notes: null,
    exercises: [
      {
        exercise_id: 'ex1',
        exercise_type: 'weight_reps',
        notes: null,
        sets: [
          {
            set_type: 'normal',
            target_weight: 80,
            target_reps: 8,
            target_duration_seconds: null,
            target_distance_meters: null,
          },
        ],
      },
      { exercise_id: 'ex2', exercise_type: 'weight_reps', notes: null, sets: [] },
    ],
  });
  const before = await getRoutineDetail(routine.id);
  const editor = await renderEditor({ routineId: routine.id });

  await waitFor(() => expect(editor.getByDisplayValue('Original')).toBeTruthy());
  await act(async () => fireEvent.changeText(editor.getByDisplayValue('Original'), 'Edited'));
  await act(async () => fireEvent.press(editor.getByLabelText('Remove Bench Press')));
  await act(async () => fireEvent.press(editor.getByLabelText('Move Squat up')));
  await act(async () => fireEvent.press(editor.getByLabelText('Close')));
  const discard = latestAlertButtons(alertSpy).find((button) => button.text === 'Discard');
  await act(async () => discard?.onPress?.());

  await waitFor(() => expect(editor.getByText('Home screen')).toBeTruthy());
  await expect(getRoutineDetail(routine.id)).resolves.toEqual(before);
});

test('existing routine Save persists the full draft', async () => {
  const routine = await saveRoutineDraft({
    name: 'Original',
    notes: null,
    exercises: [
      {
        exercise_id: 'ex1',
        exercise_type: 'weight_reps',
        notes: null,
        sets: [
          {
            set_type: 'normal',
            target_weight: 80,
            target_reps: 8,
            target_duration_seconds: null,
            target_distance_meters: null,
          },
        ],
      },
      { exercise_id: 'ex2', exercise_type: 'weight_reps', notes: null, sets: [] },
    ],
  });
  const editor = await renderEditor({ routineId: routine.id });

  await waitFor(() => expect(editor.getByDisplayValue('Original')).toBeTruthy());
  await act(async () => fireEvent.changeText(editor.getByDisplayValue('Original'), '  Edited  '));
  await act(async () =>
    fireEvent.changeText(editor.getByLabelText('Routine notes'), '  Keep this  ')
  );
  await act(async () => fireEvent.press(editor.getByLabelText('Remove Bench Press')));
  await act(async () => fireEvent.press(editor.getByLabelText('Add set to Squat')));
  await act(async () => fireEvent.changeText(editor.getByTestId('routine-set-0-0-weight'), '140'));
  await act(async () => fireEvent.changeText(editor.getByTestId('routine-set-0-0-reps'), '5'));
  await act(async () => fireEvent.press(editor.getByText('Save')));

  await waitFor(() => expect(editor.getByText('Home screen')).toBeTruthy());
  await expect(getRoutineDetail(routine.id)).resolves.toMatchObject({
    id: routine.id,
    name: 'Edited',
    notes: 'Keep this',
    exercises: [
      expect.objectContaining({
        exercise_id: 'ex2',
        position: 0,
        sets: [expect.objectContaining({ target_weight: 140, target_reps: 5 })],
      }),
    ],
  });
});

test('picked exercise appends to a dirty draft without wiping unsaved edits', async () => {
  const routine = await saveRoutineDraft({
    name: 'Original',
    notes: null,
    exercises: [{ exercise_id: 'ex1', exercise_type: 'weight_reps', notes: null, sets: [] }],
  });
  const editor = await renderEditor({ routineId: routine.id }, RoutineEditorWithPickedParam);

  await waitFor(() => expect(editor.getByDisplayValue('Original')).toBeTruthy());
  await act(async () => fireEvent.changeText(editor.getByDisplayValue('Original'), 'Unsaved Name'));
  await act(async () => fireEvent.press(editor.getByText('Inject picked exercise')));

  await waitFor(() => expect(editor.getByText('Squat')).toBeTruthy());
  expect(editor.getByDisplayValue('Unsaved Name')).toBeTruthy();
  await expect(getRoutineDetail(routine.id)).resolves.toMatchObject({
    name: 'Original',
    exercises: [expect.objectContaining({ exercise_id: 'ex1' })],
  });
});

test('picked exercise present during initial load is queued and appears after initialization', async () => {
  const routine = await saveRoutineDraft({
    name: 'Original',
    notes: null,
    exercises: [{ exercise_id: 'ex1', exercise_type: 'weight_reps', notes: null, sets: [] }],
  });
  const editor = await renderEditor({ routineId: routine.id, pickedExerciseId: 'ex2' });

  await waitFor(() => expect(editor.getByText('Bench Press')).toBeTruthy());
  await waitFor(() => expect(editor.getByText('Squat')).toBeTruthy());
  expect(editor.getByDisplayValue('Original')).toBeTruthy();
});
