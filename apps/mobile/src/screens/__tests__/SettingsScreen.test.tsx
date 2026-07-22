import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';

import { getThemeMode } from '../../db/repositories/profile';
import { ThemeProvider } from '../../theme/ThemeContext';
import { SettingsScreen } from '../SettingsScreen';

jest.mock('../../db/repositories/profile');

const mockGetThemeMode = getThemeMode as jest.MockedFunction<typeof getThemeMode>;

type TestParamList = { Settings: undefined; EditProfile: undefined };

const Stack = createNativeStackNavigator<TestParamList>();

function EditProfileStub() {
  return <Text>Edit profile destination</Text>;
}

async function renderSettings() {
  return await render(
    <ThemeProvider>
      <NavigationContainer>
        <Stack.Navigator>
          <Stack.Screen name="Settings" component={SettingsScreen as never} />
          <Stack.Screen name="EditProfile" component={EditProfileStub} />
        </Stack.Navigator>
      </NavigationContainer>
    </ThemeProvider>
  );
}

beforeEach(() => {
  mockGetThemeMode.mockResolvedValue('system');
});

test('opens edit profile from the Profile row', async () => {
  const { getByLabelText, getByText } = await renderSettings();

  await waitFor(() => expect(getByText('Name and body details')).toBeTruthy());
  fireEvent.press(getByLabelText('Edit profile'));

  await waitFor(() => expect(getByText('Edit profile destination')).toBeTruthy());
});
