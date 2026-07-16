import { act, cleanup, fireEvent, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';

import { getDb, resetDbForTests } from '../../db/index';
import * as exercisesRepository from '../../db/repositories/exercises';
import type { Exercise } from '../../db/types';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import { seededExercise } from '../../test-utils/db';
import { renderWithStack } from '../../test-utils/render';
import { ExerciseDetailScreen } from '../ExerciseDetailScreen';
import { ExerciseLibraryScreen } from '../ExerciseLibraryScreen';

type TestStackParamList = RootStackParamList & {
  PickTarget: { pickedExerciseId?: string } | undefined;
};

function PickTargetScreen({ route }: { route: { params?: { pickedExerciseId?: string } } }) {
  return <Text>{route.params?.pickedExerciseId ? `Picked ${route.params.pickedExerciseId}` : 'No pick'}</Text>;
}

beforeEach(() => {
  resetDbForTests();
  jest.restoreAllMocks();
});

afterEach(() => {
  cleanup();
});

test('shows a loading state while exercises load', async () => {
  jest
    .spyOn(exercisesRepository, 'listExercises')
    .mockReturnValue(new Promise<Exercise[]>(() => {}));

  const loading = await renderWithStack<TestStackParamList>([
    { name: 'ExerciseLibrary', component: ExerciseLibraryScreen },
  ]);

  expect(loading.getByLabelText('Loading exercises')).toBeTruthy();
  await act(async () => {
    loading.unmount();
  });
});

test('shows an empty state when filters have no matches', async () => {
  const library = await renderWithStack<TestStackParamList>([
    { name: 'ExerciseLibrary', component: ExerciseLibraryScreen },
  ]);

  await waitFor(() => expect(library.getByText(/\d+ exercises/)).toBeTruthy());
  await act(async () => {
    fireEvent.changeText(library.getByTestId('exercise-search-input'), 'phase-six-no-match');
  });
  await waitFor(() => expect(library.getByText('No exercises match your filters.')).toBeTruthy());
});

test('shows a load-error state when seeded exercise data is invalid', async () => {
  const bench = await seededExercise('Barbell Bench Press - Medium Grip');
  const db = await getDb();
  // todo: audit pending
  await db.runAsync('UPDATE exercises SET images = $images WHERE id = $id', {
    $images: 'not-json',
    $id: bench.id,
  });

  const error = await renderWithStack<TestStackParamList>([
    { name: 'ExerciseLibrary', component: ExerciseLibraryScreen },
  ]);

  await waitFor(() => expect(error.getByText('Could not load exercises.')).toBeTruthy());
});

test('searches and filters exercises in browse mode', async () => {
  const bench = await seededExercise('Barbell Bench Press - Medium Grip');
  const browse = await renderWithStack<TestStackParamList>([
    { name: 'ExerciseLibrary', component: ExerciseLibraryScreen },
    { name: 'ExerciseDetail', component: ExerciseDetailScreen },
  ]);

  await waitFor(() => expect(browse.getByLabelText('Search exercises')).toBeTruthy());
  await act(async () => {
    fireEvent.press(browse.getByLabelText('Muscle group filter'));
  });
  await waitFor(() => expect(browse.getByLabelText('Select Muscle group chest')).toBeTruthy());
  await act(async () => {
    fireEvent.press(browse.getByLabelText('Select Muscle group chest'));
  });
  await waitFor(() => expect(browse.queryByLabelText('Select Muscle group chest')).toBeNull());
  await waitFor(() => expect(browse.getByText('84 exercises')).toBeTruthy());
  await act(async () => {
    fireEvent.press(browse.getByLabelText('Muscle group filter'));
  });
  await waitFor(() => expect(browse.getByLabelText('Select Muscle group chest')).toBeTruthy());
  await act(async () => {
    fireEvent.press(browse.getByLabelText('Select Muscle group chest'));
  });
  await waitFor(() => expect(browse.getByText('84 exercises')).toBeTruthy());
  expect(browse.queryByLabelText('Loading exercises')).toBeNull();
  await act(async () => {
    fireEvent.changeText(browse.getByTestId('exercise-search-input'), 'bench');
  });

  await waitFor(() => expect(browse.getByText('18 exercises')).toBeTruthy());
  await waitFor(() => expect(browse.getByLabelText(`Open ${bench.name}`)).toBeTruthy());
});

test('opens exercise detail from browse mode', async () => {
  const bench = await seededExercise('Barbell Bench Press - Medium Grip');
  const browse = await renderWithStack<TestStackParamList>([
    { name: 'ExerciseLibrary', component: ExerciseLibraryScreen },
    { name: 'ExerciseDetail', component: ExerciseDetailScreen },
  ]);

  await waitFor(() => expect(browse.getByLabelText('Search exercises')).toBeTruthy());
  await act(async () => {
    fireEvent.changeText(browse.getByTestId('exercise-search-input'), 'bench');
  });
  await waitFor(() => expect(browse.getByLabelText(`Open ${bench.name}`)).toBeTruthy());
  await act(async () => {
    fireEvent.press(browse.getByLabelText(`Open ${bench.name}`));
  });

  await waitFor(() => expect(browse.getByText('MUSCLES WORKED')).toBeTruthy());
});

test('opens the equipment filter menu', async () => {
  const equipmentFilter = await renderWithStack<TestStackParamList>([
    { name: 'ExerciseLibrary', component: ExerciseLibraryScreen },
  ]);

  await waitFor(() => expect(equipmentFilter.getByLabelText('Search exercises')).toBeTruthy());
  await act(async () => {
    fireEvent.press(equipmentFilter.getByLabelText('Equipment filter'));
  });
  await waitFor(() => expect(equipmentFilter.getByLabelText('Select Equipment barbell')).toBeTruthy());
});

test('returns a picked exercise to the previous route', async () => {
  const pick = await renderWithStack<TestStackParamList>(
    [
      { name: 'PickTarget', component: PickTargetScreen },
      { name: 'RoutineEditor', component: PickTargetScreen as any },
      { name: 'ExerciseLibrary', component: ExerciseLibraryScreen },
      { name: 'ExerciseDetail', component: ExerciseDetailScreen },
    ],
    {
      index: 1,
      routes: [
        { name: 'RoutineEditor' },
        { name: 'ExerciseLibrary', params: { mode: 'pick', returnTo: 'RoutineEditor' } },
      ],
    }
  );

  await waitFor(() => expect(pick.getByLabelText('Search exercises')).toBeTruthy());
  await act(async () => {
    fireEvent.changeText(pick.getByTestId('exercise-search-input'), 'Push-Up Wide');
  });
  await waitFor(() => expect(pick.getByLabelText('Select Push-Up Wide')).toBeTruthy());
  await act(async () => {
    fireEvent.press(pick.getByLabelText('Select Push-Up Wide'));
  });
  await waitFor(() => expect(pick.getByText(/Picked /)).toBeTruthy());
});
