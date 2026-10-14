import { useRouter } from "@tanstack/react-router";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { localDay, type TrackerPayload } from "@/lib/domain";

type TrackerContextValue = TrackerPayload & {
  nowMs: number;
  commit: (fn: () => Promise<unknown>) => Promise<boolean>;
};

const TrackerContext = createContext<TrackerContextValue | null>(null);

function errorText(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "string" && err) return err;
  return "Something went wrong";
}

export function TrackerProvider({ data, children }: { data: TrackerPayload; children: ReactNode }) {
  const router = useRouter();
  const [now, setNow] = useState<number | null>(null);
  const running = data.sessions.some((session) => session.status === "running");

  useEffect(() => {
    const refreshIfNewDay = () => {
      if (document.visibilityState === "visible" && localDay() !== data.today) void router.invalidate();
    };
    refreshIfNewDay();
    document.addEventListener("visibilitychange", refreshIfNewDay);
    const id = window.setInterval(refreshIfNewDay, 60000);
    return () => {
      document.removeEventListener("visibilitychange", refreshIfNewDay);
      window.clearInterval(id);
    };
  }, [data.today, router]);

  useEffect(() => {
    if (!running) return;
    const tick = () => setNow(Date.now());
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [running]);

  const commit = useCallback(
    async (fn: () => Promise<unknown>) => {
      try {
        await fn();
        await router.invalidate();
        return true;
      } catch (err) {
        toast.error(errorText(err));
        return false;
      }
    },
    [router],
  );

  const value = useMemo<TrackerContextValue>(
    () => ({
      ...data,
      nowMs: now ?? Date.parse(data.serverNow),
      commit,
    }),
    [data, now, commit],
  );

  return <TrackerContext.Provider value={value}>{children}</TrackerContext.Provider>;
}

export function useTracker() {
  const value = useContext(TrackerContext);
  if (!value) throw new Error("Tracker is unavailable");
  return value;
}
