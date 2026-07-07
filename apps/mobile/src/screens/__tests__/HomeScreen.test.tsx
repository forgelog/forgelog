import { render } from '@testing-library/react-native';

import { HomeScreen } from '../HomeScreen';

test('renders the Home screen', async () => {
  const navigation = { navigate: jest.fn() } as never;
  const route = {} as never;
  const { getByText } = await render(<HomeScreen navigation={navigation} route={route} />);
  expect(getByText('Exercise Library')).toBeTruthy();
});
