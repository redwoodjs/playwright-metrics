/* eslint-disable @typescript-eslint/no-unused-vars */
"use server";
import { db } from "@/db";
import type {
  Run,
  Attempt,
} from "@/db";

export async function listRuns(filters?: { repo?: string; branch?: string }): Promise<Run[]> {
  let query = db
    .selectFrom("runs")
    .select((eb) => [
      eb.fn.max("id").as("id"),
      "repo",
      "branch",
      "commit_hash",
      "pr_user",
      "build_href",
      eb.fn.min("start_time").as("start_time"),
      eb.fn.sum("duration_ms").as("duration_ms"),
      eb.fn.sum("expected_count").as("expected_count"),
      eb.fn.sum("skipped_count").as("skipped_count"),
      eb.fn.sum("flaky_count").as("flaky_count"),
      eb.fn.sum("unexpected_count").as("unexpected_count"),
      eb.fn.count("id").as("shard_count"),
    ]);

  if (filters?.repo) {
    query = query.where("repo", "like", `${filters.repo}%`);
  }
  if (filters?.branch) {
    query = query.where("branch", "=", filters.branch);
  }

  const rows = await query
    .groupBy(["repo", "commit_hash", "pr_user"])
    .orderBy("start_time", "desc")
    .execute();

  return rows.map((r) => ({
    ...r,
    duration_ms: Number(r.duration_ms ?? 0),
    expected_count: Number(r.expected_count ?? 0),
    skipped_count: Number(r.skipped_count ?? 0),
    flaky_count: Number(r.flaky_count ?? 0),
    unexpected_count: Number(r.unexpected_count ?? 0),
    shard_count: Number(r.shard_count ?? 1),
  })) as any as Run[];
}

export async function getRun(commitHash: string): Promise<Run | undefined> {
  const baseRun = await db
    .selectFrom("runs")
    .selectAll()
    .where("commit_hash", "=", commitHash)
    .executeTakeFirst();

  if (!baseRun) return undefined;

  // Find all shards in this logical run
  const logicalRun = await db
    .selectFrom("runs")
    .select((eb) => [
      eb.fn.max("id").as("id"),
      "repo",
      "branch",
      "commit_hash",
      "pr_user",
      "build_href",
      eb.fn.min("start_time").as("start_time"),
      eb.fn.sum("duration_ms").as("duration_ms"),
      eb.fn.sum("expected_count").as("expected_count"),
      eb.fn.sum("skipped_count").as("skipped_count"),
      eb.fn.sum("flaky_count").as("flaky_count"),
      eb.fn.sum("unexpected_count").as("unexpected_count"),
      eb.fn.count("id").as("shard_count"),
    ])
    .where("repo", "=", baseRun.repo)
    .where("commit_hash", "=", baseRun.commit_hash)
    .groupBy(["repo", "commit_hash", "pr_user"])
    .executeTakeFirst();

  if (!logicalRun) return undefined;

  return {
    ...logicalRun,
    duration_ms: Number(logicalRun.duration_ms ?? 0),
    expected_count: Number(logicalRun.expected_count ?? 0),
    skipped_count: Number(logicalRun.skipped_count ?? 0),
    flaky_count: Number(logicalRun.flaky_count ?? 0),
    unexpected_count: Number(logicalRun.unexpected_count ?? 0),
    shard_count: Number(logicalRun.shard_count ?? 1),
  } as any as Run;
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
  attempt_statuses: ("pass" | "fail" | "skip")[];
  final_status: string | null;
  was_flaky: boolean;
};

