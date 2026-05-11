"use server";
import { db } from "@/db";

// Flaky reporting is limited to the trailing 2-week window so the leaderboard
// reflects current quality rather than years-old aggregates.
const FLAKY_REPORT_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

const flakyReportSince = () =>
  new Date(Date.now() - FLAKY_REPORT_WINDOW_MS).toISOString();

export type LeaderboardRow = {
  test_id: string;
  title: string | null;
  file: string | null;
  flaky_rate: number;
  flaky_runs: number;
  total_runs: number;
  waste_time_ms: number;
  recent_results: ("pass" | "flaky" | "fail" | "skip")[];
};

type RecentFlakyAggregate = {
  test_id: string;
  title: string | null;
  file: string | null;
  total_runs: number;
  flaky_runs: number;
  flaky_rate: number;
  fail_rate: number;
  waste_time_ms: number;
};

async function listFlakiestTestsRecent(
  branch?: string,
): Promise<RecentFlakyAggregate[]> {
  let query = db
    .selectFrom("results as r")
    .innerJoin("specs as t", "t.id", "r.test_id")
    .where("r.start_time", ">=", flakyReportSince());

  if (branch) {
    query = query.where("r.branch", "=", branch);
  }

  const rows = await query
    .select((eb) => [
      "r.test_id",
      "t.title",
      "t.file",
      eb.fn.countAll<number>().as("total_runs"),
      eb.fn.sum<number>("r.was_flaky").as("flaky_runs"),
      eb.fn.sum<number>("r.had_failure").as("runs_with_failure"),
      eb.fn.sum<number>("r.retry_duration_ms").as("waste_time_ms"),
    ])
    .groupBy(["r.test_id", "t.title", "t.file"])
    .execute();

  return rows
    .map((r) => {
      const total = Number(r.total_runs ?? 0);
      const flaky = Number(r.flaky_runs ?? 0);
      const fails = Number(r.runs_with_failure ?? 0);
      return {
        test_id: r.test_id,
        title: r.title,
        file: r.file,
        total_runs: total,
        flaky_runs: flaky,
        flaky_rate: total > 0 ? flaky / total : 0,
        fail_rate: total > 0 ? fails / total : 0,
        waste_time_ms: Number(r.waste_time_ms ?? 0),
      };
    })
    .filter((r) => r.flaky_runs > 0 && r.fail_rate < 1);
}

/**
 * Get all unique branches from the test_metrics table
 */
export async function listBranches(): Promise<string[]> {
  const rows = await db
    .selectFrom("test_metrics")
    .select("branch")
    .distinct()
    .orderBy("branch", "asc")
    .execute();
  return rows.map((r) => r.branch);
}

/**
 * Get recent execution results for multiple tests in a single query
 * Returns Map of testId -> array of "pass", "flaky", or "fail" statuses
 */
async function getRecentResultsBatched(
  testIds: string[],
  limit = 5,
  branch?: string,
): Promise<Map<string, ("pass" | "flaky" | "fail" | "skip")[]>> {
  if (testIds.length === 0) return new Map();

  // Cloudflare D1 has a limit of 100 variables per query.
  // We chunk the testIds to avoid hitting this limit.
  const CHUNK_SIZE = 50;
  const chunks = [];
  for (let i = 0; i < testIds.length; i += CHUNK_SIZE) {
    chunks.push(testIds.slice(i, i + CHUNK_SIZE));
  }

  const results = await Promise.all(
    chunks.map(async (chunkIds) => {
      let query = db
        .selectFrom("results as trt")
        .select([
          "trt.test_id",
          "trt.status",
          "trt.was_flaky",
          "trt.had_failure",
          "trt.start_time",
        ])
        .where("trt.test_id", "in", chunkIds)
        .where("trt.start_time", ">=", flakyReportSince());

      if (branch) {
        query = query.where("trt.branch", "=", branch);
      }

      return query
        .orderBy("trt.start_time", "desc")
        .limit(chunkIds.length * limit * 15)
        .execute();
    })
  );

  const flatRows = results.flat();

  const resultMap = new Map<string, ("pass" | "flaky" | "fail" | "skip")[]>();
  for (const r of flatRows) {
    const statuses = resultMap.get(r.test_id) || [];
    if (statuses.length >= limit) continue;

    let status: "pass" | "flaky" | "fail" | "skip" = "pass";
    const hadFailure = Boolean(r.had_failure);
    const wasFlaky = Boolean(r.was_flaky);

    if (wasFlaky) {
      status = "flaky";
    } else if (hadFailure) {
      status = "fail";
    } else if (r.status === "skipped") {
      status = "skip";
    } else {
      status = "pass";
    }

    statuses.push(status);
    resultMap.set(r.test_id, statuses);
  }

  return resultMap;
}

/**
 * Get leaderboard data with flakiness rates, waste time, and recent results
 */
export async function getLeaderboardData(
  limit = 50,
  sortBy: "rate" | "runs" | "waste" = "rate",
  branch?: string,
): Promise<LeaderboardRow[]> {
  // 1. Aggregate flaky stats from results over the trailing 2-week window
  const onlyFlaky = await listFlakiestTestsRecent(branch);

  // 2. Batched fetch of recent results for all tests at once
  const testIds = onlyFlaky.map((t) => t.test_id);
  const recentResultsMap = await getRecentResultsBatched(testIds, 12, branch);

  // 3. Transform into LeaderboardRow
  const leaderboardData: LeaderboardRow[] = onlyFlaky.map((test) => {
    return {
      test_id: test.test_id,
      title: test.title,
      file: test.file,
      flaky_rate: test.flaky_rate,
      flaky_runs: test.flaky_runs,
      total_runs: test.total_runs,
      waste_time_ms: test.waste_time_ms,
      recent_results: recentResultsMap.get(test.test_id) || [],
    };
  });

  // 5. Sort based on requested metric
  leaderboardData.sort((a, b) => {
    if (sortBy === "waste") {
      return b.waste_time_ms - a.waste_time_ms;
    }
    if (sortBy === "runs") {
      if (b.flaky_runs !== a.flaky_runs) return b.flaky_runs - a.flaky_runs;
      return b.flaky_rate - a.flaky_rate;
    }

    // Default: rate
    if (b.flaky_rate !== a.flaky_rate) return b.flaky_rate - a.flaky_rate;
    if (b.flaky_runs !== a.flaky_runs) return b.flaky_runs - a.flaky_runs;
    return b.total_runs - a.total_runs;
  });

  return leaderboardData.slice(0, limit);
}
