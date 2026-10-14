import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { HabitCard } from "@/components/habit-card";
import { useHabitDialog } from "@/components/shell";
import { useTracker } from "@/components/tracker";
import { Button } from "@/components/ui";
import { dayTone, formatLong, habitsOnDay, monthGrid, monthTitle, type DayTone } from "@/lib/domain";
import { cn } from "@/lib/utils";

const TONE: Record<DayTone, string> = {
  full: "bg-accent text-accent-fg",
  partial: "bg-accent-soft text-ink",
  none: "bg-elevated text-muted",
  off: "bg-transparent text-ink",
  future: "bg-transparent text-faint",
};

export function CalendarPage() {
  const data = useTracker();
  const { openEdit } = useHabitDialog();
  const [year, setYear] = useState(() => Number(data.today.slice(0, 4)));
  const [month, setMonth] = useState(() => Number(data.today.slice(5, 7)) - 1);
  const [selected, setSelected] = useState(data.today);
  const cells = monthGrid(year, month);
  const visible = habitsOnDay(data.habits, selected, data.logs, data.sessions);
  const heading = formatLong(selected);

  function shift(delta: number) {
    const next = new Date(Date.UTC(year, month + delta, 1));
    setYear(next.getUTCFullYear());
    setMonth(next.getUTCMonth());
  }

  return (
    <div>
      <p className="text-sm text-muted">Month</p>
      <div className="mt-1 flex items-center justify-between gap-3">
        <h1 className="font-display text-4xl tracking-tight">{monthTitle(year, month)}</h1>
        <div className="flex gap-2">
          <Button variant="secondary" size="icon" aria-label="Previous month" onClick={() => shift(-1)}>
            <ChevronLeft className="size-4" />
          </Button>
          <Button variant="secondary" size="icon" aria-label="Next month" onClick={() => shift(1)}>
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>
      <ul className="mt-4 flex flex-wrap gap-3 text-sm text-muted">
        <Legend className="bg-accent" label="All done" />
        <Legend className="bg-accent-soft" label="Partial" />
        <Legend className="bg-elevated" label="None" />
      </ul>

      <div className="mt-4 grid grid-cols-7 gap-1 text-center text-xs text-faint">
        {["S", "M", "T", "W", "T", "F", "S"].map((label, index) => (
          <div key={`${label}-${index}`} className="py-1">
            {label}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((cell) => {
          if (!cell.inMonth) return <div key={cell.day} />;
          const tone = dayTone(data.habits, cell.day, data.today, data.logs, data.sessions, data.nowMs);
          const chosen = cell.day === selected;
          return (
            <button
              key={cell.day}
              type="button"
              onClick={() => setSelected(cell.day)}
              aria-pressed={chosen}
              aria-label={`${formatLong(cell.day).weekday} ${formatLong(cell.day).dayMonth}, ${tone}`}
              className={cn(
                "flex min-h-14 flex-col rounded-xl px-1 py-1 text-left md:min-h-16",
                TONE[tone],
                chosen && "ring-2 ring-inset ring-ink",
              )}
            >
              <span className="text-sm font-medium tabular-nums">{Number(cell.day.slice(8))}</span>
              {cell.day === data.today ? <span className="mt-auto text-xs">Today</span> : null}
            </button>
          );
        })}
      </div>

      <section className="mt-8">
        <h2 className="font-display text-3xl tracking-tight">{heading.weekday}</h2>
        <p className="text-sm text-muted">{heading.dayMonth}</p>
        {visible.length === 0 ? (
          <p className="mt-4 text-sm text-muted">Nothing scheduled, and no sessions logged.</p>
        ) : (
          <div className="mt-4 grid gap-3">
            {visible.map((habit) => (
              <HabitCard key={habit.id} habit={habit} day={selected} onEdit={openEdit} compact />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <li className="flex items-center gap-2">
      <span className={cn("size-3 rounded-sm", className)} />
      {label}
    </li>
  );
}
