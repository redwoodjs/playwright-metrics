"use server";
import { db } from "@/db";
import { listFlakiestTests } from "../actions";

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
        .where("trt.test_id", "in", chunkIds);

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
  // 1. Get a larger set of potentially flaky tests from the summary table
  const flakiestTests = await listFlakiestTests(200, branch);

  // 2. Filter for tests that are actually flaky
  const onlyFlaky = flakiestTests.filter((test) => test.flaky_rate > 0);

  // 3. Batched fetch of recent results for all tests at once
  const testIds = onlyFlaky.map((t) => t.test_id);
  const recentResultsMap = await getRecentResultsBatched(testIds, 12, branch);

  // 4. Transform into LeaderboardRow
  const leaderboardData: LeaderboardRow[] = onlyFlaky.map((test) => {
    return {
      test_id: test.test_id,
      title: test.title,
      file: test.file,
      flaky_rate: test.flaky_rate,
      flaky_runs: test.flaky_runs,
      total_runs: test.total_runs,
      waste_time_ms: test.retry_duration_total_ms ?? 0,
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
