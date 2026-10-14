import { Link } from "@tanstack/react-router";
import { Check, Minus, Pause, Pencil, Play, Plus, Square, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { SessionDialog } from "@/components/dialogs";
import { useTracker } from "@/components/tracker";
import { Button, ConfirmModal, Input } from "@/components/ui";
import {
  computeStreaks,
  formatClock,
  formatDuration,
  formatLong,
  formatMinutes,
  formatReminder,
  liveSeconds,
  progressFor,
  recentTopics,
  scheduleLabel,
  type Habit,
  type Session,
} from "@/lib/domain";
import {
  deleteSession,
  incrementCount,
  pauseSession,
  resumeSession,
  startSession,
  stopSession,
  toggleCheck,
} from "@/lib/habits.functions";
import { cn } from "@/lib/utils";

function streakText(current: number, best: number): string {
  if (current > 0) return current === 1 ? "1 day streak" : `${current} day streak`;
  if (best > 0) return `Best ${best} days`;
  return "No streak yet";
}

export function HabitCard({
  habit,
  day,
  onEdit,
  compact = false,
}: {
  habit: Habit;
  day: string;
  onEdit: (habit: Habit) => void;
  compact?: boolean;
}) {
  const { today, logs, sessions, nowMs, commit } = useTracker();
  const progress = progressFor(habit, day, logs, sessions, nowMs);
  const streaks = computeStreaks(habit, logs, sessions, today, nowMs);
  const listed = (
    day === today
      ? sessions.filter((session) => session.habitId === habit.id && (session.day === day || session.status !== "completed"))
      : sessions.filter((session) => session.habitId === habit.id && session.day === day)
  ).slice().sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  const reminder = formatReminder(habit.reminderMinutes);

  return (
    <article className="rounded-3xl border border-line bg-paper p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            to="/habits/$habitId"
            params={{ habitId: String(habit.id) }}
            className="block truncate text-base font-medium text-ink"
          >
            {habit.name}
          </Link>
          <p className="mt-0.5 text-sm text-muted">
            {scheduleLabel(habit.weekdays)}
            {compact ? "" : ` · ${streakText(streaks.current, streaks.best)}`}
            {!compact && reminder ? ` · ${reminder}` : ""}
          </p>
        </div>
        {habit.kind === "check" ? (
          <button
            type="button"
            aria-pressed={progress.done}
            aria-label={progress.done ? `Mark ${habit.name} not done` : `Mark ${habit.name} done`}
            onClick={() => void commit(() => toggleCheck({ data: { habitId: habit.id, day } }))}
            className={cn(
              "grid size-11 shrink-0 place-items-center rounded-full border-2 transition-colors duration-150",
              progress.done ? "border-accent bg-accent text-accent-fg" : "border-line bg-paper text-transparent",
            )}
          >
            <Check className="size-5" />
          </button>
        ) : null}
      </div>

      {habit.kind === "count" ? (
        <CountControl habit={habit} day={day} value={progress.value} target={progress.target} />
      ) : null}

      {habit.kind === "timed" ? (
        <TimedControl habit={habit} day={day} progressValue={progress.value} progressTarget={progress.target} listed={listed} />
      ) : null}

      {!compact ? (
        <div className="mt-3 flex justify-end">
          <Button variant="ghost" size="sm" onClick={() => onEdit(habit)}>
            Edit
          </Button>
        </div>
      ) : null}
    </article>
  );
}

function CountControl({
  habit,
  day,
  value,
  target,
}: {
  habit: Habit;
  day: string;
  value: number;
  target: number;
}) {
  const { commit } = useTracker();
  const ratio = Math.min(1, value / target);
  return (
    <div className="mt-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm tabular-nums text-ink">
          {value} / {target} {habit.unit}
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="icon"
            aria-label={`Remove one ${habit.unit ?? "count"}`}
            disabled={value <= 0}
            onClick={() => void commit(() => incrementCount({ data: { habitId: habit.id, day, delta: -1 } }))}
          >
            <Minus className="size-4" />
          </Button>
          <Button
            variant="secondary"
            size="icon"
            aria-label={`Add one ${habit.unit ?? "count"}`}
            onClick={() => void commit(() => incrementCount({ data: { habitId: habit.id, day, delta: 1 } }))}
          >
            <Plus className="size-4" />
          </Button>
        </div>
      </div>
      <div
        className="mt-3 h-1.5 overflow-hidden rounded-full bg-elevated"
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={target}
        aria-label={habit.name}
      >
        <div className="h-full bg-accent" style={{ width: `${Math.round(ratio * 100)}%` }} />
      </div>
    </div>
  );
}

function TimedControl({
  habit,
  day,
  progressValue,
  progressTarget,
  listed,
}: {
  habit: Habit;
  day: string;
  progressValue: number;
  progressTarget: number;
  listed: Session[];
}) {
  const { today, sessions, commit } = useTracker();
  const [topic, setTopic] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [editing, setEditing] = useState<Session | null>(null);
  const [creating, setCreating] = useState(false);
  const [removing, setRemoving] = useState<Session | null>(null);
  const ratio = Math.min(1, progressValue / progressTarget);
  const runningHere = listed.some((session) => session.status === "running");
  const topics = recentTopics(sessions, habit.id);

  async function start() {
    if (!topic.trim()) {
      setError("Name this session");
      return;
    }
    setError("");
    setPending(true);
    const ok = await commit(() => startSession({ data: { habitId: habit.id, day: today, topic: topic.trim() } }));
    setPending(false);
    if (ok) setTopic("");
  }

  return (
    <div className="mt-4">
      <p className="text-sm tabular-nums text-ink">
        {formatMinutes(progressValue)} / {habit.targetMinutes} min
      </p>
      <div
        className="mt-3 h-1.5 overflow-hidden rounded-full bg-elevated"
        role="progressbar"
        aria-valuenow={Math.round(progressValue / 60)}
        aria-valuemin={0}
        aria-valuemax={habit.targetMinutes ?? 0}
        aria-label={habit.name}
      >
        <div className="h-full bg-accent" style={{ width: `${Math.round(ratio * 100)}%` }} />
      </div>

      {listed.length > 0 ? (
        <ul className="mt-4 grid gap-2">
          {listed.map((session) => (
            <SessionRow key={session.id} session={session} onEdit={() => setEditing(session)} onDelete={() => setRemoving(session)} />
          ))}
        </ul>
      ) : null}

      {day === today && !runningHere ? (
        <form
          className="mt-4 grid gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void start();
          }}
        >
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={topic}
              maxLength={80}
              placeholder="Session topic"
              aria-label={`Topic for ${habit.name}`}
              onChange={(event) => setTopic(event.target.value)}
            />
            <Button type="submit" disabled={pending} className="sm:w-28">
              <Play className="size-4" />
              Start
            </Button>
          </div>
          {topics.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {topics.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setTopic(item)}
                  className="h-9 rounded-lg bg-elevated px-3 text-sm text-muted"
                >
                  {item}
                </button>
              ))}
            </div>
          ) : null}
          {error ? <p className="text-sm text-danger">{error}</p> : null}
        </form>
      ) : null}

      <div className="mt-3">
        <Button variant="ghost" size="sm" onClick={() => setCreating(true)}>
          Log time
        </Button>
      </div>

      <SessionDialog
        open={editing !== null || creating}
        onOpenChange={(open) => {
          if (!open) {
            setEditing(null);
            setCreating(false);
          }
        }}
        habitId={habit.id}
        session={editing}
        day={day}
      />
      <ConfirmModal
        open={removing !== null}
        onOpenChange={(open) => {
          if (!open) setRemoving(null);
        }}
        title="Delete session?"
        body={removing ? `${removing.topic} will be removed from this day.` : ""}
        confirmLabel="Delete"
        onConfirm={async () => {
          if (!removing) return false;
          const ok = await commit(() => deleteSession({ data: { id: removing.id } }));
          if (ok) toast.success("Session deleted");
          return ok;
        }}
      />
    </div>
  );
}

