import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";
import { useAppStore } from "./store/appStore";
import Heatmap from "./components/Heatmap";
import ContestCard from "./components/ContestCard";

function App() {
  const { settings, leetcode, codechef, contests, setActivePlatform } = useAppStore();
  const isLC = settings.activePlatform === "leetcode";
  const stats = isLC ? leetcode : codechef;
  const [spinning, setSpinning] = useState(false);

  /* ── Window controls ─────────────────────────────────────────────────────── */
  const handleDrag     = () => invoke("start_drag").catch(() => {});
  const handleClose    = (e: React.MouseEvent) => { e.stopPropagation(); invoke("close_window").catch(() => {}); };
  const handleMinimize = (e: React.MouseEvent) => { e.stopPropagation(); invoke("minimize_window").catch(() => {}); };
  const handlePin      = (e: React.MouseEvent) => { e.stopPropagation(); /* toggle always-on-top — Phase 7 */ };

  /* ── Refresh (mock — will call real service in Phase 4) ──────────────────── */
  const handleRefresh = () => {
    if (spinning) return;
    setSpinning(true);
    setTimeout(() => setSpinning(false), 700);
  };

  /* ── Upcoming contests sorted by start time ──────────────────────────────── */
  const upcoming = [...contests]
    .filter((c) => new Date(c.startTime) > new Date())
    .sort((a, b) => +new Date(a.startTime) - +new Date(b.startTime))
    .slice(0, 2);

  return (
    <div className="widget">

      {/* ── Drag Handle / Header ─────────────────────────────────────────────── */}
      <div className="drag-handle" onMouseDown={handleDrag}>
        <div className="widget-identity">
          <div className="widget-icon">⚡</div>
          <span className="widget-name">CP Companion</span>
        </div>

        {/* macOS traffic-light buttons */}
        <div className="traffic-lights" onMouseDown={(e) => e.stopPropagation()}>
          <button className="tl tl-close"   onClick={handleClose}    title="Close" />
          <button className="tl tl-min"     onClick={handleMinimize} title="Minimise" />
          <button className="tl tl-pin"     onClick={handlePin}      title="Always on Top" />
        </div>
      </div>

      {/* ── Platform Tabs ─────────────────────────────────────────────────────── */}
      <div className="platform-tabs">
        <button
          className={`tab ${isLC ? "lc-active" : ""}`}
          onClick={() => setActivePlatform("leetcode")}
        >
          <span className="tab-dot" />
          LeetCode
        </button>
        <button
          className={`tab ${!isLC ? "cc-active" : ""}`}
          onClick={() => setActivePlatform("codechef")}
        >
          <span className="tab-dot" />
          CodeChef
        </button>
      </div>

      {/* ── Scrollable Body ───────────────────────────────────────────────────── */}
      <div className="widget-body">

        {/* ── Statistics ──────────────────────────────────────────────────────── */}
        <div className="section">
          <div className="section-head">
            <span className="section-label">Statistics</span>
            <span className="mock-pill">⚠ Mock</span>
          </div>
          <div className="stats-grid">
            <div className="stat-tile">
              <div className="stat-num purple">{stats.totalSolved}</div>
              <div className="stat-lbl">Problems Solved</div>
            </div>
            <div className="stat-tile">
              <div className="stat-num green">{stats.currentStreak}d</div>
              <div className="stat-lbl">Current Streak</div>
            </div>
            <div className="stat-tile">
              <div className="stat-num blue">{stats.longestStreak}d</div>
              <div className="stat-lbl">Longest Streak</div>
            </div>
            <div className="stat-tile">
              <div className="stat-num orange">{stats.totalSubmissions}</div>
              <div className="stat-lbl">Submissions</div>
            </div>
          </div>
        </div>

        {/* ── Activity Heatmap ────────────────────────────────────────────────── */}
        {settings.showHeatmap && (
          <div className="section">
            <div className="section-head">
              <span className="section-label">Activity · 365 days</span>
              <span className="mock-pill">⚠ Mock</span>
            </div>
            <Heatmap data={stats.heatmapData} />
          </div>
        )}

        {/* ── Upcoming Contests ────────────────────────────────────────────────── */}
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

      {/* ── Footer ────────────────────────────────────────────────────────────── */}
      <div className="widget-footer">
        <span className="sync-text">
          {stats.lastSynced
            ? `Synced ${new Date(stats.lastSynced).toLocaleTimeString()}`
            : "⚠ Not synced — mock data"}
        </span>
        <div className="footer-btns">
          <button className="footer-btn" title="Refresh" onClick={handleRefresh}>
            <span className={spinning ? "spinning" : ""}>↻</span>
          </button>
          <button className="footer-btn" title="Settings">
            ⚙
          </button>
        </div>
      </div>

    </div>
  );
}

export default App;
