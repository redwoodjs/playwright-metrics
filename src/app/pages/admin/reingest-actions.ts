"use server";
import { env } from "cloudflare:workers";
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
  objects: R2ObjectInfo[];
};

export async function listR2Objects(): Promise<BranchGroup[]> {
  const objects: R2ObjectInfo[] = [];
  let cursor: string | undefined;

  try {
    // List all objects from R2
    while (true) {
      const list = await env.R2.list({
        prefix: "runs/",
        cursor,
        include: ["customMetadata" as any],
      } as any);

      for (const obj of list.objects) {
        // Parse key: runs/${repo}/${branch}/${commit}/${runId}.json
        // Note: repo can contain slashes (e.g. goprzm/przm)
        const parts = obj.key.split("/");

        if (parts[0] !== "runs" || parts.length < 5) {
          continue;
        }

        const filename = parts[parts.length - 1];
        const runId = filename.replace(".json", "");
        const commit = parts[parts.length - 2];
        const branch = parts[parts.length - 3];
        // Everything between "runs" and branch is the repo
        const repo = parts.slice(1, parts.length - 3).join("/");

        // Metadata is now included in the list result
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

  // Group by Repo and Branch
  const branchMap = new Map<string, BranchGroup>();

  for (const obj of objects) {
    const branchKey = `${obj.repo}/${obj.branch}`;
    const group = branchMap.get(branchKey) || {
      repo: obj.repo,
      branch: obj.branch,
      objects: [],
    };

    group.objects.push(obj);
    branchMap.set(branchKey, group);
  }

  // Convert to array and sort by repo/branch
  const groups = Array.from(branchMap.values()).sort((a, b) => {
    const aKey = `${a.repo}/${a.branch}`;
    const bKey = `${b.repo}/${b.branch}`;
    return aKey.localeCompare(bKey);
  });

  return groups;
}

export async function reingestKeys(_prevState: any, formData: FormData) {
  const keys = formData.getAll("keys") as string[];

  if (keys.length === 0) {
    return { ok: false, error: "No files selected" };
  }

  console.log(`[Re-ingest] Starting re-ingestion of ${keys.length} files...`);

  let count = 0;
  const errors: string[] = [];

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
