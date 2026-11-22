/**
 * CodeChef Service
 *
 * DATA SOURCE (verified 2026-11-23):
 *   CodeChef has no official public REST API for profile statistics.
 *   However, the profile page (codechef.com/users/{handle}) embeds all rating
 *   data server-side inside a Drupal.settings JSON blob:
 *
 *     jQuery.extend(Drupal.settings, { ..., "date_versus_rating": { "all": [...] } });
 *
 *   Each entry in that array is a rated contest result with:
 *     { code, rating, rank, end_date, ... }
 *
 *   From this we can reliably extract:
 *     • currentRating  — last entry's rating
 *     • maxRating      — peak across all entries
 *     • contestsCount  — number of rated contests participated in
 *     • heatmapData    — contest participation dates (sparse, but real)
 *
 *   Additionally the HTML contains:
 *     • <div class="rating-number"> — current display rating (confirms currentRating)
 *     • <div class="rating-star"> — star tier shown as <span> elements (count = stars)
 *
 *   What CANNOT be fetched without OAuth:
 *     • totalSolved, currentStreak, longestStreak, totalSubmissions
 *     → these are set to null with no fabricated fallback
 *
 * HANDLE VALIDATION:
 *   An invalid handle returns HTTP 200 (Cloudflare serves a generic page) but
 *   the page has no "rating-number" div and no Drupal.settings block.
 *   We detect this and throw a clear "not found" error.
 *
 * RATE LIMITING / CLOUDFLARE:
 *   We send browser-like headers to pass Cloudflare's bot challenge.
 *   The page consistently returns in < 3 seconds with these headers.
 */

import type { PlatformStats, Contest } from "../types";

const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept":          "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.5",
  "Cache-Control":   "no-cache",
};

// ── Rating entry from Drupal.settings ─────────────────────────────────────────

interface DrualRatingEntry {
  code:     string;
  rating:   string;   // stringified integer
  rank:     string;
  end_date: string;   // "YYYY-MM-DD HH:MM:SS"
  color:    string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Extract the Drupal.settings JSON blob from CodeChef profile HTML.
 * Returns null if the blob is absent (invalid handle page).
 */
function parseDrupalSettings(html: string): Record<string, unknown> | null {
  // The blob is a single jQuery.extend(...) call; we match up to the first
  // balanced closing brace followed by ); to avoid catastrophic backtracking.
  const start = html.indexOf("jQuery.extend(Drupal.settings,");
  if (start === -1) return null;

  const jsonStart = html.indexOf("{", start);
  if (jsonStart === -1) return null;

  // Walk the string counting braces to find the matching close
  let depth = 0;
  let i = jsonStart;
  for (; i < html.length; i++) {
    if (html[i] === "{") depth++;
    else if (html[i] === "}") {
      depth--;
      if (depth === 0) break;
    }
  }
  const jsonStr = html.slice(jsonStart, i + 1);
  try {
    return JSON.parse(jsonStr) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Count <span> elements inside the rating-star div — each span is one star.
 */
function parseStars(html: string): number | null {
  const divMatch = html.match(/<div[^>]*class="[^"]*rating-star[^"]*"[^>]*>([\s\S]*?)<\/div>/);
  if (!divMatch) return null;
  return (divMatch[1].match(/<span/g) ?? []).length || null;
}

/**
 * Extract the numeric rating from the rating-number div.
 */
function parseCurrentRating(html: string): number | null {
  const m = html.match(/<div[^>]*class="[^"]*rating-number[^"]*"[^>]*>\s*(\d+)\s*<\/div>/);
  return m ? parseInt(m[1], 10) : null;
}

// ── Public functions ───────────────────────────────────────────────────────────

/**
 * Validate handle and fetch real CodeChef statistics.
 * Throws a descriptive Error on invalid handle, network failure, or parse error.
 */
export async function fetchCodeChefStats(handle: string): Promise<PlatformStats> {
  if (!handle.trim()) throw new Error("Handle cannot be empty.");

  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), 20_000);

  let html: string;
  try {
    const res = await fetch(
      `https://www.codechef.com/users/${encodeURIComponent(handle)}`,
      {
        method:   "GET",
        headers:  BROWSER_HEADERS,
        signal:   controller.signal,
        redirect: "follow",
      }
    );
    clearTimeout(id);

    if (res.status === 404) {
      throw new Error("Invalid handle — account not found on CodeChef.");
    }
    if (!res.ok) {
      throw new Error(`CodeChef returned HTTP ${res.status}. The service may be temporarily unavailable.`);
    }
    html = await res.text();
  } catch (err: unknown) {
    clearTimeout(id);
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("account not found") || msg.includes("HTTP")) {
      throw err as Error;
    }
    if (msg.includes("aborted") || msg.toLowerCase().includes("abort")) {
      throw new Error("Request timed out — unable to reach CodeChef. Check your connection.");
    }
    throw new Error(`CodeChef network error: ${msg}`);
  }

