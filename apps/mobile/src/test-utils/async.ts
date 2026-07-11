import type { AlertButton } from 'react-native';

export function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

export function latestAlertButtons(alertSpy: jest.SpyInstance): AlertButton[] {
  const call = alertSpy.mock.calls.at(-1);
  return (call?.[2] ?? []) as AlertButton[];
}
