import { render, waitFor } from '@testing-library/react-native';

import { getThemeMode, hasCompletedOnboarding } from '../../db/repositories/profile';
import { ThemeProvider } from '../../theme/ThemeContext';
import { RootNavigator } from '../RootNavigator';

jest.mock('../../db/repositories/profile');

const mockGetThemeMode = getThemeMode as jest.MockedFunction<typeof getThemeMode>;
const mockHasCompletedOnboarding = hasCompletedOnboarding as jest.MockedFunction<
  typeof hasCompletedOnboarding
>;

beforeEach(() => {
  mockGetThemeMode.mockResolvedValue('system');
});

test('shows onboarding before rendering the main navigator', async () => {
  mockHasCompletedOnboarding.mockResolvedValue(false);

  const { getByText } = await render(
    <ThemeProvider>
      <RootNavigator />
    </ThemeProvider>
  );

  await waitFor(() => expect(getByText('Let’s set up your profile.')).toBeTruthy());
});