export async function listRunTests(commitHash: string): Promise<RunTestRow[]> {
  const baseRun = await db
    .selectFrom("runs")
    .select(["repo", "commit_hash", "start_time"])
    .where("commit_hash", "=", commitHash)
    .executeTakeFirst();

  if (!baseRun) return [];

  // Subquery for all shard IDs in this logical run
  const shardIdsSubq = db
    .selectFrom("runs as r_shards")
    .select("r_shards.id")
    .where("r_shards.repo", "=", baseRun.repo)
    .where("r_shards.commit_hash", "=", baseRun.commit_hash);

  // Attempts per test per project across all shards
  const attemptsSubq = db
    .selectFrom("attempts as r")
    .select((eb) => [
      "r.test_id as test_id",
      "r.project_id as project_id",
      eb.fn.countAll().as("attempts"),
    ])
    .where("r.run_id", "in", shardIdsSubq)
    .groupBy(["r.test_id", "r.project_id"])
    .as("a");

  const maxRetrySubq = db
    .selectFrom("attempts as r")
    .select((eb) => [
      "r.test_id as test_id",
      "r.project_id as project_id",
      eb.fn.max("r.retry").as("max_retry"),
    ])
    .where("r.run_id", "in", shardIdsSubq)
    .groupBy(["r.test_id", "r.project_id"])
    .as("mr");

  const rows = await db
    .selectFrom("results as trt")
    .innerJoin("specs as t", "t.id", "trt.test_id")
    .innerJoin("runs as r_main", "r_main.id", "trt.run_id")
    .where("r_main.repo", "=", baseRun.repo)
    .where("r_main.commit_hash", "=", baseRun.commit_hash)
    .leftJoin(attemptsSubq, (join) =>
      join
        .onRef("a.test_id", "=", "trt.test_id")
        .onRef("a.project_id", "=", "trt.project_id"),
    )
    .leftJoin(maxRetrySubq, (join) =>
      join
        .onRef("mr.test_id", "=", "trt.test_id")
        .onRef("mr.project_id", "=", "trt.project_id"),
    )
    .leftJoin("attempts as rf", (join) =>
      join
        .onRef("rf.test_id", "=", "trt.test_id")
        .onRef("rf.run_id", "=", "trt.run_id")
        .onRef("rf.project_id", "=", "trt.project_id")
        .onRef("rf.retry", "=", "mr.max_retry"),
    )
    .select((eb) => [
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
      eb.and([
        eb.exists(
          db
            .selectFrom("attempts as r1")
            .select((qb) => qb.val(1).as("one"))
            .where("r1.run_id", "in", shardIdsSubq)
            .whereRef("r1.test_id", "=", eb.ref("trt.test_id"))
            .whereRef("r1.project_id", "=", eb.ref("trt.project_id"))
            .where("r1.status", "=", "failed"),
        ),
        eb.exists(
          db
            .selectFrom("attempts as r2")
            .select((qb) => qb.val(2).as("two"))
            .where("r2.run_id", "in", shardIdsSubq)
            .whereRef("r2.test_id", "=", eb.ref("trt.test_id"))
            .whereRef("r2.project_id", "=", eb.ref("trt.project_id"))
            .where("r2.status", "=", "passed"),
        ),
      ]).as("was_flaky"),
    ])
    .groupBy(["trt.test_id", "trt.project_id"]) // Ensure one row per logical test
    .orderBy("t.file", "asc")
    .orderBy("t.line", "asc")
    .execute();

  // Fetch all individual attempts for this logical run to populate the histogram
  const allAttempts = await db
    .selectFrom("attempts as att")
    .innerJoin("results as res", (join) => 
      join
        .onRef("res.test_id", "=", "att.test_id")
        .onRef("res.run_id", "=", "att.run_id")
        .onRef("res.project_id", "=", "att.project_id")
    )
    .select(["att.test_id", "res.project_name", "att.status", "att.retry"])
    .where("att.run_id", "in", shardIdsSubq)
    .orderBy("att.retry", "asc")
    .execute();

  // Group attempts by test_id and project_id for easy lookup
  const attemptsMap = new Map<string, ("pass" | "fail" | "skip")[]>();
  for (const att of allAttempts) {
    const key = `${att.test_id}:${att.project_name ?? ""}`;
    const statuses = attemptsMap.get(key) ?? [];
    if (att.status === "passed") statuses.push("pass");
    else if (att.status === "skipped") statuses.push("skip");
    else statuses.push("fail");
    attemptsMap.set(key, statuses);
  }

  return rows.map((r) => {
    const key = `${r.test_id}:${r.project_name ?? ""}`;
    return {
      ...r,
      attempts: r.attempts != null ? Number(r.attempts as unknown as number) : null,
      attempt_statuses: attemptsMap.get(key) ?? [],
      was_flaky: Boolean(r.was_flaky),
    };
  });
}

