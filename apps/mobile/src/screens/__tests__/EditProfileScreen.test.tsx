import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';

import { EditProfileScreen } from '../EditProfileScreen';
import { ThemeProvider } from '../../theme/ThemeContext';

jest.mock('../../db/repositories/profile');

import { getProfile, getThemeMode, updateProfile } from '../../db/repositories/profile';

const mockGetProfile = getProfile as jest.MockedFunction<typeof getProfile>;
const mockUpdateProfile = updateProfile as jest.MockedFunction<typeof updateProfile>;
const mockGetThemeMode = getThemeMode as jest.MockedFunction<typeof getThemeMode>;

type TestParamList = { Home: undefined; EditProfile: undefined };

const Stack = createNativeStackNavigator<TestParamList>();

function HomeScreen() {
  return <Text>Home Screen Marker</Text>;
}

async function renderScreen() {
  return render(
    <ThemeProvider>
      <NavigationContainer
        initialState={{
          index: 1,
          routes: [{ name: 'Home' }, { name: 'EditProfile' }],
        }}
      >
        <Stack.Navigator>
          <Stack.Screen name="Home" component={HomeScreen} />
          <Stack.Screen name="EditProfile" component={EditProfileScreen as never} />
        </Stack.Navigator>
      </NavigationContainer>
    </ThemeProvider>
  );
}

beforeEach(() => {
  mockUpdateProfile.mockClear();
  mockGetProfile.mockResolvedValue({
    name: 'Jamie Lee',
    themeMode: 'system',
    sex: 'female',
    birthDate: '1990-06-15',
    heightCm: 170,
    bodyweightKg: 65,
  });
  mockUpdateProfile.mockResolvedValue(undefined);
  mockGetThemeMode.mockResolvedValue('system');
});

test('loads existing profile values into the form', async () => {
  const { getByDisplayValue, getByLabelText, getByText } = await renderScreen();
  await waitFor(() => expect(getByDisplayValue('Jamie Lee')).toBeTruthy());
  expect(getByDisplayValue('170')).toBeTruthy();
  expect(getByDisplayValue('65')).toBeTruthy();
  expect(getByText('Female')).toBeTruthy();
  expect(getByLabelText('Profile name')).toBeTruthy();
  expect(getByLabelText('Height in centimeters')).toBeTruthy();
  expect(getByLabelText('Bodyweight in kilograms')).toBeTruthy();
  expect(getByLabelText('Select Female sex')).toBeTruthy();
});

test('saving persists the edited fields and navigates back', async () => {
  const { getByDisplayValue, getByLabelText, queryByText } = await renderScreen();
  await waitFor(() => expect(getByDisplayValue('Jamie Lee')).toBeTruthy());

  const nameInput = getByDisplayValue('Jamie Lee');
  await act(async () => fireEvent.changeText(nameInput, 'Jamie R. Lee'));
  await act(async () => fireEvent.press(getByLabelText('Save profile')));

  await waitFor(() =>
    expect(mockUpdateProfile).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Jamie R. Lee', heightCm: 170, bodyweightKg: 65 })
    )
  );
  await waitFor(() => expect(queryByText('Home Screen Marker')).toBeTruthy());
});

test('rejects an out-of-range height and does not save', async () => {
  const { getByDisplayValue, getByLabelText, getByText } = await renderScreen();
  await waitFor(() => expect(getByDisplayValue('170')).toBeTruthy());

  const heightInput = getByDisplayValue('170');
  await act(async () => fireEvent.changeText(heightInput, '9'));
  await act(async () => fireEvent.press(getByLabelText('Save profile')));

  await waitFor(() => expect(getByText(/between 50 and 250/)).toBeTruthy());
  expect(mockUpdateProfile).not.toHaveBeenCalled();
});

test('pressing save before the profile finishes loading does not overwrite it with blanks', async () => {
  let resolveProfile: (value: Awaited<ReturnType<typeof getProfile>>) => void = () => {};
  mockGetProfile.mockReturnValue(
    new Promise((resolve) => {
      resolveProfile = resolve;
    })
  );

  const { getByLabelText } = await renderScreen();
  await act(async () => fireEvent.press(getByLabelText('Save profile')));
  expect(mockUpdateProfile).not.toHaveBeenCalled();

  await act(async () =>
    resolveProfile({
      name: 'Jamie Lee',
      themeMode: 'system',
      sex: 'female',
      birthDate: '1990-06-15',
      heightCm: 170,
      bodyweightKg: 65,
    })
  );
});

test('cancel discards changes without saving', async () => {
  const { getByDisplayValue, getByLabelText, queryByText } = await renderScreen();
  await waitFor(() => expect(getByDisplayValue('Jamie Lee')).toBeTruthy());

  const nameInput = getByDisplayValue('Jamie Lee');
  await act(async () => fireEvent.changeText(nameInput, 'Someone Else'));
  await act(async () => fireEvent.press(getByLabelText('Close')));

  expect(mockUpdateProfile).not.toHaveBeenCalled();
  await waitFor(() => expect(queryByText('Home Screen Marker')).toBeTruthy());
});
