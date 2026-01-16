import { getTestData, getTestHistory } from "./actions";
import { Histogram } from "@/app/components/histogram";
import { StatusIcon } from "../../components/status-icon";

function formatDuration(ms: number | null): string {
  if (ms === null || ms === 0) return "-";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleString();
}

export const TestDetail = async ({ params }: { params: { testId: string } }) => {
  const testId = params.testId;
  const [test, history] = await Promise.all([
    getTestData(testId),
    getTestHistory(testId, 50),
  ]);

  if (!test) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold text-red-600">Test Not Found</h1>
        <p className="mt-2">The test with ID {testId} could not be found.</p>
        <a href="/tests" className="underline mt-4 inline-block">Back to Flakiest Tests</a>
      </div>
    );
  }

  // Prepare data for histogram (most recent results)
  const recentResults = history.slice(0, 30).map(r => {
    if (r.was_flaky) return "flaky";
    if (r.status === "passed") return "pass";
    return "fail";
  }); // Newest to oldest (newest on the left)

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm">
         <a href="/leaderboard" className="underline text-gray-500 hover:text-black">Leaderboard</a>
         <span className="text-gray-400">/</span>
         <span className="text-gray-900 font-medium">Test Detail</span>
      </div>

      {/* Header */}
      <div className="border border-black p-4 bg-white">
        <h1 className="text-2xl font-bold truncate" title={test.title || ""}>
          {test.title || "Untitled Test"}
        </h1>
        <div className="text-sm text-gray-600 mt-1">
          {test.file}
          {test.line ? `:${test.line}` : ""}
        </div>
        <div className="text-xs text-gray-400 mt-2 font-mono">ID: {test.id}</div>
      </div>

      {/* Summary / Histogram */}
      <div className="border border-black p-4 bg-white">
        <h2 className="text-lg font-bold mb-3">Recent Stability</h2>
        <div className="flex items-center gap-4">
          <Histogram results={recentResults as any} />
          <div className="text-sm text-gray-600">
            Last {recentResults.length} runs
          </div>
        </div>
      </div>

      {/* Run History */}
      <div className="space-y-2">
        <h2 className="text-lg font-bold px-2">Run History</h2>
        <div className="border border-black overflow-hidden bg-white shadow-sm">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-100 border-b border-black text-xs font-bold uppercase">
                <th className="px-3 py-2">Start Time</th>
                <th className="px-3 py-2">Context (Repo@Branch)</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Duration</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {history.map((run) => (
                <tr key={run.run_id} className="border-b border-gray-200 last:border-0 hover:bg-gray-50">
                  <td className="px-3 py-2 text-gray-600 truncate max-w-[150px]" title={formatDate(run.start_time)}>
                    {formatDate(run.start_time)}
                  </td>
                  <td className="px-3 py-2 text-gray-500 italic text-xs truncate max-w-[200px]" title={`${run.owner}/${run.repo}@${run.branch}`}>
                    {run.owner}/{run.repo}
                    <div className="text-[10px] text-gray-400 not-italic">@{run.branch}</div>
                  </td>
                  <td className="px-3 py-2">
                    <StatusIcon status={run.status ?? ""} was_flaky={run.was_flaky} />
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{formatDuration(run.duration_ms)}</td>
                  <td className="px-3 py-2 text-right">
                    <a 
                      href={`/runs/${run.run_id}`} 
                      className="text-black underline hover:no-underline text-xs"
                    >
                      View Run Details →
                    </a>
                  </td>
                </tr>
              ))}
              {history.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-8 text-center text-gray-500 italic">
                    No run history found for this test.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
