/**
 * Codeforces Service
 * Uses the official public Codeforces REST API — no authentication required.
 * Docs: https://codeforces.com/apiHelp
 *
 * Rate limits: ~1 request/second per IP. We fetch two endpoints per refresh:
 *   1. user.info  — rating, maxRating, rank, maxRank, handle verification
 *   2. user.status — full submission list to calculate unique problems solved
 *      and build a 365-day activity heatmap
 *
 * Limitations:
 *   - currentStreak / longestStreak: not exposed by the public API → null
 *   - Solved count = unique (contestId, index) pairs with verdict "OK"
 *     (last 500 submissions only — full history would need pagination)
 */

import type { PlatformStats, Contest } from "../types";

const CF_BASE = "https://codeforces.com/api";

// ── Shared fetch with timeout ──────────────────────────────────────────────────

async function cfFetch(path: string): Promise<unknown> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(`${CF_BASE}${path}`, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (json.status !== "OK") {
      throw new Error(json.comment ?? json.message ?? "Codeforces API error");
    }
    return json.result;
  } finally {
    clearTimeout(id);
  }
}

// ── Types matching Codeforces API responses ────────────────────────────────────

interface CfUser {
  handle: string;
  rating?: number;
  maxRating?: number;
  rank?: string;
  maxRank?: string;
  contribution?: number;
}

interface CfSubmission {
  id: number;
  creationTimeSeconds: number;
  verdict?: string;
  problem: {
    contestId?: number;
    problemsetName?: string;
    index: string;
    name: string;
  };
}

interface CfContest {
  id: number;
  name: string;
  type: string;
  phase: string;
  startTimeSeconds: number;
  durationSeconds: number;
}

// ── Public functions ───────────────────────────────────────────────────────────

/**
 * Validate handle and fetch user stats.
 * Throws a descriptive string on failure (not found, network, etc.)
 */
export async function fetchCodeforcesStats(handle: string): Promise<PlatformStats> {
  if (!handle.trim()) throw new Error("Handle cannot be empty.");

  // 1. Fetch user profile
  let user: CfUser;
  try {
    const result = await cfFetch(`/user.info?handles=${encodeURIComponent(handle)}`);
    user = (result as CfUser[])[0];
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.toLowerCase().includes("not found")) {
      throw new Error("Invalid handle — account not found on Codeforces.");
    }
    if (msg.includes("aborted") || msg.includes("fetch")) {
      throw new Error("Unable to reach Codeforces. Check your connection.");
    }
    throw new Error(`Codeforces error: ${msg}`);
  }

  // 2. Fetch submission history (last 10 000 to get a full picture)
  let submissions: CfSubmission[] = [];
  try {
    submissions = (await cfFetch(
      `/user.status?handle=${encodeURIComponent(handle)}&from=1&count=10000`
    )) as CfSubmission[];
  } catch {
    // Non-fatal: we still have user info; solved count will be null
    submissions = [];
  }

  // 3. Build heatmap (365 days) from submission timestamps
  const heatmapData: Record<string, number> = {};
  const cutoff = Date.now() - 365 * 24 * 60 * 60 * 1000;
  for (const sub of submissions) {
    const ms = sub.creationTimeSeconds * 1000;
    if (ms < cutoff) continue;
    const day = new Date(ms).toISOString().split("T")[0];
    heatmapData[day] = (heatmapData[day] ?? 0) + 1;
  }

  // 4. Count unique solved problems (OK verdict, deduplicated by problem key)
  const solvedKeys = new Set<string>();
  for (const sub of submissions) {
    if (sub.verdict === "OK") {
      const key = sub.problem.contestId != null
        ? `${sub.problem.contestId}-${sub.problem.index}`
        : `ps-${sub.problem.problemsetName ?? ""}-${sub.problem.name}`;
      solvedKeys.add(key);
    }
  }

  return {
    platform:         "codeforces",
    username:         user.handle,
    totalSolved:      solvedKeys.size > 0 ? solvedKeys.size : null,
    currentStreak:    null,   // CF public API does not expose streak
    longestStreak:    null,
    totalSubmissions: submissions.length > 0 ? submissions.length : null,
    rating:           user.rating    ?? null,
    maxRating:        user.maxRating ?? null,
    ranking:          null,           // CF rank is a label string (e.g. "expert"), not a number
    heatmapData,
    lastSynced:       new Date().toISOString(),
    isLoading:        false,
    error:            null,
  };
}

/**
 * Fetch upcoming Codeforces contests (BEFORE phase only).
 * Returns at most 10 contests sorted by start time.
 */
export async function fetchCodeforcesContests(): Promise<Contest[]> {
  let raw: CfContest[];
  try {
    raw = (await cfFetch("/contest.list?gym=false")) as CfContest[];
  } catch {
    return [];
  }

  const now = Date.now();
  return raw
    .filter((c) => c.phase === "BEFORE" && c.startTimeSeconds * 1000 > now)
    .sort((a, b) => a.startTimeSeconds - b.startTimeSeconds)
    .slice(0, 10)
    .map((c) => ({
      id:                 `cf-${c.id}`,
      platform:           "codeforces" as const,
      name:               c.name,
      startTime:          new Date(c.startTimeSeconds * 1000).toISOString(),
      endTime:            new Date((c.startTimeSeconds + c.durationSeconds) * 1000).toISOString(),
      url:                `https://codeforces.com/contest/${c.id}`,
      registrationUrl:    `https://codeforces.com/contestRegistration/${c.id}`,
      registrationStatus: "unknown" as const,
      durationMinutes:    Math.round(c.durationSeconds / 60),
    }));
}
