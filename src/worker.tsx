import { render, route, layout } from "rwsdk/router";
import { defineApp } from "rwsdk/worker";

import { Document } from "@/app/document";
import { setCommonHeaders } from "@/app/headers";
import { Home } from "@/app/pages/home";
import { Runs } from "@/app/pages/runs";
import { Layout } from "@/app/layout/layout";
import { RunDetail } from "@/app/pages/run-detail";
import { Leaderboard } from "@/app/pages/leaderboard/leaderboard";
import { TestDetail } from "@/app/pages/spec-detail/spec-detail";
import { RepoSpecs } from "@/app/pages/repo-specs";
import { adminApiRoutes, adminPageRoutes } from "@/app/pages/admin/routes";
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
      route("/", Leaderboard),
      route("/runs", Runs),
      route("/runs/:commitHash", RunDetail),
      route("/runs/:org/:repo", Runs),
      route("/runs/:org/:repo/test-summary", RepoSpecs),
      route("/runs/:org/:repo/:branch", Runs),
      route("/runs/:org/:repo/:branch/test-summary", RepoSpecs),
      route("/test-summary/:specId", TestDetail),
      ...adminPageRoutes,
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
  ...adminApiRoutes,
]);
