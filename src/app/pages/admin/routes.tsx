import { route, prefix } from "rwsdk/router";
import { Reingest } from "./reingest";
"use server";
import { env } from "cloudflare:workers";
import {
  ingestRawReport,
  computeRunMetrics,
  type IngestionMetadata,
} from "@/db/ingestion";

export const adminPageRoutes = prefix("/admin", [route("/reingest", Reingest)]);

export const adminApiRoutes = [];
