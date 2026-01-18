import { getSuiteHealth, getSuiteTrends, listFlakiestTests, listRegressions } from "./actions";
import { Table, TableBody, TableCell, TableContainer, TableHeadCell, TableHeader, TableRow } from "../components/table";

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
        <TableContainer>
          <Table>
            <TableHeader>
              <TableHeadCell>Spec</TableHeadCell>
              <TableHeadCell>File</TableHeadCell>
              <TableHeadCell className="text-right">Flaky Rate</TableHeadCell>
              <TableHeadCell className="text-right">Flaky Runs</TableHeadCell>
              <TableHeadCell className="text-right">Total Runs</TableHeadCell>
              <TableHeadCell className="text-right">Retries</TableHeadCell>
            </TableHeader>
            <TableBody>
              {flakiest.map((r) => (
                <TableRow key={r.test_id}>
                  <TableCell>{r.title}</TableCell>
                  <TableCell className="break-all">{r.file}</TableCell>
                  <TableCell className="text-right">{(r.flaky_rate * 100).toFixed(0)}%</TableCell>
                  <TableCell className="text-right">{r.flaky_runs}</TableCell>
                  <TableCell className="text-right">{r.total_runs}</TableCell>
                  <TableCell className="text-right">{r.retry_count_total ?? 0}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </div>

      {regressions.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-xl font-bold">Regressions</h2>
          <TableContainer>
            <Table>
              <TableHeader>
                <TableHeadCell>Spec</TableHeadCell>
                <TableHeadCell>File</TableHeadCell>
                <TableHeadCell className="text-right">Current Flaky</TableHeadCell>
                <TableHeadCell className="text-right">Previous Flaky</TableHeadCell>
                <TableHeadCell className="text-right">Factor</TableHeadCell>
                <TableHeadCell className="text-right">Runs (current)</TableHeadCell>
              </TableHeader>
              <TableBody>
                {regressions.map((r) => (
                  <TableRow key={r.test_id}>
                    <TableCell>{r.title}</TableCell>
                    <TableCell className="break-all">
                      {r.file}:{r.line}
                    </TableCell>
                    <TableCell className="text-right">{(r.current_rate * 100).toFixed(0)}%</TableCell>
                    <TableCell className="text-right">{(r.previous_rate * 100).toFixed(0)}%</TableCell>
                    <TableCell className="text-right">{r.factor === Infinity ? "∞" : r.factor.toFixed(2)}</TableCell>
                    <TableCell className="text-right">{r.total_runs}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </div>
      )}
    </div>
  );
};

