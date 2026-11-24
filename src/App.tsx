import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import "./App.css";
import { useAppStore } from "./store/appStore";
import { PLATFORM_LABELS } from "./types";
import type { Platform } from "./types";
import Heatmap from "./components/Heatmap";
import ContestCard from "./components/ContestCard";
import Settings from "./components/Settings";

function App() {
  const {
    settings, leetcode, codechef, codeforces,
    contests, setActivePlatform, setWindowMode, triggerRefresh,
  } = useAppStore();

  const [showSettings, setShowSettings] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // ── Active platform stats ─────────────────────────────────────────────────
  const statsMap = { leetcode, codechef, codeforces };
  const stats = statsMap[settings.activePlatform];

  // ── Apply stored window mode on first mount ───────────────────────────────
  useEffect(() => {
    const t = setTimeout(async () => {
      // 1. Restore saved window size + position
      const { windowX, windowY, windowW, windowH } = settings;
      if (windowX != null && windowY != null) {
        invoke("set_window_bounds", {
          x: windowX,
          y: windowY,
          w: windowW ?? 360,
          h: windowH ?? 700,
        }).catch(() => {});
      }
      // 2. Apply stored window mode (floating / desktop)
      setWindowMode(settings.windowMode).catch(() => {});
    }, 150);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Auto-refresh on first mount if usernames are configured ──────────────
  useEffect(() => {
    const { leetcodeUsername, codechefUsername, codeforcesHandle } = settings;
    if (leetcodeUsername || codechefUsername || codeforcesHandle) {
      triggerRefresh().catch(() => {});
    }
    const unlistenRefresh = listen("tray-refresh", () => {
      triggerRefresh({ bypassCooldown: true }).catch(() => {});
    });
    const unlistenMode = listen<"desktop" | "floating">("tray-set-mode", (e) => {
      setWindowMode(e.payload).catch(() => {});
    });
    return () => {
      unlistenRefresh.then((f) => f()).catch(() => {});
      unlistenMode.then((f) => f()).catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Apply opacity setting ─────────────────────────────────────────────────
  useEffect(() => {
    document.documentElement.style.setProperty(
      "--widget-opacity", String(settings.opacity)
    );
  }, [settings.opacity]);

  // ── Window controls ───────────────────────────────────────────────────────
  const handleDrag  = () => invoke("start_drag").catch(() => {});
  const handleClose = (e: React.MouseEvent) => {
    e.stopPropagation();
    // Save position + size before closing
    invoke<[number, number, number, number]>("get_window_bounds")
      .then(([x, y, w, h]) =>
        useAppStore.getState().updateSettings({ windowX: x, windowY: y, windowW: w, windowH: h })
      )
      .catch(() => {})
      .finally(() => invoke("close_window").catch(() => {}));
  };
  const handleMinimize = (e: React.MouseEvent) => {
    e.stopPropagation();
    invoke("minimize_window").catch(() => {});
  };
  const handlePinToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    const next = settings.windowMode === "floating" ? "desktop" : "floating";
    setWindowMode(next).catch(() => {});
  };

  // ── Refresh ───────────────────────────────────────────────────────────────
  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await triggerRefresh();
    } finally {
      setRefreshing(false);
    }
  };

  // ── Merged 365-day heatmap across all 3 platforms ────────────────────────
  const mergedHeatmap: Record<string, number> = {};
  for (const map of [leetcode.heatmapData, codechef.heatmapData, codeforces.heatmapData]) {
    for (const [day, count] of Object.entries(map)) {
      mergedHeatmap[day] = (mergedHeatmap[day] ?? 0) + count;
    }
  }
  const hasHeatmapData = Object.keys(mergedHeatmap).length > 0;

  // ── Upcoming contests ─────────────────────────────────────────────────────
  const upcoming = [...contests]
    .filter((c) => new Date(c.startTime) > new Date())
    .sort((a, b) => +new Date(a.startTime) - +new Date(b.startTime))
    .slice(0, 2);

  // ── Platform tab class ────────────────────────────────────────────────────
  const tabClass = (p: Platform) => {
    const isActive = settings.activePlatform === p;
    if (!isActive) return "tab";
    const map: Record<Platform, string> = {
      leetcode:   "tab lc-active",
      codechef:   "tab cc-active",
      codeforces: "tab cf-active",
    };
    return map[p];
  };

  // ── Stat display helper ───────────────────────────────────────────────────
  const statVal = (v: number | null | undefined, suffix = "") =>
    v == null ? <span style={{ color: "var(--t3)", fontSize: "12px" }}>—</span>
              : <>{v}{suffix}</>;

  // Whether the active platform has no username configured
  const usernameMap: Record<typeof settings.activePlatform, string> = {
    leetcode:   settings.leetcodeUsername,
    codechef:   settings.codechefUsername,
    codeforces: settings.codeforcesHandle,
  };
  const noUsername = !usernameMap[settings.activePlatform];

  // ● Live = synced at least once AND has at least one real numeric value AND no hard error
  const hasRealData =
    stats.lastSynced !== null &&
    (stats.totalSolved !== null || stats.rating != null) &&
    !stats.isLoading;

  // For platforms that don't expose streak, re-use the third tile for peak rating
  const showPeakRating = settings.activePlatform !== "leetcode";

  // Displayed account handle (from stats if available, else from settings)
  const displayedUsername =
    stats.username || usernameMap[settings.activePlatform] || null;

  return (
    <div className="widget">

      {/* ── Settings overlay ──────────────────────────────────────────────── */}
      {showSettings && <Settings onClose={() => setShowSettings(false)} />}

      {/* ── Drag Handle / Header ──────────────────────────────────────────── */}
      <div className="drag-handle" onMouseDown={handleDrag}>
        <div className="widget-identity">
          <div className="widget-icon">⚡</div>
          <span className="widget-name">CP Companion</span>
        </div>

        <div className="traffic-lights" onMouseDown={(e) => e.stopPropagation()}>
          <button className="tl tl-close"   onClick={handleClose}    title="Close" />
          <button className="tl tl-min"     onClick={handleMinimize} title="Minimise" />
          <button
            className="tl tl-pin"
            onClick={handlePinToggle}
            title={settings.windowMode === "floating" ? "Switch to Desktop mode" : "Switch to Floating mode"}
            style={{ opacity: settings.windowMode === "desktop" ? 0.5 : 1 }}
          />
        </div>
      </div>

      {/* ── Platform Tabs (3 platforms) ───────────────────────────────────── */}
      <div className="platform-tabs">
        {(["leetcode", "codechef", "codeforces"] as Platform[]).map((p) => (
          <button
            key={p}
            className={tabClass(p)}
            onClick={() => setActivePlatform(p)}
          >
            <span className="tab-dot" />
            {PLATFORM_LABELS[p]}
          </button>
        ))}
      </div>

      {/* ── Scrollable Body ───────────────────────────────────────────────── */}
      <div className="widget-body">

        {/* ── Statistics ────────────────────────────────────────────────── */}
        <div className="section">
          <div className="section-head">
            <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
              <span className="section-label">Statistics</span>
              {displayedUsername && (
                <span style={{ fontSize: 10, color: "var(--t3)", letterSpacing: "0.02em" }}>
                  @{displayedUsername}
                </span>
              )}
            </div>
            {stats.isLoading && (
              <span className="mock-pill" style={{ color: "var(--blue)" }}>⟳ Syncing</span>
            )}
            {!stats.isLoading && hasRealData && (
              <span className="mock-pill" style={{ color: "var(--green)", opacity: 0.8 }}>● Live</span>
            )}
            {!stats.isLoading && stats.lastSynced && !hasRealData && !noUsername && (
              <span className="mock-pill" style={{ color: "#f59e0b" }}>Partial</span>
            )}
            {!stats.isLoading && !stats.lastSynced && !noUsername && (
              <span className="mock-pill">Not synced</span>
            )}
          </div>

          {noUsername ? (
            <div style={{ padding: "16px 0", textAlign: "center", color: "var(--t3)", fontSize: 11 }}>
              Enter your {PLATFORM_LABELS[settings.activePlatform]} username<br />
              in <strong style={{ color: "var(--t2)" }}>Settings → Accounts</strong>
            </div>
          ) : (
            <>
              <div className="stats-grid">
                <div className="stat-tile">
                  <div className="stat-num purple">{statVal(stats.totalSolved)}</div>
                  <div className="stat-lbl">Problems Solved</div>
                </div>
                <div className="stat-tile">
                  <div className="stat-num green">{statVal(stats.currentStreak, "d")}</div>
                  <div className="stat-lbl">Current Streak</div>
                </div>
                <div className="stat-tile">
                  {showPeakRating ? (
                    <>
                      <div className="stat-num blue">{statVal(stats.maxRating)}</div>
                      <div className="stat-lbl">Peak Rating</div>
                    </>
                  ) : (
                    <>
                      <div className="stat-num blue">{statVal(stats.longestStreak, "d")}</div>
                      <div className="stat-lbl">Longest Streak</div>
                    </>
                  )}
                </div>
                <div className="stat-tile">
                  <div className="stat-num orange">{statVal(stats.rating)}</div>
                  <div className="stat-lbl">
                    {settings.activePlatform === "leetcode" ? "Contest Rating" : "Rating"}
                  </div>
                </div>
              </div>
              {stats.error && (
                <div style={{ marginTop: 6, fontSize: 10, color: "var(--t3)", lineHeight: 1.4 }}>
                  ℹ {stats.error}
                </div>
              )}
            </>
          )}
        </div>

        {/* ── Activity Heatmap ──────────────────────────────────────────── */}
        {settings.showHeatmap && (
          <div className="section">
            <div className="section-head">
              <span className="section-label">Activity · 365 days</span>
              {hasHeatmapData && (
                <span className="mock-pill" style={{ color: "var(--green)", opacity: 0.8 }}>● Live</span>
              )}
            </div>
            {!hasHeatmapData && !stats.isLoading ? (
              <div style={{ padding: "10px 0", textAlign: "center", color: "var(--t3)", fontSize: 11 }}>
                {noUsername
                  ? "No username set"
                  : stats.lastSynced
                    ? "No activity data available for this platform"
                    : "Waiting for sync…"}
              </div>
            ) : (
              <Heatmap data={mergedHeatmap} />
            )}
          </div>
        )}

        {/* ── Upcoming Contests ─────────────────────────────────────────── */}
        {settings.showContests && upcoming.length > 0 && (
          <div className="section">
            <div className="section-head">
              <span className="section-label">Upcoming Contests</span>
            </div>
            {upcoming.map((c) => (
              <ContestCard key={c.id} contest={c} />
            ))}
          </div>
        )}

        <div className="body-spacer" />
      </div>

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      <div className="widget-footer">
        <span className="sync-text">
          {stats.lastSynced
            ? `Synced ${new Date(stats.lastSynced).toLocaleTimeString()}`
            : stats.isLoading
              ? "Syncing…"
              : noUsername
                ? "No account configured"
                : "Press ↻ to sync"}
        </span>
        <div className="footer-btns">
          <button className="footer-btn" title="Refresh" onClick={handleRefresh}>
            <span className={refreshing ? "spinning" : ""}>↻</span>
          </button>
          <button className="footer-btn" title="Settings" onClick={() => setShowSettings(true)}>
            ⚙
          </button>
        </div>
      </div>

    </div>
  );
}

export default App;
