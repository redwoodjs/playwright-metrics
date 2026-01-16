import { getRun, listRunTests, listRunFlakies, listRunNewFlakies } from "./actions";

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
        <div><b>Counts:</b> expected {run.expected_count}, skipped {run.skipped_count}, flaky {run.flaky_count}, unexpected {run.unexpected_count}</div>
      </div>

      <div className="space-y-3">
        <h2 className="text-xl font-semibold">Tests</h2>
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
            <div className="font-bold mb-1">New flaky tests introduced</div>
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
              <col className="w-[6%]" />
              <col className="w-[6%]" />
            </colgroup>
            <thead>
              <tr>
                <th className="border border-black p-2 text-left">Title</th>
                <th className="border border-black p-2 text-left">File</th>
                <th className="border border-black p-2 text-left">Project</th>
                <th className="border border-black p-2 text-left">Status</th>
                <th className="border border-black p-2 text-right">Attempts</th>
                <th className="border border-black p-2 text-left">Final</th>
              </tr>
            </thead>
            <tbody>
              {tests.map((t) => (
                <tr key={t.id}>
                  <td className="border border-black p-2 align-top">{t.title}</td>
                  <td className="border border-black p-2 align-top break-all">
                    {t.file}:{t.line}
                  </td>
                  <td className="border border-black p-2 align-top">{t.project_name}</td>
                  <td className="border border-black p-2 align-top">{t.status}</td>
                  <td className="border border-black p-2 text-right align-top">{t.attempts}</td>
                  <td className="border border-black p-2 align-top font-bold text-xs uppercase">
                    {t.was_flaky ? (
                      <span className="text-orange-600">FLAKY</span>
                    ) : t.final_status === "passed" ? (
                      <span className="text-green-600">{t.final_status}</span>
                    ) : (
                      <span className="text-red-600">{t.final_status}</span>
                    )}
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