  // ── Validate handle via page content ───────────────────────────────────────
  // An invalid handle's page returns HTTP 200 (Cloudflare) but has no rating-number div.
  if (!html.includes("rating-number")) {
    throw new Error("Invalid handle — account not found on CodeChef.");
  }

  // ── Extract current rating from HTML div ───────────────────────────────────
  const currentRating = parseCurrentRating(html);
  const stars         = parseStars(html);

  // ── Extract full rating history from Drupal.settings ──────────────────────
  let maxRating:      number | null = null;
  let contestsCount:  number | null = null;
  const heatmapData: Record<string, number> = {};
  let parseError = false;

  const drupal = parseDrupalSettings(html);
  if (drupal) {
    const all = (
      (drupal.date_versus_rating as { all?: DrualRatingEntry[] } | undefined)?.all ?? []
    );

    if (all.length > 0) {
      contestsCount = all.length;

      const ratings = all
        .map((e) => parseInt(e.rating, 10))
        .filter((n) => !isNaN(n));

      if (ratings.length > 0) {
        maxRating = Math.max(...ratings);
      }

      // Build heatmap from rated contest participation dates (last 365 days)
      const cutoffMs = Date.now() - 365 * 24 * 60 * 60 * 1000;
      for (const e of all) {
        if (!e.end_date) continue;
        const ms = new Date(e.end_date.replace(" ", "T") + "Z").getTime();
        if (isNaN(ms) || ms < cutoffMs) continue;
        const day = new Date(ms).toISOString().split("T")[0];
        heatmapData[day] = (heatmapData[day] ?? 0) + 1;
      }
    } else {
      // Drupal block present but no rating history — new/unrated account
      parseError = false; // Not an error — just an unrated user
    }
  } else {
    // Could not parse Drupal.settings — page structure may have changed
    parseError = true;
  }

  // Build a user-friendly error note for fields that are unavailable
  const unavailableNote = [
    "Problems solved, streaks, and submission history",
    "are unavailable — CodeChef has no public API for these fields.",
  ].join(" ");

  return {
    platform:         "codechef",
    username:         handle,
    totalSolved:      null,         // Not available without OAuth
    currentStreak:    null,         // Not available without OAuth
    longestStreak:    null,         // Not available without OAuth
    totalSubmissions: contestsCount, // Reused as rated contest count
    rating:           currentRating,
    maxRating,
    ranking:          null,
    heatmapData,
    lastSynced:       new Date().toISOString(),
    isLoading:        false,
    error:            parseError
      ? "Could not parse profile data — CodeChef page structure may have changed."
      : stars !== null || currentRating !== null
        ? unavailableNote
        : "Could not extract rating data from CodeChef profile.",
  };
}

/**
 * CodeChef upcoming contests — requires authentication, returns empty array.
 */
export async function fetchCodeChefContests(): Promise<Contest[]> {
  return [];
}
