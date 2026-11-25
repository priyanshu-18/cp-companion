export interface StreakSummary {
  solvedToday: boolean;
  currentStreak: number;
  longestStreak: number;
}

export function toLocalDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Computes streak metrics from merged daily-activity counts (last 365 days).
 * Note: Each platform's own day keys are used as-is (LeetCode's submission
 * calendar is keyed by UTC day, whereas Codeforces/CodeChef use local dates).
 * Returns null if no platform is connected or no activity data is available.
 */
export function computeStreak(
  mergedHeatmap: Record<string, number>,
  hasConnectedPlatform: boolean,
  now: Date = new Date(),
): StreakSummary | null {
  if (!hasConnectedPlatform || Object.keys(mergedHeatmap).length === 0) {
    return null;
  }

  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const todayKey = toLocalDateKey(today);
  const solvedToday = (mergedHeatmap[todayKey] ?? 0) > 0;

  // Current streak: start from today if solvedToday, otherwise from yesterday
  let currentStreak = 0;
  const cursor = new Date(today);
  if (!solvedToday) {
    cursor.setDate(cursor.getDate() - 1);
  }
  for (let i = 0; i < 366; i++) {
    const key = toLocalDateKey(cursor);
    if ((mergedHeatmap[key] ?? 0) > 0) {
      currentStreak++;
      cursor.setDate(cursor.getDate() - 1);
    } else {
      break;
    }
  }

  // Longest streak within the available 365 days
  let longestStreak = 0;
  let running = 0;
  const scan = new Date(today);
  scan.setDate(scan.getDate() - 364);
  for (let i = 0; i < 365; i++) {
    const key = toLocalDateKey(scan);
    if ((mergedHeatmap[key] ?? 0) > 0) {
      running++;
      if (running > longestStreak) longestStreak = running;
    } else {
      running = 0;
    }
    scan.setDate(scan.getDate() + 1);
  }

  return { solvedToday, currentStreak, longestStreak };
}
