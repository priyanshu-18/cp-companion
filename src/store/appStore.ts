import { create } from "zustand";
import { persist } from "zustand/middleware";
import { invoke } from "@tauri-apps/api/core";
import type {
  AppSettings, PlatformStats, Contest, Platform, WindowMode,
} from "../types";
import {
  MOCK_LEETCODE_STATS,
  MOCK_CODECHEF_STATS,
  MOCK_CODEFORCES_STATS,
  MOCK_CONTESTS,
} from "../services/mock";

// ── Types ─────────────────────────────────────────────────────────────────────

interface AppState {
  settings:   AppSettings;
  leetcode:   PlatformStats;
  codechef:   PlatformStats;
  codeforces: PlatformStats;
  contests:   Contest[];

  // Actions
  setActivePlatform: (p: Platform) => void;
  updateSettings:    (s: Partial<AppSettings>) => void;
  setWindowMode:     (mode: WindowMode) => Promise<void>;
  triggerRefresh:    () => Promise<void>;
  setStatsLoading:   (platform: Platform, loading: boolean) => void;
  setStatsError:     (platform: Platform, error: string | null) => void;
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
};

// ── Store ─────────────────────────────────────────────────────────────────────

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      settings:   DEFAULT_SETTINGS,
      leetcode:   MOCK_LEETCODE_STATS,
      codechef:   MOCK_CODECHEF_STATS,
      codeforces: MOCK_CODEFORCES_STATS,
      contests:   MOCK_CONTESTS,

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
          // Silently ignore in browser dev mode; real failure logged to console
          console.warn("[WindowMode] Native command unavailable:", err);
        }
        set((s) => ({ settings: { ...s.settings, windowMode: mode } }));
      },

      /** Refresh all configured platforms.
       *  Phase 4 will swap mock returns for real API calls. */
      triggerRefresh: async () => {
        const { settings } = get();

        // ── LeetCode ──────────────────────────────────────────────────────────
        if (settings.leetcodeUsername) {
          set((s) => ({ leetcode: { ...s.leetcode, isLoading: true, error: null } }));
          // TODO Phase 4: const data = await fetchLeetCode(settings.leetcodeUsername);
          await new Promise((r) => setTimeout(r, 600)); // simulate latency
          set((s) => ({
            leetcode: {
              ...s.leetcode,
              isLoading: false,
              lastSynced: new Date().toISOString(),
              // Real data will replace MOCK values here in Phase 4
            },
          }));
        }

        // ── CodeChef ──────────────────────────────────────────────────────────
        if (settings.codechefUsername) {
          set((s) => ({ codechef: { ...s.codechef, isLoading: true, error: null } }));
          await new Promise((r) => setTimeout(r, 600));
          set((s) => ({
            codechef: { ...s.codechef, isLoading: false, lastSynced: new Date().toISOString() },
          }));
        }

        // ── Codeforces ────────────────────────────────────────────────────────
        if (settings.codeforcesHandle) {
          set((s) => ({ codeforces: { ...s.codeforces, isLoading: true, error: null } }));
          await new Promise((r) => setTimeout(r, 600));
          set((s) => ({
            codeforces: { ...s.codeforces, isLoading: false, lastSynced: new Date().toISOString() },
          }));
        }
      },

      setStatsLoading: (platform, loading) =>
        set((s) => ({ [platform]: { ...s[platform], isLoading: loading } })),

      setStatsError: (platform, error) =>
        set((s) => ({ [platform]: { ...s[platform], error, isLoading: false } })),
    }),
    {
      name: "cp-companion-v2",
      // Only persist settings — live stats are re-fetched each session
      partialize: (state) => ({ settings: state.settings }),
    }
  )
);
