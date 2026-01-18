import { db } from "@/db";

export type TestMetadata = {
  id: string;
  title: string | null;
  file: string | null;
  line: number | null;
};

export type TestHistoryRow = {
  run_id: string;
  start_time: string | null;
  owner: string | null;
  repo: string | null;
  branch: string | null;
  project_name: string | null;
  status: string | null;
  duration_ms: number;
  was_flaky: boolean;
  expected_count: number;
  skipped_count: number;
  flaky_count: number;
  unexpected_count: number;
  pr_user: string | null;
};

export async function getTestData(testId: string): Promise<TestMetadata | null> {
  const test = await db
    .selectFrom("specs")
    .selectAll()
    .where("id", "=", testId)
    .executeTakeFirst();

  return test ?? null;
}

export async function getTestHistory(
  testId: string,
  limit = 50,
): Promise<TestHistoryRow[]> {
  // Fetch the runs and the base test info for each run
  const runs = await db
    .selectFrom("results as trt")
    .innerJoin("runs as tr", "tr.id", "trt.run_id")
    .select([
      "trt.run_id",
      "trt.project_name",
      "tr.start_time",
      "tr.repo as owner",
      "tr.branch as repo",
      "tr.commit_hash as branch",
      "trt.status as final_status",
      "tr.expected_count",
      "tr.skipped_count",
      "tr.flaky_count",
      "tr.unexpected_count",
      "tr.pr_user",
    ])
    .where("trt.test_id", "=", testId)
    .orderBy("tr.start_time", "desc")
    .limit(limit)
    .execute();

  if (runs.length === 0) return [];

  const runIds = runs.map(r => r.run_id);

  // Fetch all results for these runs to compute flakiness and duration
  const results = await db
    .selectFrom("attempts")
    .select(["run_id", "project_id", "status", "duration_ms"])
    .where("test_id", "=", testId)
    .where("run_id", "in", runIds)
    .execute();

  // Aggregate results by run_id AND project_id
  const projectMetrics = new Map<string, { duration: number; hadPass: boolean; hadFail: boolean }>();
  for (const r of results) {
    const key = `${r.run_id}:${r.project_id ?? ""}`;
    const metrics = projectMetrics.get(key) ?? { duration: 0, hadPass: false, hadFail: false };
    metrics.duration += (r.duration_ms ?? 0);
    if (r.status === "passed") metrics.hadPass = true;
    if (r.status === "failed") metrics.hadFail = true;
    projectMetrics.set(key, metrics);
  }

  return runs.map((r) => {
    // Correctly match with project_name (which is stored in project_id in attempts)
    const metrics = projectMetrics.get(`${r.run_id}:${r.project_name ?? ""}`);

    return {
      run_id: r.run_id,
      project_name: r.project_name,
      start_time: r.start_time,
      owner: r.owner,
      repo: r.repo,
      branch: r.branch,
      status: r.final_status,
      duration_ms: metrics?.duration ?? 0,
      was_flaky: Boolean(metrics?.hadPass && metrics?.hadFail),
      expected_count: r.expected_count,
      skipped_count: r.skipped_count,
      flaky_count: r.flaky_count,
      unexpected_count: r.unexpected_count,
      pr_user: r.pr_user,
    };
  });
}