function SessionRow({
  session,
  onEdit,
  onDelete,
}: {
  session: Session;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { today, nowMs, commit } = useTracker();
  const seconds = liveSeconds(session, nowMs);
  const when = session.day === today ? formatClock(session.startedAt) : formatLong(session.day).dayMonth;

  return (
    <li className="rounded-xl bg-elevated px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-ink">{session.topic}</p>
          <p className="text-sm text-muted">
            {when}
            {session.notes ? ` · ${session.notes}` : ""}
          </p>
        </div>
        <p className="shrink-0 text-sm tabular-nums text-ink">{formatDuration(seconds)}</p>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {session.status === "running" ? (
          <Button variant="secondary" size="sm" onClick={() => void commit(() => pauseSession({ data: { id: session.id } }))}>
            <Pause className="size-4" />
            Pause
          </Button>
        ) : null}
        {session.status === "paused" ? (
          <Button variant="secondary" size="sm" onClick={() => void commit(() => resumeSession({ data: { id: session.id } }))}>
            <Play className="size-4" />
            Resume
          </Button>
        ) : null}
        {session.status !== "completed" ? (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              void commit(() => stopSession({ data: { id: session.id } })).then((ok) => {
                if (ok) toast.success("Session saved");
              });
            }}
          >
            <Square className="size-4" />
            Stop
          </Button>
        ) : null}
        <Button variant="ghost" size="icon" aria-label={`Edit ${session.topic}`} onClick={onEdit}>
          <Pencil className="size-4" />
        </Button>
        <Button variant="ghost" size="icon" aria-label={`Delete ${session.topic}`} onClick={onDelete}>
          <Trash2 className="size-4" />
        </Button>
      </div>
    </li>
  );
}

export function TimerDock() {
  const { habits, sessions, nowMs, commit } = useTracker();
  const session = sessions.find((item) => item.status === "running");
  if (!session) return null;
  const habit = habits.find((item) => item.id === session.habitId);
  return (
    <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-40 border-t border-line bg-paper px-4 py-3 md:bottom-0 md:left-56">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm text-muted">{habit?.name ?? "Session"}</p>
          <p className="truncate font-medium text-ink">{session.topic}</p>
        </div>
        <p className="font-display text-3xl tabular-nums tracking-tight">{formatDuration(liveSeconds(session, nowMs))}</p>
        <div className="flex gap-2">
          <Button variant="secondary" size="icon" aria-label="Pause" onClick={() => void commit(() => pauseSession({ data: { id: session.id } }))}>
            <Pause className="size-4" />
          </Button>
          <Button
            size="icon"
            aria-label="Stop and save"
            onClick={() => {
              void commit(() => stopSession({ data: { id: session.id } })).then((ok) => {
                if (ok) toast.success("Session saved");
              });
            }}
          >
            <Square className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
