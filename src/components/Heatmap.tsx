import { useState, useMemo } from "react";

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

function buildWeeks(): string[][] {
  const today = new Date();
  today.setHours(23, 59, 59, 0);

  // Go back 364 days, then rewind to Sunday
  const start = new Date(today);
  start.setDate(start.getDate() - 364);
  start.setDate(start.getDate() - start.getDay()); // Sunday

  const weeks: string[][] = [];
  let cur = new Date(start);

  while (cur <= today) {
    const week: string[] = [];
    for (let d = 0; d < 7; d++) {
      week.push(cur.toISOString().split("T")[0]);
      cur.setDate(cur.getDate() + 1);
    }
    weeks.push(week);
  }
  return weeks;
}

export default function Heatmap({ data }: Props) {
  const weeks = useMemo(() => buildWeeks(), []);
  const [tooltip, setTooltip] = useState<{ text: string; x: number; y: number } | null>(null);

  // Build month labels — show label at first week of each month
  const monthLabels: { label: string; col: number }[] = [];
  weeks.forEach((week, i) => {
    const firstDay = new Date(week[0]);
    if (firstDay.getDate() <= 7) {
      monthLabels.push({ label: MONTHS[firstDay.getMonth()], col: i });
    }
  });

  return (
    <div>
      {/* Month labels row */}
      <div style={{ position: "relative", height: "12px", marginBottom: "3px" }}>
        {monthLabels.map(({ label, col }) => (
          <span
            key={`${label}-${col}`}
            style={{
              position: "absolute",
              left: `${col * 7}px`, // 5px cell + 2px gap
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
      <div className="heatmap-scroll">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${weeks.length}, 5px)`,
            gridTemplateRows: "repeat(7, 5px)",
            gap: "2px",
            width: "fit-content",
          }}
        >
          {weeks.map((week, wi) =>
            week.map((date, di) => {
              const count = data[date] ?? 0;
              const level = getLevel(count);
              const isFuture = date > new Date().toISOString().split("T")[0];
              return (
                <div
                  key={date}
                  className="hm-cell"
                  data-level={isFuture ? 0 : level}
                  style={{
                    gridColumn: wi + 1,
                    gridRow: di + 1,
                    opacity: isFuture ? 0.3 : 1,
                  }}
                  onMouseEnter={(e) => {
                    if (isFuture) return;
                    const d = new Date(date);
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

      {/* Legend */}
      <div className="heatmap-footer">
        <div /> {/* spacer */}
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
