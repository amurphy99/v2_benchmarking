/* Helpers for the Chat List page.
--------------------------------------------------------------------------------
- formatTimeAgo : single-unit "X ago" string for the per-card pill
- groupByRecency: groups sessions by day for the past week, then by week
*/
import { ChatSession } from "@/api";

// Single-unit ago: "just now", "5m ago", "3h ago", "2d ago", "1w ago", "3mo ago"
export function formatTimeAgo(d: Date | null | undefined): string {
    if (!d) return "—";
    const elapsedMs = Date.now() - d.getTime();
    if (elapsedMs < 0) return "just now";

    const sec  = Math.floor(elapsedMs / 1_000);
    const min  = Math.floor(sec / 60);
    const hr   = Math.floor(min / 60);
    const day  = Math.floor(hr  / 24);
    const wk   = Math.floor(day / 7 );
    const mo   = Math.floor(day / 30);

    if (sec <  10)  return  "just now";
    if (sec <  60)  return `${sec}s ago`;
    if (min <  60)  return `${min}m ago`;
    if (hr  <  24)  return `${hr}h ago`;
    if (day <   7)  return `${day}d ago`;
    if (wk  <   4)  return `${wk}w ago`;
    return `${mo}mo ago`;
}

// --------------------------------------------------------------------------------
// Grouping: day-by-day for past 7 days, then by week.
// --------------------------------------------------------------------------------
export interface SessionGroup {
    key      : string;           // unique key
    label    : string;           // displayed header text
    sessions : ChatSession[];    // sessions in the group, sorted newest-first
}

function startOfDay(d: Date): Date {
    const out = new Date(d);
    out.setHours(0, 0, 0, 0);
    return out;
}

function daysBetween(a: Date, b: Date): number {
    const ms = startOfDay(a).getTime() - startOfDay(b).getTime();
    return Math.round(ms / (1000 * 60 * 60 * 24));
}

function dayLabel(date: Date, today: Date): string {
    const days = daysBetween(today, date);
    if (days === 0) return "Today";
    if (days === 1) return "Yesterday";
    return date.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
}

function weekRangeLabel(start: Date, end: Date): string {
    const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    return `Week of ${fmt(start)} – ${fmt(end)}`;
}

// Returns one group per day for the past 7 days that contained at least one
// session, then one group per week beyond that. Empty groups are omitted.
// Sessions without start_ts are placed in a trailing "Earlier" group.
export function groupByRecency(sessions: ChatSession[]): SessionGroup[] {
    const today = startOfDay(new Date());

    interface Bucket { label: string; sessions: ChatSession[]; sortKey: number; }
    const byKey = new Map<string, Bucket>();

    for (const s of sessions) {
        if (!s.start_ts) {
            const k = "earlier";
            if (!byKey.has(k)) byKey.set(k, { label: "Earlier", sessions: [], sortKey: -Infinity });
            byKey.get(k)!.sessions.push(s);
            continue;
        }

        const d         = new Date(s.start_ts);
        const dayOffset = daysBetween(today, d);

        if (dayOffset >= 0 && dayOffset < 7) {
            const k = `day-${dayOffset}`;
            if (!byKey.has(k)) {
                byKey.set(k, { label: dayLabel(d, today), sessions: [], sortKey: -dayOffset });
            }
            byKey.get(k)!.sessions.push(s);
        } else {
            // Group by ISO-week (start = Monday of that week).
            const dayOfWeek = (d.getDay() + 6) % 7; // 0 = Mon
            const weekStart = startOfDay(new Date(d.getTime() - dayOfWeek * 24 * 60 * 60 * 1000));
            const weekEnd   = new Date(weekStart.getTime() + 6 * 24 * 60 * 60 * 1000);
            const k         = `week-${weekStart.toISOString().slice(0, 10)}`;
            if (!byKey.has(k)) {
                byKey.set(k, { label: weekRangeLabel(weekStart, weekEnd), sessions: [], sortKey: weekStart.getTime() / -1e7 });
            }
            byKey.get(k)!.sessions.push(s);
        }
    }

    const groups = Array.from(byKey.entries()).map(([key, b]) => ({
        key,
        label   : b.label,
        sessions: [...b.sessions].sort((a, x) => {
            const ta = a.start_ts ? new Date(a.start_ts).getTime() : 0;
            const tx = x.start_ts ? new Date(x.start_ts).getTime() : 0;
            return tx - ta;
        }),
        sortKey: b.sortKey,
    }));

    return groups.sort((a, b) => b.sortKey - a.sortKey).map(({ key, label, sessions }) => ({ key, label, sessions }));
}
