import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { act, fireEvent, render, waitFor, within } from '@testing-library/react-native';
import { Dimensions, StyleSheet, Text } from 'react-native';

import type { RootStackParamList } from '../../navigation/RootNavigator';
import { mobileStore, type RoutineSummary } from '../../db/mobileStore';
import { HomeScreen } from '../HomeScreen';

jest.mock('@expo/ui/community/bottom-sheet');
jest.mock('../../db/mobileStore', () => ({
  mobileStore: {
    routines: {
      getWithSummaries: jest.fn(),
      remove: jest.fn(),
    },
    workouts: {
      getActive: jest.fn(),
    },
  },
}));

const mockGetRoutinesWithSummaries = mobileStore.routines.getWithSummaries as jest.MockedFunction<
  typeof mobileStore.routines.getWithSummaries
>;
const mockGetActiveWorkout = mobileStore.workouts.getActive as jest.MockedFunction<
  typeof mobileStore.workouts.getActive
>;

type TestParamList = RootStackParamList & { Home: undefined };

const Stack = createNativeStackNavigator<TestParamList>();

const LONG_ROUTINE_NAME =
  'Push Pull Legs Upper Lower Full Body Hypertrophy Strength Conditioning Routine';

function RoutineEditorStub({ route }: { route: { params?: RootStackParamList['RoutineEditor'] } }) {
  return (
    <Text>
      Create editor routineId: {route.params?.routineId ?? 'none'}; templateId:{' '}
      {route.params?.templateId ?? 'none'}
    </Text>
  );
}

