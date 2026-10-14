/**
 * Local replacement for the original server functions. Same names and call
 * shape (`fn({ data })`), but everything runs against the on-device store.
 */
import { addDays, localDay, type ExportPayload, type Habit, type HabitKind, type Log, type Session, type TrackerPayload } from "@/lib/domain";
import { db, persist, replaceState, type DbState } from "@/lib/store";

type HabitInput = {
  name: string;
  targetCount: number | null;
  unit: string | null;
  targetMinutes: number | null;
  weekdays: string;
  reminderMinutes: number | null;
};

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const ok = { ok: true as const };

function cleanName(name: string): string {
  const trimmed = (name ?? "").trim();
  if (!trimmed) throw new Error("Name is required");
  if (trimmed.length > 80) throw new Error("Name is too long");
  return trimmed;
}

function normalizeWeekdays(raw: string): string {
  const days = [...new Set(String(raw).split(",").filter((d) => /^[0-6]$/.test(d)))].sort();
  if (days.length === 0) throw new Error("Pick at least one day");
  return days.join(",");
}

function checkDay(day: string) {
  if (!DAY_RE.test(day)) throw new Error("Invalid day");
}

function targetsFor(kind: HabitKind, input: HabitInput) {
  if (kind === "check") return { targetCount: null, unit: null, targetMinutes: null };
  if (kind === "count") {
    if (input.targetCount == null || input.targetCount <= 0) throw new Error("Set a target count");
    return { targetCount: Math.round(input.targetCount), unit: input.unit?.trim() ? input.unit.trim() : "times", targetMinutes: null };
  }
  if (input.targetMinutes == null || input.targetMinutes <= 0) throw new Error("Set a time goal");
  return { targetCount: null, unit: null, targetMinutes: Math.round(input.targetMinutes) };
}

function findHabit(id: number): Habit {
  const habit = db().habits.find((h) => h.id === id);
  if (!habit) throw new Error("Habit not found");
  return habit;
}

function findSession(id: number): Session {
  const session = db().sessions.find((s) => s.id === id);
  if (!session) throw new Error("Session not found");
  return session;
}

function secondsSince(iso: string | null): number {
  if (!iso) return 0;
  return Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 1000));
}

function pauseSession_(session: Session) {
  const total = session.accumulatedSeconds + secondsSince(session.resumedAt);
  session.accumulatedSeconds = total;
  session.durationSeconds = total;
  session.resumedAt = null;
  session.status = "paused";
}

function pauseAllRunning(exceptId?: number) {
  for (const s of db().sessions) {
    if (s.status === "running" && s.resumedAt && s.id !== exceptId) pauseSession_(s);
  }
}

function upsertLog(habitId: number, day: string, update: (log: Log) => void, initial: Partial<Log> = {}) {
  const state = db();
  let log = state.logs.find((l) => l.habitId === habitId && l.day === day);
  if (!log) {
    log = { id: state.nextId.log++, habitId, day, value: 0, note: null, ...initial };
    state.logs.push(log);
  }
  update(log);
}

/* ----------------------------- reads ----------------------------- */

export async function loadTracker(): Promise<TrackerPayload> {
  const state = db();
  const today = localDay();
  const from = addDays(today, -400);
  return structuredClone({
    today,
    from,
    serverNow: new Date().toISOString(),
    habits: [...state.habits].sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id),
    logs: state.logs.filter((l) => l.day >= from && l.day <= today).sort((a, b) => a.day.localeCompare(b.day) || a.id - b.id),
    sessions: state.sessions
      .filter((s) => (s.day >= from && s.day <= today) || s.status !== "completed")
      .sort((a, b) => a.startedAt.localeCompare(b.startedAt) || a.id - b.id),
  });
}

export async function exportData(): Promise<ExportPayload> {
  const state = db();
  return structuredClone({
    exportedAt: new Date().toISOString(),
    habits: [...state.habits].sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id),
    logs: [...state.logs].sort((a, b) => a.day.localeCompare(b.day) || a.id - b.id),
    sessions: [...state.sessions].sort((a, b) => a.startedAt.localeCompare(b.startedAt) || a.id - b.id),
  });
}

/* ----------------------------- habits ----------------------------- */

