"use server";
import { env } from "cloudflare:workers";
import { db, sql } from "@/db";

const RESET_TABLES = ["attempts", "results", "runs", "test_metrics"] as const;
type ResetTable = (typeof RESET_TABLES)[number];

export type ResetResult = {
  deletedThisCall: number;
  chunksUsed: number;
  remaining: Record<ResetTable, boolean>;
  done: boolean;
};

// Wipe all ingested data so a full reingest from R2 produces a clean state.
// Does NOT touch the R2 bucket — only the Durable Object DB tables.
//
// A single DELETE FROM <multi-million-row table> exceeds the DO storage op
// timeout, so we chunk it. Each call processes up to maxChunks deletions;
// repeat until `done: true`.
export async function resetAllIngestedData(opts: {
  chunkSize?: number;
  maxChunks?: number;
} = {}): Promise<ResetResult> {
  const chunkSize = opts.chunkSize ?? 5000;
  const maxChunks = opts.maxChunks ?? 50;

  let deletedThisCall = 0;
  let chunksUsed = 0;
  const remaining: Record<ResetTable, boolean> = {
    attempts: true,
    results: true,
    runs: true,
    test_metrics: true,
  };

  for (const table of RESET_TABLES) {
    while (remaining[table] && chunksUsed < maxChunks) {
      const result = await sql`
        DELETE FROM ${sql.raw(table)}
        WHERE rowid IN (SELECT rowid FROM ${sql.raw(table)} LIMIT ${chunkSize})
      `.execute(db);
      const n = Number((result as any).numAffectedRows ?? 0);
      deletedThisCall += n;
      chunksUsed += 1;
      if (n < chunkSize) {
        remaining[table] = false;
      }
    }
    if (chunksUsed >= maxChunks) break;
  }

  return {
    deletedThisCall,
    chunksUsed,
    remaining,
    done: Object.values(remaining).every((r) => !r),
  };
}

export type QueueResult = {
  pagesScanned: number;
  queued: number;
  cursor: string | null;
  done: boolean;
  stoppedBy: "done" | "subrequests" | "wallclock";
  resumedFromPersisted: boolean;
};

const CURSOR_KEY = "_state/reingest-cursor.json";

async function readPersistedCursor(): Promise<string | undefined> {
  const obj = await env.R2.get(CURSOR_KEY);
  if (!obj) return undefined;
  try {
    const data = JSON.parse(await obj.text());
    return typeof data.cursor === "string" ? data.cursor : undefined;
  } catch {
    return undefined;
  }
}

async function writePersistedCursor(cursor: string | null): Promise<void> {
  if (cursor === null) {
    await env.R2.delete(CURSOR_KEY);
    return;
  }
  await env.R2.put(
    CURSOR_KEY,
    JSON.stringify({ cursor, updatedAt: new Date().toISOString() }),
  );
}

// Page through R2 under prefix "runs/" and queue every key for re-ingestion
// via the existing INGESTION_QUEUE. The cursor is persisted in R2 between
// calls so hitting the route repeatedly without arguments resumes the sweep.
// Pass `reset: true` to start over from the beginning.
export async function queueAllR2ForReingest(opts: {
  cursor?: string;
  reset?: boolean;
} = {}): Promise<QueueResult> {
  // Each page = 1 list subrequest + up to 10 sendBatch subrequests (1000/100).
  // Worker budget is 1000 subrequests; leave headroom for DO calls etc.
  const SUBREQ_BUDGET = 850;
  const PAGE_COST_MAX = 11;
  const WALLCLOCK_BUDGET_MS = 25_000;

  const startMs = Date.now();
  let cursor: string | undefined = opts.cursor;
  let resumedFromPersisted = false;
  if (!cursor && !opts.reset) {
    cursor = await readPersistedCursor();
    resumedFromPersisted = cursor !== undefined;
  }
  let pagesScanned = 0;
  let queued = 0;
  let subreqsUsed = 2; // reserve for the persist read + final write

  while (true) {
    if (subreqsUsed + PAGE_COST_MAX > SUBREQ_BUDGET) {
      await writePersistedCursor(cursor ?? null);
      return {
        pagesScanned,
        queued,
        cursor: cursor ?? null,
        done: false,
        stoppedBy: "subrequests",
        resumedFromPersisted,
      };
    }
    if (Date.now() - startMs > WALLCLOCK_BUDGET_MS) {
      await writePersistedCursor(cursor ?? null);
      return {
        pagesScanned,
        queued,
        cursor: cursor ?? null,
        done: false,
        stoppedBy: "wallclock",
        resumedFromPersisted,
      };
    }

    const list = await env.R2.list({
      prefix: "runs/",
      cursor,
      limit: 1000,
    });
    subreqsUsed += 1;
    pagesScanned += 1;

    if (list.objects.length > 0) {
      const messages = list.objects.map((o) => ({
        body: { type: "ingest" as const, r2ObjectKey: o.key },
      }));
      // Queue sendBatch limit is 100; fan them out in parallel.
      const batches: { body: { type: "ingest"; r2ObjectKey: string } }[][] = [];
      for (let i = 0; i < messages.length; i += 100) {
        batches.push(messages.slice(i, i + 100));
      }
      await Promise.all(batches.map((b) => env.INGESTION_QUEUE.sendBatch(b)));
      subreqsUsed += batches.length;
      queued += list.objects.length;
    }

    if (!list.truncated) {
      await writePersistedCursor(null);
      return {
        pagesScanned,
        queued,
        cursor: null,
        done: true,
        stoppedBy: "done",
        resumedFromPersisted,
      };
    }
    cursor = list.cursor;
  }
}
