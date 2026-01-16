import { getSuiteHealth, getSuiteTrends, listFlakiestTests, listRegressions } from "./actions";

export const Health = async () => {
  const [trends, health30, flakiest, regressions] = await Promise.all([
    getSuiteTrends(),
    getSuiteHealth(30),
    listFlakiestTests(10),
    listRegressions(10, 10, 5),
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
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Spec suite health</h1>

      <div className="space-y-1">
        <div>
          <b>Overall flakiness (7 vs 30):</b> {pct(trends.rate_7)}{" "}
          <span>{trends.trend >= 0 ? "↑" : "↓"} ({pct(Math.abs(trends.trend))})</span>
        </div>
        <div>
          <b>Health score (30 runs):</b> {health30.health_score.toFixed(3)} ({status})
        </div>
        <div className="text-sm">
          Executions in window: {health30.total_executions}, flaky executions: {health30.flaky_executions}
        </div>
      </div>

      <div className="space-y-2">
        <h2 className="text-xl font-bold">Top contributors</h2>
        <div className="overflow-x-auto">
          <table className="w-full table-auto border-collapse border border-black text-sm">
            <thead>
              <tr>
                <th className="border border-black p-2 text-left">Spec</th>
                <th className="border border-black p-2 text-left">File</th>
                <th className="border border-black p-2 text-right">Flaky Rate</th>
                <th className="border border-black p-2 text-right">Flaky Runs</th>
                <th className="border border-black p-2 text-right">Total Runs</th>
                <th className="border border-black p-2 text-right">Retries</th>
              </tr>
            </thead>
            <tbody>
              {flakiest.map((r) => (
                <tr key={r.test_id}>
                  <td className="border border-black p-2 align-top">{r.title}</td>
                  <td className="border border-black p-2 align-top break-all">{r.file}</td>
                  <td className="border border-black p-2 text-right align-top">{(r.flaky_rate * 100).toFixed(0)}%</td>
                  <td className="border border-black p-2 text-right align-top">{r.flaky_runs}</td>
                  <td className="border border-black p-2 text-right align-top">{r.total_runs}</td>
                  <td className="border border-black p-2 text-right align-top">{r.retry_count_total ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {regressions.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-xl font-bold">Regressions</h2>
          <div className="overflow-x-auto">
            <table className="w-full table-auto border-collapse border border-black text-sm">
              <thead>
                <tr>
                  <th className="border border-black p-2 text-left">Spec</th>
                  <th className="border border-black p-2 text-left">File</th>
                  <th className="border border-black p-2 text-right">Current Flaky</th>
                  <th className="border border-black p-2 text-right">Previous Flaky</th>
                  <th className="border border-black p-2 text-right">Factor</th>
                  <th className="border border-black p-2 text-right">Runs (current)</th>
                </tr>
              </thead>
              <tbody>
                {regressions.map((r) => (
                  <tr key={r.test_id}>
                    <td className="border border-black p-2 align-top">{r.title}</td>
                    <td className="border border-black p-2 align-top break-all">
                      {r.file}:{r.line}
                    </td>
                    <td className="border border-black p-2 text-right align-top">{(r.current_rate * 100).toFixed(0)}%</td>
                    <td className="border border-black p-2 text-right align-top">{(r.previous_rate * 100).toFixed(0)}%</td>
                    <td className="border border-black p-2 text-right align-top">{r.factor === Infinity ? "∞" : r.factor.toFixed(2)}</td>
                    <td className="border border-black p-2 text-right align-top">{r.total_runs}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