function renderHome() {
  return render(
    <NavigationContainer>
      <Stack.Navigator>
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen name="RoutineEditor" component={RoutineEditorStub as any} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

beforeEach(() => {
  mockGetActiveWorkout.mockResolvedValue(null);
  mockGetRoutinesWithSummaries.mockResolvedValue([]);
});

test('renders the Home screen with a start action', async () => {
  const { getByLabelText, getByTestId, getByText, queryByLabelText } = await renderHome();
  await waitFor(() => expect(getByText('Start Empty Workout')).toBeTruthy());
  expect(getByLabelText('Start Empty Workout')).toBeTruthy();
  expect(getByLabelText('Create routine')).toBeTruthy();
  expect(getByText('Starter Routines')).toBeTruthy();
  expect(getByLabelText('Starter routine Beginner Full Body')).toBeTruthy();
  expect(getByLabelText('Starter routine Push Day')).toBeTruthy();
  expect(getByLabelText('Starter routine Pull Day')).toBeTruthy();
  expect(getByLabelText('Starter routine Leg Day')).toBeTruthy();
  expect(queryByLabelText('Starter routine options Push Day')).toBeNull();
  expect(queryByLabelText('Browse routine templates')).toBeNull();

  const pushCard = getByTestId('starter-routine-card-push-day');
  expect(StyleSheet.flatten(pushCard.props.style).height).toBe(
    StyleSheet.flatten(pushCard.props.style).width
  );
  expect(within(pushCard).getByText('Push Day')).toBeTruthy();
  expect(within(pushCard).getByText('4 exercises')).toBeTruthy();
  expect(within(pushCard).getByText('Barbell Bench Press - Medium Grip')).toBeTruthy();
  expect(within(pushCard).getByText('Dumbbell Shoulder Press')).toBeTruthy();
  expect(within(pushCard).getByText('+2 more')).toBeTruthy();
  expect(
    within(pushCard).queryByText('Chest, shoulders, and triceps with straightforward working sets.')
  ).toBeNull();
});

test('keeps starter routine cards in exactly two columns on wide screens', async () => {
  const originalWindow = Dimensions.get('window');
  const originalScreen = Dimensions.get('screen');
  await act(() => {
    Dimensions.set({
      window: { ...originalWindow, width: 844 },
      screen: { ...originalScreen, width: 844 },
    });
  });

  try {
    const home = await renderHome();
    const pushCard = await waitFor(() => home.getByTestId('starter-routine-card-push-day'));
    expect(StyleSheet.flatten(pushCard.props.style).width).toBe(400);
    expect(StyleSheet.flatten(pushCard.props.style).height).toBe(400);
  } finally {
    await act(() => {
      Dimensions.set({ window: originalWindow, screen: originalScreen });
    });
  }
});

test('grows starter routine cards instead of clipping content with large text', async () => {
  const originalWindow = Dimensions.get('window');
  const originalScreen = Dimensions.get('screen');
  await act(() => {
    Dimensions.set({
      window: { ...originalWindow, width: 320, fontScale: 2 },
      screen: { ...originalScreen, width: 320, fontScale: 2 },
    });
  });

  try {
    const home = await renderHome();
    const pushCard = await waitFor(() => home.getByTestId('starter-routine-card-push-day'));
    const cardStyle = StyleSheet.flatten(pushCard.props.style);
    expect(cardStyle.width).toBe(138);
    expect(cardStyle.height).toBeGreaterThan(cardStyle.width);
  } finally {
    await act(() => {
      Dimensions.set({ window: originalWindow, screen: originalScreen });
    });
  }
});

test('starter routine card opens an action sheet before creating a routine', async () => {
  const home = await renderHome();

  await waitFor(() => expect(home.getByLabelText('Starter routine Push Day')).toBeTruthy());
  fireEvent.press(home.getByLabelText('Starter routine Push Day'));

  const sheet = await waitFor(() => home.getByTestId('starter-routine-actions-sheet'));
  const bottomSheet = home.getByTestId('mock-bottom-sheet');
  expect(bottomSheet.props.enablePanDownToClose).toBe(true);
  expect(bottomSheet.props.snapPoints).toEqual(['55%', '85%']);
  expect(bottomSheet.props.enableDynamicSizing).toBeUndefined();
  expect(
    StyleSheet.flatten(home.getByTestId('starter-routine-sheet-scroll-view').props.style).flex
  ).toBe(1);
  expect(
    within(sheet).getByText('Chest, shoulders, and triceps with straightforward working sets.')
  ).toBeTruthy();
  expect(within(sheet).getByText('Barbell Bench Press - Medium Grip')).toBeTruthy();
  expect(within(sheet).getByText('Dumbbell Shoulder Press')).toBeTruthy();
  expect(home.getByLabelText('Create routine from Push Day')).toBeTruthy();

  fireEvent.press(home.getByLabelText('Create routine from Push Day'));

  await waitFor(() =>
    expect(home.getByText('Create editor routineId: none; templateId: push-day')).toBeTruthy()
  );
});

test('create routine opens a new editor draft without a routine id', async () => {
  const { getByLabelText, getByText } = await renderHome();

  await waitFor(() => expect(getByLabelText('Create routine')).toBeTruthy());
  fireEvent.press(getByLabelText('Create routine'));

  await waitFor(() =>
    expect(getByText('Create editor routineId: none; templateId: none')).toBeTruthy()
  );
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
    exerciseNames: ['Bench Press', 'Shoulder Press'],
  };
  mockGetRoutinesWithSummaries.mockResolvedValue([longRoutine]);

  const { getByLabelText, getByText } = await renderHome();
  const nameNode = await waitFor(() => getByText(LONG_ROUTINE_NAME));
  expect(nameNode.props.numberOfLines).toBe(1);
  await waitFor(() => expect(getByText('Start')).toBeTruthy());
  expect(getByLabelText(`View routine ${LONG_ROUTINE_NAME}`)).toBeTruthy();
  expect(getByLabelText(`Start routine ${LONG_ROUTINE_NAME}`)).toBeTruthy();
  expect(getByLabelText(`Routine options ${LONG_ROUTINE_NAME}`)).toBeTruthy();
});
