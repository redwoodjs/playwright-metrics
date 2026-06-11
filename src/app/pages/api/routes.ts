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
import { db, sql } from "@/db";

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

type ApiLeaderboardRow = {
  test_id: string;
  title: string | null;
  file: string | null;
  flaky_rate: number;
  flaky_runs: number;
  total_runs: number;
  waste_time_ms: number;
  recent_results: ("pass" | "flaky" | "fail" | "skip")[];
};

type TestFailureRow = {
  test_id: string;
  run_id: string;
  project_id: string | null;
  retry: number | null;
  status: string | null;
  duration_ms: number | null;
  start_time: string | null;
  error_msg: string | null;
  repo: string;
  branch: string;
  commit_hash: string;
  commit_href: string;
  pr_href: string;
  pr_title: string;
  build_href: string;
  pr_user: string;
  title: string | null;
  file: string | null;
  line: number | null;
};

type RawFailureDetails = {
  message?: string | null;
  stack?: string | null;
  value?: string | null;
  location?: unknown;
  snippet?: string | null;
  stdout?: unknown[];
  stderr?: unknown[];
} | null;

async function getApiLeaderboardData(
  limit: number,
  sortBy: "rate" | "runs" | "waste",
  branch?: string,
): Promise<ApiLeaderboardRow[]> {
  const branchFilter = branch ? sql`WHERE m.branch = ${branch}` : sql``;
  const orderBy =
    sortBy === "waste"
      ? sql`waste_time_ms DESC, flaky_rate DESC, flaky_runs DESC`
      : sortBy === "runs"
        ? sql`flaky_runs DESC, flaky_rate DESC, total_runs DESC`
        : sql`flaky_rate DESC, flaky_runs DESC, total_runs DESC`;

  const result = await sql`
    SELECT
      test_id,
      title,
      file,
      total_runs,
      flaky_runs,
      flaky_rate,
      waste_time_ms
    FROM (
      SELECT
        m.test_id AS test_id,
        t.title AS title,
        t.file AS file,
        SUM(m.total_runs) AS total_runs,
        SUM(m.flaky_runs) AS flaky_runs,
        SUM(m.runs_with_failure) AS runs_with_failure,
        SUM(COALESCE(m.retry_duration_total_ms, 0)) AS waste_time_ms,
        CAST(SUM(m.flaky_runs) AS REAL) / SUM(m.total_runs) AS flaky_rate
      FROM test_metrics AS m
      INNER JOIN specs AS t ON t.id = m.test_id
      ${branchFilter}
      GROUP BY m.test_id, t.title, t.file
    )
    WHERE flaky_runs > 0 AND runs_with_failure < total_runs
    ORDER BY ${orderBy}
    LIMIT ${limit}
  `.execute(db);

  return result.rows.map((row: any) => ({
    test_id: String(row.test_id),
    title: row.title ?? null,
    file: row.file ?? null,
    flaky_rate: Number(row.flaky_rate ?? 0),
    flaky_runs: Number(row.flaky_runs ?? 0),
    total_runs: Number(row.total_runs ?? 0),
    waste_time_ms: Number(row.waste_time_ms ?? 0),
    recent_results: [],
  }));
}

async function getTestFailures(testId: string, limit: number) {
  const result = await sql`
    SELECT
      a.test_id,
      a.run_id,
      a.project_id,
      a.retry,
      a.status,
      a.duration_ms,
      a.start_time,
      a.error_msg,
      r.repo,
      r.branch,
      r.commit_hash,
      r.commit_href,
      r.pr_href,
      r.pr_title,
      r.build_href,
      r.pr_user,
      s.title,
      s.file,
      s.line
    FROM attempts AS a
    INNER JOIN runs AS r ON r.id = a.run_id
    INNER JOIN specs AS s ON s.id = a.test_id
    WHERE a.test_id = ${testId}
      AND a.status IN ('failed', 'timedOut', 'interrupted')
    ORDER BY COALESCE(a.start_time, r.start_time) DESC
    LIMIT ${limit}
  `.execute(db);

  const rows = result.rows as any[] as TestFailureRow[];
  const enriched = await Promise.all(rows.map(enrichFailureWithRawReport));
  return enriched;
}

