"use server";
import { env } from "cloudflare:workers";
import { db, sql } from "@/db";

export type StatsResult = {
  r2: {
    runsObjects: number;
    oldObjects: number;
    pagesScanned: number;
    incomplete: boolean;
  };
  db: {
    runs: number;
    results: number;
    attempts: number;
    test_metrics: number;
    earliest_result_start: string | null;
    latest_result_start: string | null;
  };
};

export async function getAdminStats(): Promise<StatsResult> {
  const [runsCount, oldCount] = await Promise.all([
    countR2Prefix("runs/"),
    countR2Prefix("old/"),
  ]);

  const [r, ru, a, tm, range] = await Promise.all([
    sql`SELECT COUNT(*) AS c FROM results`.execute(db),
    sql`SELECT COUNT(*) AS c FROM runs`.execute(db),
    sql`SELECT COUNT(*) AS c FROM attempts`.execute(db),
    sql`SELECT COUNT(*) AS c FROM test_metrics`.execute(db),
    sql`SELECT MIN(start_time) AS earliest, MAX(start_time) AS latest FROM results`.execute(db),
  ]);

  return {
    r2: {
      runsObjects: runsCount.count,
      oldObjects: oldCount.count,
      pagesScanned: runsCount.pages + oldCount.pages,
      incomplete: runsCount.incomplete || oldCount.incomplete,
    },
    db: {
      runs: numberFromRow(ru.rows[0]),
      results: numberFromRow(r.rows[0]),
      attempts: numberFromRow(a.rows[0]),
      test_metrics: numberFromRow(tm.rows[0]),
      earliest_result_start: (range.rows[0] as any)?.earliest ?? null,
      latest_result_start: (range.rows[0] as any)?.latest ?? null,
    },
  };
}

async function countR2Prefix(prefix: string): Promise<{
  count: number;
  pages: number;
  incomplete: boolean;
}> {
  const SUBREQ_BUDGET = 400;
  let cursor: string | undefined;
  let count = 0;
  let pages = 0;

  while (pages < SUBREQ_BUDGET) {
    const list = await env.R2.list({ prefix, cursor, limit: 1000 });
    pages += 1;
    count += list.objects.length;
    if (!list.truncated) {
      return { count, pages, incomplete: false };
    }
    cursor = list.cursor;
  }
  return { count, pages, incomplete: true };
}

function numberFromRow(row: any): number {
  if (!row) return 0;
  const c = row.c;
  return typeof c === "bigint" ? Number(c) : Number(c ?? 0);
}
