import { db } from "@/db";

export type IngestionMetadata = {
  runId: string;
  repo: string;
  branch: string;
  commit: string;
  prUser?: string;
  commitHref?: string;
  prHref?: string;
  prTitle?: string;
  buildHref?: string;
  playwrightVersion?: string;
  workers?: number;
  shardCurrent?: number;
  shard_current?: number;
  shardTotal?: number;
  shard_total?: number;
  startTime?: string;
  durationMs?: number;
  expectedCount?: number;
  skippedCount?: number;
  skipped_count?: number;
  flakyCount?: number;
  flaky_count?: number;
  unexpectedCount?: number;
  unexpected_count?: number;
};

/**
 * Ingests the raw report data into the database.
 * Does NOT compute metrics.
 */
export async function ingestRawReport(
  metadata: IngestionMetadata,
  reportJson: any
) {
  const { runId } = metadata;

  // Insert test run using upsert to avoid overwriting existing shard data
  // but updating metadata if it changed.
  await db
    .insertInto("runs")
    .values({
      id: runId,
      pr_user: metadata.prUser ?? "",
      repo: metadata.repo,
      branch: metadata.branch,
      commit_hash: metadata.commit,
      commit_href: metadata.commitHref ?? "",
      pr_href: metadata.prHref ?? "",
      pr_title: metadata.prTitle ?? "",
      build_href: metadata.buildHref ?? "",
      playwright_version: metadata.playwrightVersion ?? "",
      workers: metadata.workers ?? 0,
      shard_current: metadata.shard_current ?? metadata.shardCurrent ?? 0,
      shard_total: metadata.shard_total ?? metadata.shardTotal ?? 0,
      start_time: metadata.startTime ?? new Date().toISOString(),
      duration_ms: metadata.durationMs ?? 0,
      expected_count: metadata.expectedCount ?? 0,
      skipped_count: metadata.skipped_count ?? metadata.skippedCount ?? 0,
      flaky_count: metadata.flaky_count ?? metadata.flakyCount ?? 0,
      unexpected_count: metadata.unexpected_count ?? metadata.unexpectedCount ?? 0,
    })
    .onConflict((oc) =>
      oc.column("id").doUpdateSet({
        pr_user: (eb) => eb.ref("excluded.pr_user"),
        repo: (eb) => eb.ref("excluded.repo"),
        branch: (eb) => eb.ref("excluded.branch"),
        commit_hash: (eb) => eb.ref("excluded.commit_hash"),
        commit_href: (eb) => eb.ref("excluded.commit_href"),
        pr_href: (eb) => eb.ref("excluded.pr_href"),
        pr_title: (eb) => eb.ref("excluded.pr_title"),
        build_href: (eb) => eb.ref("excluded.build_href"),
        playwright_version: (eb) => eb.ref("excluded.playwright_version"),
        // We don't update shard info or counts here as they are partial per shard
        // they will be updated by computeRunMetrics at the end.
      })
    )
    .execute();

  const processSuite = async (suite: any) => {
    for (const spec of suite.specs ?? []) {
      const testId = spec.id;
      const title = spec.title;
      const filePath = spec.file;
      const line = spec.line;

      // Upsert test identity
      await db
        .insertInto("specs")
        .values({ id: testId, title, file: filePath, line })
        .onConflict((oc) => oc.column("id").doNothing())
        .execute();

      for (const test of spec.tests ?? []) {
        const projectId = test.projectName ?? "";
        const resultId = `${runId}:${testId}:${projectId}`;

        // Upsert result for this project
        await db
          .insertInto("results")
          .values({
            id: resultId,
            run_id: runId,
            test_id: testId,
            project_id: projectId,
            project_name: projectId,
            status: spec.ok ? "passed" : "failed", // spec.ok is a general indicator
          })
          .onConflict((oc) =>
            oc.column("id").doUpdateSet({
              status: (eb) => eb.ref("excluded.status"),
            })
          )
          .execute();

        for (const result of test.results ?? []) {
          // Use deterministic ID for attempts: run+test+project+retry
          const attemptId = `${runId}:${testId}:${projectId}:${result.retry}`;
          await db
            .insertInto("attempts")
            .values({
              id: attemptId,
              run_id: runId,
              test_id: testId,
              project_id: projectId,
              status: result.status,
              duration_ms: result.duration,
              retry: result.retry,
              worker_index: result.workerIndex,
              start_time: result.startTime,
              error_msg: result.error?.message ?? null,
            })
            .onConflict((oc) =>
              oc.column("id").doUpdateSet({
                status: (eb) => eb.ref("excluded.status"),
                duration_ms: (eb) => eb.ref("excluded.duration_ms"),
                worker_index: (eb) => eb.ref("excluded.worker_index"),
                start_time: (eb) => eb.ref("excluded.start_time"),
                error_msg: (eb) => eb.ref("excluded.error_msg"),
              })
            )
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
}

/**
 * Computes metrics for a given run based on attempts entries.
 */
export async function computeRunMetrics(runId: string) {
  const results = await db
    .selectFrom("attempts")
    .selectAll()
    .where("run_id", "=", runId)
    .execute();

  if (results.length === 0) return;

  // Compute earliest start and latest end
  let earliestStart: string | null = null;
  let latestEndMs = 0;

  const testIdToResults = new Map<string, any[]>();
  for (const r of results) {
    const arr = testIdToResults.get(r.test_id) ?? [];
    arr.push(r);
    testIdToResults.set(r.test_id, arr);

    if (r.start_time) {
      if (!earliestStart || r.start_time < earliestStart) {
        earliestStart = r.start_time;
      }
      const startMs = Date.parse(r.start_time);
      const endMs = isNaN(startMs) ? 0 : startMs + (r.duration_ms ?? 0);
      if (endMs > latestEndMs) latestEndMs = endMs;
    }
  }

  let expectedCount = 0;
  let skippedCount = 0;
  let flakyCount = 0;
  let unexpectedCount = 0;

  for (const [, arr] of testIdToResults) {
    let maxRetry = -1;
    let finalStatus: string | null = null;
    let hadFail = false;
    let hadPass = false;

    for (const r of arr) {
      if (r.status === "failed") hadFail = true;
      if (r.status === "passed") hadPass = true;
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

  const derivedDuration =
    latestEndMs > 0 && earliestStart
      ? Math.max(0, latestEndMs - Date.parse(earliestStart))
      : 0;

  await db
    .updateTable("runs")
    .set({
      start_time: earliestStart ?? new Date().toISOString(),
      duration_ms: derivedDuration,
      expected_count: expectedCount,
      skipped_count: skippedCount,
      flaky_count: flakyCount,
      unexpected_count: unexpectedCount,
    })
    .where("id", "=", runId)
    .execute();
}
