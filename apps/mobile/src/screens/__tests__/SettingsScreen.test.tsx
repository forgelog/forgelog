import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';

import { getThemeMode, setThemeMode } from '../../db/repositories/profile';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import { ThemeProvider } from '../../theme/ThemeContext';
import { SettingsScreen } from '../SettingsScreen';

jest.mock('../../db/repositories/profile');

const mockGetThemeMode = getThemeMode as jest.MockedFunction<typeof getThemeMode>;
const mockSetThemeMode = setThemeMode as jest.MockedFunction<typeof setThemeMode>;

const Stack = createNativeStackNavigator<RootStackParamList>();

function EditProfileStub() {
  return <Text>Edit profile destination</Text>;
}

async function renderSettings() {
  return await render(
    <ThemeProvider>
      <NavigationContainer>
        <Stack.Navigator>
          <Stack.Screen name="Settings" component={SettingsScreen} />
          <Stack.Screen name="EditProfile" component={EditProfileStub} />
        </Stack.Navigator>
      </NavigationContainer>
    </ThemeProvider>
  );
}

beforeEach(() => {
  mockGetThemeMode.mockResolvedValue('system');
  mockSetThemeMode.mockResolvedValue(undefined);
});

test('opens edit profile from the Account profile row', async () => {
  const { getByLabelText, getByText } = await renderSettings();

  await waitFor(() => expect(getByText('Account')).toBeTruthy());
  await waitFor(() => expect(getByText('Name and body details')).toBeTruthy());
  fireEvent.press(getByLabelText('Edit profile'));

  await waitFor(() => expect(getByText('Edit profile destination')).toBeTruthy());
});

test('renders theme preferences and persists selection', async () => {
  const { getByLabelText, getByText } = await renderSettings();

  await waitFor(() => expect(getByText('Preferences')).toBeTruthy());
  expect(getByText('Theme')).toBeTruthy();
  expect(getByText('System')).toBeTruthy();
  expect(getByText('Light')).toBeTruthy();
  expect(getByText('Dark')).toBeTruthy();

  fireEvent.press(getByText('Dark'));

  await waitFor(() =>
    expect(getByLabelText('Use Dark theme').props.accessibilityState).toEqual({ selected: true })
  );
  await waitFor(() => expect(mockSetThemeMode).toHaveBeenCalledWith(expect.anything(), 'dark'));
});
