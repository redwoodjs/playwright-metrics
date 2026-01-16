import { getRun, listRunTests, listRunFlakies, listRunNewFlakies } from "./actions";
import { StatusIcon } from "../components/status-icon";
import { Histogram } from "../components/histogram";

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
        <div><b>PR User:</b> {run.pr_user}</div>
        <div><b>Start:</b> {run.start_time || "-"}</div>
        <div><b>Duration (ms):</b> {run.duration_ms}</div>
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
        <div className="overflow-x-auto">
          <table className="w-full table-auto border-collapse border border-black text-sm">
            <colgroup>
              <col className="w-[40%]" />
              <col className="w-[28%]" />
              <col className="w-[10%]" />
              <col className="w-[10%]" />
              <col className="w-[12%]" />
            </colgroup>
            <thead>
              <tr>
                <th className="border border-black p-2 text-left">Title</th>
                <th className="border border-black p-2 text-left">File</th>
                <th className="border border-black p-2 text-left">Project</th>
                <th className="border border-black p-2 text-left">Attempts</th>
                <th className="border border-black p-2 text-left">Final Result</th>
              </tr>
            </thead>
            <tbody>
              {tests.map((t) => (
                <tr key={t.id}>
                  <td className="border border-black p-2 align-top">{t.title}</td>
                  <td className="border border-black p-2 align-top break-all">
                    {t.file}:{t.line}
                  </td>
                  <td className="border border-black p-2 align-top italic text-gray-500">
                    {t.project_name}
                  </td>
                  <td className="border border-black p-2 align-top">
                    <Histogram results={t.attempt_statuses} />
                  </td>
                  <td className="border border-black p-2 align-top">
                    <StatusIcon status={t.final_status ?? ""} was_flaky={t.was_flaky} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

