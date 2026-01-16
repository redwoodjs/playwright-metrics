/* eslint-disable @typescript-eslint/no-unused-vars */
"use server";
import { db } from "@/db";
import type {
  TestRun,
  TestResult,
} from "@/db";

export async function listRuns(): Promise<TestRun[]> {
  return await db
    .selectFrom("test_run")
    .selectAll()
    .orderBy("start_time", "desc")
    .execute();
}

export async function getRun(runId: string): Promise<TestRun | undefined> {
  const rows = await db
    .selectFrom("test_run")
    .selectAll()
    .where("id", "=", runId)
    .execute();
  return rows[0];
}

export type RunTestRow = {
  id: string;
  test_id: string;
  title: string | null;
  file: string | null;
  line: number | null;
  project_name: string | null;
  status: string | null;
  expected: boolean | null;
  attempts: number | null;
  final_status: string | null;
};

export async function listRunTests(runId: string): Promise<RunTestRow[]> {
  // Attempts per test
  const attemptsSubq = db
    .selectFrom("test_result as r")
    .select((eb) => [
      "r.test_id as test_id",
      eb.fn.countAll().as("attempts"),
    ])
    .where("r.run_id", "=", runId)
    .groupBy("r.test_id")
    .as("a");

  // Max retry per test
  const maxRetrySubq = db
    .selectFrom("test_result as r")
    .select((eb) => [
      "r.test_id as test_id",
      eb.fn.max("r.retry").as("max_retry"),
    ])
    .where("r.run_id", "=", runId)
    .groupBy("r.test_id")
    .as("mr");

  const rows = await db
    .selectFrom("test_run_test as trt")
    .innerJoin("test as t", "t.id", "trt.test_id")
    .leftJoin(attemptsSubq, "a.test_id", "trt.test_id")
    .leftJoin(maxRetrySubq, "mr.test_id", "trt.test_id")
    .leftJoin("test_result as rf", (join) =>
      join
        .onRef("rf.test_id", "=", "trt.test_id")
        .onRef("rf.run_id", "=", "trt.run_id")
        .onRef("rf.retry", "=", "mr.max_retry"),
    )
    .select([
      "trt.id as id",
      "trt.test_id as test_id",
      "t.title as title",
      "t.file as file",
      "t.line as line",
      "trt.project_name as project_name",
      "trt.status as status",
      "trt.expected as expected",
      "a.attempts as attempts",
      "rf.status as final_status",
    ])
    .where("trt.run_id", "=", runId)
    .orderBy("t.file", "asc")
    .orderBy("t.line", "asc")
    .execute();
  return rows.map((r) => ({
    ...r,
    attempts: r.attempts != null ? Number(r.attempts as unknown as number) : null,
  }));
}

export async function getTestResults(
  runId: string,
  testId: string,
): Promise<TestResult[]> {
  return await db
    .selectFrom("test_result")
    .selectAll()
    .where("run_id", "=", runId)
    .where("test_id", "=", testId)
    .orderBy("retry", "asc")
    .execute();
}

// ===== Aggregations across runs =====

export type FlakiestRow = {
  test_id: string;
  title: string | null;
  file: string | null;
  total_runs: number;
  flaky_runs: number;
  runs_with_failure: number;
  flaky_rate: number;
  fail_rate: number;
  mean_duration_ms: number | null;
  retry_count_total?: number;
  retry_duration_total_ms?: number;
  last_flaky_start_time?: string | null;
  bucket?: "stable" | "suspicious" | "flaky" | "critical";
};

