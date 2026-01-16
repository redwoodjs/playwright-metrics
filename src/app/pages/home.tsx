import { getSuiteHealth, getSuiteTrends } from "./actions";

export const Home = async () => {
  const [trends, health30] = await Promise.all([
    getSuiteTrends(),
    getSuiteHealth(30),
  ]);
  const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
  const status =
    health30.health_score >= 0.98
      ? "excellent"
      : health30.health_score >= 0.95
        ? "acceptable"
        : health30.health_score >= 0.9
          ? "degraded"
          : "critical";
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Play Report</h1>
      <p>Flakiness-first CI observability for Playwright.</p>

      <div className="border border-black p-3 inline-block text-sm">
        <div><b>Overall flakiness (7 vs 30):</b> {pct(trends.rate_7)} <span>{trends.trend >= 0 ? "↑" : "↓"} ({pct(Math.abs(trends.trend))})</span></div>
        <div><b>Health score (30 runs):</b> {health30.health_score.toFixed(3)} ({status})</div>
        <div>Executions: {health30.total_executions}, flaky: {health30.flaky_executions}</div>
        <div className="mt-2">
          <a className="underline" href="/health">View health details →</a>
        </div>
      </div>

      <div className="space-y-2">
        <h2 className="text-xl font-bold">How this works</h2>
        <ul className="list-disc pl-6 text-sm">
          <li>Primary KPI is Flaky Rate: failed then passed in the same run.</li>
          <li>Ranking: highest flaky_rate, then flaky_runs, then total_runs.</li>
          <li>Executions come from <code>attempts</code>; trends use the last N runs.</li>
        </ul>
        <div className="text-sm">
          Explore: <a className="underline" href="/specs">Flakiest specs</a> · <a className="underline" href="/runs">Recent runs</a>
        </div>
      </div>
    </div>
  );
};
