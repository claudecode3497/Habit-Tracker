import { createFileRoute } from "@tanstack/react-router";
import { TodayPage } from "@/components/today";

export const Route = createFileRoute("/_app/")({
  component: TodayPage,
});
