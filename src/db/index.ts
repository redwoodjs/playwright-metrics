import { env } from "cloudflare:workers";
import { type Database, createDb } from "rwsdk/db";
import { type migrations } from "@/db/migrations";

export type AppDatabase = Database<typeof migrations>;
export type Spec = AppDatabase["specs"];
export type Run = AppDatabase["runs"] & {
  shard_count?: number;
};
export type Result = AppDatabase["results"];
export type Attempt = AppDatabase["attempts"];

export const db = createDb<AppDatabase>(
  env.DATABASE,
  "metrics", // unique key for this database instance
);