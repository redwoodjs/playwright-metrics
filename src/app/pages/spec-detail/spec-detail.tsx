import { getTestData, getTestHistory } from "./actions";
import { AttemptHistory } from "@/app/components/attempt-history";
import { Table, TableBody, TableCell, TableContainer, TableHeadCell, TableHeader, TableRow } from "@/app/components/table";
import { RunRow } from "@/app/components/run-row";



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

  // Prepare data for history (most recent results)
  const recentAttempts = history.slice(0, 50).reverse().map(run => ({
    status: run.was_flaky ? "flaky" : (run.status ?? "unknown"),
    run_id: run.run_id
  })); // Oldest to newest

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

   

      <div className="space-y-2">
       
        <h2 className="text-lg font-bold">Run History</h2>
      
        <TableContainer>
        <Table>
          <TableHeader>
            <TableHeadCell>Commit</TableHeadCell>
            <TableHeadCell className="w-full">Date</TableHeadCell>
            <TableHeadCell>Attempts</TableHeadCell>
            <TableHeadCell className="text-right">Status</TableHeadCell>
          </TableHeader>
          <TableBody>
            {history.map((run) => (
              <RunRow
                key={run.run_id}
                repo={run.repo ?? ""}
                branch={run.branch ?? ""}
                commit={run.commit_hash ?? ""}
                user={run.pr_user ?? ""}
                startTime={run.start_time}
                expected={run.status === "passed" || run.was_flaky ? 1 : 0}
                skipped={run.status === "skipped" ? 1 : 0}
                flaky={run.was_flaky ? 1 : 0}
                unexpected={(run.status === "failed" || run.status === "timedOut" || run.status === "interrupted") && !run.was_flaky ? 1 : 0}
                showRepo={false}
                showBranch={false}
                showStats={false}
                attemptStatuses={run.attempt_statuses}
              />
            ))}
            {history.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="py-8 text-center text-gray-500 italic">
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
