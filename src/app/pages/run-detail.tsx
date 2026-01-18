import { getRun, listRunTests, listRunFlakies, listRunNewFlakies } from "./actions";
import { StatusIcon } from "../components/status-icon";
import { Histogram } from "../components/histogram";
import { formatDuration } from "../shared/format";
import { Table, TableBody, TableCell, TableContainer, TableHeadCell, TableHeader, TableRow } from "../components/table";

export const RunDetail = async ({ params }: { params: { runId: string } }) => {
  const runId = params.runId;
  const run = await getRun(runId);
  const tests = await listRunTests(runId);
  const flakies = await listRunFlakies(runId);
  const newFlakies = await listRunNewFlakies(runId);

  if (!run) {
    return (
      <div className="space-y-4">
        <a href="/runs" className="text-sm text-blue-600 hover:underline">← Back to Runs</a>
        <h1 className="text-2xl font-semibold">Run not found</h1>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <a href="/runs" className="underline text-sm">← Back to Runs</a>
      <h1 className="text-2xl font-bold">Run {run.id}</h1>
      <div className="space-y-1">
        <div><b>Repository:</b> {run.repo}/{run.branch}@{run.commit_hash}</div>
        <div><b>Commit:</b> <span title={run.commit_href ?? ""} className="font-mono">{run.commit_hash}</span></div>
        {run.pr_user ? <div><b>User:</b> {run.pr_user}</div> : null}
        <div><b>Start:</b> {run.start_time || "-"}</div>
        <div className="flex gap-4 border-t border-black pt-2 mt-2">
          <div className="flex items-center gap-1"><StatusIcon status="passed" /> <span>{run.expected_count}</span></div>
          <div className="flex items-center gap-1"><StatusIcon status="failed" /> <span>{run.unexpected_count}</span></div>
          <div className="flex items-center gap-1"><StatusIcon status="flaky" /> <span>{run.flaky_count}</span></div>
          <div className="flex items-center gap-1"><StatusIcon status="skipped" /> <span>{run.skipped_count}</span></div>
        </div>
      </div>

      <div className="space-y-3">
        <h2 className="text-xl font-semibold">Specs</h2>
        {flakies.length > 0 && (
          <div className="border border-black p-2 bg-yellow-50 text-sm">
            <div className="font-bold mb-1">Flaky in this run</div>
            <ul className="list-disc pl-6">
              {flakies.map((f) => (
                <li key={f.test_id}>
                  {f.title} — {f.file}:{f.line}
                </li>
              ))}
            </ul>
          </div>
        )}
        {newFlakies.length > 0 && (
          <div className="border border-black p-2 bg-green-50 text-sm">
            <div className="font-bold mb-1">New flaky specs introduced</div>
            <ul className="list-disc pl-6">
              {newFlakies.map((f) => (
                <li key={f.test_id}>
                  {f.title} — {f.file}:{f.line}
                </li>
              ))}
            </ul>
          </div>
        )}
        <TableContainer>
          <Table>
            <TableHeader>
              <TableHeadCell>Title</TableHeadCell>
              <TableHeadCell>File</TableHeadCell>
              <TableHeadCell>Attempts</TableHeadCell>
              <TableHeadCell>Final Result</TableHeadCell>
            </TableHeader>
            <TableBody>
              {tests.map((t) => (
                <TableRow key={t.id}>
                  <TableCell>{t.title}</TableCell>
                  <TableCell className="break-all">
                    {t.file}:{t.line}
                  </TableCell>
                  <TableCell>
                    <Histogram results={t.attempt_statuses} />
                  </TableCell>
                  <TableCell>
                    <StatusIcon status={t.final_status ?? ""} was_flaky={t.was_flaky} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </div>
    </div>
  );
};

