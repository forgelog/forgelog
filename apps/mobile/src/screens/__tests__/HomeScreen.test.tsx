import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { render, waitFor } from '@testing-library/react-native';

import { HomeScreen } from '../HomeScreen';
import type { RootStackParamList } from '../../navigation/RootNavigator';

const Stack = createNativeStackNavigator<RootStackParamList>();

test('renders the Home screen with a start action', async () => {
  const { getByText } = await render(
    <NavigationContainer>
      <Stack.Navigator>
        <Stack.Screen name="Home" component={HomeScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
  await waitFor(() => expect(getByText('Start Workout')).toBeTruthy());
});
