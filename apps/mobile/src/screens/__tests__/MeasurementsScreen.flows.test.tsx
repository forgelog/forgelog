import { act, cleanup, fireEvent, waitFor } from '@testing-library/react-native';

import { resetDbForTests } from '../../db/index';
import type { RootStackParamList } from '../../navigation/RootNavigator';
import { renderWithStack } from '../../test-utils/render';
import { MeasurementsScreen } from '../MeasurementsScreen';
import { RecordMeasurementsScreen } from '../RecordMeasurementsScreen';

beforeEach(() => {
  resetDbForTests();
});

afterEach(() => {
  cleanup();
});

async function renderMeasurements() {
  return renderWithStack<RootStackParamList>([
    { name: 'Measurements', component: MeasurementsScreen },
    { name: 'RecordMeasurements', component: RecordMeasurementsScreen },
  ]);
}

test('shows every measurement type and an empty state for unrecorded values', async () => {
  const screen = await renderMeasurements();

  await waitFor(() => expect(screen.getByText('Bodyweight')).toBeTruthy());
  expect(screen.getByText('Right calf')).toBeTruthy();
  expect(screen.getAllByText('Not recorded')).toHaveLength(18);
});

test('records entered measurements and returns to the current values', async () => {
  const screen = await renderMeasurements();
  await waitFor(() => expect(screen.getByLabelText('Record measurements')).toBeTruthy());

  await act(async () => fireEvent.press(screen.getByLabelText('Record measurements')));
  await waitFor(() => expect(screen.getByTestId('measurement-right-calf-input')).toBeTruthy());

  await act(async () => {
    fireEvent.changeText(screen.getByTestId('measurement-bodyweight-input'), '80.5');
  });
  await act(async () => {
    fireEvent.changeText(screen.getByTestId('measurement-waist-input'), '91');
  });
  await act(async () => fireEvent.press(screen.getByLabelText('Save measurements')));

  await waitFor(() => expect(screen.getByText('80.5 kg')).toBeTruthy());
  expect(screen.getByText('91 cm')).toBeTruthy();
  expect(screen.getAllByText('Not recorded')).toHaveLength(16);
});

test('keeps the record screen open when a value is invalid', async () => {
  const screen = await renderMeasurements();
  await waitFor(() => expect(screen.getByLabelText('Record measurements')).toBeTruthy());
  await act(async () => fireEvent.press(screen.getByLabelText('Record measurements')));
  await waitFor(() => expect(screen.getByTestId('measurement-body-fat-input')).toBeTruthy());

  await act(async () => {
    fireEvent.changeText(screen.getByTestId('measurement-body-fat-input'), 'not-a-number');
  });
  await act(async () => fireEvent.press(screen.getByLabelText('Save measurements')));

  await waitFor(() => expect(screen.getByText('Body fat must be a number.')).toBeTruthy());
  expect(screen.getByLabelText('Save measurements')).toBeTruthy();
});
