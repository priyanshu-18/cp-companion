import { invoke } from "@tauri-apps/api/core";
import type { Contest, PlatformStats } from "../types";
import { mapApiError } from "./apiError";

export async function fetchCodeforcesStats(handle: string): Promise<PlatformStats> {
  const clean = handle.trim();
  if (!clean) throw new Error("Handle cannot be empty.");
  try {
    const dto = await invoke<Omit<PlatformStats, "isLoading">>("fetch_codeforces", {
      handle: clean,
    });
    return { ...dto, isLoading: false };
  } catch (err) {
    throw mapApiError(err, "Codeforces");
  }
}

export async function fetchCodeforcesContests(): Promise<Contest[]> {
  try {
    const all = await invoke<Contest[]>("fetch_contests");
    return all.filter((c) => c.platform === "codeforces");
  } catch {
    return [];
  }
}
