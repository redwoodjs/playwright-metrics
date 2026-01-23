import { type Migrations, sql } from "rwsdk/db";

export const migrations = {
  "001_initial": {
    async up(db) {
      return [
        await db.schema
          .createTable("runs")
          .addColumn("id", "text", (col) => col.primaryKey())
          .addColumn("pr_user", "text", (col) => col.notNull())
          .addColumn("repo", "text", (col) => col.notNull())
          .addColumn("branch", "text", (col) => col.notNull())
          .addColumn("commit_hash", "text", (col) => col.notNull())
          .addColumn("commit_href", "text", (col) => col.notNull())
          .addColumn("pr_href", "text", (col) => col.notNull())
          .addColumn("pr_title", "text", (col) => col.notNull())
          .addColumn("build_href", "text", (col) => col.notNull())
          .addColumn("playwright_version", "text", (col) => col.notNull())
          .addColumn("workers", "integer", (col) => col.notNull())
          .addColumn("shard_current", "integer", (col) => col.notNull())
          .addColumn("shard_total", "integer", (col) => col.notNull())
          .addColumn("start_time", "text", (col) => col.notNull())
          .addColumn("duration_ms", "integer", (col) => col.notNull())
          .addColumn("expected_count", "integer", (col) => col.notNull())
          .addColumn("skipped_count", "integer", (col) => col.notNull())
          .addColumn("flaky_count", "integer", (col) => col.notNull())
          .addColumn("unexpected_count", "integer", (col) => col.notNull())
          .execute(),
        await db.schema
          .createTable("specs")
          .addColumn("id", "text", (col) => col.primaryKey())
          .addColumn("title", "text")
          .addColumn("file", "text")
          .addColumn("line", "integer")
          .addColumn("column", "integer")
          .execute(),
        await db.schema
          .createTable("results")
          .addColumn("id", "text", (col) => col.primaryKey())
          .addColumn("run_id", "text", (col) => col.notNull())
          .addColumn("test_id", "text", (col) => col.notNull())
          .addColumn("project_id", "text")
          .addColumn("project_name", "text")
          .addColumn("status", "text")
          .addColumn("expected", "boolean")
          .addColumn("attempts", "integer")
          .addColumn("final_status", "text")
          .execute(),
        await db.schema
          .createTable("attempts")
          .addColumn("id", "text", (col) => col.primaryKey())
          .addColumn("run_id", "text", (col) => col.notNull())
          .addColumn("test_id", "text", (col) => col.notNull())
          .addColumn("project_id", "text")
          .addColumn("worker_index", "integer")
          .addColumn("retry", "integer")
          .addColumn("status", "text")
          .addColumn("duration_ms", "integer")
          .addColumn("start_time", "text")
          .addColumn("error_msg", "text")
          .execute(),
      ];
    },
    async down(db) {
      return [
        await db.schema.dropTable("runs").ifExists().execute(),
        await db.schema.dropTable("specs").ifExists().execute(),
        await db.schema.dropTable("results").ifExists().execute(),
        await db.schema.dropTable("attempts").ifExists().execute(),
      ];
    },
  },
  "003_add_run_labels": {
    async up(db) {
      return [
        await db.schema
          .alterTable("runs")
          .addColumn("labels", "text")
          .execute(),
      ];
    },
    async down(db) {
      return [
        await db.schema.alterTable("runs").dropColumn("labels").execute(),
      ];
    },
  },
  "004_test_metrics": {
    async up(db) {
      // 1. Add columns to results for easier aggregation
      await db.schema
        .alterTable("results")
        .addColumn("branch", "text")
        .execute();
      await db.schema
        .alterTable("results")
        .addColumn("was_flaky", "boolean")
        .execute();
      await db.schema
        .alterTable("results")
        .addColumn("had_failure", "boolean")
        .execute();
      await db.schema
        .alterTable("results")
        .addColumn("retry_duration_ms", "integer")
        .execute();
      await db.schema
        .alterTable("results")
        .addColumn("retry_count", "integer")
        .execute();
      await db.schema
        .alterTable("results")
        .addColumn("final_duration_ms", "integer")
        .execute();
      await db.schema
        .alterTable("results")
        .addColumn("start_time", "text")
        .execute();

      // 2. Create test_metrics summary table
      await db.schema
        .createTable("test_metrics")
        .addColumn("test_id", "text", (col) => col.notNull())
        .addColumn("branch", "text", (col) => col.notNull())
        .addColumn("total_runs", "integer", (col) =>
          col.notNull().defaultTo(0),
        )
        .addColumn("flaky_runs", "integer", (col) =>
          col.notNull().defaultTo(0),
        )
        .addColumn("runs_with_failure", "integer", (col) =>
          col.notNull().defaultTo(0),
        )
        .addColumn("retry_duration_total_ms", "integer", (col) =>
          col.notNull().defaultTo(0),
        )
        .addColumn("retry_count_total", "integer", (col) =>
          col.notNull().defaultTo(0),
        )
        .addColumn("last_flaky_start_time", "text")
        .addColumn("duration_total_ms", "integer", (col) =>
          col.notNull().defaultTo(0),
        )
        .addPrimaryKeyConstraint("test_metrics_pk", ["test_id", "branch"])
        .execute();

      // 3. Add indices for performance
      await db.schema
        .createIndex("idx_results_test_branch")
        .on("results")
        .columns(["test_id", "branch"])
        .execute();
      await db.schema
        .createIndex("idx_attempts_test_run")
        .on("attempts")
        .columns(["test_id", "run_id"])
        .execute();

      // 4. Backfill existing results with branch and start_time from runs
      await sql`UPDATE results SET branch = (SELECT branch FROM runs WHERE runs.id = results.run_id)`.execute(
        db,
      );
      await sql`UPDATE results SET start_time = (SELECT start_time FROM runs WHERE runs.id = results.run_id)`.execute(
        db,
      );

      // 5. Initial populate of test_metrics from current results
      // We calculate metrics from the results table which now has was_flaky and had_failure
      // (though these might be NULL for old results unless re-computed)
      await sql`INSERT INTO test_metrics (test_id, branch, total_runs, flaky_runs, runs_with_failure, retry_duration_total_ms, retry_count_total, duration_total_ms, last_flaky_start_time)
                SELECT 
                  test_id, 
                  branch, 
                  COUNT(*), 
                  SUM(CASE WHEN was_flaky = 1 THEN 1 ELSE 0 END),
                  SUM(CASE WHEN had_failure = 1 THEN 1 ELSE 0 END),
                  SUM(COALESCE(retry_duration_ms, 0)),
                  SUM(COALESCE(retry_count, 0)),
                  SUM(COALESCE(final_duration_ms, 0)),
                  MAX(CASE WHEN was_flaky = 1 THEN start_time ELSE NULL END)
                FROM results
                WHERE branch IS NOT NULL
                GROUP BY test_id, branch`.execute(db);

      return [];
    },
    async down(db) {
      return [
        await db.schema.dropTable("test_metrics").ifExists().execute(),
        await db.schema.alterTable("results").dropColumn("branch").execute(),
        await db.schema.alterTable("results").dropColumn("was_flaky").execute(),
        await db.schema.alterTable("results").dropColumn("had_failure").execute(),
        await db.schema
          .alterTable("results")
          .dropColumn("retry_duration_ms")
          .execute(),
        await db.schema
          .alterTable("results")
          .dropColumn("retry_count")
          .execute(),
        await db.schema
          .alterTable("results")
          .dropColumn("final_duration_ms")
          .execute(),
        await db.schema.alterTable("results").dropColumn("start_time").execute(),
        await db.schema
          .dropIndex("idx_results_test_branch")
          .ifExists()
          .execute(),
        await db.schema.dropIndex("idx_attempts_test_run").ifExists().execute(),
      ];
    },
  },
} satisfies Migrations;