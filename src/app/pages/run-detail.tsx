import { getRun, listRunTests } from "./actions";
import { RunTestList } from "../components/run-test-list";

export const RunDetail = async ({ params }: { params: { commitHash: string } }) => {
  const commitHash = params.commitHash;
  const run = await getRun(commitHash);
  const tests = await listRunTests(commitHash);

  if (!run) {
    return (
      <div className="space-y-4">
        <a href="/runs" className="text-sm text-blue-600 hover:underline">← Back to Runs</a>
        <h1 className="text-2xl font-semibold">Run not found</h1>
        <p className="text-gray-500">No logical run found for commit <span className="font-mono">{commitHash}</span></p>
      </div>
    );
  }

  const runStats = {
    expected: Number(run.expected_count ?? 0),
    skipped: Number(run.skipped_count ?? 0),
    flaky: Number(run.flaky_count ?? 0),
    unexpected: Number(run.unexpected_count ?? 0),
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <a href="/runs" className="text-xs text-gray-500 hover:underline mb-2 flex items-center gap-1">
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
          Back to Runs
        </a>
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold font-mono truncate max-w-[600px]" title={run.commit_hash}>
              {run.repo}/{run.branch}@{run.commit_hash.slice(0, 7)}
            </h1>
            <div className="flex items-center gap-4 text-xs text-gray-500">
              {run.pr_user && <span>by <b>{run.pr_user}</b></span>}
              <span>{run.start_time || "-"}</span>
              {run.shard_count && run.shard_count > 1 && (
                <div className="text-[10px] bg-gray-100 text-gray-500 px-1 rounded flex items-center gap-0.5 not-italic" title={`${run.shard_count} shards connected`}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/></svg>
                  {run.shard_count} shards
                </div>
              )}
            </div>
            {run.labels && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {run.labels.split(",").map(label => (
                  <span key={label} className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded border border-blue-100 font-medium">
                    {label.trim()}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <RunTestList tests={tests} runStats={runStats} />
    </div>
  );
};

