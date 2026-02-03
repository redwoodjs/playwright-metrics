import { env } from "cloudflare:workers";

export type IngestionEventType = "upload" | "ingest_start" | "ingest_complete" | "error";

export type IngestionEvent = {
  runId: string;
  type: IngestionEventType;
  message: string;
  timestamp: string;
  details?: any;
};

export async function logIngestionTimeline(
  event: {
    runId: string | null;
    type: IngestionEventType;
    message: string;
    details?: any;
  }
) {
  if (!env.R2) {
    console.warn("[logIngestionTimeline] R2 is not bound");
    return;
  }

  const timestamp = new Date();
  const timestampISO = timestamp.toISOString();
  // Reverse timestamp for simplistic ordering if needed, or just ISO
  // For R2 listing, we want retrieval order.
  // If we want "Latest first", we actually want a key that scans in reverse?
  // R2 list doesn't strictly support reverse scan effectively for pagination without custom keys.
  // Standard Trick: `events/${9999999999999 - timestamp}/...`
  // But let's stick to standard ISO for readability and we'll just list/limit.
  // If we want "latest", we might need to list from the end? No R2 doesn't support that.
  // We'll use the "Reverse Timestamp" trick? `Year-Month-Day`?
  
  // Actually, let's use the provided requirement: "Aggregate them... say file came in... ingested".
  // A standard list might be fine if we just filter/sort in memory for the top 50, OR use the reverse-timestamp key.
  
  // Use reverse timestamp for efficient "Latest First" listing
  const runId = event.runId || "unknown";
  const reverseTimestamp = 9999999999999 - timestamp.getTime();
  const key = `ingestion-events/${reverseTimestamp}-${runId}-${event.type}.json`;
  
  const data: IngestionEvent = {
    runId,
    type: event.type,
    message: event.message,
    timestamp: timestampISO,
    details: event.details
  };

  try {
    await env.R2.put(key, JSON.stringify(data), {
      httpMetadata: { contentType: "application/json" },
      customMetadata: {
        runId,
        type: event.type
      }
    });
  } catch (e) {
    console.error(`[logIngestionTimeline] Failed to log: ${e}`);
  }
}
