import { useState } from "react";
import { useAppStore } from "../store/appStore";
import type { Platform, WindowMode, Theme, RefreshInterval } from "../types";
import { fetchLeetCodeStats } from "../services/leetcode";
import { fetchCodeChefStats } from "../services/codechef";
import { fetchCodeforcesStats } from "../services/codeforces";

interface Props {
  onClose: () => void;
}

type Section = "accounts" | "behavior" | "appearance" | "data" | "notifications" | "general";

const SECTION_LABELS: Record<Section, string> = {
  accounts:      "Accounts",
  behavior:      "Window",
  appearance:    "Appearance",
  data:          "Data & Refresh",
  notifications: "Notifications",
  general:       "General",
};

// ── Small reusable controls ───────────────────────────────────────────────────

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      className={`s-toggle ${value ? "on" : ""}`}
      onClick={() => onChange(!value)}
      aria-checked={value}
      role="switch"
    />
  );
}

function SegmentRow<T extends string>({
  label, value, options, onChange,
}: { label: string; value: T; options: { v: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="s-row">
      <span className="s-row-label">{label}</span>
      <div className="s-segment">
        {options.map((o) => (
          <button
            key={o.v}
            className={`s-seg-btn ${value === o.v ? "active" : ""}`}
            onClick={() => onChange(o.v)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}


function ToggleRow({ label, sub, value, onChange }: {
  label: string; sub?: string; value: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div className="s-row">
      <div>
        <div className="s-row-label">{label}</div>
        {sub && <div className="s-row-sub">{sub}</div>}
      </div>
      <Toggle value={value} onChange={onChange} />
    </div>
  );
}

// ── Main Settings Component ───────────────────────────────────────────────────

export default function Settings({ onClose }: Props) {
  const { settings, updateSettings, setWindowMode, setPlatformStats, triggerRefresh } = useAppStore();
  const [section, setSection] = useState<Section>("accounts");
  const [saved, setSaved] = useState(false);

  // ── Per-platform account verification state ───────────────────────────────
  type VerifyState = "idle" | "loading" | "ok" | "error";
  const [lcVerify,  setLcVerify]  = useState<VerifyState>("idle");
  const [ccVerify,  setCcVerify]  = useState<VerifyState>("idle");
  const [cfVerify,  setCfVerify]  = useState<VerifyState>("idle");
  const [lcErr,  setLcErr]  = useState("");
  const [ccErr,  setCcErr]  = useState("");
  const [cfErr,  setCfErr]  = useState("");

  // Draft values (uncommitted until Verify pressed)
  const [lcDraft, setLcDraft] = useState(settings.leetcodeUsername);
  const [ccDraft, setCcDraft] = useState(settings.codechefUsername);
  const [cfDraft, setCfDraft] = useState(settings.codeforcesHandle);

  const save = (partial: Parameters<typeof updateSettings>[0]) => {
    updateSettings(partial);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const handleWindowMode = async (mode: WindowMode) => {
    await setWindowMode(mode);
  };

  // ── Account verify handlers ───────────────────────────────────────────────

  const verifyLeetCode = async () => {
    const handle = lcDraft.trim();
    if (!handle) return;
    setLcVerify("loading"); setLcErr("");
    try {
      const stats = await fetchLeetCodeStats(handle);
      save({ leetcodeUsername: stats.username || handle });
      setPlatformStats("leetcode", stats);
      setLcVerify("ok");
      triggerRefresh({ bypassCooldown: false }).catch(() => {});
    } catch (e: unknown) {
      setLcVerify("error");
      setLcErr(e instanceof Error ? e.message : String(e));
    }
  };

  const verifyCodeChef = async () => {
    const handle = ccDraft.trim();
    if (!handle) return;
    setCcVerify("loading"); setCcErr("");
    try {
      const stats = await fetchCodeChefStats(handle);
      save({ codechefUsername: stats.username || handle });
      setPlatformStats("codechef", stats);
      setCcVerify("ok");
      triggerRefresh({ bypassCooldown: false }).catch(() => {});
    } catch (e: unknown) {
      setCcVerify("error");
      setCcErr(e instanceof Error ? e.message : String(e));
    }
  };

  const verifyCodeforces = async () => {
    const handle = cfDraft.trim();
    if (!handle) return;
    setCfVerify("loading"); setCfErr("");
    try {
      const stats = await fetchCodeforcesStats(handle);
      save({ codeforcesHandle: stats.username || handle });
      setPlatformStats("codeforces", stats);
      setCfVerify("ok");
      triggerRefresh({ bypassCooldown: false }).catch(() => {});
    } catch (e: unknown) {
      setCfVerify("error");
      setCfErr(e instanceof Error ? e.message : String(e));
    }
  };

  // ── Section renderers ─────────────────────────────────────────────────────

  const renderAccounts = () => (
    <div className="s-section-body">
      <p className="s-hint">
        Enter your handle and press <strong>Verify</strong> to validate the
        account and fetch real statistics.
      </p>

      {/* ── LeetCode ── */}
      <div className="s-group">
        <div className="s-group-title">LeetCode</div>
        <div className="s-field">
          <label className="s-field-label">Username</label>
          <div className="s-verify-row">
            <input
              className="s-input"
              type="text"
              value={lcDraft}
              placeholder="e.g. neal_wu"
              onChange={(e) => { setLcDraft(e.target.value); setLcVerify("idle"); setLcErr(""); }}
              onKeyDown={(e) => e.key === "Enter" && verifyLeetCode()}
              spellCheck={false} autoCapitalize="off" autoCorrect="off"
            />
            <button
              className={`s-verify-btn ${lcVerify}`}
              onClick={verifyLeetCode}
              disabled={lcVerify === "loading" || !lcDraft.trim()}
            >
              {lcVerify === "loading" ? "⟳" : lcVerify === "ok" ? "✓" : "Verify"}
            </button>
          </div>
          {lcVerify === "error" && <div className="s-verify-err">{lcErr}</div>}
          {lcVerify === "ok" && <div className="s-verify-ok">Account verified ✓</div>}
          {settings.leetcodeUsername && lcVerify === "idle" && (
            <div className="s-verify-saved">Saved: {settings.leetcodeUsername}</div>
          )}
        </div>
      </div>

      {/* ── CodeChef ── */}
      <div className="s-group">
        <div className="s-group-title">CodeChef</div>
        <div className="s-field">
          <label className="s-field-label">Username / Handle</label>
          <div className="s-verify-row">
            <input
              className="s-input"
              type="text"
              value={ccDraft}
              placeholder="e.g. gennady"
              onChange={(e) => { setCcDraft(e.target.value); setCcVerify("idle"); setCcErr(""); }}
              onKeyDown={(e) => e.key === "Enter" && verifyCodeChef()}
              spellCheck={false} autoCapitalize="off" autoCorrect="off"
            />
            <button
              className={`s-verify-btn ${ccVerify}`}
              onClick={verifyCodeChef}
              disabled={ccVerify === "loading" || !ccDraft.trim()}
            >
              {ccVerify === "loading" ? "⟳" : ccVerify === "ok" ? "✓" : "Verify"}
            </button>
          </div>
          {ccVerify === "error" && <div className="s-verify-err">{ccErr}</div>}
          {ccVerify === "ok" && <div className="s-verify-ok">Account verified ✓ (stats limited — no public API)</div>}
          {settings.codechefUsername && ccVerify === "idle" && (
            <div className="s-verify-saved">Saved: {settings.codechefUsername}</div>
          )}
        </div>
      </div>

      {/* ── Codeforces ── */}
      <div className="s-group">
        <div className="s-group-title">Codeforces</div>
        <div className="s-field">
          <label className="s-field-label">Handle</label>
          <div className="s-verify-row">
            <input
              className="s-input"
              type="text"
              value={cfDraft}
              placeholder="e.g. tourist"
              onChange={(e) => { setCfDraft(e.target.value); setCfVerify("idle"); setCfErr(""); }}
              onKeyDown={(e) => e.key === "Enter" && verifyCodeforces()}
              spellCheck={false} autoCapitalize="off" autoCorrect="off"
            />
            <button
              className={`s-verify-btn ${cfVerify}`}
              onClick={verifyCodeforces}
              disabled={cfVerify === "loading" || !cfDraft.trim()}
            >
              {cfVerify === "loading" ? "⟳" : cfVerify === "ok" ? "✓" : "Verify"}
            </button>
          </div>
          {cfVerify === "error" && <div className="s-verify-err">{cfErr}</div>}
          {cfVerify === "ok" && <div className="s-verify-ok">Account verified ✓</div>}
          {settings.codeforcesHandle && cfVerify === "idle" && (
            <div className="s-verify-saved">Saved: {settings.codeforcesHandle}</div>
          )}
        </div>
      </div>
    </div>
  );

  const renderBehavior = () => (
    <div className="s-section-body">
      <div className="s-group">
        <div className="s-group-title">Window Mode</div>

        <div className="s-mode-cards">
          <button
            className={`s-mode-card ${settings.windowMode === "floating" ? "active" : ""}`}
            onClick={() => handleWindowMode("floating")}
          >
            <span className="s-mode-icon">🪟</span>
            <span className="s-mode-name">Floating</span>
            <span className="s-mode-desc">Always above other windows</span>
          </button>
          <button
            className={`s-mode-card ${settings.windowMode === "desktop" ? "active" : ""}`}
            onClick={() => handleWindowMode("desktop")}
          >
            <span className="s-mode-icon">🖥</span>
            <span className="s-mode-name">Desktop</span>
            <span className="s-mode-desc">Pinned below app windows</span>
          </button>
        </div>

        <p className="s-hint" style={{ marginTop: 10 }}>
          <b>Desktop mode</b> places the widget on the wallpaper layer.
          App windows appear on top of it, like the macOS Clock widget.
        </p>
      </div>

      <div className="s-group">
        <div className="s-group-title">Visibility</div>
        <ToggleRow
          label="Show Heatmap"
          sub="365-day activity chart"
          value={settings.showHeatmap}
          onChange={(v) => save({ showHeatmap: v })}
        />
        <ToggleRow
          label="Show Contests"
          sub="Upcoming contest section"
          value={settings.showContests}
          onChange={(v) => save({ showContests: v })}
        />
      </div>
    </div>
  );

  const renderAppearance = () => (
    <div className="s-section-body">
      <div className="s-group">
        <div className="s-group-title">Theme</div>
        <SegmentRow<Theme>
          label="Color Mode"
          value={settings.theme}
          options={[
            { v: "dark",   label: "Dark"   },
            { v: "light",  label: "Light"  },
            { v: "system", label: "System" },
          ]}
          onChange={(v) => save({ theme: v })}
        />
        <p className="s-hint">Light and System themes coming in Phase 7.</p>
      </div>

      <div className="s-group">
        <div className="s-group-title">Opacity</div>
        <div className="s-row">
          <span className="s-row-label">Widget Opacity</span>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              className="s-slider"
              type="range"
              min={60} max={100} step={5}
              value={Math.round(settings.opacity * 100)}
              onChange={(e) => save({ opacity: Number(e.target.value) / 100 })}
            />
            <span className="s-row-sub">{Math.round(settings.opacity * 100)}%</span>
          </div>
        </div>
      </div>
    </div>
  );

  const renderData = () => (
    <div className="s-section-body">
      <div className="s-group">
        <div className="s-group-title">Default Platform</div>
        <SegmentRow<Platform>
          label="Show first"
          value={settings.activePlatform}
          options={[
            { v: "leetcode",   label: "LC"  },
            { v: "codechef",   label: "CC"  },
            { v: "codeforces", label: "CF"  },
          ]}
          onChange={(v) => save({ activePlatform: v })}
        />
      </div>

      <div className="s-group">
        <div className="s-group-title">Auto-Refresh Interval</div>
        <p className="s-hint">
          Approximate interval. The OS may delay background work. Actual
          refresh happens when the app is active.
        </p>
        {([5, 15, 60, 1440] as RefreshInterval[]).map((n) => (
          <div key={n} className="s-row" style={{ cursor: "pointer" }}
            onClick={() => save({ refreshInterval: n })}>
            <span className="s-row-label">
              {n < 60 ? `${n} minutes` : n === 60 ? "1 hour" : "24 hours"}
            </span>
            <div className={`s-radio ${settings.refreshInterval === n ? "checked" : ""}`} />
          </div>
        ))}
      </div>
    </div>
  );

  const renderNotifications = () => (
    <div className="s-section-body">
      <p className="s-hint">Native notifications will be implemented in Phase 6.</p>

      <div className="s-group">
        <div className="s-group-title">Contest Reminders</div>
        <ToggleRow label="24 hours before"  value={settings.notifyContest24h}    onChange={(v) => save({ notifyContest24h: v })} />
        <ToggleRow label="1 hour before"    value={settings.notifyContest1h}     onChange={(v) => save({ notifyContest1h: v })} />
        <ToggleRow label="15 minutes before"value={settings.notifyContest15m}    onChange={(v) => save({ notifyContest15m: v })} />
      </div>

      <div className="s-group">
        <div className="s-group-title">Daily</div>
        <ToggleRow label="Daily coding reminder" sub="Configure time in Phase 6" value={settings.notifyDailyReminder} onChange={(v) => save({ notifyDailyReminder: v })} />
      </div>
    </div>
  );

  const renderGeneral = () => (
    <div className="s-section-body">
      <div className="s-group">
        <div className="s-group-title">About</div>
        <div className="s-row">
          <span className="s-row-label">CP Companion</span>
          <span className="s-row-sub">v0.1.0</span>
        </div>
        <div className="s-row">
          <span className="s-row-label">Build</span>
          <span className="s-row-sub">Tauri 2 · React 19 · Rust</span>
        </div>
      </div>

      <div className="s-group">
        <div className="s-group-title">Data</div>
        <button
          className="s-danger-btn"
          onClick={() => {
            localStorage.removeItem("cp-companion-v3");
            window.location.reload();
          }}
        >
          Reset All Settings
        </button>
        <p className="s-hint" style={{ marginTop: 6 }}>
          Clears all saved preferences. Cached statistics are not affected.
        </p>
      </div>
    </div>
  );

  const sections: Section[] = [
    "accounts", "behavior", "appearance", "data", "notifications", "general",
  ];

  return (
    <div className="settings-panel">
      {/* Header */}
      <div className="s-header">
        <button className="s-back-btn" onClick={onClose}>← Back</button>
        <span className="s-title">Settings</span>
        <span className={`s-saved ${saved ? "visible" : ""}`}>Saved ✓</span>
      </div>

      <div className="s-layout">
        {/* Sidebar nav */}
        <nav className="s-nav">
          {sections.map((s) => (
            <button
              key={s}
              className={`s-nav-btn ${section === s ? "active" : ""}`}
              onClick={() => setSection(s)}
            >
              {SECTION_LABELS[s]}
            </button>
          ))}
        </nav>

        {/* Content */}
        <div className="s-content">
          {section === "accounts"      && renderAccounts()}
          {section === "behavior"      && renderBehavior()}
          {section === "appearance"    && renderAppearance()}
          {section === "data"          && renderData()}
          {section === "notifications" && renderNotifications()}
          {section === "general"       && renderGeneral()}
        </div>
      </div>
    </div>
  );
}
