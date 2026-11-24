import { create } from "zustand";
import { persist } from "zustand/middleware";
import { invoke } from "@tauri-apps/api/core";
import type {
  AppSettings, PlatformStats, Contest, Platform, WindowMode,
} from "../types";
import { emptyStats } from "../types";
import { fetchCodeforcesStats } from "../services/codeforces";
import { fetchLeetCodeStats } from "../services/leetcode";
import { fetchCodeChefStats } from "../services/codechef";

const MANUAL_COOLDOWN_MS = 60_000;

interface AppState {
  settings:   AppSettings;
  leetcode:   PlatformStats;
  codechef:   PlatformStats;
  codeforces: PlatformStats;
  contests:   Contest[];
  lastAttemptAt: Record<Platform, number>;

  setActivePlatform: (p: Platform) => void;
  updateSettings:    (s: Partial<AppSettings>) => void;
  setWindowMode:     (mode: WindowMode) => Promise<void>;
  setPlatformStats:  (platform: Platform, stats: PlatformStats) => void;
  triggerRefresh:    (options?: { bypassCooldown?: boolean }) => Promise<void>;
  setStatsLoading:   (platform: Platform, loading: boolean) => void;
  setStatsError:     (platform: Platform, error: string | null) => void;
}

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

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      settings:   DEFAULT_SETTINGS,
      leetcode:   emptyStats("leetcode"),
      codechef:   emptyStats("codechef"),
      codeforces: emptyStats("codeforces"),
      contests:   [],
      lastAttemptAt: { leetcode: 0, codechef: 0, codeforces: 0 },

      setActivePlatform: (platform) =>
        set((s) => ({ settings: { ...s.settings, activePlatform: platform } })),

      updateSettings: (partial) =>
        set((s) => ({ settings: { ...s.settings, ...partial } })),

      setWindowMode: async (mode) => {
        try {
          if (mode === "desktop") {
            await invoke("pin_to_desktop");
          } else {
            await invoke("set_floating_mode");
          }
        } catch {
          // Non-fatal outside Tauri runtime
        }
        set((s) => ({ settings: { ...s.settings, windowMode: mode } }));
      },

      setPlatformStats: (platform, stats) =>
        set((s) => ({
          [platform]: { ...stats, isLoading: false },
          lastAttemptAt: { ...s.lastAttemptAt, [platform]: Date.now() },
        })),

      triggerRefresh: async (options) => {
        const bypass = options?.bypassCooldown ?? false;
        const { settings, lastAttemptAt } = get();
        const now = Date.now();
        const tasks: Promise<void>[] = [];

        const runPlatform = (
          platform: Platform,
          handle: string,
          fetcher: (h: string) => Promise<PlatformStats>,
        ) => {
          if (!handle.trim()) return;
          if (get()[platform].isLoading) return;
          if (!bypass && now - (lastAttemptAt[platform] ?? 0) < MANUAL_COOLDOWN_MS) {
            return;
          }

          tasks.push(
            (async () => {
              set((s) => ({
                [platform]: { ...s[platform], isLoading: true },
                lastAttemptAt: { ...s.lastAttemptAt, [platform]: Date.now() },
              }));
              try {
                const data = await fetcher(handle);
                set({ [platform]: { ...data, isLoading: false } });
              } catch (err: unknown) {
                const msg = err instanceof Error ? err.message : String(err);
                // Preserve cached data & lastSynced; attach error for inline badge
                set((s) => ({
                  [platform]: { ...s[platform], isLoading: false, error: msg },
                }));
              }
            })()
          );
        };

        runPlatform("leetcode", settings.leetcodeUsername, fetchLeetCodeStats);
        runPlatform("codechef", settings.codechefUsername, fetchCodeChefStats);
        runPlatform("codeforces", settings.codeforcesHandle, fetchCodeforcesStats);

        // Fetch upcoming contests from all 3 platforms in parallel via Rust
        tasks.push(
          (async () => {
            try {
              const all = await invoke<Contest[]>("fetch_contests");
              if (Array.isArray(all)) {
                all.sort((a, b) => +new Date(a.startTime) - +new Date(b.startTime));
                set({ contests: all });
              }
            } catch {
              // Keep cached contests on failure
            }
          })()
        );

        await Promise.allSettled(tasks);
      },

      setStatsLoading: (platform, loading) =>
        set((s) => ({ [platform]: { ...s[platform], isLoading: loading } })),

      setStatsError: (platform, error) =>
        set((s) => ({ [platform]: { ...s[platform], error, isLoading: false } })),
    }),
    {
      name: "cp-companion-v3",
      partialize: (state) => ({
        settings:   state.settings,
        leetcode:   state.leetcode,
        codechef:   state.codechef,
        codeforces: state.codeforces,
        contests:   state.contests,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        state.leetcode.isLoading = false;
        state.codechef.isLoading = false;
        state.codeforces.isLoading = false;
      },
    }
  )
);
