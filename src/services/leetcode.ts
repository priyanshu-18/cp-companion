import { invoke } from "@tauri-apps/api/core";
import type { Contest, PlatformStats } from "../types";
import { mapApiError } from "./apiError";

function extractLeetCodeUsername(raw: string): string {
  return raw
    .replace(/^https?:\/\/(www\.)?leetcode\.com\/(u\/)?/i, "")
    .replace(/\/.*$/, "")
    .trim();
}

export async function fetchLeetCodeStats(rawUsername: string): Promise<PlatformStats> {
  const clean = extractLeetCodeUsername(rawUsername);
  if (!clean) throw new Error("Username cannot be empty.");
  try {
    const dto = await invoke<Omit<PlatformStats, "isLoading">>("fetch_leetcode", {
      handle: clean,
    });
    return { ...dto, isLoading: false };
  } catch (err) {
    throw mapApiError(err, "LeetCode");
  }
}

export async function fetchLeetCodeContests(): Promise<Contest[]> {
  try {
    const all = await invoke<Contest[]>("fetch_contests");
    return all.filter((c) => c.platform === "leetcode");
  } catch {
    return [];
  }
}
