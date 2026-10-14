export type HabitKind = "check" | "count" | "timed";
export type SessionStatus = "running" | "paused" | "completed";
export type DayTone = "full" | "partial" | "none" | "off" | "future";

export type Habit = {
  id: number;
  name: string;
  kind: HabitKind;
  targetCount: number | null;
  unit: string | null;
  targetMinutes: number | null;
  weekdays: string;
  archived: boolean;
  reminderMinutes: number | null;
  sortOrder: number;
};

export type Log = {
  id: number;
  habitId: number;
  day: string;
  value: number;
  note: string | null;
};

export type Session = {
  id: number;
  habitId: number;
  topic: string;
  day: string;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number;
  accumulatedSeconds: number;
  resumedAt: string | null;
  status: SessionStatus;
  notes: string | null;
};

export type TrackerPayload = {
  today: string;
  from: string;
  serverNow: string;
  habits: Habit[];
  logs: Log[];
  sessions: Session[];
};

export type ExportPayload = {
  exportedAt: string;
  habits: Habit[];
  logs: Log[];
  sessions: Session[];
};

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function dayInTimeZone(timeZone: string, date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const y = parts.find((p) => p.type === "year")?.value ?? "1970";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  const d = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${y}-${m}-${d}`;
}

export function localDay(date = new Date()): string {
  return dayInTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone, date);
}

export function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

export function weekdayIndex(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function isScheduled(weekdays: string, day: string): boolean {
  return weekdays.split(",").includes(String(weekdayIndex(day)));
}

export function scheduleLabel(weekdays: string): string {
  const days = [...new Set(weekdays.split(",").filter(Boolean))].sort();
  if (days.length === 7) return "Every day";
  if (days.join(",") === "1,2,3,4,5") return "Weekdays";
  if (days.join(",") === "0,6") return "Weekends";
  return days.map((d) => SHORT[Number(d)] ?? d).join(", ");
}

export function formatLong(iso: string): { weekday: string; dayMonth: string } {
  const month = Number(iso.slice(5, 7));
  const day = Number(iso.slice(8, 10));
  return {
    weekday: WEEKDAYS[weekdayIndex(iso)] ?? "",
    dayMonth: `${day} ${MONTHS[month - 1] ?? ""}`,
  };
}

export function monthTitle(year: number, monthIndex: number): string {
  return `${MONTHS[monthIndex] ?? ""} ${year}`;
}

export function shortWeekday(iso: string): string {
  return SHORT[weekdayIndex(iso)] ?? "";
}

export function monthGrid(year: number, monthIndex: number): { day: string; inMonth: boolean }[] {
  const first = `${year}-${String(monthIndex + 1).padStart(2, "0")}-01`;
  const start = addDays(first, -weekdayIndex(first));
  const cells: { day: string; inMonth: boolean }[] = [];
  const month = String(monthIndex + 1).padStart(2, "0");
  const yearText = String(year);
  for (let i = 0; i < 42; i += 1) {
    const day = addDays(start, i);
    cells.push({
      day,
      inMonth: day.slice(0, 4) === yearText && day.slice(5, 7) === month,
    });
  }
  if (cells.slice(-7).every((cell) => !cell.inMonth)) cells.splice(-7);
  return cells;
}

export function formatClock(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(d);
}

export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

export function formatMinutes(totalSeconds: number): string {
  const m = Math.max(0, Math.round(totalSeconds / 60));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem ? `${h}h ${rem}m` : `${h}h`;
}

export function formatReminder(minutes: number | null): string {
  if (minutes == null) return "";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function liveSeconds(
  session: Pick<Session, "status" | "accumulatedSeconds" | "resumedAt" | "durationSeconds">,
  nowMs: number,
): number {
  if (session.status === "running" && session.resumedAt) {
    const t = new Date(session.resumedAt).getTime();
    if (!Number.isNaN(t)) {
      return session.accumulatedSeconds + Math.max(0, Math.floor((nowMs - t) / 1000));
    }
  }
  return session.durationSeconds;
}

export function progressFor(
  habit: Habit,
  day: string,
  logs: readonly Log[],
  sessions: readonly Session[],
  nowMs: number,
): { value: number; target: number; ratio: number; done: boolean } {
  if (habit.kind === "check") {
    const value = logs.find((l) => l.habitId === habit.id && l.day === day)?.value ?? 0;
    const done = value >= 1;
    return { value: done ? 1 : 0, target: 1, ratio: done ? 1 : 0, done };
  }
  if (habit.kind === "count") {
    const value = logs.find((l) => l.habitId === habit.id && l.day === day)?.value ?? 0;
    const target = Math.max(1, habit.targetCount ?? 1);
    return { value, target, ratio: Math.min(1, value / target), done: value >= target };
  }
  const seconds = sessions
    .filter((s) => s.habitId === habit.id && s.day === day)
    .reduce((sum, s) => sum + liveSeconds(s, nowMs), 0);
  const target = Math.max(1, habit.targetMinutes ?? 1) * 60;
  return {
    value: seconds,
    target,
    ratio: Math.min(1, seconds / target),
    done: seconds >= target,
  };
}

export function dayTone(
  habits: readonly Habit[],
  day: string,
  today: string,
  logs: readonly Log[],
  sessions: readonly Session[],
  nowMs: number,
): DayTone {
  if (day > today) return "future";
  const scheduled = habits.filter((h) => !h.archived && isScheduled(h.weekdays, day));
  if (scheduled.length === 0) return "off";
  let done = 0;
  let touched = 0;
  for (const habit of scheduled) {
    const progress = progressFor(habit, day, logs, sessions, nowMs);
    if (progress.done) done += 1;
    if (progress.value > 0) touched += 1;
  }
  if (done === scheduled.length) return "full";
  if (touched > 0) return "partial";
  return "none";
}

export function habitsOnDay(
  habits: readonly Habit[],
  day: string,
  logs: readonly Log[],
  sessions: readonly Session[],
): Habit[] {
  const ids = new Set<number>();
  for (const habit of habits) {
    if (!habit.archived && isScheduled(habit.weekdays, day)) ids.add(habit.id);
  }
  for (const log of logs) {
    if (log.day === day && log.value > 0) ids.add(log.habitId);
  }
  for (const session of sessions) {
    if (session.day === day) ids.add(session.habitId);
  }
  return habits.filter((h) => ids.has(h.id) && !h.archived);
}

/** Today stays open until it is completed, so an unfinished today does not break a streak. */
export function computeStreaks(
  habit: Habit,
  logs: readonly Log[],
  sessions: readonly Session[],
  today: string,
  nowMs: number,
  lookbackDays = 400,
): { current: number; best: number; rateDone: number; rateScheduled: number } {
  const earliest = addDays(today, -lookbackDays);
  const done = (day: string) => progressFor(habit, day, logs, sessions, nowMs).done;

  let current = 0;
  let cursor = today;
  if (!isScheduled(habit.weekdays, cursor) || !done(cursor)) cursor = addDays(cursor, -1);
  for (let i = 0; i < lookbackDays + 2; i += 1) {
    if (cursor < earliest) break;
    if (!isScheduled(habit.weekdays, cursor)) {
      cursor = addDays(cursor, -1);
      continue;
    }
    if (!done(cursor)) break;
    current += 1;
    cursor = addDays(cursor, -1);
  }

  let best = 0;
  let run = 0;
  cursor = earliest;
  while (cursor <= today) {
    if (cursor === today && isScheduled(habit.weekdays, cursor) && !done(cursor)) break;
    if (!isScheduled(habit.weekdays, cursor)) {
      cursor = addDays(cursor, 1);
      continue;
    }
    if (done(cursor)) {
      run += 1;
      if (run > best) best = run;
    } else run = 0;
    cursor = addDays(cursor, 1);
  }

  let rateDone = 0;
  let rateScheduled = 0;
  cursor = today;
  for (let i = 0; i < lookbackDays + 2 && rateScheduled < 30; i += 1) {
    if (cursor < earliest) break;
    if (isScheduled(habit.weekdays, cursor)) {
      rateScheduled += 1;
      if (done(cursor)) rateDone += 1;
    }
    cursor = addDays(cursor, -1);
  }

  return { current, best: Math.max(best, current), rateDone, rateScheduled };
}

export function recentTopics(sessions: readonly Session[], habitId: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (let i = sessions.length - 1; i >= 0; i -= 1) {
    const session = sessions[i];
    if (!session || session.habitId !== habitId || seen.has(session.topic)) continue;
    seen.add(session.topic);
    out.push(session.topic);
    if (out.length === 4) break;
  }
  return out;
}

export function weekBars(
  habits: readonly Habit[],
  logs: readonly Log[],
  sessions: readonly Session[],
  today: string,
  nowMs: number,
): { day: string; label: string; done: number; total: number; pct: number }[] {
  const bars = [];
  for (let i = 6; i >= 0; i -= 1) {
    const day = addDays(today, -i);
    const scheduled = habits.filter((h) => !h.archived && isScheduled(h.weekdays, day));
    let done = 0;
    for (const habit of scheduled) {
      if (progressFor(habit, day, logs, sessions, nowMs).done) done += 1;
    }
    const total = scheduled.length;
    bars.push({
      day,
      label: shortWeekday(day),
      done,
      total,
      pct: total === 0 ? 0 : Math.round((done / total) * 100),
    });
  }
  return bars;
}

export function topicTotals(
  sessions: readonly Session[],
  from: string,
  to: string,
  nowMs: number,
): { topic: string; seconds: number }[] {
  const map = new Map<string, number>();
  for (const session of sessions) {
    if (session.day < from || session.day > to) continue;
    map.set(session.topic, (map.get(session.topic) ?? 0) + liveSeconds(session, nowMs));
  }
  return [...map.entries()]
    .map(([topic, seconds]) => ({ topic, seconds }))
    .sort((a, b) => b.seconds - a.seconds)
    .slice(0, 6);
}

export function heatmapWeeks(endDay: string, weeks: number): string[][] {
  const start = addDays(endDay, -weekdayIndex(endDay) - (weeks - 1) * 7);
  const result: string[][] = [];
  let cursor = start;
  for (let w = 0; w < weeks; w += 1) {
    const week: string[] = [];
    for (let d = 0; d < 7; d += 1) {
      week.push(cursor);
      cursor = addDays(cursor, 1);
    }
    result.push(week);
  }
  return result;
}

export function csvEscape(value: unknown): string {
  const s = value == null ? "" : String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function exportCsv(data: ExportPayload): string {
  const names = new Map(data.habits.map((h) => [h.id, h.name]));
  const lines = [
    ["record", "date", "habit", "detail", "value", "unit", "notes"].join(","),
  ];
  for (const log of data.logs) {
    const habit = data.habits.find((h) => h.id === log.habitId);
    lines.push(
      [
        "log",
        log.day,
        names.get(log.habitId) ?? "",
        habit?.kind ?? "",
        log.value,
        habit?.unit ?? "",
        log.note ?? "",
      ]
        .map(csvEscape)
        .join(","),
    );
  }
  for (const session of data.sessions) {
    lines.push(
      [
        "session",
        session.day,
        names.get(session.habitId) ?? "",
        session.topic,
        session.durationSeconds,
        "seconds",
        session.notes ?? "",
      ]
        .map(csvEscape)
        .join(","),
    );
  }
  return lines.join("\n");
}

export function downloadText(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
