import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';

import type { RootStackParamList } from '../../navigation/RootNavigator';
import { RoutineTemplatePickerScreen } from '../RoutineTemplatePickerScreen';

type TestParamList = RootStackParamList & { Home: undefined };

const Stack = createNativeStackNavigator<TestParamList>();

function HomeStub() {
  return <Text>Home screen</Text>;
}

function RoutineEditorStub({
  route,
  navigation,
}: {
  route: { params?: RootStackParamList['RoutineEditor'] };
  navigation: { goBack(): void };
}) {
  return (
    <>
      <Text>
        Editor template: {route.params?.templateId ?? 'none'}; routine:{' '}
        {route.params?.routineId ?? 'none'}
      </Text>
      <Text onPress={() => navigation.goBack()}>Close editor</Text>
    </>
  );
}

function renderPicker() {
  return render(
    <NavigationContainer
      initialState={{ routes: [{ name: 'Home' }, { name: 'RoutineTemplatePicker' }], index: 1 }}
    >
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Home" component={HomeStub} />
        <Stack.Screen name="RoutineTemplatePicker" component={RoutineTemplatePickerScreen} />
        <Stack.Screen name="RoutineEditor" component={RoutineEditorStub as any} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

test('lists the built-in routine templates', async () => {
  const picker = await renderPicker();

  await waitFor(() => expect(picker.getByText('Beginner Full Body')).toBeTruthy());
  expect(picker.getByText('Push Day')).toBeTruthy();
  expect(picker.getByText('Pull Day')).toBeTruthy();
  expect(picker.getByText('Leg Day')).toBeTruthy();
});

test('selecting a template opens a new routine draft seeded from its id', async () => {
  const picker = await renderPicker();

  await waitFor(() => expect(picker.getByLabelText('Create routine from Push Day')).toBeTruthy());
  const pushTemplate = picker.getByLabelText('Create routine from Push Day');
  expect(pushTemplate.props.accessibilityHint).toContain(
    'Chest, shoulders, and triceps with straightforward working sets.'
  );
  expect(pushTemplate.props.accessibilityHint).toContain('4 exercises');
  fireEvent.press(pushTemplate);

  await waitFor(() =>
    expect(picker.getByText('Editor template: push-day; routine: none')).toBeTruthy()
  );

  fireEvent.press(picker.getByText('Close editor'));
  await waitFor(() => expect(picker.getByText('Home screen')).toBeTruthy());
  expect(picker.queryByText('Routine Templates')).toBeNull();
});

test('back returns to the workout page without creating a routine', async () => {
  const picker = await renderPicker();

  await waitFor(() => expect(picker.getByLabelText('Back')).toBeTruthy());
  fireEvent.press(picker.getByLabelText('Back'));

  await waitFor(() => expect(picker.getByText('Home screen')).toBeTruthy());
});