export async function createHabit({ data }: { data: HabitInput & { kind: HabitKind } }) {
  const name = cleanName(data.name);
  const weekdays = normalizeWeekdays(data.weekdays);
  const targets = targetsFor(data.kind, data);
  const state = db();
  const next = state.habits.reduce((max, h) => Math.max(max, h.sortOrder), -1) + 1;
  state.habits.push({
    id: state.nextId.habit++,
    name,
    kind: data.kind,
    ...targets,
    weekdays,
    archived: false,
    reminderMinutes: data.reminderMinutes,
    sortOrder: next,
  });
  persist();
  return ok;
}

export async function updateHabit({ data }: { data: HabitInput & { id: number } }) {
  const habit = findHabit(data.id);
  const targets = targetsFor(habit.kind, data);
  habit.name = cleanName(data.name);
  habit.targetCount = targets.targetCount;
  habit.unit = targets.unit;
  habit.targetMinutes = targets.targetMinutes;
  habit.weekdays = normalizeWeekdays(data.weekdays);
  habit.reminderMinutes = data.reminderMinutes;
  persist();
  return ok;
}

export async function setArchived({ data }: { data: { id: number; archived: boolean } }) {
  findHabit(data.id).archived = data.archived;
  persist();
  return ok;
}

export async function deleteHabit({ data }: { data: { id: number } }) {
  findHabit(data.id);
  const state = db();
  state.habits = state.habits.filter((h) => h.id !== data.id);
  state.logs = state.logs.filter((l) => l.habitId !== data.id);
  state.sessions = state.sessions.filter((s) => s.habitId !== data.id);
  persist();
  return ok;
}

/* ------------------------- check-offs & counts ------------------------- */

export async function toggleCheck({ data }: { data: { habitId: number; day: string } }) {
  checkDay(data.day);
  if (findHabit(data.habitId).kind !== "check") throw new Error("Not a check-off habit");
  upsertLog(data.habitId, data.day, (log) => {
    log.value = log.value >= 1 ? 0 : 1;
  }, { value: 0 });
  persist();
  return ok;
}

export async function incrementCount({ data }: { data: { habitId: number; day: string; delta: number } }) {
  checkDay(data.day);
  if (findHabit(data.habitId).kind !== "count") throw new Error("Not a count habit");
  upsertLog(data.habitId, data.day, (log) => {
    log.value = Math.max(0, log.value + data.delta);
  });
  persist();
  return ok;
}

export async function setCount({ data }: { data: { habitId: number; day: string; value: number } }) {
  checkDay(data.day);
  if (findHabit(data.habitId).kind !== "count") throw new Error("Not a count habit");
  upsertLog(data.habitId, data.day, (log) => {
    log.value = Math.max(0, Math.min(100000, Math.round(data.value)));
  });
  persist();
  return ok;
}

export async function setLogNote({ data }: { data: { habitId: number; day: string; note: string } }) {
  checkDay(data.day);
  findHabit(data.habitId);
  const note = data.note.trim() ? data.note.trim().slice(0, 1000) : null;
  upsertLog(data.habitId, data.day, (log) => {
    log.note = note;
  });
  persist();
  return ok;
}

/* ----------------------------- sessions ----------------------------- */

export async function startSession({ data }: { data: { habitId: number; day: string; topic: string } }) {
  checkDay(data.day);
  const topic = data.topic.trim();
  if (!topic) throw new Error("Name this session");
  const habit = findHabit(data.habitId);
  if (habit.kind !== "timed") throw new Error("Not a timed habit");
  if (habit.archived) throw new Error("This habit is archived");
  pauseAllRunning();
  const state = db();
  const now = new Date().toISOString();
  state.sessions.push({
    id: state.nextId.session++,
    habitId: data.habitId,
    topic: topic.slice(0, 80),
    day: data.day,
    startedAt: now,
    endedAt: null,
    durationSeconds: 0,
    accumulatedSeconds: 0,
    resumedAt: now,
    status: "running",
    notes: null,
  });
  persist();
  return ok;
}

export async function pauseSession({ data }: { data: { id: number } }) {
  const session = db().sessions.find((s) => s.id === data.id);
  if (!session || session.status !== "running" || !session.resumedAt) throw new Error("That session is not running");
  pauseSession_(session);
  persist();
  return ok;
}

