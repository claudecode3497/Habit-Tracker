import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Check, Minus, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { HabitCard } from "@/components/habit-card";
import { useHabitDialog } from "@/components/shell";
import { useTracker } from "@/components/tracker";
import { Button, ConfirmModal, Textarea } from "@/components/ui";
import {
  addDays,
  computeStreaks,
  formatLong,
  formatMinutes,
  heatmapWeeks,
  isScheduled,
  liveSeconds,
  progressFor,
  scheduleLabel,
  type Habit,
} from "@/lib/domain";
import { deleteHabit, incrementCount, setArchived, setLogNote, toggleCheck } from "@/lib/habits.functions";
import { cn } from "@/lib/utils";

export function HabitDetail({ habitId }: { habitId: string }) {
  const data = useTracker();
  const navigate = useNavigate();
  const { openEdit } = useHabitDialog();
  const [confirm, setConfirm] = useState(false);
  const id = Number(habitId);
  const habit = data.habits.find((item) => item.id === id);

  if (!Number.isInteger(id) || !habit) {
    return (
      <div>
        <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted">
          <ArrowLeft className="size-4" />
          Today
        </Link>
        <h1 className="mt-4 font-display text-4xl tracking-tight">Habit not found</h1>
      </div>
    );
  }

  const stats = computeStreaks(habit, data.logs, data.sessions, data.today, data.nowMs);
  const rate = stats.rateScheduled === 0 ? 0 : Math.round((stats.rateDone / stats.rateScheduled) * 100);
  const seconds = data.sessions
    .filter((session) => session.habitId === habit.id)
    .reduce((sum, session) => sum + liveSeconds(session, data.nowMs), 0);
  const weeks = heatmapWeeks(data.today, 16);
  const history = recentScheduledDays(habit.weekdays, data.today, 14);

  return (
    <div>
      <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted">
        <ArrowLeft className="size-4" />
        Today
      </Link>
      <p className="mt-4 text-sm text-muted">
        {habit.kind === "check" ? "Check-off" : habit.kind === "count" ? "Count" : "Timed"} · {scheduleLabel(habit.weekdays)}
      </p>
      <h1 className="font-display text-4xl tracking-tight">{habit.name}</h1>
      {habit.archived ? <p className="mt-2 text-sm text-muted">Archived. It stays out of Today.</p> : null}

      <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Streak" value={String(stats.current)} />
        <Stat label="Best" value={String(stats.best)} />
        <Stat label="30 days" value={`${rate}%`} />
        <Stat label={habit.kind === "timed" ? "Logged" : "Hits"} value={habit.kind === "timed" ? formatMinutes(seconds) : `${stats.rateDone}`} />
      </dl>

      <section className="mt-8">
        <h2 className="text-sm font-medium text-muted">Last 16 weeks</h2>
        <div className="mt-3 flex gap-1 overflow-x-auto">
          {weeks.map((week) => (
            <div key={week[0]} className="grid gap-1">
              {week.map((day) => (
                <span key={day} title={dayLabel(habit.weekdays, day)} className={cn("size-3.5 rounded-sm", cellClass(habit, day, data))} />
              ))}
            </div>
          ))}
        </div>
        <ul className="mt-3 flex flex-wrap gap-3 text-xs text-muted">
          <li className="flex items-center gap-1"><span className="size-3 rounded-sm bg-accent" /> Done</li>
          <li className="flex items-center gap-1"><span className="size-3 rounded-sm bg-accent-soft" /> Partial</li>
          <li className="flex items-center gap-1"><span className="size-3 rounded-sm bg-line" /> Missed</li>
          <li className="flex items-center gap-1"><span className="size-3 rounded-sm bg-elevated" /> Off</li>
        </ul>
      </section>

      <div className="mt-6 flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => openEdit(habit)}>
          Edit
        </Button>
        <Button
          variant="secondary"
          onClick={() => {
            void data.commit(() => setArchived({ data: { id: habit.id, archived: !habit.archived } })).then((ok) => {
              if (ok) toast.success(habit.archived ? "Restored" : "Archived");
            });
          }}
        >
          {habit.archived ? "Restore" : "Archive"}
        </Button>
        <Button variant="danger" onClick={() => setConfirm(true)}>
          Delete
        </Button>
      </div>

      <section className="mt-8">
        <h2 className="text-sm font-medium text-muted">Recent days</h2>
        {habit.kind === "timed" ? (
          <div className="mt-3">
            <HabitCard habit={habit} day={data.today} onEdit={openEdit} />
            <ul className="mt-4 grid gap-2">
              {data.sessions
                .filter((session) => session.habitId === habit.id && session.day !== data.today)
                .slice()
                .reverse()
                .slice(0, 20)
                .map((session) => (
                  <li key={session.id} className="rounded-xl border border-line px-3 py-2 text-sm">
                    <span className="font-medium">{session.topic}</span>
                    <span className="text-muted">
                      {" "}
                      · {formatLong(session.day).dayMonth} · {formatMinutes(liveSeconds(session, data.nowMs))}
                    </span>
                    {session.notes ? <span className="mt-1 block text-muted">{session.notes}</span> : null}
                  </li>
                ))}
            </ul>
          </div>
        ) : (
          <ul className="mt-3 grid gap-3">
            {history.map((day) => (
              <HistoryRow key={`${habit.id}-${day}`} habit={habit} day={day} />
            ))}
          </ul>
        )}
      </section>

      <ConfirmModal
        open={confirm}
        onOpenChange={setConfirm}
        title={`Delete ${habit.name}?`}
        body="Its logs and sessions are removed. This cannot be undone."
        confirmLabel="Delete habit"
        onConfirm={async () => {
          const ok = await data.commit(() => deleteHabit({ data: { id: habit.id } }));
          if (ok) {
            toast.success("Habit deleted");
            void navigate({ to: "/" });
          }
          return ok;
        }}
      />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-line bg-paper px-3 py-3">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="mt-1 font-display text-2xl tabular-nums tracking-tight">{value}</dd>
    </div>
  );
}

