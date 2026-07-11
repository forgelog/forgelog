import { id } from '../id';
import * as Crypto from 'expo-crypto';

jest.mock('expo-crypto', () => ({
  randomUUID: jest.fn(() => '123e4567-e89b-42d3-a456-426614174000'),
}));

describe('id', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('uses the native secure UUID generator', () => {
    expect(id()).toBe('123e4567-e89b-42d3-a456-426614174000');
    expect(Crypto.randomUUID).toHaveBeenCalledTimes(1);
  });
});
