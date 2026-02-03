"use server";
import { env } from "cloudflare:workers";

export type LogEntry = {
  key: string;
  runId: string;
  level: "info" | "warn" | "error";
  message: string;
  timestamp: string;
  context?: any;
};

export async function listLogs(runId?: string, limit = 50, cursor?: string) {
  if (!env.R2) {
    return { logs: [], cursor: undefined };
  }

  // If runId is provided, show detailed logs for that run.
  // If not, show the global ingestion timeline.
  const prefix = runId ? `logs/${runId}/` : "ingestion-events/";

  try {
    const list = await env.R2.list({
      prefix,
      limit,
      cursor,
      include: ["customMetadata"],
    } as any);

    const logs: LogEntry[] = [];

    for (const obj of list.objects) {
      const customMetadata = (obj as any).customMetadata || {};
      
      logs.push({
        key: obj.key,
        runId: customMetadata.runId || "unknown",
        level: (customMetadata.level || customMetadata.type || "info") as any,
        message: "Loading...",
        timestamp: obj.uploaded.toISOString(),
      });
    }

    // Sort:
    // If global timeline (ingestion-events/reverse-timestamp), R2 order is already "Correct" (reverse).
    // If detailed logs (logs/runId/timestamp), R2 order is chronological (oldest first).
    
    // We want newest first in UI.
    // ingestion-events list is ALREADY Newest First.
    // detailed logs list is Oldest First.

    if (runId) {
       // Detailed logs: Reverse them to show newest first
       logs.reverse();
    } else {
       // Timeline: Already newest first
    }

    const hydratedLogs = await Promise.all(
      logs.map(async (log) => {
        try {
          const obj = await env.R2.get(log.key);
          if (obj) {
            const data = await obj.json() as any;
            return {
              ...log,
              message: data.message,
              context: data.context || data.details,
              timestamp: data.timestamp || log.timestamp,
              level: data.level || data.type || log.level
            };
          }
        } catch (e) {
          // ignore error
        }
        return log;
      })
    );

    return {
      logs: hydratedLogs,
      cursor: list.truncated ? list.cursor : undefined,
    };
  } catch (error) {
    console.error("Error listing logs:", error);
    return { logs: [], cursor: undefined };
  }
}
