# Playwright Metrics

Flakiness is the product.

A flakiness-first test reporting system that aggregates Playwright reporter output and produces metrics for all test runs. Built to answer: "What is broken in our test suite?" rather than just "What failed on this run?"

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/redwoodjs/playwright-metrics)

## Overview

This tool aggregates Playwright reporter output to identify and prioritize flaky tests. It runs on Cloudflare Workers, storing raw data in R2 and metrics in Durable Objects (SQLite).

## Installation

The easiest way to get started is by deploying to Cloudflare:

1. Click the **Deploy to Cloudflare Workers** button above.
2. Follow the prompts to connect your GitHub account and deploy.
3. Once deployed, you'll have a URL for your metrics dashboard (e.g., `https://playwright-metrics.your-subdomain.workers.dev`).

## Uploading Reports

To track metrics, you need to upload Playwright JSON reports to your server.

### 1. Requirements

- **Reporter**: Use the built-in [JSON reporter](https://playwright.dev/docs/test-reporters#json-reporter) in your Playwright project.
  ```typescript
  // playwright.config.ts
  export default defineConfig({
    reporter: [['json', { outputFile: 'playwright-report/report.json' }]],
  });
  ```
- **Upload Script**: A script to POST the JSON report to the `/upload/` endpoint.

### 2. Integration

We provide a specialized upload script in [upload-playwright-report.tsx](scripts/upload-playwright-report.tsx.example).

To use it in your project, check the example script for usage instructions and required environment variables.

## Simple JSON API

For scripts or AI clients that just need JSON, the Worker exposes a small authenticated API under `/api`.

Set a shared token as a Worker secret:

```bash
wrangler secret put API_AUTH_TOKEN
```

Then call it with one of these headers:

```bash
curl -H "Authorization: Bearer $API_AUTH_TOKEN" https://your-worker.example.com/api/metrics
curl -H "x-api-key: $API_AUTH_TOKEN" https://your-worker.example.com/api/leaderboard?limit=20
```

Useful endpoints:

- `GET /api/metrics?branch=&limit=20` — compact summary for humans/AI clients
- `GET /api/leaderboard?branch=&limit=50&sortBy=rate|runs|waste`
- `GET /api/runs?repo=&branch=&limit=50&offset=0`
- `GET /api/runs/:commitHash?include=tests`
- `GET /api/suite/health?windowRuns=30`
- `GET /api/suite/trends`
- `GET /api/regressions?currentWindow=10&previousWindow=10&minimumSampleSize=5`
- `GET /api/test-trend?testId=<id>&lookbackRuns=30`

## Security via Zero Trust

We recommend protecting your metrics dashboard using [Cloudflare Zero Trust](https://www.cloudflare.com/products/zero-trust/).

1. Enable **Cloudflare Access** for your Worker's domain.
2. Create an **Access Application** for your dashboard URL.
3. Define **Policies** to restrict access (e.g., only allow users from your organization).

Wait, what about the `/upload/` endpoint? It needs to be bypassable by your CI/CD pipeline. You can do this by creating an **Access Service Token** for your CI runner and adding a policy to allow it.

## Philosophy

### Primary KPI: Flaky Rate
`flaky_rate = flaky_runs / total_runs`
A **flaky_run** failed at least once but passed on retry in the same run.

### Ranking Principle
1. Highest **flaky_rate**
2. Highest **flaky_runs**
3. Highest **total_runs**

This surfaces the most unstable tests first.

## Further Reading
- [Product Brief](docs/product.md)
- [RedwoodSDK Documentation](https://docs.rwsdk.com/)
