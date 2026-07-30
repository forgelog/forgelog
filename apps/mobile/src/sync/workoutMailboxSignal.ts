let publish: (() => void) | null = null;
const appliedListeners = new Set<() => void>();

export function registerWorkoutMailboxPublisher(publisher: () => void): void {
  publish = publisher;
}

export function signalWorkoutMailboxPublisher(): void {
  publish?.();
}

export function subscribeWorkoutMailboxApplied(listener: () => void): () => void {
  appliedListeners.add(listener);
  return () => appliedListeners.delete(listener);
}

export function notifyWorkoutMailboxApplied(): void {
  for (const listener of appliedListeners) listener();
}
