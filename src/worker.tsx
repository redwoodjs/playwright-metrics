import { render, route, layout } from "rwsdk/router";
import { defineApp } from "rwsdk/worker";

import { Document } from "@/app/Document";
import { setCommonHeaders } from "@/app/headers";
import { Home } from "@/app/pages/Home";
import { Runs } from "@/app/pages/Runs";
import { Flakiest } from "@/app/pages/Flakiest";
import { Health } from "@/app/pages/Health";
import { AppLayout } from "@/app/layout/AppLayout";
import { RunDetail } from "@/app/pages/RunDetail";
import { env } from "cloudflare:workers";
import { db } from "./db";
export { Database } from "@/db/durableObject";

export type AppContext = {};

export default defineApp([
  setCommonHeaders(),
  ({ ctx }) => {
    ctx;
  },
  render(
    Document,
    [
      layout(AppLayout, [
        route("/health", Health),
        route("/", Home),
        route("/runs", Runs),
        route("/runs/:runId", RunDetail),
        route("/tests", Flakiest),
      ]),
    ],
  ),

  route("/upload/", async ({ request }) => {
    const formData = await request.formData();

    const file = formData.get("file") as File;
    const runId = formData.get("run-id")!.toString();
    const repo = formData.get("repo")!.toString();
    const branch = formData.get("branch")!.toString();
    const commit = formData.get("commit")!.toString();
    const prUser = formData.get("pr-user")?.toString() ?? "";

    const playwrightVersion = formData.get("playwright-version")?.toString() ?? "";
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

    // -----------------------------
    // Insert test run
    // -----------------------------
    await db
      .insertInto("test_run")
      .values({
        id: runId,
        pr_user: prUser,
        repo,
        branch,
        commit_hash: commit,
        commit_href: commitHref,
        pr_href: prHref,
        pr_title: prTitle,
        build_href: buildHref,
        playwright_version: playwrightVersion,
        workers,
        shard_current: shardCurrent,
        shard_total: shardTotal,
        start_time: startTime,
        duration_ms: durationMs,
        expected_count: expectedCount,
        skipped_count: skippedCount,
        flaky_count: flakyCount,
        unexpected_count: unexpectedCount,
      })
      .execute();

    // -----------------------------
    // Store raw report in R2
    // -----------------------------
    const r2ObjectKey = `runs/${repo}/${branch}/${commit}/${runId}.json`;

    await env.R2.put(r2ObjectKey, JSON.stringify(reportJson), {
      httpMetadata: {
        contentType: "application/json",
      },
    });

    // -----------------------------
    // Normalize tests (handles nested suites)
    // -----------------------------
    const processSuite = async (suite: any) => {
      for (const spec of suite.specs ?? []) {
        const testId = spec.id;
        const title = spec.title;
        const filePath = spec.file;
        const line = spec.line;
        // Upsert test identity
        await db
          .insertInto("test")
          .values({ id: testId, title, file: filePath, line })
          .onConflict((oc) => oc.column("id").doNothing())
          .execute();
        // Link test to run
        await db
          .insertInto("test_run_test")
          .values({
            id: crypto.randomUUID(),
            run_id: runId,
            test_id: testId,
            status: spec.ok ? "passed" : "failed",
            project_name: spec.projectName ?? undefined,
            project_id: (spec as any).projectId ?? spec.projectName ?? undefined,
          })
          .execute();
        // Attempts
        for (const test of spec.tests ?? []) {
          for (const result of test.results ?? []) {
            await db
              .insertInto("test_result")
              .values({
                id: crypto.randomUUID(),
                run_id: runId,
                test_id: testId,
                project_id: test.projectName,
                status: result.status,
                duration_ms: result.duration,
                retry: result.retry,
                worker_index: result.workerIndex,
                start_time: result.startTime,
                error_msg: result.error?.message ?? null,
              })
              .execute();
          }
        }
      }
      for (const child of suite.suites ?? []) {
        await processSuite(child);
      }
    };
    for (const suite of reportJson.suites ?? []) {
      await processSuite(suite);
    }

    // -----------------------------
    // Derive run-level metrics if not provided
    // -----------------------------
    const results = await db
      .selectFrom("test_result")
      .selectAll()
      .where("run_id", "=", runId)
      .execute();

    if (results.length > 0) {
      // Compute earliest start and latest end (start + duration)
      let earliestStart: string | null = null;
      let latestEndMs = 0;

      const testIdToResults = new Map<string, typeof results>();
      for (const r of results) {
        // group by test
        const arr = (testIdToResults.get(r.test_id) as any[]) ?? [];
        arr.push(r);
        testIdToResults.set(r.test_id, arr as any);

        // time math
        if (r.start_time) {
          if (!earliestStart || r.start_time < earliestStart) {
            earliestStart = r.start_time;
          }
          const startMs = Date.parse(r.start_time);
          const endMs = isNaN(startMs) ? 0 : startMs + (r.duration_ms ?? 0);
          if (endMs > latestEndMs) latestEndMs = endMs;
        }
      }

      // Categorize per test final status
      let expectedCount = 0;
      let skippedCount = 0;
      let flakyCount = 0;
      let unexpectedCount = 0;

      for (const [, arr] of testIdToResults) {
        let maxRetry = -1;
        let finalStatus: string | null = null;
        let hadFail = false;
        let hadPass = false;
        let hadSkipped = false;
        for (const r of arr as any[]) {
          if (r.status === "failed") hadFail = true;
          if (r.status === "passed") hadPass = true;
          if (r.status === "skipped") hadSkipped = true;
          if ((r.retry ?? 0) >= maxRetry) {
            maxRetry = r.retry ?? 0;
            finalStatus = r.status ?? null;
          }
        }
        const flakyInRun = hadFail && hadPass;
        if (finalStatus === "skipped") {
          skippedCount += 1;
        } else if (flakyInRun) {
          flakyCount += 1;
        } else if (finalStatus === "failed") {
          unexpectedCount += 1;
        } else if (finalStatus === "passed") {
          expectedCount += 1;
        }
      }

      // Fallback values if missing
      const derivedStart = earliestStart ?? startTime ?? new Date().toISOString();
      const derivedDuration =
        latestEndMs > 0 && earliestStart
          ? Math.max(0, latestEndMs - Date.parse(earliestStart))
          : durationMs ?? 0;

      await db
        .updateTable("test_run")
        .set({
          start_time: startTime || derivedStart,
          duration_ms: durationMs || derivedDuration,
          expected_count: expectedCount,
          skipped_count: skippedCount,
          flaky_count: flakyCount,
          unexpected_count: unexpectedCount,
        })
        .where("id", "=", runId)
        .execute();
    }

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

  // Debug: list runs as JSON to verify state visibility
  route("/api/runs", async () => {
    const runs = await db
      .selectFrom("test_run")
      .selectAll()
      .orderBy("start_time", "desc")
      .execute();
    return new Response(JSON.stringify(runs, null, 2), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }),
]);