/**
 * LeetCode Service
 * Uses the unofficial (but widely used and stable) LeetCode GraphQL endpoint.
 * No authentication is required for public profile data.
 * Endpoint: https://leetcode.com/graphql
 *
 * Headers required:
 *   Referer + Origin must be set to https://leetcode.com; without them LeetCode
 *   may return a network error or 400 depending on the client context (Tauri WebView).
 *
 * Data fetched:
 *   - matchedUser: totalSolved (All/Easy/Medium/Hard), profile ranking
 *   - userContestRanking: contest rating, globalRanking, attendedContestsCount
 *   - userCalendar: streak, totalActiveDays, submissionCalendar (heatmap JSON)
 *     → fetched for BOTH the current and previous year so the 365-day heatmap
 *       is populated even if the user has had no activity yet this year.
 *
 * Limitations:
 *   - totalSubmissions: not exposed publicly → null
 *   - longestStreak: not exposed publicly → null
 *   - LeetCode has no public contest-list API → fetchLeetCodeContests returns []
 */

import type { PlatformStats, Contest } from "../types";

const LC_GRAPHQL = "https://leetcode.com/graphql";

// Browser-like headers required for LeetCode to accept requests from Tauri WebView
const LC_HEADERS: Record<string, string> = {
  "Content-Type":  "application/json",
  "Referer":       "https://leetcode.com",
  "Origin":        "https://leetcode.com",
  "User-Agent":    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
};

// ── Shared fetch ───────────────────────────────────────────────────────────────

async function lcFetch(query: string, variables?: Record<string, unknown>): Promise<unknown> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(LC_GRAPHQL, {
      method:  "POST",
      headers: LC_HEADERS,
      body:    JSON.stringify({ query, variables }),
      signal:  controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json() as { data?: unknown; errors?: { message: string }[] };
    if (json.errors?.length) {
      throw new Error(json.errors[0].message);
    }
    return json.data;
  } finally {
    clearTimeout(id);
  }
}

// ── GraphQL queries ────────────────────────────────────────────────────────────

/** Full stats query — includes current-year calendar. */
const STATS_QUERY = `
  query UserStats($username: String!, $year: Int!) {
    matchedUser(username: $username) {
      username
      profile { ranking }
      submitStatsGlobal {
        acSubmissionNum {
          difficulty
          count
        }
      }
      userCalendar(year: $year) {
        streak
        totalActiveDays
        submissionCalendar
      }
    }
    userContestRanking(username: $username) {
      rating
      globalRanking
      attendedContestsCount
    }
  }
`;

/** Lightweight query to fetch just the previous year's calendar. */
const PREV_CAL_QUERY = `
  query PrevCalendar($username: String!, $year: Int!) {
    matchedUser(username: $username) {
      userCalendar(year: $year) {
        submissionCalendar
      }
    }
  }
`;

// ── Types ──────────────────────────────────────────────────────────────────────

interface LcStatsData {
  matchedUser: {
    username: string;
    profile: { ranking: number };
    submitStatsGlobal: {
      acSubmissionNum: Array<{ difficulty: string; count: number }>;
    };
    userCalendar: {
      streak: number;
      totalActiveDays: number;
      submissionCalendar: string; // JSON string: { "unix_ts_secs": count }
    };
  } | null;
  userContestRanking: {
    rating: number;
    globalRanking: number;
    attendedContestsCount: number;
  } | null;
}

