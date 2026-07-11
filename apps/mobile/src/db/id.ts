import * as Crypto from 'expo-crypto';

export function id(): string {
  if (typeof Crypto.randomUUID === 'function') {
    const nativeId = Crypto.randomUUID();
    if (nativeId) return nativeId;
  }

  const webId = globalThis.crypto?.randomUUID?.();
  if (webId) return webId;

  throw new Error('Secure UUID generation is unavailable');
}
