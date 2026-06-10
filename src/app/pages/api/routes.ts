import { route } from "rwsdk/router";
import { env } from "cloudflare:workers";

import {
  getRun,
  getSuiteHealth,
  getSuiteTrends,
  getTestTrend,
  listRegressions,
  listRunFlakies,
  listRunNewFlakies,
  listRunTests,
  listRuns,
} from "@/app/pages/actions";
import { getLeaderboardData } from "@/app/pages/leaderboard/actions";
import { getAdminStats } from "@/app/pages/admin/stats-actions";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-api-key, content-type",
};

const json = (data: unknown, init: ResponseInit = {}) =>
  Response.json(data, {
    ...init,
    headers: {
      ...CORS_HEADERS,
      ...init.headers,
    },
  });

const getToken = () =>
  (env as Env & { API_AUTH_TOKEN?: string }).API_AUTH_TOKEN?.trim();

function unauthorized(message = "Unauthorized") {
  return json(
    { error: message },
    {
      status: 401,
      headers: {
        "WWW-Authenticate": 'Basic realm="playwright-metrics-api"',
      },
    },
  );
}

function isAuthorized(request: Request): boolean {
  const expectedToken = getToken();
  if (!expectedToken) return false;

  const apiKey = request.headers.get("x-api-key");
  if (apiKey === expectedToken) return true;

  const authorization = request.headers.get("authorization") ?? "";
  if (authorization === `Bearer ${expectedToken}`) return true;

  if (authorization.startsWith("Basic ")) {
    try {
      const decoded = atob(authorization.slice("Basic ".length));
      const password = decoded.includes(":")
        ? decoded.slice(decoded.indexOf(":") + 1)
        : decoded;
      return password === expectedToken;
    } catch {
      return false;
    }
  }

  return false;
}

function requireAuth(request: Request): Response | undefined {
  if (!getToken()) {
    return json(
      {
        error:
          "API_AUTH_TOKEN is not configured. Set it as a Worker secret before using /api.",
      },
      { status: 503 },
    );
  }

  if (!isAuthorized(request)) return unauthorized();
  return undefined;
}

function intParam(
  url: URL,
  name: string,
  fallback: number,
  { min = 1, max = Number.MAX_SAFE_INTEGER } = {},
) {
  const value = Number(url.searchParams.get(name) ?? fallback);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

function sortByParam(url: URL): "rate" | "runs" | "waste" {
  const sortBy = url.searchParams.get("sortBy");
  return sortBy === "runs" || sortBy === "waste" ? sortBy : "rate";
}

function apiIndex() {
  return json({
    name: "playwright-metrics-api",
    auth: "Send Authorization: Bearer <token>, Basic auth with the token as password, or x-api-key: <token>.",
    endpoints: [
      "GET /api/metrics?branch=&limit=20",
      "GET /api/leaderboard?branch=&limit=50&sortBy=rate|runs|waste",
      "GET /api/runs?repo=&branch=&limit=50&offset=0",
      "GET /api/runs/:commitHash?include=tests",
      "GET /api/suite/health?windowRuns=30",
      "GET /api/suite/trends",
      "GET /api/regressions?currentWindow=10&previousWindow=10&minimumSampleSize=5",
      "GET /api/test-trend?testId=<id>&lookbackRuns=30",
      "GET /api/admin/stats",
    ],
  });
}

async function apiHandler({ request }: { request: Request }) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (request.method !== "GET") return json({ error: "Method not allowed" }, { status: 405 });

  const authResponse = requireAuth(request);
  if (authResponse) return authResponse;

  const url = new URL(request.url);
  const parts = url.pathname
    .replace(/^\/api\/?/, "")
    .split("/")
    .filter(Boolean)
    .map(decodeURIComponent);

  if (parts.length === 0) return apiIndex();

  if (parts[0] === "metrics") {
    const limit = intParam(url, "limit", 20, { max: 100 });
    const branch = url.searchParams.get("branch") ?? undefined;
    const [stats, health, trends, leaderboard, regressions, runs] =
      await Promise.all([
        getAdminStats(),
        getSuiteHealth(30),
        getSuiteTrends(),
        getLeaderboardData(limit, "rate", branch),
        listRegressions(10, 10, 5),
        listRuns({ branch, limit, offset: 0 }),
      ]);

    return json({
      generatedAt: new Date().toISOString(),
      branch: branch ?? null,
      stats,
      suite: { health, trends },
      leaderboard,
      regressions,
      recentRuns: runs.runs,
      totalRuns: runs.totalCount,
    });
  }

  if (parts[0] === "leaderboard") {
    const limit = intParam(url, "limit", 50, { max: 200 });
    const branch = url.searchParams.get("branch") ?? undefined;
    return json({
      leaderboard: await getLeaderboardData(limit, sortByParam(url), branch),
    });
  }

  if (parts[0] === "runs") {
    if (parts[1]) {
      const include = new Set(
        (url.searchParams.get("include") ?? "")
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
      );
      const commitHash = parts[1];
      const [run, flakyTests, newFlakyTests, tests] = await Promise.all([
        getRun(commitHash),
        listRunFlakies(commitHash),
        listRunNewFlakies(commitHash),
        include.has("tests") ? listRunTests(commitHash) : Promise.resolve(undefined),
      ]);

      if (!run) return json({ error: "Run not found" }, { status: 404 });
      return json({ run, flakyTests, newFlakyTests, tests });
    }

    const repo = url.searchParams.get("repo") ?? undefined;
    const branch = url.searchParams.get("branch") ?? undefined;
    const limit = intParam(url, "limit", 50, { max: 200 });
    const offset = intParam(url, "offset", 0, { min: 0 });
    const result = await listRuns({ repo, branch, limit, offset });
    return json(result);
  }

  if (parts[0] === "suite" && parts[1] === "health") {
    const windowRuns = intParam(url, "windowRuns", 30, { max: 500 });
    return json({ health: await getSuiteHealth(windowRuns) });
  }

  if (parts[0] === "suite" && parts[1] === "trends") {
    return json({ trends: await getSuiteTrends() });
  }

  if (parts[0] === "regressions") {
    return json({
      regressions: await listRegressions(
        intParam(url, "currentWindow", 10, { max: 500 }),
        intParam(url, "previousWindow", 10, { max: 500 }),
        intParam(url, "minimumSampleSize", 5, { max: 500 }),
      ),
    });
  }

  if (parts[0] === "test-trend") {
    const testId = url.searchParams.get("testId");
    if (!testId) return json({ error: "Missing testId query parameter" }, { status: 400 });
    return json({
      testId,
      trend: await getTestTrend(
        testId,
        intParam(url, "lookbackRuns", 30, { max: 500 }),
      ),
    });
  }

  if (parts[0] === "admin" && parts[1] === "stats") {
    return json(await getAdminStats());
  }

  return json({ error: "Not found" }, { status: 404 });
}

export const apiRoutes = [route("/", apiHandler), route("/*", apiHandler)];
