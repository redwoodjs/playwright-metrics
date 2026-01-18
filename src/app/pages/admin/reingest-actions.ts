"use server";
import { env } from "cloudflare:workers";
import { db } from "@/db";
import {
  computeRunMetrics,
  ingestRawReport,
  type IngestionMetadata,
} from "@/db/ingestion";

export type R2ObjectInfo = {
  key: string;
  repo: string;
  branch: string;
  commit: string;
  runId: string;
  prHref?: string;
  prTitle?: string;
  prUser?: string;
  uploaded?: string;
};

export type BranchGroup = {
  repo: string;
  branch: string;
  prTitle?: string;
  prHref?: string;
  prUser?: string;
  objects: R2ObjectInfo[];
};

export async function listR2Objects(): Promise<BranchGroup[]> {
  const objects: R2ObjectInfo[] = [];
  let cursor: string | undefined;

  try {
    console.log("[listR2Objects] Checking env and R2 binding...");
    if (!env) console.warn("[listR2Objects] env is UNDEFINED");
    if (env && !env.R2) console.warn("[listR2Objects] env.R2 is UNDEFINED");
    if (env && env.R2) console.log("[listR2Objects] R2 keys:", Object.keys(env.R2));

    // List all objects from R2
    while (true) {
      let list: any;
      try {
        // Try with customMetadata first
        list = await env.R2.list({
          prefix: "runs/",
          cursor,
          include: ["customMetadata"],
        } as any);
      } catch (err: any) {
        console.warn("[listR2Objects] List with metadata failed, retrying without it:", err.message);
        try {
          list = await env.R2.list({
            prefix: "runs/",
            cursor,
          });
        } catch (innerErr: any) {
          console.error("[listR2Objects] Fatal R2 list error:", innerErr.message);
          throw innerErr;
        }
      }

      if (!list || !list.objects) {
        console.warn("[listR2Objects] R2 list returned empty result unexpectedly");
        break;
      }

      for (const obj of list.objects) {
        // Parse key: runs/${repo}/${branch}/${commit}/${runId}.json
        const parts = obj.key.split("/");

        if (parts[0] !== "runs" || parts.length < 5) {
          continue;
        }

        const filename = parts[parts.length - 1];
        const runId = filename.replace(".json", "");
        const commit = parts[parts.length - 2];
        const branch = parts[parts.length - 3];
        const repo = parts.slice(1, parts.length - 3).join("/");

        const customMetadata = (obj as any).customMetadata ?? {};
        const prHref = customMetadata.prHref;
        const prTitle = customMetadata.prTitle;
        const prUser = customMetadata.prUser;

        objects.push({
          key: obj.key,
          repo,
          branch,
          commit,
          runId,
          prHref,
          prTitle,
          prUser,
          uploaded: obj.uploaded?.toISOString(),
        });
      }

      if (!list.truncated) break;
      cursor = list.cursor;
    }
  } catch (error) {
    console.error("[listR2Objects] Error listing R2 objects:", error);
    throw error;
  }

  // Group by (Repo + Branch + PR)
  const groupMap = new Map<string, BranchGroup>();

  for (const obj of objects) {
    // Group by PR if it exists, otherwise by branch
    const groupKey = obj.prHref || `${obj.repo}/${obj.branch}`;
    const group = groupMap.get(groupKey) || {
      repo: obj.repo,
      branch: obj.branch,
      prTitle: obj.prTitle,
      prHref: obj.prHref,
      prUser: obj.prUser,
      objects: [],
    };

    group.objects.push(obj);
    groupMap.set(groupKey, group);
  }

  // Sort objects within each group by uploaded DESC
  for (const group of groupMap.values()) {
    group.objects.sort((a, b) => {
      const aTime = a.uploaded ? new Date(a.uploaded).getTime() : 0;
      const bTime = b.uploaded ? new Date(b.uploaded).getTime() : 0;
      return bTime - aTime;
    });
  }

  // Convert to array and sort by the newest object in each group DESC
  const groups = Array.from(groupMap.values()).sort((a, b) => {
    const aTime = a.objects[0]?.uploaded
      ? new Date(a.objects[0].uploaded).getTime()
      : 0;
    const bTime = b.objects[0]?.uploaded
      ? new Date(b.objects[0].uploaded).getTime()
      : 0;

    if (bTime !== aTime) return bTime - aTime;

    return `${a.repo}/${a.branch}`.localeCompare(`${b.repo}/${b.branch}`);
  });

  return groups;
}