async function enrichFailureWithRawReport(row: TestFailureRow) {
  const r2ObjectKey = `runs/${row.repo}/${row.branch}/${row.commit_hash}/${row.run_id}.json`;
  let raw: RawFailureDetails = null;

  try {
    const obj = await env.R2.get(r2ObjectKey);
    if (obj) {
      raw = findRawFailureDetails(
        await obj.json<any>(),
        row.run_id,
        row.test_id,
        row.project_id,
        row.retry,
      );
    }
  } catch (error: any) {
    raw = { message: `Could not load raw report details: ${error.message}` };
  }

  return {
    run_id: row.run_id,
    project_id: row.project_id,
    retry: row.retry == null ? null : Number(row.retry),
    status: row.status,
    duration_ms: row.duration_ms == null ? null : Number(row.duration_ms),
    start_time: row.start_time,
    error: {
      message: raw?.message ?? row.error_msg,
      stack: raw?.stack ?? null,
      value: raw?.value ?? null,
      location: raw?.location ?? null,
      snippet: raw?.snippet ?? extractSnippet(raw?.stack ?? row.error_msg),
      db_message: row.error_msg,
    },
    raw_report: {
      r2ObjectKey,
      found: raw !== null,
    },
    run: {
      repo: row.repo,
      branch: row.branch,
      commit_hash: row.commit_hash,
      commit_href: row.commit_href,
      pr_href: row.pr_href,
      pr_title: row.pr_title,
      build_href: row.build_href,
      pr_user: row.pr_user,
    },
    test: {
      title: row.title,
      file: row.file,
      line: row.line == null ? null : Number(row.line),
    },
  };
}

function findRawFailureDetails(
  reportJson: any,
  runId: string,
  testId: string,
  projectId: string | null,
  retry: number | null,
): RawFailureDetails {
  const targetRetry = retry == null ? null : Number(retry);

  const visitSuite = (suite: any): RawFailureDetails => {
    for (const spec of suite.specs ?? []) {
      if (spec.id !== testId) continue;
      for (const test of spec.tests ?? []) {
        if ((test.projectName ?? "") !== (projectId ?? "")) continue;

        for (const result of test.results ?? []) {
          if (targetRetry !== null && Number(result.retry ?? 0) !== targetRetry) {
            continue;
          }
          if (!["failed", "timedOut", "interrupted"].includes(result.status)) {
            continue;
          }

          const error = result.error ?? result.errors?.[0] ?? null;
          return {
            message: error?.message ?? undefined,
            stack: error?.stack ?? undefined,
            value: error?.value ?? undefined,
            location: error?.location ?? result.location ?? null,
            snippet: extractSnippet(error?.stack ?? error?.message ?? null),
            stdout: result.stdout ?? [],
            stderr: result.stderr ?? [],
          };
        }
      }
    }

    for (const child of suite.suites ?? []) {
      const found = visitSuite(child);
      if (found) return found;
    }

    return null;
  };

  for (const suite of reportJson.suites ?? []) {
    const found = visitSuite(suite);
    if (found) return found;
  }

  return { message: `No raw failure details found in report for ${runId}` };
}

function extractSnippet(text?: string | null): string | null {
  if (!text) return null;
  const lines = text.split("\n");
  const firstCodeLine = lines.findIndex((line) => /^\s*>?\s*\d+\s*\|/.test(line));
  if (firstCodeLine === -1) return null;
  return lines.slice(Math.max(0, firstCodeLine - 2), firstCodeLine + 6).join("\n");
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
      "GET /api/tests/:testId/failures?limit=50",
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
      leaderboard: await getApiLeaderboardData(limit, sortByParam(url), branch),
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

  if (parts[0] === "tests" && parts[1] && parts[2] === "failures") {
    const limit = intParam(url, "limit", 50, { max: 100 });
    const failures = await getTestFailures(parts[1], limit);
    return json({
      testId: parts[1],
      count: failures.length,
      failures,
    });
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