export async function listFlakiestTests(limit = 50): Promise<FlakiestRow[]> {
  // Distinct executions per (test, run) from the canonical source of truth
  const execRuns = db
    .selectFrom("test_result as r")
    .select(["r.test_id as test_id", "r.run_id as run_id"])
    .groupBy(["r.test_id", "r.run_id"])
    .as("er");

  // Runs where the test had any failure
  const failRuns = db
    .selectFrom("test_result as r")
    .select(["r.test_id as test_id", "r.run_id as run_id"])
    .where("r.status", "=", "failed")
    .groupBy(["r.test_id", "r.run_id"])
    .as("fr");

  // Runs where the test had any pass
  const passRuns = db
    .selectFrom("test_result as r")
    .select(["r.test_id as test_id", "r.run_id as run_id"])
    .where("r.status", "=", "passed")
    .groupBy(["r.test_id", "r.run_id"])
    .as("pr");

  // Aggregate totals
  const totalAgg = db
    .selectFrom(execRuns)
    .select((eb) => ["er.test_id as test_id", eb.fn.countAll().as("total_runs")])
    .groupBy("er.test_id")
    .as("tot");

  const failAgg = db
    .selectFrom(failRuns)
    .select((eb) => ["fr.test_id as test_id", eb.fn.countAll().as("runs_with_failure")])
    .groupBy("fr.test_id")
    .as("fa");

  const flakyAgg = db
    .selectFrom(failRuns)
    .innerJoin(passRuns, (join) =>
      join
        .onRef("fr.test_id", "=", "pr.test_id")
        .onRef("fr.run_id", "=", "pr.run_id"),
    )
    .select((eb) => ["fr.test_id as test_id", eb.fn.countAll().as("flaky_runs")])
    .groupBy("fr.test_id")
    .as("fka");

  // Final attempt durations avg per test
  const finalDurations = db
    .selectFrom("test_result as r")
    .select([
      "r.test_id as test_id",
      "r.run_id as run_id",
      "r.duration_ms as duration_ms",
    ])
    .innerJoin(
      db
        .selectFrom("test_result as rmax")
        .select((eb) => [
          "rmax.test_id as test_id",
          "rmax.run_id as run_id",
          eb.fn.max("rmax.retry").as("max_retry"),
        ])
        .groupBy(["rmax.test_id", "rmax.run_id"])
        .as("mx"),
      (join) =>
        join
          .onRef("mx.test_id", "=", "r.test_id")
          .onRef("mx.run_id", "=", "r.run_id")
          .onRef("mx.max_retry", "=", "r.retry"),
    )
    .as("fd");

  const durationAgg = db
    .selectFrom(finalDurations)
    .select((eb) => ["fd.test_id as test_id", eb.fn.avg("fd.duration_ms").as("mean_duration_ms")])
    .groupBy("fd.test_id")
    .as("da");

  // Retry cost per test (time + count)
  const retryAgg = db
    .selectFrom("test_result as r")
    .where("r.retry", ">", 0)
    .select((eb) => [
      "r.test_id as test_id",
      eb.fn.sum("r.duration_ms").as("retry_duration_total_ms"),
      eb.fn.countAll().as("retry_count_total"),
    ])
    .groupBy("r.test_id")
    .as("ra");

  // Last flaky occurrence time per test (max start_time of any flaky run)
  const flakyRunsWithTime = db
    .selectFrom(failRuns)
    .innerJoin(passRuns, (join) =>
      join
        .onRef("fr.test_id", "=", "pr.test_id")
        .onRef("fr.run_id", "=", "pr.run_id"),
    )
    .innerJoin("test_run as tr", "tr.id", "fr.run_id")
    .select(["fr.test_id as test_id", "tr.start_time as start_time"])
    .as("frt");

  const lastFlakyAgg = db
    .selectFrom(flakyRunsWithTime)
    .select((eb) => [
      "frt.test_id as test_id",
      eb.fn.max("frt.start_time").as("last_flaky_start_time"),
    ])
    .groupBy("frt.test_id")
    .as("lfa");

  const rows = await db
    .selectFrom(totalAgg)
    .leftJoin("test as t", "t.id", "tot.test_id")
    .leftJoin(failAgg, "fa.test_id", "tot.test_id")
    .leftJoin(flakyAgg, "fka.test_id", "tot.test_id")
    .leftJoin(durationAgg, "da.test_id", "tot.test_id")
    .leftJoin(retryAgg, "ra.test_id", "tot.test_id")
    .leftJoin(lastFlakyAgg, "lfa.test_id", "tot.test_id")
    .select([
      "tot.test_id as test_id",
      "t.title as title",
      "t.file as file",
      "tot.total_runs as total_runs",
      "fa.runs_with_failure as runs_with_failure",
      "fka.flaky_runs as flaky_runs",
      "da.mean_duration_ms as mean_duration_ms",
      "ra.retry_duration_total_ms as retry_duration_total_ms",
      "ra.retry_count_total as retry_count_total",
      "lfa.last_flaky_start_time as last_flaky_start_time",
    ])
    .execute();

  const mapped = rows.map((r) => {
    const total = Number(r.total_runs ?? 0);
    const flaky = Number(r.flaky_runs ?? 0);
    const instab = Number(r.runs_with_failure ?? 0);
    const flaky_rate = total > 0 ? flaky / total : 0;
    let bucket: FlakiestRow["bucket"] = "stable";
    if (flaky_rate >= 0.2) bucket = "critical";
    else if (flaky_rate >= 0.05) bucket = "flaky";
    else if (flaky_rate >= 0.01) bucket = "suspicious";
    return {
      test_id: r.test_id,
      title: r.title,
      file: r.file,
      total_runs: total,
      flaky_runs: flaky,
      runs_with_failure: instab,
      flaky_rate,
      fail_rate: total > 0 ? instab / total : 0, // Note: "instability rate" (any failure)
      mean_duration_ms:
        r.mean_duration_ms != null
          ? Number(r.mean_duration_ms as unknown as number)
          : null,
      retry_duration_total_ms:
        r.retry_duration_total_ms != null
          ? Number(r.retry_duration_total_ms as unknown as number)
          : 0,
      retry_count_total:
        r.retry_count_total != null
          ? Number(r.retry_count_total as unknown as number)
          : 0,
      last_flaky_start_time: r.last_flaky_start_time ?? null,
      bucket,
    } as FlakiestRow;
  });

  // Filters out "pure failures" and "consistent flakes"
  // If it fails 100% of the time, it's a failure, not a flaky test.
  const onlyFlaky = mapped.filter((r) => r.flaky_runs > 0 && r.fail_rate < 1);

  // Default ordering everywhere:
  // 1. Highest flaky_rate
  // 2. Then highest flaky_runs
  // 3. Then highest total_runs
  onlyFlaky.sort((a, b) => {
    if (b.flaky_rate !== a.flaky_rate) return b.flaky_rate - a.flaky_rate;
    if (b.flaky_runs !== a.flaky_runs) return b.flaky_runs - a.flaky_runs;
    return b.total_runs - a.total_runs;
  });

  return onlyFlaky.slice(0, limit);
}

