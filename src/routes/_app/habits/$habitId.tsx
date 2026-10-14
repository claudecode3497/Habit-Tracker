import { createFileRoute } from "@tanstack/react-router";
import { HabitDetail } from "@/components/habit-detail";

export const Route = createFileRoute("/_app/habits/$habitId")({
  component: HabitRoute,
});

function HabitRoute() {
  const { habitId } = Route.useParams();
  return <HabitDetail habitId={habitId} />;
}
