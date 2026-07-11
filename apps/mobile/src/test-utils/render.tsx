import { NavigationContainer, type InitialState, type ParamListBase } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { render } from '@testing-library/react-native';
import type { ComponentType } from 'react';

type ScreenConfig<ParamList extends ParamListBase> = {
  name: Extract<keyof ParamList, string>;
  component: ComponentType<any>;
  initialParams?: object;
};

export async function renderWithStack<ParamList extends ParamListBase>(
  screens: ScreenConfig<ParamList>[],
  initialState?: InitialState
) {
  const Stack = createNativeStackNavigator<ParamList>();

  return await render(
    <NavigationContainer initialState={initialState}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {screens.map((screen) => (
          <Stack.Screen
            key={screen.name}
            name={screen.name}
            component={screen.component}
            initialParams={screen.initialParams}
          />
        ))}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
