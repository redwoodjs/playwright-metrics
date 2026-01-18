import { getTestData, getTestHistory } from "./actions";
import { Histogram } from "@/app/components/histogram";
import { StatusIcon } from "../../components/status-icon";
import { Table, TableBody, TableCell, TableContainer, TableHeadCell, TableHeader, TableRow } from "@/app/components/table";
import { formatDuration } from "@/app/shared/format";


function formatDate(dateStr: string | null): string {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleString();
}

export const TestDetail = async ({ params }: { params: { specId: string } }) => {
  const specId = params.specId;
  const [test, history] = await Promise.all([
    getTestData(specId),
    getTestHistory(specId, 50),
  ]);

  if (!test) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold text-red-600">Spec Not Found</h1>
        <p className="mt-2">The spec with ID {specId} could not be found.</p>
        <a href="/specs" className="underline mt-4 inline-block">Back to Flakiest Specs</a>
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
         <span className="text-gray-900 font-medium">Spec Detail</span>
      </div>

      {/* Header */}
      <div className="border border-black p-4 bg-white">
        <h1 className="text-2xl font-bold truncate" title={test.title || ""}>
          {test.title || "Untitled Spec"}
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
        <TableContainer>
          <Table>
            <TableHeader>
              <TableHeadCell>Start Time</TableHeadCell>
              <TableHeadCell>Context (Repo@Branch)</TableHeadCell>
              <TableHeadCell>Status</TableHeadCell>
              <TableHeadCell className="text-right">Actions</TableHeadCell>
            </TableHeader>
            <TableBody>
              {history.map((run) => (
                <TableRow key={run.run_id}>
                  <TableCell className="text-gray-600 truncate max-w-[150px]" title={formatDate(run.start_time)}>
                    {formatDate(run.start_time)}
                  </TableCell>
                  <TableCell className="text-gray-500 italic text-xs truncate max-w-[200px]" title={`${run.owner}/${run.repo}@${run.branch}`}>
                    {run.owner}/{run.repo}
                    <div className="text-[10px] text-gray-400 not-italic">@{run.branch}</div>
                  </TableCell>
                  <TableCell>
                    <StatusIcon status={run.status ?? ""} was_flaky={run.was_flaky} />
                  </TableCell>
                  <TableCell className="text-right">
                    <a 
                      href={`/runs/${run.run_id}`} 
                      className="text-black underline hover:no-underline text-xs"
                    >
                      View Run Details →
                    </a>
                  </TableCell>
                </TableRow>
              ))}
              {history.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-gray-500 italic">
                    No run history found for this spec.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </div>
    </div>
  );
};
