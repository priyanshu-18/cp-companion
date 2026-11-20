import { useState, useEffect } from "react";

/** Returns a live countdown string "Xd Hh Mm Ss" until targetISO */
export function useCountdown(targetISO: string): string {
  const [display, setDisplay] = useState("");

  useEffect(() => {
    function update() {
      const diff = new Date(targetISO).getTime() - Date.now();
      if (diff <= 0) {
        setDisplay("Started");
        return;
      }
      const days = Math.floor(diff / 86_400_000);
      const hrs  = Math.floor((diff % 86_400_000) / 3_600_000);
      const mins = Math.floor((diff % 3_600_000) / 60_000);
      const secs = Math.floor((diff % 60_000) / 1_000);

      if (days > 0) {
        setDisplay(`${days}d ${hrs}h ${mins}m`);
      } else if (hrs > 0) {
        setDisplay(`${hrs}h ${mins}m ${secs}s`);
      } else {
        setDisplay(`${mins}m ${secs}s`);
      }
    }

    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [targetISO]);

  return display;
}
