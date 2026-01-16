# Playwright Metrics

Flakiness is the product.

A flakiness-first test reporting system that aggregates Playwright reporter output and produces metrics for all test runs. Built to answer: "What is broken in our test suite?" rather than just "What failed on this run?"

Built by the [RedwoodJS team](https://rwsdk.com) — **Hire us!**

## Overview

This tool aggregates Playwright reporter output and produces metrics for all test runs. It's self-hostable and runs on Cloudflare Workers, with raw data stored in Cloudflare R2 (object storage) and metrics collected in Durable Objects (SQLite-backed).

## Core Philosophy

This is a **reliability system, not a test report viewer**. The primary goal is flake detection and prioritization, helping engineers immediately see:

- Which tests waste the most CI time
- Which tests fail unpredictably
- Which tests need fixing first

### Future

- Reporter for Playwright; so you don't need to manually add an action.
- Status bar updates; so developers see immediately which tests fail.
- MCP server for grabbing the flakiness;
- Downloading the full-report;
- Automated fixing via GitHub Bot.

### Primary KPI: Flaky Rate

The main metric is **flaky_rate**:

```
flaky_rate = flaky_runs / total_runs
```

Where a **flaky_run** = failed at least once AND passed on retry in the same run.

This metric measures:

- Nondeterminism
- Race conditions
- Timing sensitivity
- Infrastructure sensitivity
- Brittle selectors

A flaky test is worse than a failing test. Failing tests get fixed. Flaky tests rot.

### Ranking Principle

Default ordering everywhere:

1. Highest flaky_rate
2. Then highest flaky_runs
3. Then highest total_runs

This surfaces the most unstable tests with enough data to be meaningful.

## Architecture

- **Runtime**: Cloudflare Workers
- **Raw Data Storage**: Cloudflare R2 (object storage) — stores complete Playwright JSON reports
- **Metrics Storage**: Durable Objects (SQLite-backed) — stores normalized test data, runs, and computed metrics
- **Framework**: RedwoodSDK (React Server Components on Cloudflare)

### Data Flow

1. Playwright test runs upload JSON reports to `/upload/` endpoint
2. Raw JSON reports are stored in R2 at `runs/{repo}/{branch}/{commit}/{runId}.json`
3. Test data is normalized and stored in Durable Objects:
   - Test identities (id, title, file, line)
   - Test runs (metadata, timing, counts)
   - Test results (status, duration, retries, errors)
4. Metrics are computed and displayed in the dashboard

## Setup

### Prerequisites

- Node.js (v18+)
- pnpm
- Cloudflare account with Workers and R2 enabled

### Installation

```shell
pnpm install
```

### Development

```shell
pnpm dev
```

Point your browser to the URL displayed in the terminal (e.g. `http://localhost:5173/`).

### Deployment

```shell
pnpm release
```

This will:

1. Clean build artifacts
2. Build the application
3. Deploy to Cloudflare Workers

## Data Ingestion

The system accepts Playwright JSON reporter output via the `/upload/` endpoint.

### Upload Endpoint

**POST** `/upload/`

**Content-Type**: `multipart/form-data`

**Required Fields**:

- `file`: Playwright JSON report file
- `run-id`: Unique identifier for this test run
- `repo`: Repository name
- `branch`: Git branch name
- `commit`: Git commit hash

**Optional Fields**:

- `pr-user`: Pull request author
- `playwright-version`: Playwright version
- `workers`: Number of workers used
- `shard-current`: Current shard number
- `shard-total`: Total shards
- `start-time`: ISO timestamp of run start
- `duration-ms`: Total duration in milliseconds
- `expected-count`: Number of expected (passed) tests
- `skipped-count`: Number of skipped tests
- `flaky-count`: Number of flaky tests
- `unexpected-count`: Number of unexpected (failed) tests
- `commit-href`: URL to commit
- `pr-href`: URL to pull request
- `pr-title`: Pull request title
- `build-href`: URL to CI build

**Response**:

```json
{
  "ok": true,
  "r2_key": "runs/{repo}/{branch}/{commit}/{runId}.json"
}
```

## Dashboard Features

The dashboard provides:

**For each test**:

- Flaky rate
- Total flaky runs
- Total retries
- Mean runtime
- Last flaky occurrence
- Failure trend over last N runs

**For each PR**:

- New flaky tests introduced
- Existing flaky tests that regressed
- Tests that became stable again

### Flake Classification

- **Stable** → flaky_rate < 1%
- **Suspicious** → flaky_rate 1–5%
- **Flaky** → flaky_rate 5–20%
- **Critical** → flaky_rate > 20%

Only Flaky and Critical matter day-to-day.

## Why This Exists

Playwright HTML reports answer: "What failed on this run?"

This system answers: "What is broken in our test suite?"

This platform exists to:

- Surface nondeterminism
- Quantify instability
- Prioritize reliability work
- Reduce CI noise

**Flakiness is the product.**

## Further Reading

- [Product Brief](docs/product.md) — Detailed product philosophy and metrics
- [RedwoodSDK Documentation](https://docs.rwsdk.com/)
