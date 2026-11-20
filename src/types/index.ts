// ─── Platform Types ───────────────────────────────────────────────────────────

export type Platform = "leetcode" | "codechef";

// ─── Statistics ───────────────────────────────────────────────────────────────

export interface PlatformStats {
  platform: Platform;
  username: string;
  totalSolved: number;
  currentStreak: number;
  longestStreak: number;
  totalSubmissions: number;
  ranking?: number;
  /** Map of "YYYY-MM-DD" → submission count */
  heatmapData: Record<string, number>;
  lastSynced: string | null; // ISO timestamp
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
  endTime: string;     // ISO timestamp
  url: string;
  registrationUrl?: string;
  registrationStatus: RegistrationStatus;
  durationMinutes: number;
}

// ─── App Settings ─────────────────────────────────────────────────────────────

export type RefreshInterval = 1 | 5 | 15 | 60 | 1440; // minutes

export interface AppSettings {
  activePlatform: Platform;
  leetcodeUsername: string;
  codechefUsername: string;
  refreshInterval: RefreshInterval;
  alwaysOnTop: boolean;
  showHeatmap: boolean;
  showContests: boolean;
  windowX: number | null;
  windowY: number | null;
}
