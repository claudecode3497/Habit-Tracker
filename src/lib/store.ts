/**
 * On-device database. The whole tracker lives in memory and is written through
 * to IndexedDB (localStorage as a fallback) after every change, so data
 * survives app restarts and works fully offline.
 */
import { addDays, localDay, weekdayIndex, type Habit, type Log, type Session } from "@/lib/domain";

export type DbState = {
  version: 1;
  nextId: { habit: number; log: number; session: number };
  habits: Habit[];
  logs: Log[];
  sessions: Session[];
};

const DB_NAME = "cadence";
const STORE = "kv";
const KEY = "state";
const LS_KEY = "cadence-state-v1";

let state: DbState | null = null;
let writeChain: Promise<void> = Promise.resolve();

function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(): Promise<DbState | null> {
  const db = await openIdb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, "readonly").objectStore(STORE).get(KEY);
    req.onsuccess = () => resolve((req.result as DbState | undefined) ?? null);
    req.onerror = () => reject(req.error);
  });
}

async function idbPut(value: DbState): Promise<void> {
  const db = await openIdb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function lsGet(): DbState | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as DbState) : null;
  } catch {
    return null;
  }
}

function lsPut(value: DbState) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(value));
  } catch {
    /* storage full or blocked */
  }
}

function valid(value: unknown): value is DbState {
  const v = value as DbState | null;
  return !!v && Array.isArray(v.habits) && Array.isArray(v.logs) && Array.isArray(v.sessions) && !!v.nextId;
}

export async function initStore(): Promise<void> {
  if (state) return;
  let loaded: DbState | null = null;
  try {
    loaded = await idbGet();
  } catch {
    /* fall through to localStorage */
  }
  if (!valid(loaded)) loaded = lsGet();
  state = valid(loaded) ? loaded : emptyState();
  if (!valid(loaded)) persist();
  try {
    await navigator.storage?.persist?.();
  } catch {
    /* best effort */
  }
}

export function db(): DbState {
  if (!state) throw new Error("Database is not ready");
  return state;
}

export function persist() {
  const snapshot = structuredClone(db());
  writeChain = writeChain
    .then(() => idbPut(snapshot))
    .catch(() => lsPut(snapshot));
}

/** Resolves once every queued write has reached storage. */
export function flush(): Promise<void> {
  return writeChain;
}

export function replaceState(next: DbState) {
  state = next;
  persist();
}

export function emptyState(): DbState {
  return { version: 1, nextId: { habit: 1, log: 1, session: 1 }, habits: [], logs: [], sessions: [] };
}

export function resetToEmpty() {
  replaceState(emptyState());
}

export function resetToSample() {
  replaceState(seed());
}

/* ------------------------------------------------------------------ */
/* Sample data (same habits and history the app was designed with)     */
/* ------------------------------------------------------------------ */

function dayOfYear(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  const start = Date.UTC(y, 0, 0);
  return Math.round((Date.UTC(y, m - 1, d) - start) / 86400000);
}

function atUtc(day: string, hh: number, mm: number, addMinutes = 0): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, hh, mm + addMinutes)).toISOString();
}

export function seed(): DbState {
  const today = localDay();
  const s = emptyState();
  const defs: Omit<Habit, "id" | "archived">[] = [
    { name: "Morning stretch", kind: "check", targetCount: null, unit: null, targetMinutes: null, weekdays: "0,1,2,3,4,5,6", reminderMinutes: 420, sortOrder: 0 },
    { name: "Water", kind: "count", targetCount: 8, unit: "glasses", targetMinutes: null, weekdays: "0,1,2,3,4,5,6", reminderMinutes: 540, sortOrder: 1 },
    { name: "Read", kind: "count", targetCount: 20, unit: "pages", targetMinutes: null, weekdays: "0,1,2,3,4,5,6", reminderMinutes: 1260, sortOrder: 2 },
    { name: "Deep work", kind: "timed", targetCount: null, unit: null, targetMinutes: 90, weekdays: "1,2,3,4,5", reminderMinutes: 570, sortOrder: 3 },
    { name: "Spanish", kind: "timed", targetCount: null, unit: null, targetMinutes: 25, weekdays: "0,1,2,3,4,5,6", reminderMinutes: 1200, sortOrder: 4 },
    { name: "Evening walk", kind: "check", targetCount: null, unit: null, targetMinutes: null, weekdays: "0,1,3,5,6", reminderMinutes: null, sortOrder: 5 },
  ];
  for (const d of defs) s.habits.push({ ...d, id: s.nextId.habit++, archived: false });
  const by = (name: string) => s.habits.find((h) => h.name === name)!;
  const scheduled = (h: Habit, day: string) => h.weekdays.split(",").includes(String(weekdayIndex(day)));

  const addLog = (habitId: number, day: string, value: number, note: string | null = null) =>
    s.logs.push({ id: s.nextId.log++, habitId, day, value, note });
  const addSession = (habitId: number, topic: string, day: string, hh: number, mm: number, minutes: number, notes: string | null) => {
    const seconds = minutes * 60;
    s.sessions.push({
      id: s.nextId.session++,
      habitId,
      topic,
      day,
      startedAt: atUtc(day, hh, mm),
      endedAt: atUtc(day, hh, mm, minutes),
      durationSeconds: seconds,
      accumulatedSeconds: seconds,
      resumedAt: null,
      status: "completed",
      notes,
    });
  };

  for (let back = 27; back >= 1; back -= 1) {
    const day = addDays(today, -back);
    const doy = dayOfYear(day);
    for (const h of s.habits) {
      if (!scheduled(h, day)) continue;
      if (h.name === "Water") addLog(h.id, day, doy % 5 === 0 ? 4 : 8);
      else if (h.name === "Read") addLog(h.id, day, doy % 4 === 0 ? 10 : 24, back === 2 ? "Finished the chapter on how habits stick." : null);
      else if (h.name === "Morning stretch" && doy % 5 !== 0) addLog(h.id, day, 1);
      else if (h.name === "Evening walk" && doy % 3 !== 0) addLog(h.id, day, 1);
    }
    const dw = by("Deep work");
    if (scheduled(dw, day)) {
      const topics = ["Calculus", "Systems design", "Essay draft", "Code review"];
      addSession(dw.id, topics[doy % 4]!, day, 9, 15, doy % 4 === 0 ? 40 : 50, doy % 8 === 0 ? "Left a note in the margin." : null);
      if (doy % 4 !== 0) addSession(dw.id, "Review", day, 14, 5, 45, null);
    }
    const sp = by("Spanish");
    const spTopics = ["Spanish verbs", "Listening drill", "Conversation", "Reading"];
    addSession(sp.id, spTopics[doy % 4]!, day, 20, 10, doy % 6 === 0 ? 10 : 28, doy % 11 === 0 ? "Mixed up ser and estar again." : null);
  }
  addLog(by("Water").id, today, 3);
  return s;
}
