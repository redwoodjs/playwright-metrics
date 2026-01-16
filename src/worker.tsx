import { render, route, layout } from "rwsdk/router";
import { defineApp } from "rwsdk/worker";

import { Document } from "@/app/document";
import { setCommonHeaders } from "@/app/headers";
import { Home } from "@/app/pages/home";
import { Runs } from "@/app/pages/runs";
import { Flakiest } from "@/app/pages/flakiest";
import { Health } from "@/app/pages/health";
import { AppLayout as Layout } from "@/app/layout/app-layout";
import { RunDetail } from "@/app/pages/run-detail";
import { Reingest } from "@/app/pages/admin/reingest";
import { Leaderboard } from "@/app/pages/leaderboard/leaderboard";
import { TestDetail } from "@/app/pages/test-detail/test-detail";
import { env, waitUntil } from "cloudflare:workers";
import { db } from "./db";
import {
  ingestRawReport,
  computeRunMetrics,
  type IngestionMetadata,
} from "./db/ingestion";
export { Database } from "@/db/durableObject";

export type AppContext = {};

export default defineApp([
  setCommonHeaders(),

  render(Document, [
    layout(Layout, [
      route("/health", Health),
      route("/", Home),
      route("/runs", Runs),
      route("/runs/:runId", RunDetail),
      route("/tests", Flakiest),
      route("/leaderboard", Leaderboard),
      route("/tests/:testId", TestDetail),
      route("/admin/reingest", Reingest),
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

    // -----------------------------
    // Ingest and compute metrics
    // -----------------------------
    waitUntil(
      (async () => {
        await ingestRawReport(metadata, reportJson);
        await computeRunMetrics(runId);
      })()
    );

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

  route("/admin/reingest", async ({ request }) => {
    // Handle POST requests for actual re-ingestion
    if (request.method === "POST") {
      const formData = await request.formData();
      const keys = formData.getAll("keys") as string[];

      if (keys.length === 0) {
        return new Response(
          JSON.stringify({ ok: false, error: "No files selected" }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          }
        );
      }

      console.log(
        `[Re-ingest] Starting re-ingestion of ${keys.length} files...`
      );

      let count = 0;
      const errors: string[] = [];

      for (const key of keys) {
        try {
          console.log(`[Re-ingest] Processing ${key}...`);

          const r2Obj = await env.R2.get(key);
          if (!r2Obj) {
            console.log(`[Re-ingest] Skipping ${key}, could not fetch.`);
            errors.push(`${key}: could not fetch`);
            continue;
          }

          const reportJson = await r2Obj.json<any>();
          const customMetadata = r2Obj.customMetadata ?? {};

          // Parse key: runs/${repo}/${branch}/${commit}/${runId}.json
          const parts = key.split("/");
          if (parts.length !== 5) {
            errors.push(`${key}: invalid key format`);
            continue;
          }

          const repo = parts[1];
          const branch = parts[2];
          const commit = parts[3];
          const filename = parts[4];
          const runId = filename.replace(".json", "");

          const metadata: IngestionMetadata = {
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
            expectedCount: customMetadata.expectedCount
              ? Number(customMetadata.expectedCount)
              : undefined,
            skippedCount: customMetadata.skippedCount
              ? Number(customMetadata.skippedCount)
              : undefined,
            flakyCount: customMetadata.flakyCount
              ? Number(customMetadata.flakyCount)
              : undefined,
            unexpectedCount: customMetadata.unexpectedCount
              ? Number(customMetadata.unexpectedCount)
              : undefined,
            commitHref: customMetadata.commitHref,
            prHref: customMetadata.prHref,
            prTitle: customMetadata.prTitle,
            buildHref: customMetadata.buildHref,
          };

          await ingestRawReport(metadata, reportJson);
          await computeRunMetrics(runId);
          count++;
        } catch (error) {
          const errorMsg =
            error instanceof Error ? error.message : String(error);
          console.error(`[Re-ingest] Error processing ${key}:`, errorMsg);
          errors.push(`${key}: ${errorMsg}`);
        }
      }

      console.log(`[Re-ingest] Finished re-ingesting ${count} runs.`);

      return new Response(
        JSON.stringify({
          ok: true,
          count,
          errors: errors.length > 0 ? errors : undefined,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // GET requests are handled by the Reingest page component via the route above
    return new Response("Method not allowed", { status: 405 });
  }),

  // Debug: list runs as JSON to verify state visibility
  route("/api/runs", async () => {
    const runs = await db
      .selectFrom("runs")
      .selectAll()
      .orderBy("start_time", "desc")
      .execute();
    return new Response(JSON.stringify(runs, null, 2), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }),
]);
