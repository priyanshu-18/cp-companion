import type { PlatformStats, Contest, Platform } from "../types";

/**
 * MOCK DATA SERVICE
 * All values are fabricated for UI development only.
 * Every call site in the UI shows ⚠ Mock badges.
 * Replace each export with real service calls in Phase 4.
 */

function generateMockHeatmap(): Record<string, number> {
  const data: Record<string, number> = {};
  const today = new Date();
  for (let i = 364; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().split("T")[0];
    const rand = Math.random();
    if (rand > 0.58) data[key] = Math.floor(rand * 14);
  }
  return data;
}

export const MOCK_LEETCODE_STATS: PlatformStats = {
  platform: "leetcode",
  username: "mock_user",
  totalSolved: 342,
  currentStreak: 12,
  longestStreak: 47,
  totalSubmissions: 891,
  ranking: 54321,
  rating: null,
  heatmapData: generateMockHeatmap(),
  lastSynced: null,
  isLoading: false,
  error: null,
};

export const MOCK_CODECHEF_STATS: PlatformStats = {
  platform: "codechef",
  username: "mock_user",
  totalSolved: 189,
  currentStreak: 5,
  longestStreak: 23,
  totalSubmissions: 412,
  ranking: null,
  rating: 1734,
  heatmapData: generateMockHeatmap(),
  lastSynced: null,
  isLoading: false,
  error: null,
};

export const MOCK_CODEFORCES_STATS: PlatformStats = {
  platform: "codeforces",
  username: "mock_user",
  totalSolved: 521,
  currentStreak: null,   // CF doesn't expose streak in public API
  longestStreak: null,
  totalSubmissions: 1204,
  ranking: 12345,
  rating: 1689,
  heatmapData: generateMockHeatmap(),
  lastSynced: null,
  isLoading: false,
  error: null,
};

const PLATFORMS: Platform[] = ["leetcode", "codechef", "codeforces"];

export const MOCK_CONTESTS: Contest[] = [
  {
    id: "lc-weekly-430",
    platform: "leetcode",
    name: "Weekly Contest 430",
    startTime: new Date(Date.now() + 2 * 86_400_000).toISOString(),
    endTime:   new Date(Date.now() + 2 * 86_400_000 + 90 * 60_000).toISOString(),
    url: "https://leetcode.com/contest/weekly-contest-430",
    registrationStatus: "open",
    durationMinutes: 90,
  },
  {
    id: "cf-round-995",
    platform: "codeforces",
    name: "Codeforces Round 995 (Div. 2)",
    startTime: new Date(Date.now() + 3 * 86_400_000).toISOString(),
    endTime:   new Date(Date.now() + 3 * 86_400_000 + 135 * 60_000).toISOString(),
    url: "https://codeforces.com/contest/2060",
    registrationStatus: "unknown",
    durationMinutes: 135,
  },
  {
    id: "cc-starters-162",
    platform: "codechef",
    name: "CodeChef Starters 162",
    startTime: new Date(Date.now() + 5 * 86_400_000).toISOString(),
    endTime:   new Date(Date.now() + 5 * 86_400_000 + 120 * 60_000).toISOString(),
    url: "https://www.codechef.com/START162",
    registrationStatus: "unknown",
    durationMinutes: 120,
  },
];

// Keep this so imports stay working during transition
export { PLATFORMS };
