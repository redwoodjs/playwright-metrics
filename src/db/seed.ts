import { getDb, sql } from "@/db";
import { computeRunMetrics } from "./ingestion";

export async function seedDatabase(env: Env) {
  const db = getDb(env);
  // Clear existing data (optional, but good for predictable seeds)
  await sql`DELETE FROM attempts`.execute(db);
  await sql`DELETE FROM results`.execute(db);
  await sql`DELETE FROM specs`.execute(db);
  await sql`DELETE FROM runs`.execute(db);
  await sql`DELETE FROM test_metrics`.execute(db);

  const branches = ["main", "develop", "feature/auth", "fix/api"];
  const projects = ["Chromium", "Firefox", "WebKit"];
  
  // 1. Create specs
  const specList = [];
  for (let i = 1; i <= 20; i++) {
    const spec = {
      id: `spec-${i}`,
      title: `Test Case ${i}`,
      file: `tests/feature-${Math.ceil(i/5)}.spec.ts`,
      line: i * 10,
    };
    specList.push(spec);
    await db.insertInto("specs").values(spec).onConflict(oc => oc.column("id").doNothing()).execute();
  }

  // 2. Create runs
  for (let r = 1; r <= 10; r++) {
    const runId = `run-${r}`;
    const branch = branches[r % branches.length];
    const startTime = new Date(Date.now() - r * 24 * 60 * 60 * 1000).toISOString();
    
    await db.insertInto("runs").values({
      id: runId,
      pr_user: "tester",
      repo: "redwoodjs/play-report",
      branch,
      commit_hash: `abc${r}`,
      commit_href: "https://github.com",
      pr_href: "https://github.com",
      pr_title: `PR for run ${r}`,
      build_href: "https://github.com",
      playwright_version: "1.49.0",
      workers: 4,
      shard_current: 1,
      shard_total: 1,
      start_time: startTime,
      duration_ms: 120000,
      expected_count: 0,
      skipped_count: 0,
      flaky_count: 0,
      unexpected_count: 0,
    }).execute();

    // 3. Create results and attempts for each spec in this run
    for (const spec of specList) {
      for (const projectName of projects) {
        const resultId = `${runId}-${spec.id}-${projectName}`;
        
        // Determine status: 
        // 70% success, 20% flaky (1 fail then pass), 10% fail
        const rand = Math.random();
        let status: "passed" | "failed" | "flaky" = "passed";
        let attemptsCount = 1;

        if (rand > 0.9) {
          status = "failed";
          attemptsCount = 2; // Failed twice
        } else if (rand > 0.7) {
          status = "flaky"; // Passed on retry
          attemptsCount = 2;
        }

        await db.insertInto("results").values({
          id: resultId,
          run_id: runId,
          test_id: spec.id,
          project_id: projectName.toLowerCase(),
          project_name: projectName,
          status: status === "flaky" ? "passed" : status,
          expected: status !== "failed",
          attempts: attemptsCount,
          final_status: status === "flaky" ? "passed" : status,
          branch,
          start_time: startTime,
        } as any).execute();

        for (let a = 0; a < attemptsCount; a++) {
          const attemptStatus = (status === "flaky" && a === 0) ? "failed" : (status === "failed" ? "failed" : "passed");
          await db.insertInto("attempts").values({
            id: `${resultId}-a${a}`,
            run_id: runId,
            test_id: spec.id,
            project_id: projectName.toLowerCase(),
            worker_index: 0,
            retry: a,
            status: attemptStatus,
            duration_ms: 5000,
            start_time: startTime,
          } as any).execute();
        }
      }
    }

    // 4. Compute metrics for this run
    await computeRunMetrics(env, runId);
  }

  console.log("Seeding complete!");
}
