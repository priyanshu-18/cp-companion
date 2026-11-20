import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
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
    // Small delay so the window is fully ready before native calls
    const t = setTimeout(() => {
      setWindowMode(settings.windowMode).catch(() => {});
    }, 150);
    return () => clearTimeout(t);
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
    // Save position before closing
    invoke<[number, number]>("get_window_position")
      .then(([x, y]) => useAppStore.getState().updateSettings({ windowX: x, windowY: y }))
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
    v == null ? <span style={{ color: "var(--t3)", fontSize: "12px" }}>N/A</span>
              : <>{v}{suffix}</>;

  return (
    <div className="widget" style={{ opacity: settings.opacity }}>

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
            <span className="section-label">Statistics</span>
            {stats.isLoading
              ? <span className="mock-pill" style={{ color: "var(--blue)" }}>⟳ Loading</span>
              : <span className="mock-pill">⚠ Mock</span>
            }
          </div>
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
              <div className="stat-num blue">{statVal(stats.longestStreak, "d")}</div>
              <div className="stat-lbl">Longest Streak</div>
            </div>
            <div className="stat-tile">
              <div className="stat-num orange">
                {settings.activePlatform === "codeforces" || settings.activePlatform === "codechef"
                  ? statVal(stats.rating)
                  : statVal(stats.totalSubmissions)}
              </div>
              <div className="stat-lbl">
                {settings.activePlatform === "codeforces" || settings.activePlatform === "codechef"
                  ? "Rating"
                  : "Submissions"}
              </div>
            </div>
          </div>
          {stats.error && (
            <div style={{ marginTop: 6, fontSize: 10, color: "#ef4444" }}>
              ⚠ {stats.error}
            </div>
          )}
        </div>

        {/* ── Activity Heatmap ──────────────────────────────────────────── */}
        {settings.showHeatmap && (
          <div className="section">
            <div className="section-head">
              <span className="section-label">Activity · 365 days</span>
              <span className="mock-pill">⚠ Mock</span>
            </div>
            <Heatmap data={stats.heatmapData} />
          </div>
        )}

        {/* ── Upcoming Contests ─────────────────────────────────────────── */}
        {settings.showContests && upcoming.length > 0 && (
          <div className="section">
            <div className="section-head">
              <span className="section-label">Upcoming Contests</span>
              <span className="mock-pill">⚠ Mock</span>
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
              : "⚠ Mock data"}
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
