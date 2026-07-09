import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

import { ProfileScreen } from '../ProfileScreen';
import { ThemeProvider } from '../../theme/ThemeContext';

jest.mock('../../db/repositories/personalRecords');
jest.mock('../../db/repositories/workouts');
jest.mock('../../db/repositories/profile');

import { listAllRecords } from '../../db/repositories/personalRecords';
import { getProfileName, getThemeMode, setProfileName } from '../../db/repositories/profile';
import { getProfileStats } from '../../db/repositories/workouts';

const mockListAllRecords = listAllRecords as jest.MockedFunction<typeof listAllRecords>;
const mockGetProfileStats = getProfileStats as jest.MockedFunction<typeof getProfileStats>;
const mockGetProfileName = getProfileName as jest.MockedFunction<typeof getProfileName>;
const mockSetProfileName = setProfileName as jest.MockedFunction<typeof setProfileName>;
const mockGetThemeMode = getThemeMode as jest.MockedFunction<typeof getThemeMode>;

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
  mockGetProfileName.mockResolvedValue('Alex Rivera');
  mockGetThemeMode.mockResolvedValue('system');
  mockSetProfileName.mockResolvedValue(undefined);
});

test('clearing the name falls back to the default and persists it', async () => {
  const { getByDisplayValue } = await renderProfile();
  await waitFor(() => expect(getByDisplayValue('Alex Rivera')).toBeTruthy());

  const nameInput = getByDisplayValue('Alex Rivera');
  await act(async () => fireEvent.changeText(nameInput, '   '));
  await act(async () => fireEvent(nameInput, 'blur'));

  await waitFor(() => expect(mockSetProfileName).toHaveBeenCalledWith('Alex Rivera'));
});

test('trims whitespace before saving a new name', async () => {
  const { getByDisplayValue } = await renderProfile();
  await waitFor(() => expect(getByDisplayValue('Alex Rivera')).toBeTruthy());

  const nameInput = getByDisplayValue('Alex Rivera');
  await act(async () => fireEvent.changeText(nameInput, '  Jamie Lee  '));
  await act(async () => fireEvent(nameInput, 'blur'));

  await waitFor(() => expect(mockSetProfileName).toHaveBeenCalledWith('Jamie Lee'));
});
