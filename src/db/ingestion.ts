import { db, sql } from "@/db";
import { env } from "cloudflare:workers";
import { logIngestionTimeline } from "./ingestion-logger";

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
  labels?: string;
};

/**
 * Log an ingestion-related event to R2.
 */
export async function logIngestionEvent(
  params: {
    runId?: string | null;
    level: "info" | "warn" | "error";
    message: string;
    context?: any;
  }
) {
  const timestamp = new Date().toISOString();
  const runId = params.runId ?? "unknown";
  const logId = crypto.randomUUID();
  const logKey = `logs/${runId}/${timestamp.replace(/[:.]/g, "-")}-${logId}.json`;

  const logData = {
    runId: params.runId,
    level: params.level,
    message: params.message,
    context: params.context,
    timestamp,
  };

  try {
    if (env.R2) {
      await env.R2.put(logKey, JSON.stringify(logData), {
        httpMetadata: { contentType: "application/json" },
        customMetadata: {
          runId: runId,
          level: params.level,
        },
      });
    } else {
      console.warn("[logIngestionEvent] R2 binding not found, logging to console only.");
      console.log(JSON.stringify(logData));
    }
  } catch (err) {
    console.error("[logIngestionEvent] Failed to log to R2:", err);
    console.log(JSON.stringify(logData));
  }
}

/**
 * Ingests the raw report data into the database.
 * Does NOT compute metrics.
 */
