/**
 * LeetCode Service
 * Uses the unofficial (but widely used and stable) LeetCode GraphQL endpoint.
 * No authentication is required for public profile data.
 * Endpoint: https://leetcode.com/graphql
 *
 * CORS note: Direct browser fetch to leetcode.com is blocked by CORS in a
 * standard browser. In Tauri, the WebView makes the request from a native
 * context (not a browser Origin), so CORS is not enforced. This works
 * correctly in the Tauri desktop app.
 *
 * Data fetched:
 *   - matchedUser: totalSolved (All/Easy/Medium/Hard), profile ranking
 *   - userContestRanking: contest rating, globalRanking, attendedContestsCount
 *   - userCalendar: streak, totalActiveDays, submissionCalendar (heatmap JSON)
 *
 * Limitations:
 *   - submissionCalendar only covers the requested year → we fetch current year
 *   - LeetCode does not expose totalSubmissions publicly → null
 *   - recentAcSubmissionList only returns last 20 AC submissions, not usable for
 *     a full heatmap. We use userCalendar instead.
 */

import type { PlatformStats, Contest } from "../types";

const LC_GRAPHQL = "https://leetcode.com/graphql";

// ── Shared fetch ───────────────────────────────────────────────────────────────

async function lcFetch(query: string, variables?: Record<string, unknown>): Promise<unknown> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), 12_000);
  try {
    const res = await fetch(LC_GRAPHQL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json() as { data?: unknown; errors?: { message: string }[] };
    if (json.errors?.length) {
      const msg = json.errors[0].message;
      throw new Error(msg);
    }
    return json.data;
  } finally {
    clearTimeout(id);
  }
}

// ── GraphQL queries ────────────────────────────────────────────────────────────

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
      submissionCalendar: string; // JSON string: { "unix_ts": count }
    };
  } | null;
  userContestRanking: {
    rating: number;
    globalRanking: number;
    attendedContestsCount: number;
  } | null;
}

// ── Public functions ───────────────────────────────────────────────────────────

/**
 * Validate username and fetch user stats.
 * Throws a descriptive string on failure.
 */
export async function fetchLeetCodeStats(username: string): Promise<PlatformStats> {
  if (!username.trim()) throw new Error("Username cannot be empty.");

  const year = new Date().getFullYear();
  let data: LcStatsData;

  try {
    data = (await lcFetch(STATS_QUERY, { username, year })) as LcStatsData;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.toLowerCase().includes("does not exist") || msg.toLowerCase().includes("not found")) {
      throw new Error("Invalid username — account not found on LeetCode.");
    }
    if (msg.includes("aborted") || msg.includes("fetch")) {
      throw new Error("Unable to reach LeetCode. Check your connection.");
    }
    throw new Error(`LeetCode error: ${msg}`);
  }

  if (!data.matchedUser) {
    throw new Error("Invalid username — account not found on LeetCode.");
  }

  const user = data.matchedUser;

  // Parse solved counts
  const acNums = user.submitStatsGlobal.acSubmissionNum;
  const totalSolved = acNums.find((x) => x.difficulty === "All")?.count ?? null;

  // Parse heatmap from submissionCalendar (unix timestamps in seconds → YYYY-MM-DD)
  const heatmapData: Record<string, number> = {};
  try {
    const calObj = JSON.parse(user.userCalendar.submissionCalendar) as Record<string, number>;
    const cutoff = Date.now() - 365 * 24 * 60 * 60 * 1000;
    for (const [ts, count] of Object.entries(calObj)) {
      const ms = Number(ts) * 1000;
      if (ms < cutoff) continue;
      const day = new Date(ms).toISOString().split("T")[0];
      heatmapData[day] = (heatmapData[day] ?? 0) + count;
    }
  } catch {
    // malformed calendar — leave heatmapData empty
  }

  const contestRanking = data.userContestRanking;

  return {
    platform:         "leetcode",
    username:         user.username,
    totalSolved:      totalSolved,
    currentStreak:    user.userCalendar.streak,
    longestStreak:    null,         // LeetCode calendar only returns current streak
    totalSubmissions: null,         // LeetCode public API does not expose this
    rating:           contestRanking ? Math.round(contestRanking.rating) : null,
    ranking:          user.profile.ranking ?? null,
    heatmapData,
    lastSynced:       new Date().toISOString(),
    isLoading:        false,
    error:            null,
  };
}

/**
 * Fetch upcoming LeetCode contests.
 * LeetCode does not have a public contest list API — returns empty array.
 * Contest data would require authentication or scraping.
 */
export async function fetchLeetCodeContests(): Promise<Contest[]> {
  // LeetCode has no public contest list endpoint.
  // Contest info is embedded in JS bundles behind auth.
  return [];
}
