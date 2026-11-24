import { invoke } from "@tauri-apps/api/core";
import type { Contest, PlatformStats } from "../types";
import { mapApiError } from "./apiError";

export async function fetchCodeChefStats(handle: string): Promise<PlatformStats> {
  const clean = handle.trim();
  if (!clean) throw new Error("Handle cannot be empty.");
  try {
    const dto = await invoke<Omit<PlatformStats, "isLoading">>("fetch_codechef", {
      handle: clean,
    });
    return { ...dto, isLoading: false };
  } catch (err) {
    throw mapApiError(err, "CodeChef");
  }
}

export async function fetchCodeChefContests(): Promise<Contest[]> {
  try {
    const all = await invoke<Contest[]>("fetch_contests");
    return all.filter((c) => c.platform === "codechef");
  } catch {
    return [];
  }
}