interface LcPrevCalData {
  matchedUser: {
    userCalendar: { submissionCalendar: string } | null;
  } | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Parse a submissionCalendar JSON string (unix-ts-in-seconds → count)
 * into a heatmap record (YYYY-MM-DD → count), filtered to the last 365 days.
 */
function parseCalendar(calStr: string, cutoffMs: number, out: Record<string, number>): void {
  try {
    const calObj = JSON.parse(calStr) as Record<string, number>;
    for (const [ts, count] of Object.entries(calObj)) {
      const ms = Number(ts) * 1000;
      if (ms < cutoffMs) continue;
      const day = new Date(ms).toISOString().split("T")[0];
      out[day] = (out[day] ?? 0) + count;
    }
  } catch {
    // malformed calendar — ignore
  }
}

/**
 * Strip a full LeetCode profile URL to just the username.
 * e.g. "https://leetcode.com/neal_wu/" → "neal_wu"
 */
function cleanUsername(raw: string): string {
  return raw
    .replace(/^https?:\/\/(www\.)?leetcode\.com\//i, "")
    .replace(/\/.*$/, "")
    .trim();
}

// ── Public functions ───────────────────────────────────────────────────────────

/**
 * Validate username and fetch user stats.
 * Throws a descriptive Error on failure.
 */
export async function fetchLeetCodeStats(rawUsername: string): Promise<PlatformStats> {
  if (!rawUsername.trim()) throw new Error("Username cannot be empty.");

  const username = cleanUsername(rawUsername);
  const year     = new Date().getFullYear();
  const prevYear = year - 1;

  // Run main stats + previous-year calendar in parallel.
  // If the main query fails → user does not exist or network issue.
  // If previous-year calendar fails → non-fatal, we still have this year's data.
  let data: LcStatsData;
  let prevCalStr = "{}";

  try {
    const [mainResult, prevResult] = await Promise.allSettled([
      lcFetch(STATS_QUERY, { username, year }),
      lcFetch(PREV_CAL_QUERY, { username, year: prevYear }),
    ]);

    if (mainResult.status === "rejected") {
      throw mainResult.reason as Error;
    }
    data = mainResult.value as LcStatsData;

    if (prevResult.status === "fulfilled") {
      const p = prevResult.value as LcPrevCalData;
      prevCalStr = p?.matchedUser?.userCalendar?.submissionCalendar ?? "{}";
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.toLowerCase().includes("does not exist") || msg.toLowerCase().includes("not found")) {
      throw new Error("Invalid username — account not found on LeetCode.");
    }
    if (msg.includes("aborted") || msg.toLowerCase().includes("fetch") || msg.includes("network")) {
      throw new Error("Unable to reach LeetCode. Check your connection.");
    }
    throw new Error(`LeetCode error: ${msg}`);
  }

  if (!data.matchedUser) {
    throw new Error("Invalid username — account not found on LeetCode.");
  }

  const user = data.matchedUser;

  // Parse solved counts
  const acNums    = user.submitStatsGlobal.acSubmissionNum;
  const totalSolved = acNums.find((x) => x.difficulty === "All")?.count ?? null;

  // Build 365-day heatmap from both year calendars
  const heatmapData: Record<string, number> = {};
  const cutoffMs = Date.now() - 365 * 24 * 60 * 60 * 1000;
  parseCalendar(user.userCalendar.submissionCalendar, cutoffMs, heatmapData);
  parseCalendar(prevCalStr, cutoffMs, heatmapData);

  const contestRanking = data.userContestRanking;

  return {
    platform:         "leetcode",
    username:         user.username,
    totalSolved,
    currentStreak:    user.userCalendar.streak    ?? null,
    longestStreak:    null,         // Not exposed by LeetCode public API
    totalSubmissions: null,         // Not exposed by LeetCode public API
    rating:           contestRanking ? Math.round(contestRanking.rating) : null,
    maxRating:        null,         // LeetCode does not expose peak contest rating
    ranking:          user.profile.ranking > 0 ? user.profile.ranking : null,
    heatmapData,
    lastSynced:       new Date().toISOString(),
    isLoading:        false,
    error:            null,
  };
}

/**
 * LeetCode has no public contest-list API.
 * Returns an empty array; contest info would require auth or scraping.
 */
export async function fetchLeetCodeContests(): Promise<Contest[]> {
  return [];
}
