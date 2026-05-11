import { linkFor } from "rwsdk/router";
import type { app } from "@/worker";

export const link = linkFor<typeof app>();
