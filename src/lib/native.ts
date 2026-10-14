/** Phone-only features (reminders, saving files). Everything degrades to web behaviour in a browser. */
import { Capacitor } from "@capacitor/core";
import { downloadText, type Habit } from "@/lib/domain";

export const isNative = Capacitor.isNativePlatform();

export type ReminderPermission = "granted" | "denied" | "default" | "unsupported";

export async function getReminderPermission(): Promise<ReminderPermission> {
  if (isNative) {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    const res = await LocalNotifications.checkPermissions();
    return res.display === "granted" ? "granted" : res.display === "denied" ? "denied" : "default";
  }
  return typeof Notification === "undefined" ? "unsupported" : Notification.permission;
}

export async function requestReminderPermission(): Promise<ReminderPermission> {
  if (isNative) {
    const { LocalNotifications } = await import("@capacitor/local-notifications");
    const res = await LocalNotifications.requestPermissions();
    return res.display === "granted" ? "granted" : "denied";
  }
  if (typeof Notification === "undefined") return "unsupported";
  return Notification.requestPermission();
}

/**
 * Schedules one repeating weekly notification per habit per scheduled weekday.
 * They fire even when the app is closed. Safe to call whenever habits change.
 */
export async function syncNativeReminders(habits: Habit[]): Promise<void> {
  if (!isNative) return;
  const { LocalNotifications } = await import("@capacitor/local-notifications");
  const perm = await LocalNotifications.checkPermissions();
  const pending = await LocalNotifications.getPending();
  if (pending.notifications.length) {
    await LocalNotifications.cancel({ notifications: pending.notifications.map((n) => ({ id: n.id })) });
  }
  if (perm.display !== "granted") return;
  const notifications = habits
    .filter((h) => !h.archived && h.reminderMinutes != null)
    .flatMap((h) =>
      h.weekdays
        .split(",")
        .filter((d) => /^[0-6]$/.test(d))
        .map((d) => ({
          id: h.id * 10 + Number(d),
          title: "Cadence",
          body: `Time for ${h.name}.`,
          // Capacitor weekdays: 1 = Sunday … 7 = Saturday
          schedule: {
            on: { weekday: Number(d) + 1, hour: Math.floor(h.reminderMinutes! / 60), minute: h.reminderMinutes! % 60 },
            allowWhileIdle: true,
          },
        })),
    );
  if (notifications.length) await LocalNotifications.schedule({ notifications });
}

/** Saves a text file: a normal download in a browser, the system share sheet on a phone. */
export async function saveTextFile(filename: string, content: string, type: string): Promise<void> {
  if (!isNative) {
    downloadText(filename, content, type);
    return;
  }
  const { Filesystem, Directory, Encoding } = await import("@capacitor/filesystem");
  const { Share } = await import("@capacitor/share");
  const written = await Filesystem.writeFile({ path: filename, data: content, directory: Directory.Cache, encoding: Encoding.UTF8 });
  await Share.share({ title: filename, url: written.uri, dialogTitle: "Save your Cadence backup" });
}

/**
 * Keeps the status-bar and navigation-bar icons readable: light icons when the
 * app is in dark mode, dark icons in light mode (the app theme can differ from the phone's).
 */
export function watchSystemBarStyle(): void {
  if (!isNative) return;
  const apply = async () => {
    const { SystemBars, SystemBarsStyle } = await import("@capacitor/core");
    const dark = document.documentElement.classList.contains("dark");
    await SystemBars.setStyle({ style: dark ? SystemBarsStyle.Dark : SystemBarsStyle.Light });
  };
  void apply().catch(() => {});
  new MutationObserver(() => void apply().catch(() => {})).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });
}