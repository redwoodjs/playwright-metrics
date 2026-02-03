import { env } from "cloudflare:workers";
import { createDb, sql } from "rwsdk/db";
export { sql };

export interface AppDatabase {
  runs: {
    id: string;
    pr_user: string;
    repo: string;
    branch: string;
    commit_hash: string;
    commit_href: string;
    pr_href: string;
    pr_title: string;
    build_href: string;
    playwright_version: string;
    workers: number;
    shard_current: number;
    shard_total: number;
    start_time: string;
    duration_ms: number;
    expected_count: number;
    skipped_count: number;
    flaky_count: number;
    unexpected_count: number;
    labels?: string;
  };
  specs: {
    id: string;
    title: string | null;
    file: string | null;
    line: number | null;
    column: number | null;
  };
  results: {
    id: string;
    run_id: string;
    test_id: string;
    project_id: string | null;
    project_name: string | null;
    status: string | null;
    expected: boolean | null;
    attempts: number | null;
    final_status: string | null;
    branch: string | null;
    was_flaky: boolean | null;
    had_failure: boolean | null;
    retry_duration_ms: number | null;
    retry_count: number | null;
    final_duration_ms: number | null;
    start_time: string | null;
  };
  attempts: {
    id: string;
    run_id: string;
    test_id: string;
    project_id: string | null;
    worker_index: number | null;
    retry: number | null;
    status: string | null;
    duration_ms: number | null;
    start_time: string | null;
    error_msg: string | null;
  };
  test_metrics: {
    test_id: string;
    branch: string;
    total_runs: number;
    flaky_runs: number;
    runs_with_failure: number;
    retry_duration_total_ms: number;
    retry_count_total: number;
    duration_total_ms: number;
    last_flaky_start_time: string | null;
  };
}

export type Spec = AppDatabase["specs"];
export type Run = AppDatabase["runs"];
export type Result = AppDatabase["results"];
export type Attempt = AppDatabase["attempts"];

export const getDb = (env: Env) => {
  return createDb<AppDatabase>(
    env.DATABASE,
    "metrics",
  );
};

export const db = getDb(env);