import { Link, useMatchRoute, useRouterState } from "@tanstack/react-router";
import { BarChart3, CalendarDays, Download, ListChecks, Moon, Plus, Sun } from "lucide-react";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { DataDialog, HabitDialog } from "@/components/dialogs";
import { TimerDock } from "@/components/habit-card";
import { useTracker } from "@/components/tracker";
import { Button } from "@/components/ui";
import { isScheduled, progressFor, type Habit } from "@/lib/domain";
import { isNative, syncNativeReminders } from "@/lib/native";
import { cn } from "@/lib/utils";

type DialogApi = {
  openCreate: () => void;
  openEdit: (habit: Habit) => void;
};

const DialogContext = createContext<DialogApi | null>(null);

export function useHabitDialog() {
  const value = useContext(DialogContext);
  if (!value) throw new Error("Habit dialog is unavailable");
  return value;
}

const NAV = [
  { to: "/", label: "Today", icon: ListChecks, exact: true },
  { to: "/calendar", label: "Month", icon: CalendarDays, exact: false },
  { to: "/insights", label: "Insights", icon: BarChart3, exact: false },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const { habits, logs, sessions, today } = useTracker();
  const [editing, setEditing] = useState<Habit | null>(null);
  const [habitOpen, setHabitOpen] = useState(false);
  const [dataOpen, setDataOpen] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark" | null>(null);
  const isLoading = useRouterState({ select: (state) => state.isLoading || state.status === "pending" });
  const running = sessions.some((session) => session.status === "running");
  const api = useMemo<DialogApi>(
    () => ({
      openCreate: () => {
        setEditing(null);
        setHabitOpen(true);
      },
      openEdit: (habit) => {
        setEditing(habit);
        setHabitOpen(true);
      },
    }),
    [],
  );

  useEffect(() => {
    const stored = localStorage.getItem("cadence-theme");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const next = stored === "dark" || stored === "light" ? stored : prefersDark ? "dark" : "light";
    document.documentElement.classList.toggle("dark", next === "dark");
    setTheme(next);
  }, []);

  const reminderKey = JSON.stringify(
    habits.map((h) => [h.id, h.name, h.archived, h.weekdays, h.reminderMinutes]),
  );
  useEffect(() => {
    if (isNative) void syncNativeReminders(habits).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reminderKey]);

  useEffect(() => {
    if (isNative) return; // the phone schedules its own notifications
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    const tick = () => {
      const now = new Date();
      const minutes = now.getHours() * 60 + now.getMinutes();
      for (const habit of habits) {
        if (habit.archived || habit.reminderMinutes == null || habit.reminderMinutes !== minutes) continue;
        if (!isScheduled(habit.weekdays, today)) continue;
        if (progressFor(habit, today, logs, sessions, Date.now()).done) continue;
        const key = `cadence-reminded:${habit.id}:${today}`;
        if (localStorage.getItem(key)) continue;
        localStorage.setItem(key, "1");
        new Notification("Cadence", { body: `${habit.name} is still open today.` });
      }
    };
    tick();
    const id = window.setInterval(tick, 20000);
    return () => window.clearInterval(id);
  }, [habits, logs, sessions, today]);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.classList.toggle("dark", next === "dark");
    localStorage.setItem("cadence-theme", next);
    setTheme(next);
  }

  return (
    <DialogContext.Provider value={api}>
      <div className="min-h-dvh bg-canvas text-ink md:grid md:grid-cols-[14rem_minmax(0,1fr)]">
        <aside className="sticky top-0 hidden h-dvh flex-col border-r border-line bg-paper px-4 py-6 md:flex">
          <Brand />
          <nav className="mt-8 grid gap-1">
            {NAV.map((item) => (
              <NavLink key={item.to} {...item} />
            ))}
          </nav>
          <div className="mt-auto grid gap-2">
            <Button onClick={api.openCreate}>
              <Plus className="size-4" />
              Add habit
            </Button>
            <Button variant="ghost" onClick={() => setDataOpen(true)}>
              <Download className="size-4" />
              Data
            </Button>
            <Button variant="ghost" onClick={toggleTheme} aria-label={theme === "dark" ? "Use light mode" : "Use dark mode"}>
              {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
              {theme === "dark" ? "Light" : "Dark"}
            </Button>
          </div>
        </aside>
        <div className="min-w-0">
          <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 md:hidden">
            <Brand />
            <div className="flex items-center gap-1">
              <Button size="sm" onClick={api.openCreate}>
                <Plus className="size-4" />
                Add
              </Button>
              <Button variant="ghost" size="icon" aria-label="Export and reminders" onClick={() => setDataOpen(true)}>
                <Download className="size-4" />
              </Button>
              <Button variant="ghost" size="icon" aria-label={theme === "dark" ? "Use light mode" : "Use dark mode"} onClick={toggleTheme}>
                {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
              </Button>
            </div>
          </header>
          {isLoading ? <div className="h-0.5 bg-accent" /> : null}
          <main
            className={cn(
              "mx-auto w-full max-w-3xl px-4 pt-6 md:pt-10",
              running
                ? "pb-[calc(12rem+env(safe-area-inset-bottom))] md:pb-36"
                : "pb-[calc(7rem+env(safe-area-inset-bottom))] md:pb-16",
            )}
          >
            {children}
          </main>
        </div>
        <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-paper pb-[env(safe-area-inset-bottom)] md:hidden">
          <div className="grid h-16 grid-cols-3">
            {NAV.map((item) => (
              <NavLink key={item.to} {...item} stacked />
            ))}
          </div>
        </nav>
        <TimerDock />
      </div>
      <HabitDialog open={habitOpen} onOpenChange={setHabitOpen} habit={editing} />
      <DataDialog open={dataOpen} onOpenChange={setDataOpen} />
    </DialogContext.Provider>
  );
}

function Brand() {
  return (
    <Link to="/" className="flex items-center gap-2">
      <span className="grid size-8 place-items-center rounded-lg border border-line">
        <span className="size-2.5 rounded-full bg-accent" />
      </span>
      <span className="font-display text-xl tracking-tight">Cadence</span>
    </Link>
  );
}

function NavLink({
  to,
  label,
  icon: Icon,
  exact,
  stacked = false,
}: {
  to: "/" | "/calendar" | "/insights";
  label: string;
  icon: typeof ListChecks;
  exact: boolean;
  stacked?: boolean;
}) {
  const match = useMatchRoute();
  const active = Boolean(match({ to, fuzzy: !exact }));
  return (
    <Link
      to={to}
      aria-current={active ? "page" : undefined}
      className={cn(
        "text-sm",
        stacked
          ? "flex h-16 flex-col items-center justify-center gap-1"
          : "flex h-11 items-center gap-3 rounded-xl px-3",
        active ? "bg-elevated font-medium text-ink" : "text-muted",
        stacked && active && "bg-transparent",
      )}
    >
      <Icon className="size-4" />
      {label}
    </Link>
  );
}
