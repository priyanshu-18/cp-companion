import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AppSettings, PlatformStats, Contest, Platform } from "../types";
import { MOCK_LEETCODE_STATS, MOCK_CODECHEF_STATS, MOCK_CONTESTS } from "../services/mock";

interface AppState {
  settings: AppSettings;
  leetcode: PlatformStats;
  codechef: PlatformStats;
  contests: Contest[];

  // Actions
  setActivePlatform: (p: Platform) => void;
  updateSettings: (s: Partial<AppSettings>) => void;
}

const DEFAULT_SETTINGS: AppSettings = {
  activePlatform: "leetcode",
  leetcodeUsername: "",
  codechefUsername: "",
  refreshInterval: 15,
  alwaysOnTop: true,
  showHeatmap: true,
  showContests: true,
  windowX: null,
  windowY: null,
};

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      settings: DEFAULT_SETTINGS,
      leetcode: MOCK_LEETCODE_STATS,
      codechef: MOCK_CODECHEF_STATS,
      contests: MOCK_CONTESTS,

      setActivePlatform: (platform) =>
        set((s) => ({ settings: { ...s.settings, activePlatform: platform } })),

      updateSettings: (partial) =>
        set((s) => ({ settings: { ...s.settings, ...partial } })),
    }),
    {
      name: "cp-companion-storage",
      // Only persist settings, not live data (data refreshed on launch)
      partialize: (state) => ({ settings: state.settings }),
    }
  )
);