function recentScheduledDays(weekdays: string, today: string, count: number): string[] {
  const days: string[] = [];
  let cursor = today;
  for (let i = 0; i < 80 && days.length < count; i += 1) {
    if (isScheduled(weekdays, cursor)) days.push(cursor);
    cursor = addDays(cursor, -1);
  }
  return days;
}

function cellClass(habit: Habit, day: string, data: ReturnType<typeof useTracker>): string {
  if (day > data.today) return "bg-transparent";
  if (!isScheduled(habit.weekdays, day)) return "bg-elevated";
  const progress = progressFor(habit, day, data.logs, data.sessions, data.nowMs);
  if (progress.done) return "bg-accent";
  if (progress.value > 0) return "bg-accent-soft";
  return "bg-line";
}

function dayLabel(weekdays: string, day: string): string {
  return `${day} ${isScheduled(weekdays, day) ? "scheduled" : "off"}`;
}

function HistoryRow({ habit, day }: { habit: Habit; day: string }) {
  const data = useTracker();
  const log = data.logs.find((item) => item.habitId === habit.id && item.day === day);
  const [note, setNote] = useState(log?.note ?? "");
  const progress = progressFor(habit, day, data.logs, data.sessions, data.nowMs);
  const heading = formatLong(day);

  return (
    <li className="rounded-2xl border border-line bg-paper p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-medium">{heading.weekday}</p>
          <p className="text-sm text-muted">
            {heading.dayMonth}
            {day === data.today ? " · Today" : ""}
          </p>
        </div>
        {habit.kind === "check" ? (
          <button
            type="button"
            aria-pressed={progress.done}
            aria-label={progress.done ? "Mark not done" : "Mark done"}
            onClick={() => void data.commit(() => toggleCheck({ data: { habitId: habit.id, day } }))}
            className={cn(
              "grid size-11 place-items-center rounded-full border-2",
              progress.done ? "border-accent bg-accent text-accent-fg" : "border-line text-transparent",
            )}
          >
            <Check className="size-5" />
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="icon"
              aria-label="Decrease"
              disabled={progress.value <= 0}
              onClick={() => void data.commit(() => incrementCount({ data: { habitId: habit.id, day, delta: -1 } }))}
            >
              <Minus className="size-4" />
            </Button>
            <span className="min-w-16 text-center text-sm tabular-nums">
              {progress.value}/{progress.target}
            </span>
            <Button
              variant="secondary"
              size="icon"
              aria-label="Increase"
              onClick={() => void data.commit(() => incrementCount({ data: { habitId: habit.id, day, delta: 1 } }))}
            >
              <Plus className="size-4" />
            </Button>
          </div>
        )}
      </div>
      <details className="mt-3">
        <summary className="text-sm text-muted">{note ? "Note" : "Add note"}</summary>
        <form
          className="mt-2 grid gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void data.commit(() => setLogNote({ data: { habitId: habit.id, day, note } })).then((ok) => {
              if (ok) toast.success("Note saved");
            });
          }}
        >
          <Textarea value={note} maxLength={1000} aria-label={`Note for ${heading.dayMonth}`} onChange={(event) => setNote(event.target.value)} />
          <div>
            <Button type="submit" variant="secondary" size="sm">
              Save note
            </Button>
          </div>
        </form>
      </details>
    </li>
  );
}
