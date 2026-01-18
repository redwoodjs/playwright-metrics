import { listRuns } from "./actions";
import { Table, TableBody, TableCell, TableContainer, TableHeadCell, TableHeader, TableRow } from "../components/table";
import { RunRow } from "../components/run-row";

const formatDate = (dateStr: string | null) => {
  if (!dateStr) return "-";
  try {
    return new Date(dateStr).toLocaleString();
  } catch (e) {
    return dateStr;
  }
};

export const Runs = async ({ params }: { params?: { org?: string; repo?: string; branch?: string } }) => {
  const repoFilter = params?.org && params?.repo ? `${params.org}/${params.repo}` : undefined;
  const branchFilter = params?.branch;

  const runs = await listRuns({ repo: repoFilter, branch: branchFilter });

  // Group by repo
  const groupedByRepo: Record<string, Record<string, typeof runs>> = {};
  for (const run of runs) {
    const repoParts = run.repo.split("/");
    const repoName = repoParts.length >= 2 ? repoParts.slice(0, 2).join("/") : run.repo;

    if (!groupedByRepo[repoName]) {
      groupedByRepo[repoName] = {};
    }
    if (!groupedByRepo[repoName][run.branch]) {
      groupedByRepo[repoName][run.branch] = [];
    }
    groupedByRepo[repoName][run.branch].push(run);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Test runs</h1>
          {repoFilter && (
            <div className="flex items-center gap-2 text-sm text-gray-500 mt-1">
              <a href="/runs" className="hover:underline">All Runs</a>
              <span>/</span>
              <a href={`/runs/${repoFilter}`} className={!branchFilter ? "font-bold text-black" : "hover:underline"}>{repoFilter}</a>
              {branchFilter && (
                <>
                  <span>/</span>
                  <span className="font-bold text-black">{branchFilter}</span>
                </>
              )}
              {!branchFilter && (
                <>
                  <span className="mx-1">·</span>
                  <a href={`/runs/${repoFilter}/specs`} className="text-gray-400 hover:text-black hover:underline flex items-center gap-1">
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>
                    View All Specs
                  </a>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {Object.entries(groupedByRepo).map(([repo, branches]) => (
        <div key={repo} className="space-y-4">
          {!repoFilter && (
            <div className="pb-1">
              <a href={`/runs/${repo}`} className="text-lg font-bold hover:underline">
                {repo}
              </a>
            </div>
          )}

          {Object.entries(branches).map(([branch, branchRuns]) => (
            <div key={branch} className="space-y-2">
              <div className="flex items-center justify-between px-2 py-1 bg-gray-50 rounded">
                <a
                  href={`/runs/${repo}/${branch}`}
                  className="text-sm font-semibold hover:underline flex items-center gap-2"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/></svg>
                  {branch}
                </a>
                <span className="text-[10px] text-gray-400 font-mono italic">
                  {branchRuns.length} {branchRuns.length === 1 ? "run" : "runs"}
                </span>
              </div>

              <TableContainer>
                <Table>
                  <TableHeader>
                    <TableHeadCell>Commit</TableHeadCell>
                    <TableHeadCell className="w-full">Date</TableHeadCell>
                    <TableHeadCell>Metrics</TableHeadCell>
                    <TableHeadCell className="text-right">Status</TableHeadCell>
                    
                  </TableHeader>
                  <TableBody>
                    {branchRuns.map((r) => (
                      <RunRow
                        key={r.commit_hash}
                        repo={r.repo}
                        branch={r.branch}
                        commit={r.commit_hash}
                        user={r.pr_user}
                        startTime={r.start_time}
                        expected={r.expected_count}
                        skipped={r.skipped_count}
                        flaky={r.flaky_count}
                        unexpected={r.unexpected_count}
                        shardCount={r.shard_count}
                        showRepo={false}
                        showBranch={false}
                      />
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </div>
          ))}
        </div>
      ))}

      {runs.length === 0 && (
        <div className="py-12 text-center text-gray-500 italic border border-dashed border-gray-300 rounded">
          No runs found {repoFilter ? `for ${repoFilter}` : ""}{branchFilter ? ` / ${branchFilter}` : ""}.
        </div>
      )}
    </div>
  );
};