export type RunFlakyRow = {
  test_id: string;
  title: string | null;
  file: string | null;
  line: number | null;
};

export async function listRunFlakies(runId: string): Promise<RunFlakyRow[]> {
  const rows = await db
    .selectFrom("test_run_test as trt")
    .innerJoin("test as t", "t.id", "trt.test_id")
    .select(["trt.test_id as test_id", "t.title as title", "t.file as file", "t.line as line"])
    .where("trt.run_id", "=", runId)
    .where((eb) =>
      eb.and([
        eb.exists(
          eb
            .selectFrom("test_result as r1")
            .select((qb) => qb.val(1).as("one"))
            .whereRef("r1.run_id", "=", "trt.run_id")
            .whereRef("r1.test_id", "=", "trt.test_id")
            .where("r1.status", "=", "failed"),
        ),
        eb.exists(
          eb
            .selectFrom("test_result as r2")
            .select((qb) => qb.val(1).as("one"))
            .whereRef("r2.run_id", "=", "trt.run_id")
            .whereRef("r2.test_id", "=", "trt.test_id")
            .where("r2.status", "=", "passed"),
        ),
      ]),
    )
    .orderBy("t.file", "asc")
    .orderBy("t.line", "asc")
    .execute();
  return rows;
}

export type TestTrendPoint = {
  run_id: string;
  start_time: string;
  final_status: string | null;
  had_failure: boolean;
  was_flaky: boolean;
};

export async function getTestTrend(
  testId: string,
  lookbackRuns = 30,
): Promise<TestTrendPoint[]> {
  // determine final status per run
  const maxRetry = db
    .selectFrom("test_result as r")
    .select((eb) => [
      "r.run_id as run_id",
      eb.fn.max("r.retry").as("max_retry"),
    ])
    .where("r.test_id", "=", testId)
    .groupBy("r.run_id")
    .as("mr");

  const rows = await db
    .selectFrom("test_run_test as trt")
    .innerJoin("test_run as tr", "tr.id", "trt.run_id")
    .leftJoin(maxRetry, "mr.run_id", "trt.run_id")
    .leftJoin("test_result as rf", (join) =>
      join
        .onRef("rf.run_id", "=", "trt.run_id")
        .onRef("rf.test_id", "=", "trt.test_id")
        .onRef("rf.retry", "=", "mr.max_retry"),
    )
    .select((eb) => [
      "trt.run_id as run_id",
      "tr.start_time as start_time",
      "rf.status as final_status",
      eb
        .exists(
          eb
            .selectFrom("test_result as r1")
            .select((qb) => qb.val(1).as("one"))
            .whereRef("r1.run_id", "=", "trt.run_id")
            .whereRef("r1.test_id", "=", "trt.test_id")
            .where("r1.status", "=", "failed"),
        )
        .as("had_failure"),
      eb
        .and([
          eb.exists(
            eb
              .selectFrom("test_result as r2")
              .select((qb) => qb.val(1).as("one"))
              .whereRef("r2.run_id", "=", "trt.run_id")
              .whereRef("r2.test_id", "=", "trt.test_id")
              .where("r2.status", "=", "failed"),
          ),
          eb.exists(
            eb
              .selectFrom("test_result as r3")
              .select((qb) => qb.val(1).as("one"))
              .whereRef("r3.run_id", "=", "trt.run_id")
              .whereRef("r3.test_id", "=", "trt.test_id")
              .where("r3.status", "=", "passed"),
          ),
        ])
        .as("was_flaky"),
    ])
    .where("trt.test_id", "=", testId)
    .orderBy("tr.start_time", "desc")
    .limit(lookbackRuns)
    .execute();

  return rows.map((r) => ({
    run_id: r.run_id,
    start_time: r.start_time!,
    final_status: r.final_status ?? null,
    had_failure: Boolean(r.had_failure),
    was_flaky: Boolean(r.was_flaky),
  }));
}

