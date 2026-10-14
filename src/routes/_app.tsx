import { createFileRoute, Outlet } from "@tanstack/react-router";
import { Toaster } from "sonner";
import { AppShell } from "@/components/shell";
import { TrackerProvider } from "@/components/tracker";
import { AppErrorComponent } from "@/lib/error-component";
import { loadTracker } from "@/lib/habits.functions";

export const Route = createFileRoute("/_app")({
  loader: () => loadTracker(),
  errorComponent: AppErrorComponent,
  component: AppLayout,
});

function AppLayout() {
  const data = Route.useLoaderData();
  return (
    <TrackerProvider data={data}>
      <AppShell>
        <Outlet />
      </AppShell>
      <Toaster
        position="top-center"
        toastOptions={{
          style: {
            background: "var(--c-paper)",
            color: "var(--c-ink)",
            border: "1px solid var(--c-line)",
          },
        }}
      />
    </TrackerProvider>
  );
}
