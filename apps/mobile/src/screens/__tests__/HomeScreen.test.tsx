import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { render, waitFor } from '@testing-library/react-native';

import type { RoutineSummary } from '../../db/repositories/routines';
import { HomeScreen } from '../HomeScreen';

jest.mock('../../db/repositories/routines');
jest.mock('../../db/repositories/workouts');

import { listRoutineSummaries } from '../../db/repositories/routines';
import { getActiveWorkout } from '../../db/repositories/workouts';

const mockListRoutineSummaries = listRoutineSummaries as jest.MockedFunction<
  typeof listRoutineSummaries
>;
const mockGetActiveWorkout = getActiveWorkout as jest.MockedFunction<typeof getActiveWorkout>;

type TestParamList = { Home: undefined };

const Stack = createNativeStackNavigator<TestParamList>();

const LONG_ROUTINE_NAME =
  'Push Pull Legs Upper Lower Full Body Hypertrophy Strength Conditioning Routine';

function renderHome() {
  return render(
    <NavigationContainer>
      <Stack.Navigator>
        <Stack.Screen name="Home" component={HomeScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

beforeEach(() => {
  mockGetActiveWorkout.mockResolvedValue(null);
  mockListRoutineSummaries.mockResolvedValue([]);
});

test('renders the Home screen with a start action', async () => {
  const { getByText } = await renderHome();
  await waitFor(() => expect(getByText('Start Empty Workout')).toBeTruthy());
});

test('truncates a long routine name instead of pushing the Start button off-screen', async () => {
  const longRoutine: RoutineSummary = {
    id: 'r1',
    name: LONG_ROUTINE_NAME,
    notes: null,
    position: 0,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
    exerciseCount: 6,
    muscles: ['chest', 'shoulders'],
  };
  mockListRoutineSummaries.mockResolvedValue([longRoutine]);

  const { getByText } = await renderHome();
  const nameNode = await waitFor(() => getByText(LONG_ROUTINE_NAME));
  expect(nameNode.props.numberOfLines).toBe(1);
  await waitFor(() => expect(getByText('Start')).toBeTruthy());
});
