import { db } from "@/db";

export default async () => {
  console.log("… Seeding play-report data");

  // Clear existing data (children first)
  await db.deleteFrom("test_result").execute();
  await db.deleteFrom("test_run_test").execute();
  await db.deleteFrom("test").execute();
  await db.deleteFrom("test_run").execute();

  // Seed one run
  const runId = crypto.randomUUID();
  const startIso = new Date().toISOString();

  await db
    .insertInto("test_run")
    .values({
      id: runId,
      pr_user: "octocat",
      repo: "acme/widgets",
      branch: "main",
      commit_hash: "abc123def",
      commit_href: "https://github.com/acme/widgets/commit/abc123def",
      pr_href: "https://github.com/acme/widgets/pull/42",
      pr_title: "Improve widget behavior",
      build_href: "https://ci.example.com/builds/98765",
      playwright_version: "1.45.0",
      workers: 4,
      shard_current: 1,
      shard_total: 1,
      start_time: startIso,
      duration_ms: 12345,
      expected_count: 8,
      skipped_count: 1,
      flaky_count: 1,
      unexpected_count: 2,
    })
    .execute();

  // Seed tests
  const testA = crypto.randomUUID();
  const testB = crypto.randomUUID();

  await db
    .insertInto("test")
    .values([
      { id: testA, title: "should add items to cart", file: "cart.spec.ts", line: 12 },
      { id: testB, title: "should handle checkout errors", file: "checkout.spec.ts", line: 34 },
    ])
    .execute();

  // Link tests to run
  const trtA = crypto.randomUUID();
  const trtB = crypto.randomUUID();
  await db
    .insertInto("test_run_test")
    .values([
      {
        id: trtA,
        run_id: runId,
        test_id: testA,
        project_id: "chromium",
        project_name: "Chromium",
        status: "expected",
        expected: true,
        attempts: 1,
        final_status: "passed",
      },
      {
        id: trtB,
        run_id: runId,
        test_id: testB,
        project_id: "chromium",
        project_name: "Chromium",
        status: "flaky",
        expected: false,
        attempts: 2,
        final_status: "passed",
      },
    ])
    .execute();

  // Attempt results
  await db
    .insertInto("test_result")
    .values([
      {
        id: crypto.randomUUID(),
        run_id: runId,
        test_id: testA,
        project_id: "chromium",
        worker_index: 1,
        retry: 0,
        status: "passed",
        duration_ms: 523,
        start_time: startIso,
        error_msg: null,
      },
      // Flaky test: fail then pass
      {
        id: crypto.randomUUID(),
        run_id: runId,
        test_id: testB,
        project_id: "chromium",
        worker_index: 2,
        retry: 0,
        status: "failed",
        duration_ms: 800,
        start_time: startIso,
        error_msg: "NetworkError: 500 from /checkout",
      },
      {
        id: crypto.randomUUID(),
        run_id: runId,
        test_id: testB,
        project_id: "chromium",
        worker_index: 2,
        retry: 1,
        status: "passed",
        duration_ms: 610,
        start_time: startIso,
        error_msg: null,
      },
    ])
    .execute();

  console.log("✔ Finished seeding play-report 🌱");
};