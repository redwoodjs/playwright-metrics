"use server";
import { env } from "cloudflare:workers";

export type ArchiveResult = {
  pagesScanned: number;
  objectsScanned: number;
  staleFound: number;
  moved: number;
  errors: string[];
  cursor: string | null;
  done: boolean;
};

// Move R2 objects older than `days` from runs/... to old/runs/... so the
// reingest UI (which lists with prefix "runs/") stops scanning them.
//
// Each move costs 3 subrequests (get + put + delete) and the worker subrequest
// budget is 1000/request, so we bound the page size and stop early if we'd
// exceed it. Pass the returned `cursor` back in to continue.
export async function archiveStaleR2Objects(opts: {
  days?: number;
  cursor?: string;
  pageSize?: number;
  parallelism?: number;
} = {}): Promise<ArchiveResult> {
  const days = opts.days ?? 14;
  const pageSize = opts.pageSize ?? 300;
  const parallelism = opts.parallelism ?? 50;
  const cutoffMs = Date.now() - days * 24 * 60 * 60 * 1000;

  let cursor: string | undefined = opts.cursor;
  let pagesScanned = 0;
  let objectsScanned = 0;
  let staleFound = 0;
  let moved = 0;
  const errors: string[] = [];

  // Subrequest budget per worker invocation is 1000. Reserve some headroom
  // for the DO/kysely calls happening elsewhere.
  const SUBREQUEST_BUDGET = 900;
  let subrequestsUsed = 0;

  while (subrequestsUsed + 1 + pageSize * 3 <= SUBREQUEST_BUDGET) {
    const list = await env.R2.list({
      prefix: "runs/",
      cursor,
      limit: pageSize,
    });
    subrequestsUsed += 1;

    pagesScanned += 1;
    objectsScanned += list.objects.length;

    const stale = list.objects.filter(
      (o) => o.uploaded && o.uploaded.getTime() < cutoffMs,
    );
    staleFound += stale.length;

    for (let i = 0; i < stale.length; i += parallelism) {
      const chunk = stale.slice(i, i + parallelism);
      const results = await Promise.allSettled(
        chunk.map((obj) => moveOne(obj.key)),
      );
      subrequestsUsed += chunk.length * 3;
      for (let j = 0; j < results.length; j += 1) {
        const r = results[j];
        if (r.status === "fulfilled") {
          if (r.value) moved += 1;
        } else {
          errors.push(`${chunk[j].key}: ${r.reason?.message ?? r.reason}`);
        }
      }
    }

    if (!list.truncated) {
      return {
        pagesScanned,
        objectsScanned,
        staleFound,
        moved,
        errors,
        cursor: null,
        done: true,
      };
    }

    cursor = list.cursor;
  }

  return {
    pagesScanned,
    objectsScanned,
    staleFound,
    moved,
    errors,
    cursor: cursor ?? null,
    done: false,
  };
}

async function moveOne(key: string): Promise<boolean> {
  const src = await env.R2.get(key);
  if (!src) return false;
  const newKey = `old/${key}`;
  await env.R2.put(newKey, src.body, {
    httpMetadata: src.httpMetadata,
    customMetadata: src.customMetadata,
  });
  await env.R2.delete(key);
  return true;
}
