"use server";

export async function backfillMetrics() {
  const { db, sql } = await import("@/db");

  // 1. Clear summary table
  await sql`DELETE FROM test_metrics`.execute(db);

  // 2. Repopulate from attempts and runs directly (more robust than results)
  // This aggregation finds flakiness per (test, project, run) and then sums it up.
  await sql`
    INSERT INTO test_metrics (
      test_id, branch, total_runs, flaky_runs, runs_with_failure, 
      retry_duration_total_ms, retry_count_total, duration_total_ms, last_flaky_start_time
    )
    SELECT 
      test_id, 
      branch, 
      COUNT(*) as total_runs,
      SUM(is_flaky) as flaky_runs,
      SUM(had_failure) as runs_with_failure,
      SUM(retry_duration) as retry_duration_total_ms,
      SUM(retry_count) as retry_count_total,
      SUM(final_duration) as duration_total_ms,
      MAX(CASE WHEN is_flaky = 1 THEN start_time ELSE NULL END) as last_flaky_start_time
    FROM (
      SELECT 
        a.test_id, 
        r.branch,
        a.run_id,
        CASE WHEN COUNT(DISTINCT a.status) > 1 AND SUM(CASE WHEN a.status = 'passed' THEN 1 ELSE 0 END) > 0 AND SUM(CASE WHEN a.status != 'passed' AND a.status != 'skipped' THEN 1 ELSE 0 END) > 0 THEN 1 ELSE 0 END as is_flaky,
        CASE WHEN SUM(CASE WHEN a.status != 'passed' AND a.status != 'skipped' THEN 1 ELSE 0 END) > 0 THEN 1 ELSE 0 END as had_failure,
        SUM(CASE WHEN a.retry > 0 THEN a.duration_ms ELSE 0 END) as retry_duration,
        SUM(CASE WHEN a.retry > 0 THEN 1 ELSE 0 END) as retry_count,
        MAX(a.duration_ms) as final_duration,
        MIN(a.start_time) as start_time
      FROM attempts a
      JOIN runs r ON r.id = a.run_id
      GROUP BY a.test_id, r.branch, a.run_id, a.project_id
    )
    GROUP BY test_id, branch
  `.execute(db);

  const res = await sql`SELECT COUNT(*) as count FROM test_metrics`.execute(db);
  // @ts-ignore
  const metricCount = res.rows?.[0]?.count ?? res[0]?.count ?? 0;

  return { metricCount };
}
