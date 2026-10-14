import { Link } from "@tanstack/react-router";
import { HabitCard } from "@/components/habit-card";
import { useHabitDialog } from "@/components/shell";
import { useTracker } from "@/components/tracker";
import { Button } from "@/components/ui";
import {
  computeStreaks,
  formatLong,
  formatMinutes,
  isScheduled,
  liveSeconds,
  progressFor,
  type Habit,
  type Log,
  type Session,
} from "@/lib/domain";

export function TodayPage() {
  const { habits, logs, sessions, today, nowMs } = useTracker();
  const { openCreate, openEdit } = useHabitDialog();
  const active = habits.filter((habit) => !habit.archived);
  const scheduled = active
    .filter((habit) => isScheduled(habit.weekdays, today))
    .sort(byProgress(today, logs, sessions, nowMs));
  const later = active.filter((habit) => !isScheduled(habit.weekdays, today));
  const archived = habits.filter((habit) => habit.archived);
  const done = scheduled.filter((habit) => progressFor(habit, today, logs, sessions, nowMs).done).length;
  const longest = active.reduce(
    (best, habit) => Math.max(best, computeStreaks(habit, logs, sessions, today, nowMs).current),
    0,
  );
  const minutes = sessions
    .filter((session) => session.day === today)
    .reduce((sum, session) => sum + liveSeconds(session, nowMs), 0);
  const heading = formatLong(today);

  return (
    <div>
      <p className="text-sm text-muted">Today</p>
      <h1 className="font-display text-4xl tracking-tight md:text-5xl">{heading.weekday}</h1>
      <p className="mt-1 text-muted">{heading.dayMonth}</p>

      <dl className="mt-8 grid grid-cols-3 gap-3">
        <Stat label="Done" value={scheduled.length === 0 ? "Rest" : `${done}/${scheduled.length}`} />
        <Stat label="Streak" value={String(longest)} />
        <Stat label="Timed" value={formatMinutes(minutes)} />
      </dl>

      {active.length === 0 ? (
        <div className="mt-8 rounded-3xl border border-line bg-paper p-5">
          <h2 className="font-display text-3xl tracking-tight">No habits yet</h2>
          <p className="mt-2 text-sm text-muted">Add a check-off, a count, or a timed practice.</p>
          <Button className="mt-4" onClick={openCreate}>
            Add habit
          </Button>
        </div>
      ) : null}

      <div className="mt-6 grid gap-3">
        {scheduled.map((habit) => (
          <HabitCard key={habit.id} habit={habit} day={today} onEdit={openEdit} />
        ))}
      </div>

      {later.length > 0 ? (
        <section className="mt-8">
          <h2 className="text-sm font-medium text-muted">Not scheduled today</h2>
          <div className="mt-3 grid gap-3">
            {later.map((habit) => (
              <HabitCard key={habit.id} habit={habit} day={today} onEdit={openEdit} compact />
            ))}
          </div>
        </section>
      ) : null}

      {archived.length > 0 ? (
        <details className="mt-8">
          <summary className="text-sm font-medium text-muted">Archived ({archived.length})</summary>
          <ul className="mt-3 grid gap-2">
            {archived.map((habit) => (
              <li key={habit.id}>
                <Link
                  to="/habits/$habitId"
                  params={{ habitId: String(habit.id) }}
                  className="text-sm text-ink underline-offset-4 hover:underline"
                >
                  {habit.name}
                </Link>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

function byProgress(day: string, logs: readonly Log[], sessions: readonly Session[], nowMs: number) {
  return (a: Habit, b: Habit) => {
    const ad = progressFor(a, day, logs, sessions, nowMs).done ? 1 : 0;
    const bd = progressFor(b, day, logs, sessions, nowMs).done ? 1 : 0;
    if (ad !== bd) return ad - bd;
    return a.sortOrder - b.sortOrder;
  };
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-line bg-paper px-3 py-3">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="mt-1 font-display text-2xl tabular-nums tracking-tight">{value}</dd>
    </div>
  );
}
