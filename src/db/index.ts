import { env } from "cloudflare:workers";
import { type Database, createDb } from "rwsdk/db";
import { type migrations } from "@/db/migrations";

export type AppDatabase = Database<typeof migrations>;
export type Test = AppDatabase["test"];
export type TestRun = AppDatabase["test_run"];
export type TestRunTest = AppDatabase["test_run_test"];
export type TestResult = AppDatabase["test_result"];

export const db = createDb<AppDatabase>(
  env.DATABASE,
  "tests-database", // unique key for this database instance
);