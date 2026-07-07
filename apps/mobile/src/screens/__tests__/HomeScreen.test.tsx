import { render } from '@testing-library/react-native';

import { HomeScreen } from '../HomeScreen';

test('renders the Home screen', async () => {
  const { getByText } = await render(<HomeScreen />);
  expect(getByText('Home')).toBeTruthy();
});