export async function getTestResults(
  runId: string,
  testId: string,
): Promise<Attempt[]> {
  return await db
    .selectFrom("attempts")
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
    .selectFrom("attempts as r")
    .select(["r.test_id as test_id", "r.run_id as run_id"])
    .groupBy(["r.test_id", "r.run_id"])
    .as("er");

  // Runs where the test had any failure
  const failRuns = db
    .selectFrom("attempts as r")
    .select(["r.test_id as test_id", "r.run_id as run_id"])
    .where("r.status", "=", "failed")
    .groupBy(["r.test_id", "r.run_id"])
    .as("fr");

  // Runs where the test had any pass
  const passRuns = db
    .selectFrom("attempts as r")
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
    .selectFrom("attempts as r")
    .select([
      "r.test_id as test_id",
      "r.run_id as run_id",
      "r.duration_ms as duration_ms",
    ])
    .innerJoin(
      db
        .selectFrom("attempts as rmax")
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
    .selectFrom("attempts as r")
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
    .innerJoin("runs as tr", "tr.id", "fr.run_id")
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
    .leftJoin("specs as t", "t.id", "tot.test_id")
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

export type RepoSpecRow = {
  test_id: string;
  title: string | null;
  file: string | null;
  line: number | null;
  project_name: string | null;
  final_status: string | null;
  was_flaky: boolean;
  attempts: {
    status: string;
    retry?: number;
    run_id: string;
  }[];
};

export async function listRepoSpecs(repo: string, branch?: string): Promise<RepoSpecRow[]> {
  // 1. Find all unique (test_id, project_name) for this repo
  let uniqueSpecsQuery = db
    .selectFrom("results as res")
    .innerJoin("runs as r", "r.id", "res.run_id")
    .innerJoin("specs as s", "s.id", "res.test_id")
    .select((eb) => [
      "res.test_id",
      "res.project_name",
      "s.title",
      "s.file",
      "s.line",
      eb.fn.max("r.start_time").as("last_exec")
    ])
    .where("r.repo", "like", `${repo}%`);

  if (branch) {
    uniqueSpecsQuery = uniqueSpecsQuery.where("r.branch", "=", branch);
  }

  const uniqueSpecs = await uniqueSpecsQuery
    .groupBy(["res.test_id", "res.project_name", "s.title", "s.file", "s.line"])
    .orderBy("s.file", "asc")
    .orderBy("s.line", "asc")
    .execute();

  if (uniqueSpecs.length === 0) return [];

  // 2. Get history - fetch all attempts for these specs in this repo
  let allRepoAttemptsQuery = db
    .selectFrom("attempts as att")
    .innerJoin("runs as r", "r.id", "att.run_id")
    .innerJoin("results as res", (join) => 
        join.onRef("res.run_id", "=", "att.run_id")
            .onRef("res.test_id", "=", "att.test_id")
            .onRef("res.project_id", "=", "att.project_id")
    )
    .select([
        "att.test_id",
        "res.project_name",
        "att.status",
        "att.retry",
        "att.run_id",
        "r.start_time",
    ])
    .where("r.repo", "like", `${repo}%`);

  if (branch) {
    allRepoAttemptsQuery = allRepoAttemptsQuery.where("r.branch", "=", branch);
  }

  const allRepoAttempts = await allRepoAttemptsQuery
    .orderBy("r.start_time", "desc")
    .execute();
    
  // Group by (test_id, project_name, run_id) to find flakiness per run
  const runResultsMap = new Map<string, Map<string, { status: string, was_flaky: boolean, start_time: string }>>();
  for (const att of allRepoAttempts) {
    const specKey = `${att.test_id}:${att.project_name}`;
    const runMap = runResultsMap.get(specKey) ?? new Map();
    
    const runInfo = runMap.get(att.run_id) ?? { 
      status: att.status, 
      was_flaky: false, 
      start_time: att.start_time,
      passed: false,
      failed: false
    };

    if (att.status === 'passed') runInfo.passed = true;
    if (att.status === 'failed' || att.status === 'timedOut' || att.status === 'interrupted') runInfo.failed = true;
    
    // Final status for the run (latest attempt)
    if (att.retry === 0 || !runMap.has(att.run_id)) {
        runInfo.status = att.status;
    }

    runInfo.was_flaky = runInfo.passed && runInfo.failed;
    runMap.set(att.run_id, runInfo);
    runResultsMap.set(specKey, runMap);
  }

  return uniqueSpecs.map(s => {
    const specKey = `${s.test_id}:${s.project_name}`;
    const runMap = runResultsMap.get(specKey);
    
    // Sort runs by start_time DESC and take last 12
    const sortedRuns = Array.from(runMap?.values() ?? [])
      .sort((a, b) => b.start_time.localeCompare(a.start_time))
      .slice(0, 12)
      .reverse(); // Back to ASC for display

    const latestRun = sortedRuns[sortedRuns.length - 1];

    return {
      test_id: s.test_id,
      title: s.title,
      file: s.file,
      line: s.line,
      project_name: s.project_name,
      final_status: latestRun?.status ?? null,
      was_flaky: latestRun?.was_flaky ?? false,
      attempts: sortedRuns.map(r => ({
        status: r.was_flaky ? "flaky" : (r.status || "unknown"),
        run_id: "" 
      }))
    };
  });
}

export async function listRunFlakies(commitHash: string): Promise<RunFlakyRow[]> {
  const baseRun = await db
    .selectFrom("runs")
    .select(["repo", "commit_hash"])
    .where("commit_hash", "=", commitHash)
    .executeTakeFirst();

  if (!baseRun) return [];

  const shardIdsSubq = db
    .selectFrom("runs as r_shards")
    .select("r_shards.id")
    .where("r_shards.repo", "=", baseRun.repo)
    .where("r_shards.commit_hash", "=", baseRun.commit_hash);

  const rows = await db
    .selectFrom("results as trt")
    .innerJoin("specs as t", "t.id", "trt.test_id")
    .select(["trt.test_id as test_id", "t.title as title", "t.file as file", "t.line as line"])
    .where("trt.run_id", "in", shardIdsSubq)
    .where((eb) =>
      eb.and([
        eb.exists(
          db
            .selectFrom("attempts as r1")
            .select((qb) => qb.val(1).as("one"))
            .where("r1.run_id", "in", shardIdsSubq)
            .whereRef("r1.test_id", "=", eb.ref("trt.test_id"))
            .where("r1.status", "=", "failed"),
        ),
        eb.exists(
          db
            .selectFrom("attempts as r2")
            .select((qb) => qb.val(1).as("one"))
            .where("r2.run_id", "in", shardIdsSubq)
            .whereRef("r2.test_id", "=", eb.ref("trt.test_id"))
            .where("r2.status", "=", "passed"),
        ),
      ]),
    )
    .groupBy(["trt.test_id"])
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
    .selectFrom("attempts as r")
    .select((eb) => [
      "r.run_id as run_id",
      eb.fn.max("r.retry").as("max_retry"),
    ])
    .where("r.test_id", "=", testId)
    .groupBy("r.run_id")
    .as("mr");

  const rows = await db
    .selectFrom("results as trt")
    .innerJoin("runs as tr", "tr.id", "trt.run_id")
    .leftJoin(maxRetry, "mr.run_id", "trt.run_id")
    .leftJoin("attempts as rf", (join) =>
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
            .selectFrom("attempts as r1")
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
              .selectFrom("attempts as r2")
              .select((qb) => qb.val(1).as("one"))
              .whereRef("r2.run_id", "=", "trt.run_id")
              .whereRef("r2.test_id", "=", "trt.test_id")
              .where("r2.status", "=", "failed"),
          ),
          eb.exists(
            eb
              .selectFrom("attempts as r3")
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
    .selectFrom("runs")
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
    .selectFrom("attempts as r")
    .innerJoin(rr, (join) => join.onRef("rr.id", "=", "r.run_id"))
    .select(["r.test_id as test_id", "r.run_id as run_id"])
    .groupBy(["r.test_id", "r.run_id"])
    .execute();

  // Flaky pairs: intersection of any-fail and any-pass for the same test/run
  const failPairs = db
    .selectFrom("attempts as r")
    .innerJoin(rr, (join) => join.onRef("rr.id", "=", "r.run_id"))
    .select(["r.test_id as test_id", "r.run_id as run_id"])
    .where("r.status", "=", "failed")
    .groupBy(["r.test_id", "r.run_id"])
    .as("f");
  const passPairs = db
    .selectFrom("attempts as r")
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
    .innerJoin("runs as tr", (join) => join.onRef("tr.id", "=", "rr.id"))
    .select(["tr.start_time"])
    .orderBy("tr.start_time", "asc")
    .limit(1)
    .executeTakeFirst();
  const rrPrev = db
    .selectFrom("runs")
    .select(["id"])
    .where("start_time", "<", oldestCurrent?.start_time ?? "")
    .orderBy("start_time", "desc")
    .limit(previousWindow)
    .as("rp");

  // Aggregations per window
  const execCurrent = await db
    .selectFrom("attempts as r")
    .innerJoin(rrCur, (join) => join.onRef("rr.id", "=", "r.run_id"))
    .select((eb) => ["r.test_id as test_id", eb.fn.count("r.run_id").distinct().as("total_runs")])
    .groupBy("r.test_id")
    .execute();
  const currentTotals = new Map(execCurrent.map((r) => [r.test_id as string, Number(r.total_runs)]));

  const flakyCurrent = await db
    .selectFrom(
      db
        .selectFrom("attempts as r")
        .innerJoin(rrCur, (join) => join.onRef("rr.id", "=", "r.run_id"))
        .select(["r.test_id as test_id", "r.run_id as run_id"])
        .where("r.status", "=", "failed")
        .groupBy(["r.test_id", "r.run_id"])
        .as("f"),
    )
    .innerJoin(
      db
        .selectFrom("attempts as r")
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
    .selectFrom("attempts as r")
    .innerJoin(rrPrev, (join) => join.onRef("rp.id", "=", "r.run_id"))
    .select((eb) => ["r.test_id as test_id", eb.fn.count("r.run_id").distinct().as("total_runs")])
    .groupBy("r.test_id")
    .execute();
  const prevTotals = new Map(execPrev.map((r) => [r.test_id as string, Number(r.total_runs)]));

  const flakyPrev = await db
    .selectFrom(
      db
        .selectFrom("attempts as r")
        .innerJoin(rrPrev, (join) => join.onRef("rp.id", "=", "r.run_id"))
        .select(["r.test_id as test_id", "r.run_id as run_id"])
        .where("r.status", "=", "failed")
        .groupBy(["r.test_id", "r.run_id"])
        .as("f"),
    )
    .innerJoin(
      db
        .selectFrom("attempts as r")
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
    .selectFrom("specs")
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
  commitHash: string,
  lookbackRuns = 20,
): Promise<RunFlakyRow[]> {
  const run = await getRun(commitHash);
  if (!run?.start_time) return [];

  const baseRun = await db
    .selectFrom("runs")
    .select(["repo", "commit_hash"])
    .where("commit_hash", "=", commitHash)
    .executeTakeFirst();
  if (!baseRun) return [];

  // SQL Subquery for shards in the current run
  const shardIdsSubq = db
    .selectFrom("runs as r_shards")
    .select("r_shards.id")
    .where("r_shards.repo", "=", baseRun.repo)
    .where("r_shards.commit_hash", "=", baseRun.commit_hash);

  // SQL Subquery for prior run IDs (approximate for shards)
  const priorRunsIdsSubq = db
    .selectFrom("runs as r_prior")
    .select("r_prior.id")
    .where("r_prior.start_time", "<", run.start_time!)
    .orderBy("r_prior.start_time", "desc")
    .limit(lookbackRuns * (run.shard_count ?? 1));

  // Flaky tests in this run (across all shards)
  const failNow = db
    .selectFrom("attempts")
    .select(["test_id"])
    .where("run_id", "in", shardIdsSubq)
    .where("status", "=", "failed")
    .groupBy("test_id")
    .as("fn");
  const passNow = db
    .selectFrom("attempts")
    .select(["test_id"])
    .where("run_id", "in", shardIdsSubq)
    .where("status", "=", "passed")
    .groupBy("test_id")
    .as("pn");

  const flakiesNowSubq = db
    .selectFrom(failNow)
    .innerJoin(passNow, "pn.test_id", "fn.test_id")
    .select(["fn.test_id as test_id"]);

  // Which of those tests were flaky in any prior run?
  const priorFail = db
    .selectFrom("attempts as pf_att")
    .select(["pf_att.test_id", "pf_att.run_id"])
    .where("pf_att.test_id", "in", flakiesNowSubq)
    .where("pf_att.run_id", "in", priorRunsIdsSubq)
    .where("pf_att.status", "=", "failed")
    .groupBy(["pf_att.test_id", "pf_att.run_id"])
    .as("pf");
  const priorPass = db
    .selectFrom("attempts as pp_att")
    .select(["pp_att.test_id", "pp_att.run_id"])
    .where("pp_att.test_id", "in", flakiesNowSubq)
    .where("pp_att.run_id", "in", priorRunsIdsSubq)
    .where("pp_att.status", "=", "passed")
    .groupBy(["pp_att.test_id", "pp_att.run_id"])
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

  // Get the full list of flakies in this run to filter out the prior ones
  const flakiesNow = await flakiesNowSubq.execute();
  const newIds = flakiesNow
    .map((f) => f.test_id)
    .filter((id) => !priorFlakySet.has(id));

  if (newIds.length === 0) return [];

  return await db
    .selectFrom("specs as t")
    .select(["t.id as test_id", "t.title as title", "t.file as file", "t.line as line"])
    .where("t.id", "in", newIds)
    .execute();
}
