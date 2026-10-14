import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useTracker } from "@/components/tracker";
import { addDays, computeStreaks, formatMinutes, liveSeconds, topicTotals, weekBars } from "@/lib/domain";

export function InsightsPage() {
  const { habits, logs, sessions, today, nowMs } = useTracker();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const bars = weekBars(habits, logs, sessions, today, nowMs);
  const topics = topicTotals(sessions, addDays(today, -29), today, nowMs).map((row) => ({
    ...row,
    label: row.topic,
    minutes: Math.round(row.seconds / 60),
  }));
  const active = habits.filter((habit) => !habit.archived);
  const weekSeconds = sessions
    .filter((session) => session.day >= addDays(today, -6) && session.day <= today)
    .reduce((sum, session) => sum + liveSeconds(session, nowMs), 0);

  return (
    <div>
      <p className="text-sm text-muted">Insights</p>
      <h1 className="font-display text-4xl tracking-tight">How the days add up</h1>
      <p className="mt-2 text-sm text-muted">{formatMinutes(weekSeconds)} logged across the last 7 days.</p>

      <section className="mt-8 rounded-3xl border border-line bg-paper p-4">
        <h2 className="text-sm font-medium text-ink">Completion, last 7 days</h2>
        <div className="mt-4 h-48">
          {mounted ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={bars} barCategoryGap="28%">
                <XAxis dataKey="label" tick={{ fill: "var(--c-muted)", fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis hide domain={[0, 100]} />
                <Tooltip
                  cursor={{ fill: "var(--c-elevated)" }}
                  contentStyle={{
                    background: "var(--c-paper)",
                    border: "1px solid var(--c-line)",
                    borderRadius: 12,
                    color: "var(--c-ink)",
                    fontSize: 14,
                  }}
                  formatter={(_value, _name, item) => {
                    const row = item.payload as { done: number; total: number };
                    if (row.total === 0) return ["Nothing scheduled", ""];
                    return [`${row.done} of ${row.total}`, "Done"];
                  }}
                />
                <Bar dataKey="pct" radius={[8, 8, 0, 0]} isAnimationActive={false}>
                  {bars.map((row) => (
                    <Cell key={row.day} fill={row.total === 0 ? "var(--c-line)" : "var(--c-accent)"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : null}
        </div>
      </section>

      <section className="mt-4 rounded-3xl border border-line bg-paper p-4">
        <h2 className="text-sm font-medium text-ink">Time by topic, 30 days</h2>
        {topics.length === 0 ? (
          <p className="mt-3 text-sm text-muted">No sessions in this window.</p>
        ) : (
          <div className="mt-4 h-56">
            {mounted ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topics} layout="vertical" margin={{ left: 8, right: 8 }}>
                  <XAxis type="number" hide />
                  <YAxis
                    type="category"
                    dataKey="label"
                    width={108}
                    tick={{ fill: "var(--c-muted)", fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    cursor={{ fill: "var(--c-elevated)" }}
                    contentStyle={{
                      background: "var(--c-paper)",
                      border: "1px solid var(--c-line)",
                      borderRadius: 12,
                      color: "var(--c-ink)",
                      fontSize: 14,
                    }}
                    formatter={(value) => [`${value} min`, "Time"]}
                  />
                  <Bar dataKey="minutes" fill="var(--c-accent)" radius={[0, 8, 8, 0]} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            ) : null}
          </div>
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-medium text-muted">Habits</h2>
        <ul className="mt-3 grid gap-2">
          {active.map((habit) => {
            const stats = computeStreaks(habit, logs, sessions, today, nowMs);
            const rate = stats.rateScheduled === 0 ? 0 : Math.round((stats.rateDone / stats.rateScheduled) * 100);
            return (
              <li key={habit.id}>
                <Link
                  to="/habits/$habitId"
                  params={{ habitId: String(habit.id) }}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-paper px-4 py-3"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{habit.name}</span>
                    <span className="block text-sm text-muted">
                      {stats.current > 0 ? `${stats.current} day streak` : "No current streak"} · best {stats.best}
                    </span>
                  </span>
                  <span className="font-display text-2xl tabular-nums">{rate}%</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
