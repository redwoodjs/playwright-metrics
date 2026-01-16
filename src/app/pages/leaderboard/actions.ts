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
  recent_results: ("pass" | "flaky" | "fail")[];
};

/**
 * Get recent execution results for a test (last 5 runs)
 * Returns array of "pass", "flaky", or "fail" statuses
 */
async function getRecentResults(
  testId: string,
  limit = 5,
): Promise<("pass" | "flaky" | "fail")[]> {
  // Get the last N runs for this test
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
        .exists(
          eb
            .selectFrom("test_result as r2")
            .select((qb) => qb.val(1).as("one"))
            .whereRef("r2.run_id", "=", "trt.run_id")
            .whereRef("r2.test_id", "=", "trt.test_id")
            .where("r2.status", "=", "passed"),
        )
        .as("had_pass"),
    ])
    .where("trt.test_id", "=", testId)
    .orderBy("tr.start_time", "desc")
    .limit(limit)
    .execute();

  return rows.map((r) => {
    const hadFailure = Boolean(r.had_failure);
    const hadPass = Boolean(r.had_pass);
    const finalStatus = r.final_status;

    // If both pass and fail occurred, it's flaky
    if (hadFailure && hadPass) {
      return "flaky";
    }
    // If only failure (no pass), it's a fail
    if (hadFailure) {
      return "fail";
    }
    // Otherwise it passed
    return "pass";
  });
}

/**
 * Get leaderboard data with flakiness rates, waste time, and recent results
 */
export async function getLeaderboardData(
  limit = 50,
  sortBy: "rate" | "runs" | "waste" = "rate",
): Promise<LeaderboardRow[]> {
  // Get a larger set of potentially flaky tests to ensure we find those with high waste
  const flakiestTests = await listFlakiestTests(200);

  // Filter for tests that are actually flaky (flaky_rate > 0)
  const onlyFlaky = flakiestTests.filter((test) => test.flaky_rate > 0);

  // For each test, get recent results and calculate waste time
  const leaderboardData: LeaderboardRow[] = await Promise.all(
    onlyFlaky.map(async (test) => {
      const recentResults = await getRecentResults(test.test_id, 5);
      const wasteTimeMs = test.retry_duration_total_ms ?? 0;

      return {
        test_id: test.test_id,
        title: test.title,
        file: test.file,
        flaky_rate: test.flaky_rate,
        flaky_runs: test.flaky_runs,
        total_runs: test.total_runs,
        waste_time_ms: wasteTimeMs,
        recent_results: recentResults,
      };
    }),
  );

  // Filter out 100% error rate (not flaky if they always fail)
  // listFlakiestTests already calculates flaky_runs based on having both pass AND fail.
  // But we want to be explicit here if needed.
  // The listFlakiestTests already filtered for flaky_rate > 0 in the caller,
  // and flaky_rate is flaky_runs / total_runs.
  // So if flaky_rate > 0, it means it must have at least one flaky run (pass and fail).
  // A test with 100% error rate (only fails, no passes) would have flaky_runs = 0 and flaky_rate = 0.
  // So they are already excluded by `onlyFlaky`.

  // Sort based on requested metric
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