export async function ingestRawReport(
  metadata: IngestionMetadata,
  reportJson: any
) {
  const { runId } = metadata;

  await logIngestionEvent({
    runId,
    level: "info",
    message: `Starting ingestion for run ${runId}`,
    context: {
      repo: metadata.repo,
      branch: metadata.branch,
      commit: metadata.commit,
    },
  });

  await logIngestionTimeline({
    runId,
    type: "ingest_start",
    message: `Started ingesting raw report`,
    details: {
      repo: metadata.repo,
      branch: metadata.branch
    }
  });

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
      unexpected_count:
        metadata.unexpected_count ?? metadata.unexpectedCount ?? 0,
      labels: metadata.labels ?? "",
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
        labels: (eb) => eb.ref("excluded.labels"),
        // We don't update shard info or counts here as they are partial per shard
        // they will be updated by computeRunMetrics at the end.
      })
    )
    .execute();

  const specs: any[] = [];
  const results: any[] = [];
  const attempts: any[] = [];

  const processSuite = (suite: any) => {
    for (const spec of suite.specs ?? []) {
      const testId = spec.id;
      const title = spec.title;
      const filePath = spec.file;
      const line = spec.line;

      specs.push({ id: testId, title, file: filePath, line });

      for (const test of spec.tests ?? []) {
        const projectId = test.projectName ?? "";
        const resultId = `${runId}:${testId}:${projectId}`;

        // Compute final status from attempts if available
        const lastResult =
          test.results && test.results.length > 0
            ? test.results[test.results.length - 1]
            : null;
        const computedStatus = lastResult
          ? lastResult.status
          : spec.ok
          ? "passed"
          : "failed";

        results.push({
          id: resultId,
          run_id: runId,
          test_id: testId,
          project_id: projectId,
          project_name: projectId,
          status: computedStatus,
        });

        for (const result of test.results ?? []) {
          // Use deterministic ID for attempts: run+test+project+retry
          const attemptId = `${runId}:${testId}:${projectId}:${result.retry}`;
          attempts.push({
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
          });
        }
      }
    }
    for (const child of suite.suites ?? []) {
      processSuite(child);
    }
  };

  for (const suite of reportJson.suites ?? []) {
    processSuite(suite);
  }

  await logIngestionEvent({
    runId,
    level: "info",
    message: `Processed report JSON: Found ${specs.length} specs, ${results.length} results, ${attempts.length} attempts`,
  });

  // Bulk inserts with chunking
  // Cloudflare D1 has a hard limit of 100 variables per statement.
  if (specs.length > 0) {
    const CHUNK_SIZE = 15; // 4 columns * 15 = 60 variables
    for (let i = 0; i < specs.length; i += CHUNK_SIZE) {
      const chunk = specs.slice(i, i + CHUNK_SIZE);
      await db
        .insertInto("specs")
        .values(chunk)
        .onConflict((oc) => oc.column("id").doNothing())
        .execute();
    }
  }

  if (results.length > 0) {
    const CHUNK_SIZE = 10; // 6 columns * 10 = 60 variables
    for (let i = 0; i < results.length; i += CHUNK_SIZE) {
      const chunk = results.slice(i, i + CHUNK_SIZE);
      await db
        .insertInto("results")
        .values(chunk)
        .onConflict((oc) =>
          oc.column("id").doUpdateSet({
            status: (eb) => eb.ref("excluded.status"),
          })
        )
        .execute();
    }
  }

  if (attempts.length > 0) {
    const CHUNK_SIZE = 5; // 10 columns * 5 = 50 variables
    for (let i = 0; i < attempts.length; i += CHUNK_SIZE) {
      const chunk = attempts.slice(i, i + CHUNK_SIZE);
      await db
        .insertInto("attempts")
        .values(chunk)
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

  await logIngestionEvent({
    runId,
    level: "info",
    message: `Raw report ingestion completed for run ${runId}`,
  });

  await logIngestionTimeline({
    runId,
    type: "ingest_complete",
    message: `Ingestion completed`,
    details: {
      specs: specs.length,
      results: results.length
    }
  });
}

/**
 * Computes metrics for a given run based on attempts entries.
 */
export async function computeRunMetrics(runId: string) {
  const run = await db
    .selectFrom("runs")
    .selectAll()
    .where("id", "=", runId)
    .executeTakeFirst();

  if (!run) {
    await logIngestionEvent({
      runId,
      level: "error",
      message: `Cannot compute metrics: Run ${runId} not found in database`,
    });
    return;
  }

  await logIngestionEvent({
    runId,
    level: "info",
    message: `Computing metrics for run ${runId}`,
  });

  const branch = run.branch;

  const attempts = await db
    .selectFrom("attempts")
    .selectAll()
    .where("run_id", "=", runId)
    .execute();

  if (attempts.length === 0) {
    await logIngestionEvent({
      runId,
      level: "warn",
      message: `No attempts found for run ${runId}. Metrics will be zeroed.`,
    });
    return;
  }

  // Compute earliest start and latest end
  let earliestStart: string | null = null;
  let latestEndMs = 0;

  const testProjectToResults = new Map<string, any[]>();
  for (const r of attempts) {
    const key = `${r.test_id}:${r.project_id ?? ""}`;
    const arr = testProjectToResults.get(key) ?? [];
    arr.push(r);
    testProjectToResults.set(key, arr);

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

  const resultsToUpdate: any[] = [];

  for (const [key, arr] of testProjectToResults) {
    const [testId, projectId] = key.split(":");
    let maxRetry = -1;
    let finalStatus: string | null = null;
    let hadFail = false;
    let hadPass = false;
    let retryDurationMs = 0;
    let retryCount = 0;
    let finalDurationMs = 0;
    let startTime: string | null = null;

    for (const r of arr) {
      const isFailed =
        r.status === "failed" ||
        r.status === "timedOut" ||
        r.status === "interrupted";
      if (isFailed) hadFail = true;
      if (r.status === "passed") hadPass = true;

      if ((r.retry ?? 0) > 0) {
        retryDurationMs += r.duration_ms ?? 0;
        retryCount += 1;
      }

      if ((r.retry ?? 0) >= maxRetry) {
        maxRetry = r.retry ?? 0;
        finalStatus = r.status ?? null;
        finalDurationMs = r.duration_ms ?? 0;
        startTime = r.start_time;
      }
    }

    const flakyInRun = hadFail && hadPass;
    if (finalStatus === "skipped") {
      skippedCount += 1;
    } else if (flakyInRun) {
      flakyCount += 1;
    } else if (
      finalStatus === "failed" ||
      finalStatus === "timedOut" ||
      finalStatus === "interrupted"
    ) {
      unexpectedCount += 1;
    } else if (finalStatus === "passed") {
      expectedCount += 1;
    }

    if (finalStatus) {
      resultsToUpdate.push({
        id: `${runId}:${testId}:${projectId}`,
        run_id: runId,
        test_id: testId,
        project_id: projectId,
        project_name: projectId,
        status: finalStatus,
        branch,
        was_flaky: flakyInRun,
        had_failure: hadFail,
        retry_duration_ms: retryDurationMs,
        retry_count: retryCount,
        final_duration_ms: finalDurationMs,
        start_time: startTime ?? run.start_time,
      });
    }
  }

  // Bulk update results status
  if (resultsToUpdate.length > 0) {
    const CHUNK_SIZE = 5;
    for (let i = 0; i < resultsToUpdate.length; i += CHUNK_SIZE) {
      const chunk = resultsToUpdate.slice(i, i + CHUNK_SIZE);
      await db
        .insertInto("results")
        .values(chunk)
        .onConflict((oc) =>
          oc.column("id").doUpdateSet({
            status: (eb) => eb.ref("excluded.status"),
            branch: (eb) => eb.ref("excluded.branch"),
            was_flaky: (eb) => eb.ref("excluded.was_flaky"),
            had_failure: (eb) => eb.ref("excluded.had_failure"),
            retry_duration_ms: (eb) => eb.ref("excluded.retry_duration_ms"),
            retry_count: (eb) => eb.ref("excluded.retry_count"),
            final_duration_ms: (eb) => eb.ref("excluded.final_duration_ms"),
            start_time: (eb) => eb.ref("excluded.start_time"),
          }),
        )
        .execute();
    }

    const testMetricsToUpdate = new Map<string, any>();
    for (const res of resultsToUpdate) {
      const metricKey = `${res.test_id}:${res.branch}`;
      const existing = testMetricsToUpdate.get(metricKey) || {
        test_id: res.test_id,
        branch: res.branch,
        total_runs: 0,
        flaky_runs: 0,
        runs_with_failure: 0,
        retry_duration_total_ms: 0,
        retry_count_total: 0,
        duration_total_ms: 0,
        last_flaky_start_time: null,
      };

      existing.total_runs += 1;
      if (res.was_flaky) {
        existing.flaky_runs += 1;
        if (
          !existing.last_flaky_start_time ||
          res.start_time > existing.last_flaky_start_time
        ) {
          existing.last_flaky_start_time = res.start_time;
        }
      }
      if (res.had_failure) existing.runs_with_failure += 1;
      existing.retry_duration_total_ms += res.retry_duration_ms;
      existing.retry_count_total += res.retry_count;
      existing.duration_total_ms += res.final_duration_ms;

      testMetricsToUpdate.set(metricKey, existing);
    }

    const metricsToUpdate = Array.from(testMetricsToUpdate.values());
    const METRIC_CHUNK = 5;
    for (let i = 0; i < metricsToUpdate.length; i += METRIC_CHUNK) {
      const chunk = metricsToUpdate.slice(i, i + METRIC_CHUNK);
      for (const metric of chunk) {
        await db
          .insertInto("test_metrics")
          .values(metric)
          .onConflict((oc) =>
            oc.columns(["test_id", "branch"]).doUpdateSet({
              total_runs: (eb) =>
                sql`test_metrics.total_runs + ${metric.total_runs}`,
              flaky_runs: (eb) =>
                sql`test_metrics.flaky_runs + ${metric.flaky_runs}`,
              runs_with_failure: (eb) =>
                sql`test_metrics.runs_with_failure + ${metric.runs_with_failure}`,
              retry_duration_total_ms: (eb) =>
                sql`test_metrics.retry_duration_total_ms + ${metric.retry_duration_total_ms}`,
              retry_count_total: (eb) =>
                sql`test_metrics.retry_count_total + ${metric.retry_count_total}`,
              duration_total_ms: (eb) =>
                sql`test_metrics.duration_total_ms + ${metric.duration_total_ms}`,
              last_flaky_start_time: (eb) =>
                metric.last_flaky_start_time
                  ? sql`MAX(COALESCE(test_metrics.last_flaky_start_time, ''), ${metric.last_flaky_start_time})`
                  : eb.ref("test_metrics.last_flaky_start_time"),
            }),
          )
          .execute();
      }
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

  await logIngestionEvent({
    runId,
    level: "info",
    message: `Metrics computation completed for run ${runId}`,
    context: {
      expected: expectedCount,
      flaky: flakyCount,
      unexpected: unexpectedCount,
      skipped: skippedCount,
    },
  });
}

/**
 * Ingests a batch of reports into the database.
 * This is more efficient than calling ingestRawReport for each report.
 */
export async function ingestReportsBatch(
  reports: { metadata: IngestionMetadata; reportJson: any }[]
) {
  if (reports.length === 0) return;

  const runs: any[] = [];
  const specs: any[] = [];
  const results: any[] = [];
  const attempts: any[] = [];

  for (const { metadata, reportJson } of reports) {
    const { runId } = metadata;

    runs.push({
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
      unexpected_count:
        metadata.unexpected_count ?? metadata.unexpectedCount ?? 0,
      labels: metadata.labels ?? "",
    });

    const processSuite = (suite: any) => {
      for (const spec of suite.specs ?? []) {
        const testId = spec.id;
        specs.push({
          id: testId,
          title: spec.title,
          file: spec.file,
          line: spec.line,
        });

        for (const test of spec.tests ?? []) {
          const projectId = test.projectName ?? "";
          const resultId = `${runId}:${testId}:${projectId}`;

          const lastResult =
            test.results && test.results.length > 0
              ? test.results[test.results.length - 1]
              : null;
          const computedStatus = lastResult
            ? lastResult.status
            : spec.ok
            ? "passed"
            : "failed";

          results.push({
            id: resultId,
            run_id: runId,
            test_id: testId,
            project_id: projectId,
            project_name: projectId,
            status: computedStatus,
          });

          for (const result of test.results ?? []) {
            attempts.push({
              id: `${runId}:${testId}:${projectId}:${result.retry}`,
              run_id: runId,
              test_id: testId,
              project_id: projectId,
              status: result.status,
              duration_ms: result.duration,
              retry: result.retry,
              worker_index: result.workerIndex,
              start_time: result.startTime,
              error_msg: result.error?.message ?? null,
            });
          }
        }
      }
      for (const child of suite.suites ?? []) {
        processSuite(child);
      }
    };

    for (const suite of reportJson.suites ?? []) {
      processSuite(suite);
    }
  }

  // Cloudflare D1 Variable Limit: 100
  // runs: 21 cols -> chunk 4
  const RUN_CHUNK = 4;
  for (let i = 0; i < runs.length; i += RUN_CHUNK) {
    await db
      .insertInto("runs")
      .values(runs.slice(i, i + RUN_CHUNK))
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
          labels: (eb) => eb.ref("excluded.labels"),
        })
      )
      .execute();
  }

  // specs: 4 cols -> chunk 25 (using 20 for safety)
  const SPEC_CHUNK = 20;
  for (let i = 0; i < specs.length; i += SPEC_CHUNK) {
    await db
      .insertInto("specs")
      .values(specs.slice(i, i + SPEC_CHUNK))
      .onConflict((oc) => oc.column("id").doNothing())
      .execute();
  }

  // results: 6+ cols -> chunk 5 for safety
  const RESULT_CHUNK = 5;
  for (let i = 0; i < results.length; i += RESULT_CHUNK) {
    await db
      .insertInto("results")
      .values(results.slice(i, i + RESULT_CHUNK))
      .onConflict((oc) =>
        oc.column("id").doUpdateSet({
          status: (eb) => eb.ref("excluded.status"),
        })
      )
      .execute();
  }

  // attempts: 10+ cols -> chunk 8 for safety
  const ATTEMPT_CHUNK = 8;
  for (let i = 0; i < attempts.length; i += ATTEMPT_CHUNK) {
    await db
      .insertInto("attempts")
      .values(attempts.slice(i, i + ATTEMPT_CHUNK))
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

/**
 * Computes metrics for multiple runs efficiently.
 */
export async function computeMultipleRunsMetrics(runIds: string[]) {
  if (runIds.length === 0) return;

  const runs = await db
    .selectFrom("runs")
    .selectAll()
    .where("id", "in", runIds)
    .execute();
  const runMap = new Map(runs.map((r) => [r.id, r]));

  const allAttempts = await db
    .selectFrom("attempts")
    .selectAll()
    .where("run_id", "in", runIds)
    .execute();

  const attemptsByRun = new Map<string, any[]>();
  for (const a of allAttempts) {
    const arr = attemptsByRun.get(a.run_id) || [];
    arr.push(a);
    attemptsByRun.set(a.run_id, arr);
  }

  const resultsToUpdate: any[] = [];
  const runsToUpdate: any[] = [];

  for (const runId of runIds) {
    const run = runMap.get(runId);
    if (!run) continue;
    const branch = run.branch;

    const attempts = attemptsByRun.get(runId) || [];
    if (attempts.length === 0) continue;

    let earliestStart: string | null = null;
    let latestEndMs = 0;

    const testProjectToResults = new Map<string, any[]>();
    for (const r of attempts) {
      const key = `${r.test_id}:${r.project_id ?? ""}`;
      const arr = testProjectToResults.get(key) ?? [];
      arr.push(r);
      testProjectToResults.set(key, arr);

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

    for (const [key, arr] of testProjectToResults) {
      const [testId, projectId] = key.split(":");
      let maxRetry = -1;
      let finalStatus: string | null = null;
      let hadFail = false;
      let hadPass = false;
      let retryDurationMs = 0;
      let retryCount = 0;
      let finalDurationMs = 0;
      let startTime: string | null = null;

      for (const r of arr) {
        const isFailed =
          r.status === "failed" ||
          r.status === "timedOut" ||
          r.status === "interrupted";
        if (isFailed) hadFail = true;
        if (r.status === "passed") hadPass = true;

        if ((r.retry ?? 0) > 0) {
          retryDurationMs += r.duration_ms ?? 0;
          retryCount += 1;
        }

        if ((r.retry ?? 0) >= maxRetry) {
          maxRetry = r.retry ?? 0;
          finalStatus = r.status ?? null;
          finalDurationMs = r.duration_ms ?? 0;
          startTime = r.start_time;
        }
      }

      const flakyInRun = hadFail && hadPass;
      if (finalStatus === "skipped") {
        skippedCount += 1;
      } else if (flakyInRun) {
        flakyCount += 1;
      } else if (
        finalStatus === "failed" ||
        finalStatus === "timedOut" ||
        finalStatus === "interrupted"
      ) {
        unexpectedCount += 1;
      } else if (finalStatus === "passed") {
        expectedCount += 1;
      }

      if (finalStatus) {
        resultsToUpdate.push({
          id: `${runId}:${testId}:${projectId}`,
          run_id: runId,
          test_id: testId,
          project_id: projectId,
          project_name: projectId,
          status: finalStatus,
          branch,
          was_flaky: flakyInRun,
          had_failure: hadFail,
          retry_duration_ms: retryDurationMs,
          retry_count: retryCount,
          final_duration_ms: finalDurationMs,
          start_time: startTime ?? run.start_time,
        });
      }
    }

    const derivedDuration =
      latestEndMs > 0 && earliestStart
        ? Math.max(0, latestEndMs - Date.parse(earliestStart))
        : 0;

    runsToUpdate.push({
      id: runId,
      start_time: earliestStart ?? new Date().toISOString(),
      duration_ms: derivedDuration,
      expected_count: expectedCount,
      skipped_count: skippedCount,
      flaky_count: flakyCount,
      unexpected_count: unexpectedCount,
    });
  }

  // Bulk update results
  const RESULT_CHUNK = 5;
  for (let i = 0; i < resultsToUpdate.length; i += RESULT_CHUNK) {
    const chunk = resultsToUpdate.slice(i, i + RESULT_CHUNK);
    await db
      .insertInto("results")
      .values(chunk)
      .onConflict((oc) =>
        oc.column("id").doUpdateSet({
          status: (eb) => eb.ref("excluded.status"),
          branch: (eb) => eb.ref("excluded.branch"),
          was_flaky: (eb) => eb.ref("excluded.was_flaky"),
          had_failure: (eb) => eb.ref("excluded.had_failure"),
          retry_duration_ms: (eb) => eb.ref("excluded.retry_duration_ms"),
          retry_count: (eb) => eb.ref("excluded.retry_count"),
          final_duration_ms: (eb) => eb.ref("excluded.final_duration_ms"),
          start_time: (eb) => eb.ref("excluded.start_time"),
        }),
      )
      .execute();

    const testMetricsToUpdate = new Map<string, any>();
    for (const res of chunk) {
      const metricKey = `${res.test_id}:${res.branch}`;
      const existing = testMetricsToUpdate.get(metricKey) || {
        test_id: res.test_id,
        branch: res.branch,
        total_runs: 0,
        flaky_runs: 0,
        runs_with_failure: 0,
        retry_duration_total_ms: 0,
        retry_count_total: 0,
        duration_total_ms: 0,
        last_flaky_start_time: null,
      };

      existing.total_runs += 1;
      if (res.was_flaky) {
        existing.flaky_runs += 1;
        if (
          !existing.last_flaky_start_time ||
          res.start_time > existing.last_flaky_start_time
        ) {
          existing.last_flaky_start_time = res.start_time;
        }
      }
      if (res.had_failure) existing.runs_with_failure += 1;
      existing.retry_duration_total_ms += res.retry_duration_ms;
      existing.retry_count_total += res.retry_count;
      existing.duration_total_ms += res.final_duration_ms;

      testMetricsToUpdate.set(metricKey, existing);
    }

    const metricsToUpdate = Array.from(testMetricsToUpdate.values());
    const METRIC_CHUNK = 5;
    for (let i = 0; i < metricsToUpdate.length; i += METRIC_CHUNK) {
      const chunkMetrics = metricsToUpdate.slice(i, i + METRIC_CHUNK);
      for (const metric of chunkMetrics) {
        await db
          .insertInto("test_metrics")
          .values(metric)
          .onConflict((oc) =>
            oc.columns(["test_id", "branch"]).doUpdateSet({
              total_runs: (eb) =>
                sql`test_metrics.total_runs + ${metric.total_runs}`,
              flaky_runs: (eb) =>
                sql`test_metrics.flaky_runs + ${metric.flaky_runs}`,
              runs_with_failure: (eb) =>
                sql`test_metrics.runs_with_failure + ${metric.runs_with_failure}`,
              retry_duration_total_ms: (eb) =>
                sql`test_metrics.retry_duration_total_ms + ${metric.retry_duration_total_ms}`,
              retry_count_total: (eb) =>
                sql`test_metrics.retry_count_total + ${metric.retry_count_total}`,
              duration_total_ms: (eb) =>
                sql`test_metrics.duration_total_ms + ${metric.duration_total_ms}`,
              last_flaky_start_time: (eb) =>
                metric.last_flaky_start_time
                  ? sql`MAX(COALESCE(test_metrics.last_flaky_start_time, ''), ${metric.last_flaky_start_time})`
                  : eb.ref("test_metrics.last_flaky_start_time"),
            }),
          )
          .execute();
      }
    }
  }

  for (const runData of runsToUpdate) {
    await db
      .updateTable("runs")
      .set({
        start_time: runData.start_time,
        duration_ms: runData.duration_ms,
        expected_count: runData.expected_count,
        skipped_count: runData.skipped_count,
        flaky_count: runData.flaky_count,
        unexpected_count: runData.unexpected_count,
      })
      .where("id", "=", runData.id)
      .execute();
  }
}
