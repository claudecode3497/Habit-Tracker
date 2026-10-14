import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button, ConfirmModal, Input, Label, Modal, Textarea } from "@/components/ui";
import {
  exportCsv,
  formatReminder,
  type Habit,
  type HabitKind,
  type Session,
} from "@/lib/domain";
import {
  createHabit,
  exportData,
  importBackup,
  logSession,
  updateHabit,
  updateSession,
} from "@/lib/habits.functions";
import { useTracker } from "@/components/tracker";
import {
  getReminderPermission,
  isNative,
  requestReminderPermission,
  saveTextFile,
  syncNativeReminders,
  type ReminderPermission,
} from "@/lib/native";
import { db, resetToEmpty, resetToSample } from "@/lib/store";
import { cn } from "@/lib/utils";

const DAYS = [
  { id: "0", label: "S" },
  { id: "1", label: "M" },
  { id: "2", label: "T" },
  { id: "3", label: "W" },
  { id: "4", label: "T" },
  { id: "5", label: "F" },
  { id: "6", label: "S" },
];

const KINDS: { id: HabitKind; label: string; hint: string }[] = [
  { id: "check", label: "Check-off", hint: "Done or not, once a day" },
  { id: "count", label: "Count", hint: "A number to reach" },
  { id: "timed", label: "Timed", hint: "Sessions with a timer" },
];

function parseTime(value: string): number | null {
  if (!value) return null;
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hours = Number(match[1]);
  const mins = Number(match[2]);
  if (hours > 23 || mins > 59) return null;
  return hours * 60 + mins;
}