// ===== Suite health and trends =====

export type SuiteHealth = {
  window_runs: number;
  total_executions: number;
  flaky_executions: number;
  flaky_rate: number; // 0..1
  health_score: number; // 0..1 (1 - flaky_rate)
};

function recentRunsSubq(n: number) {
  return db
    .selectFrom("test_run")
    .select(["id"])
    .orderBy("start_time", "desc")
    .limit(n)
    .as("rr");
}

async function computeFlakyRateForRunsFromSubq(rr: ReturnType<typeof recentRunsSubq>): Promise<{
  totalPairs: number;
  flakyPairs: number;
}> {
  // Distinct executions (test_id, run_id)
  const execPairs = await db
    .selectFrom("test_result as r")
    .innerJoin(rr, (join) => join.onRef("rr.id", "=", "r.run_id"))
    .select(["r.test_id as test_id", "r.run_id as run_id"])
    .groupBy(["r.test_id", "r.run_id"])
    .execute();

  // Flaky pairs: intersection of any-fail and any-pass for the same test/run
  const failPairs = db
    .selectFrom("test_result as r")
    .innerJoin(rr, (join) => join.onRef("rr.id", "=", "r.run_id"))
    .select(["r.test_id as test_id", "r.run_id as run_id"])
    .where("r.status", "=", "failed")
    .groupBy(["r.test_id", "r.run_id"])
    .as("f");
  const passPairs = db
    .selectFrom("test_result as r")
    .innerJoin(rr, (join) => join.onRef("rr.id", "=", "r.run_id"))
    .select(["r.test_id as test_id", "r.run_id as run_id"])
    .where("r.status", "=", "passed")
    .groupBy(["r.test_id", "r.run_id"])
    .as("p");
  const flakyPairs = await db
    .selectFrom(failPairs)
    .innerJoin(passPairs, (join) =>
      join.onRef("f.test_id", "=", "p.test_id").onRef("f.run_id", "=", "p.run_id"),
    )
    .select(["f.test_id", "f.run_id"])
    .execute();

  return { totalPairs: execPairs.length, flakyPairs: flakyPairs.length };
}

export async function getSuiteHealth(windowRuns = 30): Promise<SuiteHealth> {
  const rr = recentRunsSubq(windowRuns);
  const { totalPairs, flakyPairs } = await computeFlakyRateForRunsFromSubq(rr);
  const flaky_rate = totalPairs > 0 ? flakyPairs / totalPairs : 0;
  return {
    window_runs: windowRuns,
    total_executions: totalPairs,
    flaky_executions: flakyPairs,
    flaky_rate,
    health_score: 1 - flaky_rate,
  };
}

export type SuiteTrends = {
  rate_7: number;
  rate_30: number;
  rate_90: number;
  trend: number; // rate_7 - rate_30 (positive = degrading)
};

export async function getSuiteTrends(): Promise<SuiteTrends> {
  const [r7, r30, r90] = await Promise.all([
    getSuiteHealth(7),
    getSuiteHealth(30),
    getSuiteHealth(90),
  ]);
  return {
    rate_7: r7.flaky_rate,
    rate_30: r30.flaky_rate,
    rate_90: r90.flaky_rate,
    trend: r7.flaky_rate - r30.flaky_rate,
  };
}

