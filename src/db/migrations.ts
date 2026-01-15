import { type Migrations } from "rwsdk/db";

export const migrations = {
    "001_test_run": {
      async up(db) {
        return [
          await db.schema
            .createTable("test_run")
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
        ];
      },
      async down(db) {
        await db.schema.dropTable("test_run").ifExists().execute();
      },
    },
    "002_tests": {
      async up(db) {
        return [
          await db.schema
            .createTable("tests")
            .addColumn("id", "text", (col) => col.primaryKey())
            .addColumn("title", "text")
            .addColumn("file", "text")
            .addColumn("line", "integer")
            .addColumn("column", "integer")
            .execute(),
        ];
      },
      async down(db) {
        await db.schema.dropTable("tests").ifExists().execute();
      },
    },
    "003_test_runs_tests": {
      async up(db) {
        return [
          await db.schema
            .createTable("test_runs_tests")
            .addColumn("id", "text", (col) => col.primaryKey())
            .addColumn("run_id", "text", (col) => col.notNull())
            .addColumn("test_id", "text", (col) => col.notNull())
            .addColumn("project_id", "text")
            .addColumn("project_name", "text")
            .addColumn("status", "text") // expected | flaky | failed | skipped
            .addColumn("expected", "boolean")
            .addColumn("attempts", "integer")
            .addColumn("final_status", "text")
            .execute(),
        ];
      },
      async down(db) {
        await db.schema.dropTable("test_runs_tests").ifExists().execute();
      },
    },
    "004_test_attempts": {
      async up(db) {
        return [
          await db.schema
            .createTable("test_attempts")
            .addColumn("id", "text", (col) => col.primaryKey())
            .addColumn("run_id", "text", (col) => col.notNull())
            .addColumn("test_id", "text", (col) => col.notNull())
            .addColumn("project_id", "text")
            .addColumn("worker_index", "integer")
            .addColumn("retry", "integer")
            .addColumn("status", "text") // passed | failed | skipped
            .addColumn("duration_ms", "integer")
            .addColumn("start_time", "text")
            .addColumn("error_msg", "text")
            .execute(),
        ];
      },
      async down(db) {
        await db.schema.dropTable("test_attempts").ifExists().execute();
      },
    },
    // Align table names to singular model
    "005_create_test_and_drop_tests": {
      async up(db) {
        return [
          await db.schema
            .createTable("test")
            .addColumn("id", "text", (col) => col.primaryKey())
            .addColumn("title", "text")
            .addColumn("file", "text")
            .addColumn("line", "integer")
            .addColumn("column", "integer")
            .execute(),
          await db.schema.dropTable("tests").ifExists().execute(),
        ];
      },
      async down(db) {
        return [
          await db.schema
            .createTable("tests")
            .addColumn("id", "text", (col) => col.primaryKey())
            .addColumn("title", "text")
            .addColumn("file", "text")
            .addColumn("line", "integer")
            .addColumn("column", "integer")
            .execute(),
          await db.schema.dropTable("test").ifExists().execute(),
        ];
      },
    },
    "006_create_test_run_test_and_drop_test_runs_tests": {
      async up(db) {
        return [
          await db.schema
            .createTable("test_run_test")
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
          await db.schema.dropTable("test_runs_tests").ifExists().execute(),
        ];
      },
      async down(db) {
        return [
          await db.schema
            .createTable("test_runs_tests")
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
          await db.schema.dropTable("test_run_test").ifExists().execute(),
        ];
      },
    },
    "007_create_test_result_and_drop_test_attempts": {
      async up(db) {
        return [
          await db.schema
            .createTable("test_result")
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
          await db.schema.dropTable("test_attempts").ifExists().execute(),
        ];
      },
      async down(db) {
        return [
          await db.schema
            .createTable("test_attempts")
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
          await db.schema.dropTable("test_result").ifExists().execute(),
        ];
      },
    },
  } satisfies Migrations;