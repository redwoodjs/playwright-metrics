import { type Migrations } from "rwsdk/db";

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
} satisfies Migrations;