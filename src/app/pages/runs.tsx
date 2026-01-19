import { listRuns } from "./actions";
import { Table, TableBody, TableCell, TableContainer, TableHeadCell, TableHeader, TableRow } from "../components/table";
import { RunRow } from "../components/run-row";
import { Breadcrumb, type BreadcrumbItem } from "../components/breadcrumb";
import { requestInfo } from "rwsdk/worker";
import { link } from "../shared/links";
import { SummaryView } from "../components/summary-view";

export const Runs = async ({ params }: { params?: { org?: string; repo?: string; $0?: string } }) => {
  const url = new URL(requestInfo.request.url);
  const pathname = url.pathname;
  
  const org = params?.org;
  const repo = params?.repo;
  const repoFilter = org && repo ? `${org}/${repo}` : undefined;
  
  // Branch is captured by the catch-all parameter $0
  const branchFilter = params?.$0;

  // Check if we're in summary view
  const viewParam = url.searchParams.get("view");
  const isSummaryView = viewParam === "summary";

  const breadcrumbItems: BreadcrumbItem[] = [];

  if (!repoFilter) {
    breadcrumbItems.push({ label: "Home", active: true });
  } else {
    breadcrumbItems.push({ label: "Home", href: "/runs" });
    breadcrumbItems.push({ 
      label: repoFilter, 
      href: link("/runs/:org/:repo", { org: org!, repo: repo! }), 
      active: !branchFilter 
    });
    
    if (branchFilter) {
      breadcrumbItems.push({ 
        label: branchFilter, 
        active: true 
      });
    }
  }


  // Build toggle URLs
  const currentPath = pathname;
  const summaryUrl = `${currentPath}?view=summary`;
  const historyUrl = currentPath;

  const runs = await listRuns({ repo: repoFilter, branch: branchFilter });

  // Render summary view
  if (isSummaryView) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="w-full">
            <h1 className="text-2xl font-bold mb-2">Test Summary</h1>
            <Breadcrumb items={breadcrumbItems}/>
          </div>
          <div className="ml-4">
            <div className="inline-flex items-center rounded-md border border-gray-300 bg-white p-1 gap-1">
              <a
                href={summaryUrl}
                className="px-3 py-1.5 text-xs font-medium rounded transition-all bg-black text-white"
              >
                Summary
              </a>
              <a
                href={historyUrl}
                className="px-3 py-1.5 text-xs font-medium rounded transition-all text-gray-600 hover:text-black hover:bg-gray-50"
              >
                History
              </a>
            </div>
          </div>
        </div>
        
        {repoFilter && !branchFilter && (
          <div className="flex items-center justify-between px-2 py-1 bg-gray-50 rounded">
            <div className="flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>
              <a href={link("/runs/:org/:repo", { org: org!, repo: repo! })} className="text-sm font-bold hover:underline">
                {repoFilter}
              </a>
            </div>
            <span className="text-[10px] text-gray-400 font-mono italic">
              {runs.length} {runs.length === 1 ? "run" : "runs"}
            </span>
          </div>
        )}

        {branchFilter && (
          <div className="flex items-center justify-between px-2 py-1 bg-gray-50 rounded">
            <div className="flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/></svg>
              <a
                href={link("/runs/:org/:repo/*", { org: org!, repo: repo!, $0: branchFilter } as any)}
                className="text-sm font-bold hover:underline"
              >
                {branchFilter}
              </a>
            </div>
            <span className="text-[10px] text-gray-400 font-mono italic">
              {runs.length} {runs.length === 1 ? "run" : "runs"}
            </span>
          </div>
        )}

        <SummaryView repo={repoFilter} branch={branchFilter} />
      </div>
    );
  }

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
        <div className="w-full">
          <h1 className="text-2xl font-bold mb-2">Test runs</h1>
          <Breadcrumb items={breadcrumbItems} />
        </div>
        <div className="ml-4">
          <div className="inline-flex items-center rounded-md border border-gray-300 bg-white p-1 gap-1">
            <a
              href={summaryUrl}
              className="px-3 py-1.5 text-xs font-medium rounded transition-all text-gray-600 hover:text-black hover:bg-gray-50"
            >
              Summary
            </a>
            <a
              href={historyUrl}
              className="px-3 py-1.5 text-xs font-medium rounded transition-all bg-black text-white"
            >
              History
            </a>
          </div>
        </div>
      </div>

      {Object.entries(groupedByRepo).map(([repo, branches]) => {
        const totalRuns = Object.values(branches).reduce((acc, b) => acc + b.length, 0);
        return (
          <div key={repo} className="space-y-4">
            <div className="flex items-center justify-between px-2 py-1 bg-gray-50 rounded">
              <div className="flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>
                <a href={link("/runs/:org/:repo", { org: repo.split('/')[0], repo: repo.split('/')[1] })} className="text-sm font-bold hover:underline">
                  {repo}
                </a>
              </div>
              <span className="text-[10px] text-gray-400 font-mono italic">
                {totalRuns} {totalRuns === 1 ? "run" : "runs"}
              </span>
            </div>

          {Object.entries(branches).map(([branch, branchRuns]) => (
            <div key={branch} className="space-y-2">
              <div className="flex items-center justify-between px-2 py-1 bg-gray-50 rounded">
                <div className="flex items-center gap-3">
                  <a
                    href={link("/runs/:org/:repo/*", { org: repo.split('/')[0], repo: repo.split('/')[1], $0: branch } as any)}
                    className="text-sm font-semibold hover:underline flex items-center gap-2"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/></svg>
                    {branch}
                  </a>
                </div>
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
        );
      })}

      {runs.length === 0 && (
        <div className="py-12 text-center text-gray-500 italic border border-dashed border-gray-300 rounded">
          No runs found {repoFilter ? `for ${repoFilter}` : ""}{branchFilter ? ` / ${branchFilter}` : ""}.
        </div>
      )}
    </div>
  );
};