export async function reingestKeys(_prevState: any, formData: FormData) {
  const keys = formData.getAll("keys") as string[];
  const deleteOldData = formData.get("delete_old_data") === "on";

  if (keys.length === 0) {
    return { ok: false, error: "No files selected" };
  }

  console.log(
    `[Re-ingest] Starting re-ingestion of ${keys.length} files (deleteOldData: ${deleteOldData})...`
  );

  let count = 0;
  const errors: string[] = [];
  const cleanedRuns = new Set<string>();

  for (const key of keys) {
    try {
      console.log(`[Re-ingest] Processing ${key}...`);

      const r2Obj = await env.R2.get(key);
      if (!r2Obj) {
        console.log(`[Re-ingest] Skipping ${key}, could not fetch.`);
        errors.push(`${key}: could not fetch`);
        continue;
      }

      const reportJson = await r2Obj.json<any>();
      const customMetadata = r2Obj.customMetadata ?? {};

      // Parse key: runs/${repo}/${branch}/${commit}/${runId}.json
      const parts = key.split("/");
      if (parts[0] !== "runs" || parts.length < 5) {
        errors.push(`${key}: invalid key format`);
        continue;
      }

      const filename = parts[parts.length - 1];
      const runId = filename.replace(".json", "");
      const commit = parts[parts.length - 2];
      const branch = parts[parts.length - 3];
      const repo = parts.slice(1, parts.length - 3).join("/");

      if (deleteOldData && !cleanedRuns.has(runId)) {
        console.log(`[Re-ingest] Deleting old data for run ${runId}...`);
        await db.deleteFrom("attempts").where("run_id", "=", runId).execute();
        await db.deleteFrom("results").where("run_id", "=", runId).execute();
        await db.deleteFrom("runs").where("id", "=", runId).execute();
        cleanedRuns.add(runId);
      }

      const metadata: IngestionMetadata = {
        runId,
        repo,
        branch,
        commit,
        prUser: customMetadata.prUser,
        playwrightVersion:
          customMetadata.playwrightVersion ||
          reportJson.config?.playwrightVersion,
        workers: customMetadata.workers
          ? Number(customMetadata.workers)
          : undefined,
        shardCurrent: customMetadata.shardCurrent
          ? Number(customMetadata.shardCurrent)
          : undefined,
        shardTotal: customMetadata.shardTotal
          ? Number(customMetadata.shardTotal)
          : undefined,
        startTime: customMetadata.startTime || reportJson.stats?.startTime,
        durationMs: customMetadata.durationMs
          ? Number(customMetadata.durationMs)
          : reportJson.stats?.duration,
        expectedCount: customMetadata.expectedCount
          ? Number(customMetadata.expectedCount)
          : undefined,
        skippedCount: customMetadata.skippedCount
          ? Number(customMetadata.skippedCount)
          : undefined,
        flakyCount: customMetadata.flakyCount
          ? Number(customMetadata.flakyCount)
          : undefined,
        unexpectedCount: customMetadata.unexpectedCount
          ? Number(customMetadata.unexpectedCount)
          : undefined,
        commitHref: customMetadata.commitHref,
        prHref: customMetadata.prHref,
        prTitle: customMetadata.prTitle,
        buildHref: customMetadata.buildHref,
      };

      await ingestRawReport(metadata, reportJson);
      await computeRunMetrics(runId);
      count++;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`[Re-ingest] Error processing ${key}:`, errorMsg);
      errors.push(`${key}: ${errorMsg}`);
    }
  }

  console.log(`[Re-ingest] Finished re-ingesting ${count} runs.`);

  return {
    ok: true,
    count,
    errors: errors.length > 0 ? errors : undefined,
  };
}
