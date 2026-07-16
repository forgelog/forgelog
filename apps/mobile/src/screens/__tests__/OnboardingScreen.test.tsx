import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

import { completeOnboarding, getThemeMode } from '../../db/repositories/profile';
import { ThemeProvider } from '../../theme/ThemeContext';
import { OnboardingScreen } from '../OnboardingScreen';

jest.mock('../../db/repositories/profile');

const mockCompleteOnboarding = completeOnboarding as jest.MockedFunction<typeof completeOnboarding>;
const mockGetThemeMode = getThemeMode as jest.MockedFunction<typeof getThemeMode>;

beforeEach(() => {
  mockCompleteOnboarding.mockResolvedValue(undefined);
  mockGetThemeMode.mockResolvedValue('system');
});

test('requires a name but allows bodyweight to be skipped', async () => {
  const onComplete = jest.fn();
  const { getByLabelText, getByText } = await render(
    <ThemeProvider>
      <OnboardingScreen onComplete={onComplete} />
    </ThemeProvider>
  );

  await act(async () => fireEvent.press(getByLabelText('Continue')));

  expect(getByText('Name is required.')).toBeTruthy();
  expect(mockCompleteOnboarding).not.toHaveBeenCalled();
  expect(onComplete).not.toHaveBeenCalled();
});

test('continues when bodyweight is skipped', async () => {
  const onComplete = jest.fn();
  const { getByLabelText, getByTestId } = await render(
    <ThemeProvider>
      <OnboardingScreen onComplete={onComplete} />
    </ThemeProvider>
  );

  await act(async () => fireEvent.changeText(getByTestId('onboarding-name-input'), 'Jordan'));
  await act(async () => fireEvent.press(getByLabelText('Continue')));

  await waitFor(() =>
    expect(mockCompleteOnboarding).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ name: 'Jordan', bodyweightKg: null })
    )
  );
  expect(onComplete).toHaveBeenCalledTimes(1);
});

test('persists the onboarding profile before opening the app', async () => {
  const onComplete = jest.fn();
  const { getByLabelText, getByTestId } = await render(
    <ThemeProvider>
      <OnboardingScreen onComplete={onComplete} />
    </ThemeProvider>
  );

  await act(async () => fireEvent.changeText(getByTestId('onboarding-name-input'), 'Jordan'));
  await act(async () => fireEvent.changeText(getByTestId('onboarding-bodyweight-input'), '82.5'));
  await act(async () => fireEvent.press(getByLabelText('Continue')));

  await waitFor(() =>
    expect(mockCompleteOnboarding).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ name: 'Jordan', bodyweightKg: 82.5 })
    )
  );
  expect(onComplete).toHaveBeenCalledTimes(1);
});
