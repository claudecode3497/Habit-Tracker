import assert from "node:assert/strict";
import test from "node:test";
import {
  addDays,
  computeStreaks,
  dayTone,
  isScheduled,
  monthGrid,
  progressFor,
  scheduleLabel,
  weekdayIndex,
  type Habit,
  type Log,
} from "./domain.ts";

const check: Habit = {
  id: 1,
  name: "Stretch",
  kind: "check",
  targetCount: null,
  unit: null,
  targetMinutes: null,
  weekdays: "0,1,2,3,4,5,6",
  archived: false,
  reminderMinutes: null,
  sortOrder: 0,
};

function logs(days: string[]): Log[] {
  return days.map((day, i) => ({ id: i + 1, habitId: 1, day, value: 1, note: null }));
}

test("calendar helpers stay on the date, not the timezone", () => {
  assert.equal(addDays("2026-10-13", 1), "2026-10-14");
  assert.equal(addDays("2026-10-31", 1), "2026-11-01");
  assert.equal(weekdayIndex("2026-10-13"), 2);
  assert.equal(isScheduled("1,2,3,4,5", "2026-10-13"), true);
  assert.equal(isScheduled("0,6", "2026-10-13"), false);
  assert.equal(scheduleLabel("1,2,3,4,5"), "Weekdays");
  const grid = monthGrid(2026, 9);
  assert.ok(grid.length === 35 || grid.length === 42);
  assert.equal(grid.find((cell) => cell.inMonth)?.day, "2026-10-01");
});

test("an unfinished today does not break the streak", () => {
  const today = "2026-10-13";
  const stats = computeStreaks(check, logs(["2026-10-10", "2026-10-11", "2026-10-12"]), [], today, 0);
  assert.equal(stats.current, 3);
  assert.ok(stats.best >= 3);
});

test("a miss before today ends the current streak", () => {
  const today = "2026-10-13";
  const stats = computeStreaks(
    check,
    logs(["2026-10-10", "2026-10-11", "2026-10-13"]),
    [],
    today,
    0,
  );
  assert.equal(stats.current, 1);
  assert.equal(stats.best, 2);
});

test("unscheduled days are skipped inside a streak", () => {
  const weekdayHabit: Habit = { ...check, weekdays: "1,2,3,4,5" };
  const today = "2026-10-13";
  const stats = computeStreaks(
    weekdayHabit,
    logs(["2026-10-09", "2026-10-12", "2026-10-13"]),
    [],
    today,
    0,
  );
  assert.equal(stats.current, 3);
});

test("day tone distinguishes none, partial, and full", () => {
  const habits: Habit[] = [
    check,
    { ...check, id: 2, name: "Water", kind: "count", targetCount: 8, unit: "glasses" },
  ];
  const today = "2026-10-13";
  const partialLogs: Log[] = [
    { id: 1, habitId: 1, day: today, value: 1, note: null },
    { id: 2, habitId: 2, day: today, value: 3, note: null },
  ];
  assert.equal(dayTone(habits, today, today, partialLogs, [], 0), "partial");
  assert.equal(dayTone(habits, today, today, [], [], 0), "none");
  const fullLogs: Log[] = [
    { id: 1, habitId: 1, day: today, value: 1, note: null },
    { id: 2, habitId: 2, day: today, value: 8, note: null },
  ];
  assert.equal(dayTone(habits, today, today, fullLogs, [], 0), "full");
  assert.equal(progressFor(habits[1]!, today, partialLogs, [], 0).done, false);
});