export async function resumeSession({ data }: { data: { id: number } }) {
  const session = db().sessions.find((s) => s.id === data.id);
  if (!session || session.status !== "paused") throw new Error("That session is not paused");
  pauseAllRunning(data.id);
  session.status = "running";
  session.resumedAt = new Date().toISOString();
  persist();
  return ok;
}

export async function stopSession({ data }: { data: { id: number; notes?: string } }) {
  const session = db().sessions.find((s) => s.id === data.id);
  if (!session || session.status === "completed") throw new Error("That session is already saved");
  if (session.status === "running" && session.resumedAt) {
    const total = session.accumulatedSeconds + secondsSince(session.resumedAt);
    session.accumulatedSeconds = total;
    session.durationSeconds = total;
  }
  session.resumedAt = null;
  session.endedAt = session.endedAt ?? new Date().toISOString();
  session.status = "completed";
  if (data.notes !== undefined) session.notes = data.notes.trim() ? data.notes.trim().slice(0, 1000) : null;
  persist();
  return ok;
}

export async function updateSession({ data }: { data: { id: number; topic: string; notes: string; day: string; durationSeconds: number } }) {
  checkDay(data.day);
  const topic = data.topic.trim();
  if (!topic) throw new Error("Name this session");
  const session = findSession(data.id);
  session.topic = topic.slice(0, 80);
  session.notes = data.notes.trim() ? data.notes.trim().slice(0, 1000) : null;
  session.day = data.day;
  if (session.status !== "running") {
    const seconds = Math.max(0, Math.min(60 * 60 * 72, Math.round(data.durationSeconds)));
    session.durationSeconds = seconds;
    session.accumulatedSeconds = seconds;
  }
  persist();
  return ok;
}

export async function deleteSession({ data }: { data: { id: number } }) {
  findSession(data.id);
  const state = db();
  state.sessions = state.sessions.filter((s) => s.id !== data.id);
  persist();
  return ok;
}

export async function logSession({
  data,
}: {
  data: { habitId: number; day: string; topic: string; durationSeconds: number; notes: string };
}) {
  checkDay(data.day);
  const topic = data.topic.trim();
  if (!topic) throw new Error("Name this session");
  if (findHabit(data.habitId).kind !== "timed") throw new Error("Not a timed habit");
  const seconds = Math.max(0, Math.min(60 * 60 * 72, Math.round(data.durationSeconds)));
  const [y, m, d] = data.day.split("-").map(Number);
  const start = Date.UTC(y, m - 1, d, 12, 0);
  const state = db();
  state.sessions.push({
    id: state.nextId.session++,
    habitId: data.habitId,
    topic: topic.slice(0, 80),
    day: data.day,
    startedAt: new Date(start).toISOString(),
    endedAt: new Date(start + seconds * 1000).toISOString(),
    durationSeconds: seconds,
    accumulatedSeconds: seconds,
    resumedAt: null,
    status: "completed",
    notes: data.notes.trim() ? data.notes.trim().slice(0, 1000) : null,
  });
  persist();
  return ok;
}

/* ----------------------------- backup restore ----------------------------- */

/** Replaces everything on the device with a backup produced by Export. */
export function importBackup(raw: unknown) {
  const p = raw as Partial<ExportPayload> | null;
  if (!p || !Array.isArray(p.habits) || !Array.isArray(p.logs) || !Array.isArray(p.sessions)) {
    throw new Error("That file is not a Cadence backup");
  }
  const habits = p.habits as Habit[];
  const ids = new Set(habits.map((h) => h.id));
  const logs = (p.logs as Log[]).filter((l) => ids.has(l.habitId));
  const sessions = (p.sessions as Session[]).filter((s) => ids.has(s.habitId));
  const max = (xs: { id: number }[]) => xs.reduce((m, x) => Math.max(m, Number(x.id) || 0), 0) + 1;
  const next: DbState = {
    version: 1,
    nextId: { habit: max(habits), log: max(logs), session: max(sessions) },
    habits,
    logs,
    sessions,
  };
  replaceState(next);
}
