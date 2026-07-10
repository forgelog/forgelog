export function localDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = (date.getMonth() + 1).toString().padStart(2, '0');
  const d = date.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function currentWeekDays(today: Date): Date[] {
  const base = new Date(today);
  base.setHours(0, 0, 0, 0);
  const dow = base.getDay();
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(base);
  monday.setDate(base.getDate() + mondayOffset);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

export function monthLabel(date: Date): string {
  return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

export function computeStreakDays(dayKeys: string[], todayKey: string): number {
  if (dayKeys.length === 0) return 0;
  const days = new Set(dayKeys);

  const addDays = (key: string, delta: number): string => {
    const [y, mo, d] = key.split('-').map(Number);
    const date = new Date(y, mo - 1, d + delta);
    return localDateKey(date);
  };

  let cursor = todayKey;
  if (!days.has(cursor)) {
    cursor = addDays(cursor, -1);
    if (!days.has(cursor)) return 0;
  }

  let streak = 0;
  while (days.has(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}
