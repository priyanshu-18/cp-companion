import { create } from "zustand";
import { persist } from "zustand/middleware";
import { invoke } from "@tauri-apps/api/core";
import type {
  AppSettings, PlatformStats, Contest, Platform, WindowMode,
} from "../types";
import { emptyStats } from "../types";
import { fetchCodeforcesStats, fetchCodeforcesContests } from "../services/codeforces";
import { fetchLeetCodeStats, fetchLeetCodeContests } from "../services/leetcode";
import { fetchCodeChefStats, fetchCodeChefContests } from "../services/codechef";

// ── Types ─────────────────────────────────────────────────────────────────────

interface AppState {
  settings:   AppSettings;
  leetcode:   PlatformStats;
  codechef:   PlatformStats;
  codeforces: PlatformStats;
  contests:   Contest[];

  // Actions
  setActivePlatform:  (p: Platform) => void;
  updateSettings:     (s: Partial<AppSettings>) => void;
  setWindowMode:      (mode: WindowMode) => Promise<void>;
  triggerRefresh:     () => Promise<void>;
  setStatsLoading:    (platform: Platform, loading: boolean) => void;
  setStatsError:      (platform: Platform, error: string | null) => void;
}

// ── Defaults ──────────────────────────────────────────────────────────────────

const DEFAULT_SETTINGS: AppSettings = {
  activePlatform:      "leetcode",
  leetcodeUsername:    "",
  codechefUsername:    "",
  codeforcesHandle:    "",
  windowMode:          "floating",
  theme:               "dark",
  opacity:             1.0,
  showHeatmap:         true,
  showContests:        true,
  refreshInterval:     15,
  notifyContest24h:    true,
  notifyContest1h:     true,
  notifyContest15m:    true,
  notifyDailyReminder: false,
  windowX:             null,
  windowY:             null,
  windowW:             null,
  windowH:             null,
};

// ── Helper ────────────────────────────────────────────────────────────────────

/** Returns true if a refresh is already in-flight for the given platform. */
function isAlreadyLoading(state: Pick<AppState, "leetcode" | "codechef" | "codeforces">, platform: Platform) {
  return state[platform].isLoading;
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      settings:   DEFAULT_SETTINGS,
      leetcode:   emptyStats("leetcode"),
      codechef:   emptyStats("codechef"),
      codeforces: emptyStats("codeforces"),
      contests:   [],

      setActivePlatform: (platform) =>
        set((s) => ({ settings: { ...s.settings, activePlatform: platform } })),

      updateSettings: (partial) =>
        set((s) => ({ settings: { ...s.settings, ...partial } })),

      /** Apply window mode natively via Rust command, then persist the choice. */
      setWindowMode: async (mode) => {
        try {
          if (mode === "desktop") {
            await invoke("pin_to_desktop");
          } else {
            await invoke("set_floating_mode");
          }
        } catch (err) {
          console.warn("[WindowMode] Native command unavailable:", err);
        }
        set((s) => ({ settings: { ...s.settings, windowMode: mode } }));
      },

      /**
       * Fetch real data for all platforms that have a configured username/handle.
       * - Prevents duplicate in-flight requests per platform.
       * - Preserves last successful data if a refresh fails (shows error inline).
       * - Updates lastSynced only on success.
       * - Fetches contests from Codeforces (fully public) and merges all sources.
       */
      triggerRefresh: async () => {
        const { settings } = get();
        const promises: Promise<void>[] = [];

        // ── LeetCode ──────────────────────────────────────────────────────────
        if (settings.leetcodeUsername && !isAlreadyLoading(get(), "leetcode")) {
          promises.push((async () => {
            set((s) => ({ leetcode: { ...s.leetcode, isLoading: true, error: null } }));
            try {
              const data = await fetchLeetCodeStats(settings.leetcodeUsername);
              set({ leetcode: data });
            } catch (err: unknown) {
              const msg = err instanceof Error ? err.message : String(err);
              // Preserve last successful data; just update error + stop loading
              set((s) => ({
                leetcode: { ...s.leetcode, isLoading: false, error: msg },
              }));
            }
          })());
        }

        // ── CodeChef ──────────────────────────────────────────────────────────
        if (settings.codechefUsername && !isAlreadyLoading(get(), "codechef")) {
          promises.push((async () => {
            set((s) => ({ codechef: { ...s.codechef, isLoading: true, error: null } }));
            try {
              const data = await fetchCodeChefStats(settings.codechefUsername);
              set({ codechef: data });
            } catch (err: unknown) {
              const msg = err instanceof Error ? err.message : String(err);
              set((s) => ({
                codechef: { ...s.codechef, isLoading: false, error: msg },
              }));
            }
          })());
        }

        // ── Codeforces ────────────────────────────────────────────────────────
        if (settings.codeforcesHandle && !isAlreadyLoading(get(), "codeforces")) {
          promises.push((async () => {
            set((s) => ({ codeforces: { ...s.codeforces, isLoading: true, error: null } }));
            try {
              const data = await fetchCodeforcesStats(settings.codeforcesHandle);
              set({ codeforces: data });
            } catch (err: unknown) {
              const msg = err instanceof Error ? err.message : String(err);
              set((s) => ({
                codeforces: { ...s.codeforces, isLoading: false, error: msg },
              }));
            }
          })());
        }

        // ── Contests (from all sources in parallel) ────────────────────────
        promises.push((async () => {
          try {
            const [cfContests, lcContests, ccContests] = await Promise.allSettled([
              fetchCodeforcesContests(),
              fetchLeetCodeContests(),
              fetchCodeChefContests(),
            ]);

            const all: Contest[] = [
              ...(cfContests.status === "fulfilled" ? cfContests.value : []),
              ...(lcContests.status === "fulfilled" ? lcContests.value : []),
              ...(ccContests.status === "fulfilled" ? ccContests.value : []),
            ];

            if (all.length > 0) {
              all.sort((a, b) => +new Date(a.startTime) - +new Date(b.startTime));
              set({ contests: all });
            }
          } catch {
            // Non-fatal: keep existing contest list
          }
        })());

        await Promise.allSettled(promises);
      },

      setStatsLoading: (platform, loading) =>
        set((s) => ({ [platform]: { ...s[platform], isLoading: loading } })),

      setStatsError: (platform, error) =>
        set((s) => ({ [platform]: { ...s[platform], error, isLoading: false } })),
    }),
    {
      name: "cp-companion-v3",   // new key — schema changed (no mock data defaults)
      // Persist settings only. Stats are always re-fetched on refresh.
      partialize: (state) => ({ settings: state.settings }),
    }
  )
);
