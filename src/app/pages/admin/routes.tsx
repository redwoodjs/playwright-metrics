import { route, prefix } from "rwsdk/router";
import { Reingest } from "./reingest";
import { Logs } from "./logs";
import { backfillMetrics } from "./backfill-actions";
import { archiveStaleR2Objects } from "./archive-actions";
import {
  queueAllR2ForReingest,
  resetAllIngestedData,
} from "./reingest-all-actions";
import { getAdminStats } from "./stats-actions";


export const adminPageRoutes = [
  route("/reingest", Reingest),
  route("/logs", Logs),
  route("/backfill", async () => {
    const stats = await backfillMetrics();
    return new Response(`Backfill complete! Processed ${stats.metricCount} test/branch pairs.`);
  }),
  route("/stats", async () => {
    const result = await getAdminStats();
    return Response.json(result);
  }),
  route("/reingest-all/reset", async ({ request }) => {
    const url = new URL(request.url);
    const chunkSize = Number(url.searchParams.get("chunk") ?? 5000);
    const maxChunks = Number(url.searchParams.get("maxChunks") ?? 50);
    const result = await resetAllIngestedData({ chunkSize, maxChunks });
    return Response.json(result);
  }),
  route("/reingest-all/queue", async ({ request }) => {
    const url = new URL(request.url);
    const cursor = url.searchParams.get("cursor") ?? undefined;
    const reset = url.searchParams.get("reset") === "1";
    const result = await queueAllR2ForReingest({ cursor, reset });
    return Response.json(result);
  }),
  route("/archive-stale", async ({ request }) => {
    const url = new URL(request.url);
    const days = Number(url.searchParams.get("days") ?? 14);
    const cursor = url.searchParams.get("cursor") ?? undefined;
    const pageSize = Number(url.searchParams.get("pageSize") ?? 300);
    const parallelism = Number(url.searchParams.get("parallelism") ?? 50);

    const result = await archiveStaleR2Objects({
      days,
      cursor,
      pageSize,
      parallelism,
    });
    return Response.json(result);
  }),
]
