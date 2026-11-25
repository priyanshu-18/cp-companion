import { useState, useMemo, useRef, useLayoutEffect, useEffect } from "react";

interface Props {
  data: Record<string, number>;
}

function getLevel(count: number): 0 | 1 | 2 | 3 | 4 {
  if (!count) return 0;
  if (count <= 2) return 1;
  if (count <= 4) return 2;
  if (count <= 7) return 3;
  return 4;
}

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const GAP = 2;
const MIN_CELL = 4;

function toLocalDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function buildWeeks(): { weeks: string[][]; todayKey: string } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayKey = toLocalDateKey(today);

  // Start 364 days ago, rewound to Sunday so the last column is the current week ending at today
  const start = new Date(today);
  start.setDate(start.getDate() - 364);
  start.setDate(start.getDate() - start.getDay());

  const end = new Date(today);
  end.setDate(end.getDate() + (6 - end.getDay()));

  const weeks: string[][] = [];
  const cur = new Date(start);

  while (cur <= end) {
    const week: string[] = [];
    for (let d = 0; d < 7; d++) {
      week.push(toLocalDateKey(cur));
      cur.setDate(cur.getDate() + 1);
    }
    weeks.push(week);
  }
  return { weeks, todayKey };
}

export default function Heatmap({ data }: Props) {
  const { weeks, todayKey } = useMemo(() => buildWeeks(), []);
  const [tooltip, setTooltip] = useState<{ text: string; x: number; y: number } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [cellSize, setCellSize] = useState(5);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const updateSize = () => {
      const w = el.clientWidth;
      if (w <= 0) return;
      const fitted = Math.floor((w - (weeks.length - 1) * GAP) / weeks.length);
      setCellSize(Math.max(MIN_CELL, Math.min(10, fitted)));
    };
    updateSize();
    const ro = new ResizeObserver(updateSize);
    ro.observe(el);
    return () => ro.disconnect();
  }, [weeks.length]);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollLeft = el.scrollWidth;
    }
  }, [cellSize, data, weeks.length]);

  const step = cellSize + GAP;

  // Month label above the first column where a new month starts; skip if it would overlap
  const monthLabels: { label: string; col: number }[] = [];
  let lastMonth = -1;
  let lastLeft = -999;
  weeks.forEach((week, col) => {
    const firstNonFuture = week.find((d) => d <= todayKey);
    if (!firstNonFuture) return;
    const m = new Date(firstNonFuture + "T00:00:00").getMonth();
    if (m !== lastMonth) {
      const left = col * step;
      if (left - lastLeft >= 24) {
        monthLabels.push({ label: MONTHS[m], col });
        lastLeft = left;
      }
      lastMonth = m;
    }
  });

  return (
    <div>
      <div ref={scrollRef} className="heatmap-scroll">
        <div style={{ width: `${weeks.length * step - GAP}px` }}>
          {/* Month labels row */}
          <div style={{ position: "relative", height: "12px", marginBottom: "3px" }}>
            {monthLabels.map(({ label, col }) => (
              <span
                key={`${label}-${col}`}
                style={{
                  position: "absolute",
                  left: `${col * step}px`,
                  fontSize: "8px",
                  color: "var(--t3)",
                  letterSpacing: "0.03em",
                  whiteSpace: "nowrap",
                }}
              >
                {label}
              </span>
            ))}
          </div>

          {/* Grid — columns are weeks (Sun→Sat rows) */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${weeks.length}, ${cellSize}px)`,
              gridTemplateRows: `repeat(7, ${cellSize}px)`,
              gap: `${GAP}px`,
              width: "fit-content",
            }}
          >
            {weeks.map((week, wi) =>
              week.map((date, di) => {
                const isFuture = date > todayKey;
                const count = isFuture ? 0 : (data[date] ?? 0);
                const level = getLevel(count);
                return (
                  <div
                    key={date}
                    className="hm-cell"
                    data-level={level}
                    style={{
                      width: `${cellSize}px`,
                      height: `${cellSize}px`,
                      gridColumn: wi + 1,
                      gridRow: di + 1,
                      visibility: isFuture ? "hidden" : "visible",
                    }}
                    onMouseEnter={(e) => {
                      if (isFuture) return;
                      const d = new Date(date + "T00:00:00");
                      const formatted = d.toLocaleDateString("en-IN", {
                        weekday: "short", month: "short", day: "numeric",
                      });
                      const label = count === 0
                        ? `${formatted} · No activity`
                        : `${formatted} · ${count} submission${count !== 1 ? "s" : ""}`;
                      setTooltip({ text: label, x: e.clientX + 12, y: e.clientY - 36 });
                    }}
                    onMouseLeave={() => setTooltip(null)}
                  />
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="heatmap-footer">
        <div />
        <div className="hm-legend">
          <span className="hm-legend-label">Less</span>
          {([0, 1, 2, 3, 4] as const).map((l) => (
            <div
              key={l}
              className="hm-legend-cell"
              style={{ background: `var(--h${l})` }}
            />
          ))}
          <span className="hm-legend-label">More</span>
        </div>
      </div>

      {tooltip && (
        <div className="hm-tooltip" style={{ left: tooltip.x, top: tooltip.y }}>
          {tooltip.text}
        </div>
      )}
    </div>
  );
}