export function HabitDialog({
  open,
  onOpenChange,
  habit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  habit: Habit | null;
}) {
  const { commit } = useTracker();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<HabitKind>("check");
  const [target, setTarget] = useState("8");
  const [unit, setUnit] = useState("glasses");
  const [minutes, setMinutes] = useState("30");
  const [days, setDays] = useState<string[]>(["0", "1", "2", "3", "4", "5", "6"]);
  const [reminder, setReminder] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError("");
    setName(habit?.name ?? "");
    setKind(habit?.kind ?? "check");
    setTarget(String(habit?.targetCount ?? 8));
    setUnit(habit?.unit ?? "glasses");
    setMinutes(String(habit?.targetMinutes ?? 30));
    setDays((habit?.weekdays ?? "0,1,2,3,4,5,6").split(","));
    setReminder(formatReminder(habit?.reminderMinutes ?? null));
  }, [open, habit]);

  function toggleDay(id: string) {
    setDays((current) => {
      if (current.includes(id)) {
        if (current.length === 1) return current;
        return current.filter((day) => day !== id);
      }
      return [...current, id].sort();
    });
  }

  async function save() {
    setError("");
    const count = Number(target);
    const goal = Number(minutes);
    if (!name.trim()) {
      setError("Name this habit");
      return;
    }
    if ((habit?.kind ?? kind) === "count" && (!Number.isInteger(count) || count <= 0)) {
      setError("Target needs to be a whole number");
      return;
    }
    if ((habit?.kind ?? kind) === "timed" && (!Number.isInteger(goal) || goal <= 0)) {
      setError("Goal needs to be whole minutes");
      return;
    }
    const payload = {
      name: name.trim(),
      targetCount: (habit?.kind ?? kind) === "count" ? count : null,
      unit: (habit?.kind ?? kind) === "count" ? unit : null,
      targetMinutes: (habit?.kind ?? kind) === "timed" ? goal : null,
      weekdays: days.join(","),
      reminderMinutes: parseTime(reminder),
    };
    setPending(true);
    const ok = await commit(() =>
      habit ? updateHabit({ data: { id: habit.id, ...payload } }) : createHabit({ data: { kind, ...payload } }),
    );
    setPending(false);
    if (!ok) return;
    toast.success(habit ? "Habit updated" : "Habit added");
    onOpenChange(false);
  }

  const activeKind = habit?.kind ?? kind;

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={habit ? "Edit habit" : "New habit"}
      description={habit ? "Kind stays fixed so history keeps its meaning." : "Pick how you want to track it."}
    >
      <form
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <div>
          <Label htmlFor="habit-name">Name</Label>
          <Input
            id="habit-name"
            value={name}
            maxLength={80}
            onChange={(event) => setName(event.target.value)}
            placeholder="Morning stretch"
          />
        </div>
        {habit ? (
          <p className="text-sm text-muted">
            {KINDS.find((item) => item.id === habit.kind)?.label}. {KINDS.find((item) => item.id === habit.kind)?.hint}.
          </p>
        ) : (
          <div className="grid gap-2">
            {KINDS.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={kind === item.id}
                onClick={() => setKind(item.id)}
                className={cn(
                  "rounded-xl border px-3 py-2 text-left",
                  kind === item.id ? "border-accent bg-accent-soft" : "border-line bg-paper",
                )}
              >
                <span className="block text-sm font-medium">{item.label}</span>
                <span className="block text-sm text-muted">{item.hint}</span>
              </button>
            ))}
          </div>
        )}
        {activeKind === "count" ? (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="habit-target">Daily target</Label>
              <Input
                id="habit-target"
                inputMode="numeric"
                value={target}
                onChange={(event) => setTarget(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="habit-unit">Unit</Label>
              <Input id="habit-unit" value={unit} maxLength={24} onChange={(event) => setUnit(event.target.value)} />
            </div>
          </div>
        ) : null}
        {activeKind === "timed" ? (
          <div>
            <Label htmlFor="habit-minutes">Daily goal (minutes)</Label>
            <Input
              id="habit-minutes"
              inputMode="numeric"
              value={minutes}
              onChange={(event) => setMinutes(event.target.value)}
            />
          </div>
        ) : null}
        <div>
          <Label>Days</Label>
          <div className="grid grid-cols-7 gap-1">
            {DAYS.map((day) => {
              const on = days.includes(day.id);
              return (
                <button
                  key={day.id}
                  type="button"
                  aria-pressed={on}
                  aria-label={["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][Number(day.id)]}
                  onClick={() => toggleDay(day.id)}
                  className={cn(
                    "h-11 rounded-xl text-sm font-medium",
                    on ? "bg-accent text-accent-fg" : "bg-elevated text-muted",
                  )}
                >
                  {day.label}
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <Label htmlFor="habit-reminder">Reminder</Label>
          <Input id="habit-reminder" type="time" value={reminder} onChange={(event) => setReminder(event.target.value)} />
          <p className="mt-1.5 text-sm text-faint">{isNative ? "Optional. A notification arrives at this time on the days you picked." : "Optional. Fires while the app is open, after you allow notifications."}</p>
        </div>
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        <Button type="submit" disabled={pending}>
          {habit ? "Save changes" : "Add habit"}
        </Button>
      </form>
    </Modal>
  );
}

export function SessionDialog({
  open,
  onOpenChange,
  habitId,
  session,
  day,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  habitId: number;
  session: Session | null;
  day: string;
}) {
  const { commit } = useTracker();
  const [topic, setTopic] = useState("");
  const [notes, setNotes] = useState("");
  const [when, setWhen] = useState(day);
  const [minutes, setMinutes] = useState("25");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const running = session?.status === "running";

  useEffect(() => {
    if (!open) return;
    setError("");
    setTopic(session?.topic ?? "");
    setNotes(session?.notes ?? "");
    setWhen(session?.day ?? day);
    setMinutes(String(Math.max(1, Math.round((session?.durationSeconds ?? 25 * 60) / 60))));
  }, [open, session, day]);

  async function save() {
    if (!topic.trim()) {
      setError("Name this session");
      return;
    }
    const mins = Number(minutes);
    if (!running && (!Number.isInteger(mins) || mins < 0)) {
      setError("Duration needs to be whole minutes");
      return;
    }
    setPending(true);
    const ok = session
      ? await commit(() =>
          updateSession({
            data: {
              id: session.id,
              topic: topic.trim(),
              notes,
              day: when,
              durationSeconds:
                mins === Math.round(session.durationSeconds / 60) ? session.durationSeconds : mins * 60,
            },
          }),
        )
      : await commit(() =>
          logSession({
            data: {
              habitId,
              topic: topic.trim(),
              notes,
              day: when,
              durationSeconds: mins * 60,
            },
          }),
        );
    setPending(false);
    if (!ok) return;
    toast.success(session ? "Session updated" : "Session logged");
    onOpenChange(false);
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={session ? "Edit session" : "Log time"}
      description="Topic, day, and how long it ran."
    >
      <form
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <div>
          <Label htmlFor="session-topic">Topic</Label>
          <Input id="session-topic" value={topic} maxLength={80} onChange={(event) => setTopic(event.target.value)} />
        </div>
        <div>
          <Label htmlFor="session-day">Day</Label>
          <Input id="session-day" type="date" value={when} onChange={(event) => setWhen(event.target.value)} />
        </div>
        {running ? (
          <p className="text-sm text-muted">This one is still running. Stop it to freeze the time.</p>
        ) : (
          <div>
            <Label htmlFor="session-minutes">Minutes</Label>
            <Input
              id="session-minutes"
              inputMode="numeric"
              value={minutes}
              onChange={(event) => setMinutes(event.target.value)}
            />
          </div>
        )}
        <div>
          <Label htmlFor="session-notes">Notes</Label>
          <Textarea id="session-notes" value={notes} maxLength={1000} onChange={(event) => setNotes(event.target.value)} />
        </div>
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        <Button type="submit" disabled={pending}>
          Save session
        </Button>
      </form>
    </Modal>
  );
}

export function DataDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { commit } = useTracker();
  const navigate = useNavigate();
  const [permission, setPermission] = useState<ReminderPermission>("default");
  const [pending, setPending] = useState<"json" | "csv" | null>(null);
  const [confirm, setConfirm] = useState<"erase" | "sample" | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    void getReminderPermission().then(setPermission).catch(() => setPermission("unsupported"));
  }, [open]);

  async function download(kind: "json" | "csv") {
    setPending(kind);
    try {
      const data = await exportData();
      if (kind === "json") {
        await saveTextFile("cadence-backup.json", JSON.stringify(data, null, 2), "application/json");
      } else {
        await saveTextFile("cadence.csv", exportCsv(data), "text/csv");
      }
      toast.success(kind === "json" ? "Backup ready" : "CSV ready");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Export failed";
      if (!/cancel/i.test(message)) toast.error(message);
    } finally {
      setPending(null);
    }
  }

  async function restore(file: File | undefined) {
    if (!file) return;
    const ok = await commit(async () => {
      importBackup(JSON.parse(await file.text()));
    });
    if (ok) {
      toast.success("Backup restored");
      void navigate({ to: "/" });
      onOpenChange(false);
    }
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <>
      <Modal open={open} onOpenChange={onOpenChange} title="Your data" description="Everything is stored on this device. Keep a backup.">
        <div className="grid gap-3">
          <Button variant="secondary" disabled={pending !== null} onClick={() => void download("json")}>
            {pending === "json" ? "Preparing…" : isNative ? "Back up (share / save file)" : "Download backup (JSON)"}
          </Button>
          <Button variant="secondary" disabled={pending !== null} onClick={() => void download("csv")}>
            {pending === "csv" ? "Preparing…" : isNative ? "Export CSV (share / save file)" : "Download CSV"}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(event) => void restore(event.target.files?.[0])}
          />
          <Button variant="secondary" onClick={() => fileRef.current?.click()}>
            Restore from backup
          </Button>
          {permission === "unsupported" ? (
            <p className="text-sm text-muted">Notifications are not supported here.</p>
          ) : permission === "granted" ? (
            <p className="text-sm text-muted">
              {isNative
                ? "Reminders are on. They arrive at each habit's reminder time, even when Cadence is closed."
                : "Reminders are on. They only fire while Cadence is open."}
            </p>
          ) : permission === "denied" ? (
            <p className="text-sm text-muted">Notifications are blocked. Allow them for Cadence in your phone settings.</p>
          ) : (
            <Button
              variant="secondary"
              onClick={() => {
                void requestReminderPermission().then((next) => {
                  setPermission(next);
                  if (next === "granted" && isNative) void syncNativeReminders(db().habits).catch(() => {});
                });
              }}
            >
              Enable reminders
            </Button>
          )}
          <div className="mt-2 grid gap-2 border-t border-line pt-4">
            <Button variant="danger" onClick={() => setConfirm("sample")}>
              Load sample data
            </Button>
            <Button variant="danger" onClick={() => setConfirm("erase")}>
              Erase all data
            </Button>
          </div>
        </div>
      </Modal>
      <ConfirmModal
        open={confirm === "erase"}
        onOpenChange={(next) => !next && setConfirm(null)}
        title="Erase all data?"
        body="This deletes every habit, log and session on this device. Export a backup first if you might want them back."
        confirmLabel="Erase everything"
        onConfirm={async () => {
          const ok = await commit(async () => resetToEmpty());
          if (ok) {
            void navigate({ to: "/" });
            onOpenChange(false);
          }
          return ok;
        }}
      />
      <ConfirmModal
        open={confirm === "sample"}
        onOpenChange={(next) => !next && setConfirm(null)}
        title="Replace with sample data?"
        body="Your current habits and history will be replaced by the demo habits."
        confirmLabel="Replace"
        onConfirm={async () => {
          const ok = await commit(async () => resetToSample());
          if (ok) {
            void navigate({ to: "/" });
            onOpenChange(false);
          }
          return ok;
        }}
      />
    </>
  );
}
