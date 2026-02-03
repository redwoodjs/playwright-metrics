import { route, prefix } from "rwsdk/router";
import { Reingest } from "./reingest";
import { Logs } from "./logs";
import { backfillMetrics } from "./backfill-actions";


export const adminPageRoutes = [
  route("/reingest", Reingest),
  route("/logs", Logs),
  route("/backfill", async () => {
    const stats = await backfillMetrics();
    return new Response(`Backfill complete! Processed ${stats.metricCount} test/branch pairs.`);
  })
]
