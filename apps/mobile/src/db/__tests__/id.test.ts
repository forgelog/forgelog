import { id } from '../id';
import * as Crypto from 'expo-crypto';

jest.mock('expo-crypto', () => ({
  randomUUID: jest.fn(() => '123e4567-e89b-42d3-a456-426614174000'),
}));

describe('id', () => {
  const originalCrypto = globalThis.crypto;
  const randomUUID = jest.mocked(Crypto.randomUUID);

  afterEach(() => {
    randomUUID.mockReset();
    randomUUID.mockReturnValue('123e4567-e89b-42d3-a456-426614174000');
    Object.defineProperty(Crypto, 'randomUUID', {
      configurable: true,
      value: randomUUID,
    });
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: originalCrypto,
    });
  });

  it('uses the native secure UUID generator', () => {
    expect(id()).toBe('123e4567-e89b-42d3-a456-426614174000');
    expect(Crypto.randomUUID).toHaveBeenCalledTimes(1);
  });

  it('falls back to the web crypto UUID generator', () => {
    randomUUID.mockReturnValue('');
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: { randomUUID: jest.fn(() => '987e6543-e21b-42d3-a456-426614174999') },
    });

    expect(id()).toBe('987e6543-e21b-42d3-a456-426614174999');
  });

  it('falls back when the native generator is unavailable', () => {
    jest.isolateModules(() => {
      const isolatedCrypto = jest.requireMock('expo-crypto') as { randomUUID?: unknown };
      Object.defineProperty(isolatedCrypto, 'randomUUID', {
        configurable: true,
        value: undefined,
      });
      Object.defineProperty(globalThis, 'crypto', {
        configurable: true,
        value: { randomUUID: jest.fn(() => '987e6543-e21b-42d3-a456-426614174111') },
      });
      const { id: idWithoutNativeGenerator } = jest.requireActual('../id') as typeof import('../id');

      expect(idWithoutNativeGenerator()).toBe('987e6543-e21b-42d3-a456-426614174111');
    });
  });

  it('throws when secure UUID generation is unavailable', () => {
    randomUUID.mockReturnValue('');
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: undefined,
    });

    expect(() => id()).toThrow('Secure UUID generation is unavailable');
  });
});
