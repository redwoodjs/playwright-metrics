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

  const prefix = runId ? `logs/${runId}/` : "logs/";

  try {
    const list = await env.R2.list({
      prefix,
      limit,
      cursor,
      include: ["customMetadata"],
    } as any);

    const logs: LogEntry[] = [];

    for (const obj of list.objects) {
      // We can try to use customMetadata if available, otherwise we might need to fetch the body
      // fetching body for all is expensive, so let's rely on metadata or filename
      const customMetadata = (obj as any).customMetadata || {};
      
      // If we don't have metadata, we can't show much without fetching content.
      // But let's verify if we need content.
      // For now, let's assume valid logs have metadata or we fetch just the top few? 
      // Actually, R2 list doesn't return body.
      // Let's rely on customMetadata for the list view if possible, 
      // but `logIngestionEvent` writes runId and level to customMetadata.
      // It does NOT write message.
      
      // Strategy: 
      // 1. List objects. 
      // 2. Fetch content for them in parallel (up to a limit).
      
      logs.push({
        key: obj.key,
        runId: customMetadata.runId || "unknown",
        level: customMetadata.level || "info",
        message: "Loading...", // Placeholder, will need to fetch content or change architecture to store message in metadata (size limit?)
        timestamp: obj.uploaded.toISOString(),
      });
    }

    // Sort by timestamp desc (R2 list is lexicographical by key)
    // Keys are runId/timestamp... so if runId is provided, they are sorted by timestamp.
    // If runId is NOT provided, they are grouped by runId then timestamp.
    // We might want to sort by uploaded time?
    logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Fetch content for the logs to get the message
    // Careful with performance here.
    const hydratedLogs = await Promise.all(
      logs.map(async (log) => {
        try {
          const obj = await env.R2.get(log.key);
          if (obj) {
            const data = await obj.json() as any;
            return {
              ...log,
              message: data.message,
              context: data.context,
              timestamp: data.timestamp || log.timestamp
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
