/**
 * MOCK DATA SERVICE
 * ─────────────────
 * All data here is FAKE and exists only for UI development.
 * It is clearly labelled "[MOCK]" in the UI.
 * This file will be replaced by real API integrations in Phase 4.
 */

import type { PlatformStats, Contest } from "../types";

// Generate a fake 365-day heatmap
function generateMockHeatmap(): Record<string, number> {
  const data: Record<string, number> = {};
  const today = new Date();
  for (let i = 364; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().split("T")[0];
    // Sparse random activity — realistic feel
    const rand = Math.random();
    if (rand > 0.6) {
      data[key] = Math.floor(rand * 12);
    }
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
  heatmapData: generateMockHeatmap(),
  lastSynced: null, // null = never synced for real
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
  heatmapData: generateMockHeatmap(),
  lastSynced: null,
  isLoading: false,
  error: null,
};

export const MOCK_CONTESTS: Contest[] = [
  {
    id: "lc-weekly-420",
    platform: "leetcode",
    name: "Weekly Contest 420",
    startTime: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
    endTime: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000 + 90 * 60 * 1000).toISOString(),
    url: "https://leetcode.com/contest/weekly-contest-420",
    registrationStatus: "open",
    durationMinutes: 90,
  },
  {
    id: "cc-starters-160",
    platform: "codechef",
    name: "Starters 160",
    startTime: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString(),
    endTime: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000 + 120 * 60 * 1000).toISOString(),
    url: "https://www.codechef.com/START160",
    registrationStatus: "unknown",
    durationMinutes: 120,
  },
];
