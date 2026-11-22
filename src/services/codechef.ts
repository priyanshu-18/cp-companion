/**
 * CodeChef Service
 *
 * IMPORTANT — API STATUS (verified 2026-11-23):
 *
 * CodeChef has no public, unauthenticated REST API for profile data.
 *   - Official OAuth API: requires client registration (not available for
 *     personal desktop apps without a registered redirect URI).
 *   - /api/ratings/* endpoints: return 403 or apierror for all tested paths.
 *   - HTML profile page (codechef.com/users/{handle}): served by Cloudflare,
 *     returns 180 KB of HTML but no structured JSON data in script tags.
 *     The page is a React SPA that hydrates client-side — the data is loaded
 *     by authenticated XHR after page load, not embedded in the HTML.
 *
 * Result: Real CodeChef data cannot be fetched without OAuth authentication.
 *
 * What this service does:
 *   - Attempts a lightweight HEAD request to verify the profile page exists
 *     (HTTP 200 = handle exists, HTTP 4xx = handle not found).
 *   - Returns a PlatformStats object with all numeric fields set to null
 *     and a clear "unavailable" error message.
 *   - Does NOT return mock or fabricated data.
 *   - Does NOT silently fail.
 *
 * Future path: If CodeChef opens a public API or we implement OAuth,
 * this service is the correct place to add it.
 */

import type { PlatformStats, Contest } from "../types";

/**
 * Validate handle existence and return stats with accurate null fields.
 * Throws on network failure or confirmed non-existence.
 */
export async function fetchCodeChefStats(handle: string): Promise<PlatformStats> {
  if (!handle.trim()) throw new Error("Handle cannot be empty.");

  // Attempt to verify the profile page exists via HEAD request.
  // codechef.com redirects to www.codechef.com — follow redirects.
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), 10_000);

  let status = 0;
  try {
    const res = await fetch(`https://www.codechef.com/users/${encodeURIComponent(handle)}`, {
      method: "HEAD",
      signal: controller.signal,
      redirect: "follow",
    });
    status = res.status;
  } catch (err: unknown) {
    clearTimeout(id);
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("aborted")) {
      throw new Error("Unable to reach CodeChef. Check your connection.");
    }
    // If Tauri's HTTP plugin blocks HEAD, treat as unknown — not as invalid handle
    // Fall through to return unavailable stats
    status = 0;
  } finally {
    clearTimeout(id);
  }

  if (status === 404) {
    throw new Error("Invalid handle — account not found on CodeChef.");
  }
  if (status >= 400 && status !== 0) {
    throw new Error(`CodeChef returned HTTP ${status}. The service may be unavailable.`);
  }

  // Handle exists (or we could not confirm), but we cannot fetch statistics.
  // Return real username, all stats null, with an informative error field.
  return {
    platform:         "codechef",
    username:         handle,
    totalSolved:      null,
    currentStreak:    null,
    longestStreak:    null,
    totalSubmissions: null,
    rating:           null,
    ranking:          null,
    heatmapData:      {},
    lastSynced:       new Date().toISOString(),
    isLoading:        false,
    error:            "CodeChef does not provide a public API. Statistics unavailable.",
  };
}

/**
 * CodeChef upcoming contests — not available without authentication.
 */
export async function fetchCodeChefContests(): Promise<Contest[]> {
  return [];
}
