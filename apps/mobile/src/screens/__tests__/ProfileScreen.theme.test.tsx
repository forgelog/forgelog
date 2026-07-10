import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import { ProfileScreen } from '../ProfileScreen';
import { ThemeProvider } from '../../theme/ThemeContext';

jest.mock('../../db/repositories/personalRecords');
jest.mock('../../db/repositories/workouts');
jest.mock('../../db/repositories/profile');

import { listAllRecords } from '../../db/repositories/personalRecords';
import { getProfile, getThemeMode, setThemeMode } from '../../db/repositories/profile';
import { getProfileStats } from '../../db/repositories/workouts';

const mockListAllRecords = listAllRecords as jest.MockedFunction<typeof listAllRecords>;
const mockGetProfileStats = getProfileStats as jest.MockedFunction<typeof getProfileStats>;
const mockGetThemeMode = getThemeMode as jest.MockedFunction<typeof getThemeMode>;
const mockSetThemeMode = setThemeMode as jest.MockedFunction<typeof setThemeMode>;
const mockGetProfile = getProfile as jest.MockedFunction<typeof getProfile>;

type TestParamList = { Profile: undefined };

const Stack = createNativeStackNavigator<TestParamList>();

async function renderProfile() {
  return render(
    <ThemeProvider>
      <NavigationContainer>
        <Stack.Navigator>
          <Stack.Screen name="Profile" component={ProfileScreen} />
        </Stack.Navigator>
      </NavigationContainer>
    </ThemeProvider>
  );
}

beforeEach(() => {
  mockListAllRecords.mockResolvedValue([]);
  mockGetProfileStats.mockResolvedValue({ workoutCount: 0, totalVolume: 0, streakDays: 0 });
  mockGetThemeMode.mockResolvedValue('system');
  mockSetThemeMode.mockResolvedValue(undefined);
  mockGetProfile.mockResolvedValue({
    name: 'Alex Rivera',
    themeMode: 'system',
    sex: null,
    birthDate: null,
    heightCm: null,
    bodyweightKg: null,
  });
});

test('renders the theme selector with system/light/dark options', async () => {
  const { getByText } = await renderProfile();
  await waitFor(() => expect(getByText('System')).toBeTruthy());
  expect(getByText('Light')).toBeTruthy();
  expect(getByText('Dark')).toBeTruthy();
});

test('selecting Dark persists the preference via the profile repository', async () => {
  const { getByText } = await renderProfile();
  await waitFor(() => expect(getByText('Dark')).toBeTruthy());

  fireEvent.press(getByText('Dark'));

  await waitFor(() => expect(mockSetThemeMode).toHaveBeenCalledWith('dark'));
});

test('loads the previously persisted preference on mount', async () => {
  mockGetThemeMode.mockResolvedValue('dark');
  await renderProfile();

  await waitFor(() => expect(mockGetThemeMode).toHaveBeenCalled());
});
