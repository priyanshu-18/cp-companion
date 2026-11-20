// ─── Platforms ────────────────────────────────────────────────────────────────

export type Platform = "leetcode" | "codechef" | "codeforces";

export const PLATFORM_LABELS: Record<Platform, string> = {
  leetcode:   "LeetCode",
  codechef:   "CodeChef",
  codeforces: "Codeforces",
};

// ─── Window Behavior ──────────────────────────────────────────────────────────

/** "floating"  → always-on-top, appears above all app windows.
 *  "desktop"   → native desktop-layer, sits below all app windows like a macOS widget. */
export type WindowMode = "floating" | "desktop";

// ─── Statistics ───────────────────────────────────────────────────────────────

export interface PlatformStats {
  platform: Platform;
  username: string;
  /** null if the stat is unavailable for this platform */
  totalSolved:       number | null;
  currentStreak:     number | null;
  longestStreak:     number | null;
  totalSubmissions:  number | null;
  ranking?:          number | null;
  rating?:           number | null; // Codeforces / CodeChef rating
  /** Map of "YYYY-MM-DD" → submission count. Empty when unavailable. */
  heatmapData: Record<string, number>;
  lastSynced: string | null;   // ISO timestamp; null = never synced
  isLoading: boolean;
  error: string | null;
}

// ─── Contest ──────────────────────────────────────────────────────────────────

export type RegistrationStatus =
  | "registered"
  | "not_registered"
  | "open"
  | "closed"
  | "unknown";

export interface Contest {
  id: string;
  platform: Platform;
  name: string;
  startTime: string;   // ISO timestamp
  endTime:   string;   // ISO timestamp
  url: string;
  registrationUrl?: string;
  registrationStatus: RegistrationStatus;
  durationMinutes: number;
}

// ─── App Settings ─────────────────────────────────────────────────────────────

export type RefreshInterval = 5 | 15 | 60 | 1440; // minutes

export type Theme = "dark" | "light" | "system";

export interface AppSettings {
  // Accounts
  activePlatform:     Platform;
  leetcodeUsername:   string;
  codechefUsername:   string;
  codeforcesHandle:   string;

  // Window behavior
  windowMode:         WindowMode;

  // Appearance
  theme:              Theme;
  opacity:            number;    // 0.6 – 1.0

  // Data visibility
  showHeatmap:        boolean;
  showContests:       boolean;

  // Refresh
  refreshInterval:    RefreshInterval;

  // Notifications (Phase 6)
  notifyContest24h:   boolean;
  notifyContest1h:    boolean;
  notifyContest15m:   boolean;
  notifyDailyReminder:boolean;

  // Position (physical pixels; null = use window center)
  windowX: number | null;
  windowY: number | null;
}
