import { createFileRoute } from "@tanstack/react-router";
import { InsightsPage } from "@/components/insights";

export const Route = createFileRoute("/_app/insights")({
  component: InsightsPage,
});