export type RegressionRow = {
  test_id: string;
  title: string | null;
  file: string | null;
  line: number | null;
  total_runs: number;
  current_rate: number;
  previous_rate: number;
  factor: number;
};

export async function listRegressions(
  currentWindow = 10,
  previousWindow = 10,
  minimumSampleSize = 5,
): Promise<RegressionRow[]> {
  const rrCur = recentRunsSubq(currentWindow);
  // If there are no runs yet, bail early via totals = 0.

  // Previous window: take runs immediately before the current window
  const oldestCurrent = await db
    .selectFrom(rrCur)
    .innerJoin("test_run as tr", (join) => join.onRef("tr.id", "=", "rr.id"))
    .select(["tr.start_time"])
    .orderBy("tr.start_time", "asc")
    .limit(1)
    .executeTakeFirst();
  const rrPrev = db
    .selectFrom("test_run")
    .select(["id"])
    .where("start_time", "<", oldestCurrent?.start_time ?? "")
    .orderBy("start_time", "desc")
    .limit(previousWindow)
    .as("rp");

  // Aggregations per window
  const execCurrent = await db
    .selectFrom("test_result as r")
    .innerJoin(rrCur, (join) => join.onRef("rr.id", "=", "r.run_id"))
    .select((eb) => ["r.test_id as test_id", eb.fn.count("r.run_id").distinct().as("total_runs")])
    .groupBy("r.test_id")
    .execute();
  const currentTotals = new Map(execCurrent.map((r) => [r.test_id as string, Number(r.total_runs)]));

  const flakyCurrent = await db
    .selectFrom(
      db
        .selectFrom("test_result as r")
        .innerJoin(rrCur, (join) => join.onRef("rr.id", "=", "r.run_id"))
        .select(["r.test_id as test_id", "r.run_id as run_id"])
        .where("r.status", "=", "failed")
        .groupBy(["r.test_id", "r.run_id"])
        .as("f"),
    )
    .innerJoin(
      db
        .selectFrom("test_result as r")
        .innerJoin(rrCur, (join) => join.onRef("rr.id", "=", "r.run_id"))
        .select(["r.test_id as test_id", "r.run_id as run_id"])
        .where("r.status", "=", "passed")
        .groupBy(["r.test_id", "r.run_id"])
        .as("p"),
      (join) => join.onRef("f.test_id", "=", "p.test_id").onRef("f.run_id", "=", "p.run_id"),
    )
    .select((eb) => ["f.test_id as test_id", eb.fn.countAll().as("flaky_runs")])
    .groupBy("f.test_id")
    .execute();
  const currentFlaky = new Map(flakyCurrent.map((r) => [r.test_id as string, Number(r.flaky_runs)]));

  const execPrev = await db
    .selectFrom("test_result as r")
    .innerJoin(rrPrev, (join) => join.onRef("rp.id", "=", "r.run_id"))
    .select((eb) => ["r.test_id as test_id", eb.fn.count("r.run_id").distinct().as("total_runs")])
    .groupBy("r.test_id")
    .execute();
  const prevTotals = new Map(execPrev.map((r) => [r.test_id as string, Number(r.total_runs)]));

  const flakyPrev = await db
    .selectFrom(
      db
        .selectFrom("test_result as r")
        .innerJoin(rrPrev, (join) => join.onRef("rp.id", "=", "r.run_id"))
        .select(["r.test_id as test_id", "r.run_id as run_id"])
        .where("r.status", "=", "failed")
        .groupBy(["r.test_id", "r.run_id"])
        .as("f"),
    )
    .innerJoin(
      db
        .selectFrom("test_result as r")
        .innerJoin(rrPrev, (join) => join.onRef("rp.id", "=", "r.run_id"))
        .select(["r.test_id as test_id", "r.run_id as run_id"])
        .where("r.status", "=", "passed")
        .groupBy(["r.test_id", "r.run_id"])
        .as("p"),
      (join) => join.onRef("f.test_id", "=", "p.test_id").onRef("f.run_id", "=", "p.run_id"),
    )
    .select((eb) => ["f.test_id as test_id", eb.fn.countAll().as("flaky_runs")])
    .groupBy("f.test_id")
    .execute();
  const prevFlaky = new Map(flakyPrev.map((r) => [r.test_id as string, Number(r.flaky_runs)]));

  // Compute regression set
  const testIds = new Set<string>([
    ...currentTotals.keys(),
    ...currentFlaky.keys(),
    ...prevTotals.keys(),
    ...prevFlaky.keys(),
  ]);

  const candidateIds = Array.from(testIds).filter(
    (id) => (currentTotals.get(id) ?? 0) >= minimumSampleSize,
  );
  if (candidateIds.length === 0) return [];

  const testsMeta = await db
    .selectFrom("test")
    .select(["id", "title", "file", "line"])
    .where("id", "in", candidateIds)
    .execute();
  const meta = new Map(testsMeta.map((t) => [t.id as string, t]));

  const rows: RegressionRow[] = [];
  for (const id of candidateIds) {
    const totC = currentTotals.get(id) ?? 0;
    const flakyC = currentFlaky.get(id) ?? 0;
    const rateC = totC > 0 ? flakyC / totC : 0;
    const totP = prevTotals.get(id) ?? 0;
    const flakyP = prevFlaky.get(id) ?? 0;
    const rateP = totP > 0 ? flakyP / totP : 0;
    const factor = rateP > 0 ? rateC / rateP : rateC > 0 ? Infinity : 0;
    if (rateC > rateP * 1.5) {
      const t = meta.get(id);
      rows.push({
        test_id: id,
        title: t?.title ?? null,
        file: t?.file ?? null,
        line: (t?.line as number) ?? null,
        total_runs: totC,
        current_rate: rateC,
        previous_rate: rateP,
        factor,
      });
    }
  }

  // Sort by factor desc, then by current_rate desc
  rows.sort((a, b) => (b.factor === a.factor ? b.current_rate - a.current_rate : b.factor - a.factor));
  return rows;
}

