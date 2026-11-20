import type { Contest } from "../types";
import { useCountdown } from "../hooks/useCountdown";

interface Props {
  contest: Contest;
}

export default function ContestCard({ contest }: Props) {
  const countdown = useCountdown(contest.startTime);

  const start = new Date(contest.startTime);
  const dateStr = start.toLocaleDateString("en-IN", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

  const regLabels: Record<Contest["registrationStatus"], string> = {
    registered:     "Registered ✓",
    not_registered: "Not Registered",
    open:           "Reg. Open",
    closed:         "Reg. Closed",
    unknown:        "Unknown",
  };

  const regClass = contest.registrationStatus === "not_registered"
    ? "not_registered"
    : contest.registrationStatus;

  return (
    <div className="contest-row">
      {/* Top row: platform chip + reg status */}
      <div className="contest-top">
        <span className={`platform-chip ${{ leetcode: "lc", codechef: "cc", codeforces: "cf" }[contest.platform]}`}>
          {{ leetcode: "LeetCode", codechef: "CodeChef", codeforces: "Codeforces" }[contest.platform]}
        </span>
        <span className={`reg-chip ${regClass}`}>
          {regLabels[contest.registrationStatus]}
        </span>
      </div>

      {/* Contest name */}
      <div className="contest-name-text">{contest.name}</div>

      {/* Bottom row: countdown + date + link */}
      <div className="contest-bottom">
        <div>
          <div className="contest-countdown-val">{countdown}</div>
          <div className="contest-when">{dateStr} · {contest.durationMinutes} min</div>
        </div>
        <a
          className="contest-open-link"
          href={contest.url}
          target="_blank"
          rel="noreferrer"
        >
          Open ↗
        </a>
      </div>
    </div>
  );
}
