import { render, route, layout, prefix } from "rwsdk/router";
import { defineApp } from "rwsdk/worker";

import { Document } from "@/app/document";
import { setCommonHeaders } from "@/app/headers";
import { Runs } from "@/app/pages/runs";
import { Layout } from "@/app/layout/layout";
import { RunDetail } from "@/app/pages/run-detail";
import { Leaderboard } from "@/app/pages/leaderboard/leaderboard";
import { TestDetail } from "@/app/pages/spec-detail/spec-detail";
import { RepoSpecs } from "@/app/pages/repo-specs";
import { adminPageRoutes } from "@/app/pages/admin/routes";
import { env } from "cloudflare:workers";
import { ingestRawReport, computeRunMetrics, type IngestionMetadata } from "./db/ingestion";
import { logIngestionTimeline, logIngestionError } from "./db/ingestion-logger";
export { Database } from "@/db/durableObject";

export type AppContext = {};
export type QueueMessage = {
  type: "ingest";
  r2ObjectKey: string;
  metadata?: IngestionMetadata;
};

export const app = defineApp([
  setCommonHeaders(),

  render(Document, [
    layout(Layout, [
      route("/", Leaderboard),
      route("/runs", Runs),
      route("/runs/:org/:repo", Runs),
      route("/runs/:org/:repo/*", RunDetail),
      route("/summary/:org/:repo", RepoSpecs),
      route("/summary/:org/:repo/*", RepoSpecs),
      route("/test-summary/:specId", TestDetail),
      prefix('/admin', adminPageRoutes),
    ]),
  ]),

  route("/upload/", async ({ request, ctx }) => {
    const formData = await request.formData();

    const file = formData.get("file") as File;
    const runId = formData.get("run-id")!.toString();
    const repo = formData.get("repo")!.toString();
    const branch = formData.get("branch")!.toString();
    const commit = formData.get("commit")!.toString();
    const prUser = formData.get("pr-user")?.toString() ?? "";

    const playwrightVersion =
      formData.get("playwright-version")?.toString() ?? "";
    const workers = Number(formData.get("workers") ?? 0);
    const shardCurrent = Number(formData.get("shard-current") ?? 0);
    const shardTotal = Number(formData.get("shard-total") ?? 0);
    const startTime = formData.get("start-time")?.toString() ?? "";
    const durationMs = Number(formData.get("duration-ms") ?? 0);
    const expectedCount = Number(formData.get("expected-count") ?? 0);
    const skippedCount = Number(formData.get("skipped-count") ?? 0);
    const flakyCount = Number(formData.get("flaky-count") ?? 0);
    const unexpectedCount = Number(formData.get("unexpected-count") ?? 0);

    const commitHref = formData.get("commit-href")?.toString() ?? "";
    const prHref = formData.get("pr-href")?.toString() ?? "";
    const prTitle = formData.get("pr-title")?.toString() ?? "";
    const buildHref = formData.get("build-href")?.toString() ?? "";
    const labels = formData.get("labels")?.toString() ?? "";

    const reportJson = JSON.parse(await file.text());

    const metadata: IngestionMetadata = {
      runId,
      repo,
      branch,
      commit,
      prUser,
      playwrightVersion,
      workers,
      shardCurrent,
      shardTotal,
      startTime,
      durationMs,
      expectedCount,
      skippedCount,
      flakyCount,
      unexpectedCount,
      commitHref,
      prHref,
      prTitle,
      buildHref,
      labels,
    };

    // -----------------------------
    // Store raw report in R2 (with metadata)
    // -----------------------------
    const r2ObjectKey = `runs/${repo}/${branch}/${commit}/${runId}.json`;

    // Convert metadata to a Record<string, string> for R2 customMetadata
    const customMetadata: Record<string, string> = {};
    for (const [key, value] of Object.entries(metadata)) {
      if (value !== undefined && value !== null) {
        customMetadata[key] = value.toString();
      }
    }

    await env.R2.put(r2ObjectKey, JSON.stringify(reportJson), {
      httpMetadata: {
        contentType: "application/json",
      },
      customMetadata,
    });

    await logIngestionTimeline({
      runId,
      type: "upload",
      message: `File uploaded to ${r2ObjectKey}`,
      details: {
        repo,
        branch,
        commit,
        size: JSON.stringify(reportJson).length
      }
    });

    // -----------------------------
    // Push to Queue for ingestion
    // -----------------------------
    await env.INGESTION_QUEUE.send({
      type: "ingest",
      r2ObjectKey,
      metadata,
    });

    return new Response(
      JSON.stringify({
        ok: true,
        r2_key: r2ObjectKey,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  }),
]);

export default {
  fetch: app.fetch,
  async queue(
    batch: MessageBatch<QueueMessage>,
    env: Env,
    ctx: ExecutionContext
  ) {
    for (const message of batch.messages) {
      const { type, r2ObjectKey, metadata } = message.body;

      if (type === "ingest") {
        console.log(`[Queue] Ingesting ${r2ObjectKey}...`);
        try {
          const r2Obj = await env.R2.get(r2ObjectKey);
          if (!r2Obj) {
            const errorMsg = `Could not find R2 object: ${r2ObjectKey}`;
            console.error(`[Queue] ${errorMsg}`);
            await logIngestionError(null, errorMsg, { r2ObjectKey });
            continue;
          }

          const reportJson = await r2Obj.json<any>();
          let finalMetadata = metadata;

          if (!finalMetadata) {
            console.log(`[Queue] Metadata missing for ${r2ObjectKey}, deriving...`);
            const customMetadata = r2Obj.customMetadata ?? {};
            const parts = r2ObjectKey.split("/");
            if (parts[0] !== "runs" || parts.length < 5) {
              const errorMsg = `Invalid key format for ingestion: ${r2ObjectKey}. Expected 'runs/repo/branch/commit/runId.json'`;
              console.error(`[Queue] ${errorMsg}`);
              await logIngestionError(null, errorMsg, { r2ObjectKey });
              continue;
            }

            const filename = parts[parts.length - 1];
            const runId = filename.replace(".json", "");
            const commit = parts[parts.length - 2];
            const branch = parts[parts.length - 3];
            const repo = parts.slice(1, parts.length - 3).join("/");

            finalMetadata = {
              runId,
              repo,
              branch,
              commit,
              prUser: customMetadata.prUser,
              playwrightVersion:
                customMetadata.playwrightVersion ||
                reportJson.config?.playwrightVersion,
              workers: customMetadata.workers
                ? Number(customMetadata.workers)
                : undefined,
              shardCurrent: customMetadata.shardCurrent
                ? Number(customMetadata.shardCurrent)
                : undefined,
              shardTotal: customMetadata.shardTotal
                ? Number(customMetadata.shardTotal)
                : undefined,
              startTime: customMetadata.startTime || reportJson.stats?.startTime,
              durationMs: customMetadata.durationMs
                ? Number(customMetadata.durationMs)
                : reportJson.stats?.duration,
              commitHref: customMetadata.commitHref,
              prHref: customMetadata.prHref,
              prTitle: customMetadata.prTitle,
              buildHref: customMetadata.buildHref,
            };
          }

          await ingestRawReport(finalMetadata, reportJson);
          await computeRunMetrics(finalMetadata.runId);
          console.log(`[Queue] Successfully ingested ${finalMetadata.runId}`);
        } catch (error: any) {
          console.error(`[Queue] Error ingesting ${r2ObjectKey}:`, error);
          await logIngestionError(
            metadata?.runId || null,
            `Queue ingestion failed: ${error.message}`,
            { r2ObjectKey, error: error.stack }
          );
          // Retrying depends on the error, but for now we'll let it fail or the user can re-ingest.
          // Cloudflare Queues will retry automatically if we throw or don't ack.
          throw error;
        }
      }
    }
  },
};