// New flaky tests introduced by a specific run (flaky in this run, not flaky in lookback)
export async function listRunNewFlakies(
  runId: string,
  lookbackRuns = 20,
): Promise<RunFlakyRow[]> {
  const run = await getRun(runId);
  if (!run?.start_time) return [];

  // Flaky tests in this run
  const failNow = db
    .selectFrom("test_result")
    .select(["test_id"])
    .where("run_id", "=", runId)
    .where("status", "=", "failed")
    .groupBy("test_id")
    .as("fn");
  const passNow = db
    .selectFrom("test_result")
    .select(["test_id"])
    .where("run_id", "=", runId)
    .where("status", "=", "passed")
    .groupBy("test_id")
    .as("pn");
  const flakiesNow = await db
    .selectFrom(failNow)
    .innerJoin(passNow, "pn.test_id", "fn.test_id")
    .select(["fn.test_id as test_id"])
    .execute();

  const ids = flakiesNow.map((x) => x.test_id);
  if (ids.length === 0) return [];

  // Prior runs (lookback) for those tests
  const priorRuns = await db
    .selectFrom("test_run")
    .select(["id", "start_time"])
    .where("start_time", "<", run.start_time!)
    .orderBy("start_time", "desc")
    .limit(lookbackRuns)
    .execute();
  const priorIds = priorRuns.map((r) => r.id);
  if (priorIds.length === 0) {
    // All flakies are "new" if there is no history
    return await db
      .selectFrom("test as t")
      .select(["t.id as test_id", "t.title as title", "t.file as file", "t.line as line"])
      .where("t.id", "in", ids)
      .execute();
  }

  // Which of those tests were flaky in any prior run?
  const priorFail = db
    .selectFrom("test_result")
    .select(["test_id", "run_id"])
    .where("test_id", "in", ids)
    .where("run_id", "in", priorIds)
    .where("status", "=", "failed")
    .groupBy(["test_id", "run_id"])
    .as("pf");
  const priorPass = db
    .selectFrom("test_result")
    .select(["test_id", "run_id"])
    .where("test_id", "in", ids)
    .where("run_id", "in", priorIds)
    .where("status", "=", "passed")
    .groupBy(["test_id", "run_id"])
    .as("pp");
  const priorFlaky = await db
    .selectFrom(priorFail)
    .innerJoin(priorPass, (join) =>
      join
        .onRef("pf.test_id", "=", "pp.test_id")
        .onRef("pf.run_id", "=", "pp.run_id"),
    )
    .select(["pf.test_id as test_id"])
    .execute();
  const priorFlakySet = new Set(priorFlaky.map((x) => x.test_id));

  const newIds = ids.filter((id) => !priorFlakySet.has(id));
  if (newIds.length === 0) return [];

  return await db
    .selectFrom("test as t")
    .select(["t.id as test_id", "t.title as title", "t.file as file", "t.line as line"])
    .where("t.id", "in", newIds)
    .execute();
}
