import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';

import { listAllRecords } from '../../db/repositories/personalRecords';
import {
  getProfile,
  getThemeMode,
  setProfileName,
  setThemeMode,
} from '../../db/repositories/profile';
import { ThemeProvider } from '../../theme/ThemeContext';
import { ProfileScreen } from '../ProfileScreen';

jest.mock('../../db/repositories/personalRecords');
jest.mock('../../db/repositories/profile');

const mockListAllRecords = listAllRecords as jest.MockedFunction<typeof listAllRecords>;
const mockGetThemeMode = getThemeMode as jest.MockedFunction<typeof getThemeMode>;
const mockSetThemeMode = setThemeMode as jest.MockedFunction<typeof setThemeMode>;
const mockSetProfileName = setProfileName as jest.MockedFunction<typeof setProfileName>;
const mockGetProfile = getProfile as jest.MockedFunction<typeof getProfile>;

type TestParamList = {
  Profile: undefined;
  EditProfile: undefined;
  Measurements: undefined;
  Settings: undefined;
};

const Stack = createNativeStackNavigator<TestParamList>();

function MeasurementsStub() {
  return <Text>Measurements destination</Text>;
}

function EditProfileStub() {
  return <Text>Edit profile destination</Text>;
}

function SettingsStub() {
  return <Text>Settings destination</Text>;
}

async function renderProfile() {
  return await render(
    <ThemeProvider>
      <NavigationContainer>
        <Stack.Navigator>
          <Stack.Screen name="Profile" component={ProfileScreen} />
          <Stack.Screen name="EditProfile" component={EditProfileStub} />
          <Stack.Screen name="Measurements" component={MeasurementsStub} />
          <Stack.Screen name="Settings" component={SettingsStub} />
        </Stack.Navigator>
      </NavigationContainer>
    </ThemeProvider>
  );
}

beforeEach(() => {
  mockListAllRecords.mockResolvedValue([]);
  mockGetThemeMode.mockResolvedValue('system');
  mockSetThemeMode.mockResolvedValue(undefined);
  mockSetProfileName.mockResolvedValue(undefined);
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
  const { getByLabelText, getByText } = await renderProfile();
  await waitFor(() => expect(getByText('Dark')).toBeTruthy());

  fireEvent.press(getByText('Dark'));

  await waitFor(() =>
    expect(getByLabelText('Use Dark theme').props.accessibilityState).toEqual({ selected: true })
  );
  await waitFor(() => expect(mockSetThemeMode).toHaveBeenCalledWith(expect.anything(), 'dark'));
});

test('loads the previously persisted preference on mount', async () => {
  mockGetThemeMode.mockResolvedValue('dark');
  const { getByLabelText } = await renderProfile();

  await waitFor(() => expect(mockGetThemeMode).toHaveBeenCalled());
  await waitFor(() =>
    expect(getByLabelText('Use Dark theme').props.accessibilityState).toEqual({ selected: true })
  );
});

test('shows profile header actions without member since copy or a Body edit icon', async () => {
  const { getAllByLabelText, queryByText, getByDisplayValue } = await renderProfile();

  await waitFor(() => expect(getByDisplayValue('Alex Rivera')).toBeTruthy());

  expect(queryByText('Member since 2026')).toBeNull();
  expect(getAllByLabelText('Edit profile')).toHaveLength(1);
  expect(getAllByLabelText('Open settings')).toHaveLength(1);
});

test('opens edit profile from the profile header pencil', async () => {
  const { getByLabelText, getByText, getByDisplayValue } = await renderProfile();

  await waitFor(() => expect(getByDisplayValue('Alex Rivera')).toBeTruthy());
  fireEvent.press(getByLabelText('Edit profile'));

  await waitFor(() => expect(getByText('Edit profile destination')).toBeTruthy());
});

test('opens settings from the profile header settings icon', async () => {
  const { getByLabelText, getByText, getByDisplayValue } = await renderProfile();

  await waitFor(() => expect(getByDisplayValue('Alex Rivera')).toBeTruthy());
  fireEvent.press(getByLabelText('Open settings'));

  await waitFor(() => expect(getByText('Settings destination')).toBeTruthy());
});

test('clearing the name persists an empty string, no placeholder fallback', async () => {
  const { getByDisplayValue, queryByText } = await renderProfile();
  await waitFor(() => expect(getByDisplayValue('Alex Rivera')).toBeTruthy());

  const nameInput = getByDisplayValue('Alex Rivera');
  await act(async () => fireEvent.changeText(nameInput, '   '));
  await act(async () => fireEvent(nameInput, 'blur'));

  await waitFor(() => expect(mockSetProfileName).toHaveBeenCalledWith(expect.anything(), ''));
  expect(getByDisplayValue('')).toBeTruthy();
  expect(queryByText('AR')).toBeNull();
});

test('renders populated Body fields with units', async () => {
  mockGetProfile.mockResolvedValue({
    name: 'Jamie Lee',
    themeMode: 'system',
    sex: 'female',
    birthDate: '1990-06-15',
    heightCm: 170,
    bodyweightKg: 65,
  });

  const { getByText } = await renderProfile();

  await waitFor(() => expect(getByText('Female')).toBeTruthy());
  expect(getByText('170 cm')).toBeTruthy();
  expect(getByText('65 kg')).toBeTruthy();
});

test('trims whitespace before saving a new name', async () => {
  const { getByDisplayValue } = await renderProfile();
  await waitFor(() => expect(getByDisplayValue('Alex Rivera')).toBeTruthy());

  const nameInput = getByDisplayValue('Alex Rivera');
  await act(async () => fireEvent.changeText(nameInput, '  Jamie Lee  '));
  await act(async () => fireEvent(nameInput, 'blur'));

  await waitFor(() =>
    expect(mockSetProfileName).toHaveBeenCalledWith(expect.anything(), 'Jamie Lee')
  );
});

test('opens measurements from the profile options', async () => {
  const { getByLabelText, getByText } = await renderProfile();

  await waitFor(() => expect(getByLabelText('Open measurements')).toBeTruthy());
  fireEvent.press(getByLabelText('Open measurements'));

  await waitFor(() => expect(getByText('Measurements destination')).toBeTruthy());
});
