import { CommonActions, NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react-native';
import type { ComponentProps } from 'react';
import { Alert, Text } from 'react-native';

import { getRoutineDetail, saveRoutineDraft } from '../../db/repositories/routines';
import type { RoutineDetail } from '../../db/types';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import { deferred, latestAlertButtons } from '../../test-utils/async';
import { RoutineEditorScreen } from '../RoutineEditorScreen';

jest.mock('../../db/repositories/routines');

const mockGetRoutineDetail = getRoutineDetail as jest.MockedFunction<typeof getRoutineDetail>;
const mockSaveRoutineDraft = saveRoutineDraft as jest.MockedFunction<typeof saveRoutineDraft>;
let alertSpy: jest.SpyInstance;

type TestParamList = RootStackParamList & {
  Home: undefined;
};

const Stack = createNativeStackNavigator<TestParamList>();

function HomeStub() {
  return <Text>Home screen</Text>;
}

function RoutineEditorWithPop(props: ComponentProps<typeof RoutineEditorScreen>) {
  return (
    <>
      <RoutineEditorScreen {...props} />
      <Text onPress={() => props.navigation.dispatch(CommonActions.goBack())}>Pop editor</Text>
    </>
  );
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

function makeExercise(id: string, name: string, superset_group_id: string | null) {
  return {
    id,
    routine_id: 'r1',
    exercise_id: `${id}-ex`,
    position: 0,
    superset_group_id,
    rest_seconds: null,
    tracking_type: null,
    notes: null,
    exercise: {
      id: `${id}-ex`,
      name,
      muscle_group: 'chest',
      equipment: 'barbell',
      tracking_type: 'weight_reps',
      is_custom: false,
      instructions: [],
      images: [],
      secondary_muscles: [],
      created_at: new Date().toISOString(),
    },
    sets:
      id === 're1'
        ? [
            {
              id: 'rs1',
              routine_exercise_id: 're1',
              position: 0,
              set_type: 'normal' as const,
              target_weight: 80,
              target_reps: 8,
              target_duration_seconds: null,
              target_distance_meters: null,
            },
          ]
        : [],
  };
}

const routineDetail: RoutineDetail = {
  id: 'r1',
  name: 'Push Day',
  notes: null,
  position: 0,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  exercises: [
    makeExercise('re1', 'Bench Press', 'g1'),
    makeExercise('re2', 'Overhead Press', 'g1'),
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
  mockGetRoutineDetail.mockReset();
  mockSaveRoutineDraft.mockReset();
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  mockGetRoutineDetail.mockResolvedValue(routineDetail);
  mockSaveRoutineDraft.mockResolvedValue(routineDetail);
});

afterEach(() => {
  cleanup();
  jest.restoreAllMocks();
});

test('shows the appropriate title for new and existing routines', async () => {
  const created = await renderEditor({});
  await waitFor(() => expect(created.getByText('Create Routine')).toBeTruthy());
  expect(created.queryByText('Edit Routine')).toBeNull();

  const edited = await renderEditor({ routineId: 'r1' });
  await waitFor(() => expect(edited.getByText('Edit Routine')).toBeTruthy());
  expect(edited.queryByText('Create Routine')).toBeNull();
});

test('does not show superset toggle or tag controls, even with a superset_group_id set', async () => {
  const { queryByText, getByText } = await render(
    <NavigationContainer>
      <Stack.Navigator>
        <Stack.Screen
          name="RoutineEditor"
          component={RoutineEditorScreen}
          initialParams={{ routineId: 'r1' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );

  await waitFor(() => expect(getByText('Overhead Press')).toBeTruthy());
  expect(queryByText(/Superset/)).toBeNull();
});

test('clearing the routine name shows an error and does not persist on blur', async () => {
  const { getByDisplayValue, getByText, queryByText } = await render(
    <NavigationContainer>
      <Stack.Navigator>
        <Stack.Screen
          name="RoutineEditor"
          component={RoutineEditorScreen}
          initialParams={{ routineId: 'r1' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );

  await waitFor(() => expect(getByDisplayValue('Push Day')).toBeTruthy());
  const nameInput = getByDisplayValue('Push Day');

  await act(async () => fireEvent.changeText(nameInput, '   '));
  await act(async () => fireEvent(nameInput, 'blur'));

  await waitFor(() => expect(getByText('Routine name is required.')).toBeTruthy());
  expect(mockSaveRoutineDraft).not.toHaveBeenCalled();
  expect(queryByText('Routine name is required.')).toBeTruthy();
});

test('blur does not save a valid routine name', async () => {
  const { getByDisplayValue } = await render(
    <NavigationContainer>
      <Stack.Navigator>
        <Stack.Screen
          name="RoutineEditor"
          component={RoutineEditorScreen}
          initialParams={{ routineId: 'r1' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );

  await waitFor(() => expect(getByDisplayValue('Push Day')).toBeTruthy());
  const nameInput = getByDisplayValue('Push Day');

  await act(async () => fireEvent.changeText(nameInput, '  Leg Day  '));
  await act(async () => fireEvent(nameInput, 'blur'));

  expect(mockSaveRoutineDraft).not.toHaveBeenCalled();
});

test('pressing Save persists the full draft with the trimmed routine name', async () => {
  const { getByDisplayValue, getByText } = await render(
    <NavigationContainer
      initialState={{
        routes: [{ name: 'Home' }, { name: 'RoutineEditor', params: { routineId: 'r1' } }],
        index: 1,
      }}
    >
      <Stack.Navigator>
        <Stack.Screen name="Home" component={HomeStub} />
        <Stack.Screen name="RoutineEditor" component={RoutineEditorScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );

  await waitFor(() => expect(getByDisplayValue('Push Day')).toBeTruthy());
  const nameInput = getByDisplayValue('Push Day');

  await act(async () => fireEvent.changeText(nameInput, '  Phase Five Workout  '));
  await act(async () => fireEvent.press(getByText('Save')));

  await waitFor(() =>
    expect(mockSaveRoutineDraft).toHaveBeenCalledWith(
      expect.objectContaining({ routineId: 'r1', name: 'Phase Five Workout' })
    )
  );
});

test('new routine starts empty and Save shows missing-name validation', async () => {
  const { getByLabelText, getByText } = await renderEditor({});

  await waitFor(() => expect(getByLabelText('Routine name').props.value).toBe(''));
  await act(async () => fireEvent.press(getByText('Save')));

  await waitFor(() => expect(getByText('Routine name is required.')).toBeTruthy());
  expect(Alert.alert).toHaveBeenCalledWith('Name required', expect.any(String));
  expect(mockSaveRoutineDraft).not.toHaveBeenCalled();
});

test('closing an untouched new routine performs no writes or validation', async () => {
  const { getByLabelText, getByText } = await renderEditor({});

  await waitFor(() => expect(getByLabelText('Close')).toBeTruthy());
  await act(async () => fireEvent.press(getByLabelText('Close')));

  await waitFor(() => expect(getByText('Home screen')).toBeTruthy());
  expect(mockGetRoutineDetail).not.toHaveBeenCalled();
  expect(mockSaveRoutineDraft).not.toHaveBeenCalled();
  expect(Alert.alert).not.toHaveBeenCalledWith('No exercises', expect.any(String));
});

test('closing an existing clean routine does not save it', async () => {
  const { getByLabelText, getByText } = await renderEditor({ routineId: 'r1' });

  await waitFor(() => expect(getByLabelText('Close')).toBeTruthy());
  await act(async () => fireEvent.press(getByLabelText('Close')));

  await waitFor(() => expect(getByText('Home screen')).toBeTruthy());
  expect(mockSaveRoutineDraft).not.toHaveBeenCalled();
});

test('dirty close prompt keeps editing until Discard is pressed', async () => {
  const { getByDisplayValue, getByLabelText, getByText, queryByText } = await renderEditor({
    routineId: 'r1',
  });

  await waitFor(() => expect(getByDisplayValue('Push Day')).toBeTruthy());
  await act(async () => fireEvent.changeText(getByDisplayValue('Push Day'), 'Draft Name'));
  await act(async () => fireEvent.press(getByLabelText('Close')));

  await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith(
    'Discard changes?',
    expect.any(String),
    expect.any(Array)
  ));
  const keepEditing = latestAlertButtons(alertSpy).find(
    (button) => button.text === 'Keep editing'
  );
  await act(async () => keepEditing?.onPress?.());
  expect(queryByText('Home screen')).toBeNull();

  await act(async () => fireEvent.press(getByLabelText('Close')));
  const discard = latestAlertButtons(alertSpy).find(
    (button) => button.text === 'Discard'
  );
  await act(async () => discard?.onPress?.());

  await waitFor(() => expect(getByText('Home screen')).toBeTruthy());
  expect(mockSaveRoutineDraft).not.toHaveBeenCalled();
});

test('a navigator back action also prompts before discarding dirty changes', async () => {
  const { getByDisplayValue, getByText, queryByText } = await renderEditor(
    { routineId: 'r1' },
    RoutineEditorWithPop
  );

  await waitFor(() => expect(getByDisplayValue('Push Day')).toBeTruthy());
  await act(async () => fireEvent.changeText(getByDisplayValue('Push Day'), 'Draft Name'));
  await act(async () => fireEvent.press(getByText('Pop editor')));

  expect(queryByText('Home screen')).toBeNull();
  const discard = latestAlertButtons(alertSpy).find(
    (button) => button.text === 'Discard'
  );
  await act(async () => discard?.onPress?.());

  await waitFor(() => expect(getByText('Home screen')).toBeTruthy());
  expect(mockSaveRoutineDraft).not.toHaveBeenCalled();
});

test('exposes stable E2E labels for routine editing controls', async () => {
  const { getByLabelText, getByTestId, getByText } = await render(
    <NavigationContainer>
      <Stack.Navigator>
        <Stack.Screen
          name="RoutineEditor"
          component={RoutineEditorScreen}
          initialParams={{ routineId: 'r1' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );

  await waitFor(() => expect(getByText('Bench Press')).toBeTruthy());
  expect(getByLabelText('Routine name')).toBeTruthy();
  expect(getByLabelText('Routine notes')).toBeTruthy();
  expect(getByLabelText('Tracking type for Bench Press: Weight × reps')).toBeTruthy();
  expect(getByLabelText('Move Bench Press up')).toBeTruthy();
  expect(getByLabelText('Move Bench Press down')).toBeTruthy();
  expect(getByLabelText('Add Exercise')).toBeTruthy();
  expect(getByLabelText('Add set to Bench Press')).toBeTruthy();
  expect(getByLabelText('Remove Bench Press')).toBeTruthy();
  expect(getByTestId('routine-set-0-0-weight')).toBeTruthy();
  expect(getByTestId('routine-set-0-0-reps')).toBeTruthy();
});

test('pending Save blocks close/discard until the save finishes', async () => {
  const save = deferred<RoutineDetail>();
  mockSaveRoutineDraft.mockReturnValue(save.promise);
  const { getByDisplayValue, getByLabelText, getByText, queryByText } = await renderEditor({
    routineId: 'r1',
  });

  await waitFor(() => expect(getByDisplayValue('Push Day')).toBeTruthy());
  await act(async () => fireEvent.changeText(getByDisplayValue('Push Day'), 'Updated'));
  fireEvent.press(getByText('Save'));
  await waitFor(() => expect(getByLabelText('Saving...')).toBeTruthy());
  fireEvent.press(getByLabelText('Close'));

  await waitFor(() =>
    expect(alertSpy).toHaveBeenCalledWith('Save in progress', expect.any(String))
  );
  expect(queryByText('Home screen')).toBeNull();
  expect(latestAlertButtons(alertSpy).some((button) => button.text === 'Discard')).toBe(false);

  await act(async () => save.resolve(routineDetail));
  await waitFor(() => expect(getByText('Home screen')).toBeTruthy());
});

test('Save is busy while submitting and rapid presses only call the repository once', async () => {
  const save = deferred<RoutineDetail>();
  mockSaveRoutineDraft.mockReturnValue(save.promise);
  const { getByDisplayValue, getByLabelText, getByText } = await renderEditor({ routineId: 'r1' });

  await waitFor(() => expect(getByDisplayValue('Push Day')).toBeTruthy());
  await act(async () => fireEvent.changeText(getByDisplayValue('Push Day'), 'Updated'));
  fireEvent.press(getByText('Save'));
  fireEvent.press(getByText('Save'));

  await waitFor(() =>
    expect(getByLabelText('Saving...').props.accessibilityState).toEqual({ disabled: true })
  );
  expect(mockSaveRoutineDraft).toHaveBeenCalledTimes(1);
  await act(async () => save.resolve(routineDetail));
});
