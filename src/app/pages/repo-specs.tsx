import { listRepoSpecs } from "./actions";
import { Table, TableBody, TableCell, TableContainer, TableHeadCell, TableHeader, TableRow } from "../components/table";
import { AttemptHistory } from "../components/attempt-history";
import { Breadcrumb, type BreadcrumbItem } from "../components/breadcrumb";
import { requestInfo } from "rwsdk/worker";
import { link } from "../shared/links";

const StatusIcon = ({ status, flaky }: { status: string | null; flaky?: boolean }) => {
  if (flaky) {
    return (
      <div className="flex items-center gap-1.5 text-yellow-600">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
        <span className="text-xs font-medium uppercase tracking-tight">passed</span>
      </div>
    );
  }

  if (status === "passed") {
    return (
      <div className="flex items-center gap-1.5 text-green-600">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
        <span className="text-xs font-medium uppercase tracking-tight">passed</span>
      </div>
    );
  }

  if (status === "failed" || status === "timedOut" || status === "interrupted") {
    return (
      <div className="flex items-center gap-1.5 text-red-600">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
        <span className="text-xs font-medium uppercase tracking-tight">failed</span>
      </div>
    );
  }

  if (status === "skipped") {
    return (
      <div className="flex items-center gap-1.5 text-gray-400">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/></svg>
        <span className="text-xs font-medium uppercase tracking-tight whitespace-nowrap">skipped</span>
      </div>
    );
  }

  return <span className="text-xs text-gray-400 uppercase tracking-tight">{status || "unknown"}</span>;
};

export const RepoSpecs = async ({ params }: { params: { org: string; repo: string; $0?: string } }) => {
  const org = params.org;
  const repo = params.repo;
  
  // The catch-all $0 captures everything after /summary/:org/:repo/
  // It could be just a branch, or branch/commit
  const fullPath = params.$0 || '';
  
  let branch = '';
  let commit: string | undefined;
  
  if (fullPath) {
    const segments = fullPath.split('/');
    const lastSegment = segments[segments.length - 1];
    
    // If the last segment looks like a commit hash (7+ hex chars), treat it as commit
    if (lastSegment && lastSegment.length >= 7 && /^[a-f0-9]+$/i.test(lastSegment)) {
      commit = lastSegment;
      branch = segments.slice(0, -1).join('/');
    } else {
      // Otherwise, the whole path is the branch
      branch = fullPath;
    }
  }
  
  const repoName = `${org}/${repo}`;
  
  const rows = await listRepoSpecs(repoName, branch || undefined);

  const breadcrumbItems: BreadcrumbItem[] = [
    { label: "Test runs", href: "/runs" },
    { label: repoName, href: link("/runs/:org/:repo", { org, repo }) },
  ];
  
  if (branch) {
    breadcrumbItems.push({ label: branch, href: link("/runs/:org/:repo/*", { org, repo, $0: branch } as any) });
  }
  
  if (commit) {
    breadcrumbItems.push({ label: `Run ${commit.substring(0, 7)}`, active: true });
  } else {
    breadcrumbItems.push({ label: "Test Summary", active: true });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">
          Test Summary{commit ? ` for ${commit.substring(0, 7)}` : branch ? ` for ${branch}` : ` for ${repoName}`}
        </h1>
        <Breadcrumb items={breadcrumbItems} />
      </div>

      <TableContainer>
        <Table>
          <TableHeader>
            <TableHeadCell className="w-1/2">TEST</TableHeadCell>
            <TableHeadCell>PROJECT</TableHeadCell>
            <TableHeadCell className="text-right">ATTEMPTS</TableHeadCell>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={`${r.test_id}:${r.project_name}`}>
                <TableCell className="w-full">
                  <div className="flex flex-col gap-0.5">
                    <a 
                      href={`/test-summary/${r.test_id}`} 
                      className="font-bold text-sm text-gray-900 hover:text-blue-600 transition-colors line-clamp-1"
                    >
                      {r.title}
                    </a>
                    <span className="text-[10px] text-gray-500 font-mono">
                      {r.file}:{r.line}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <span className="text-xs text-gray-400 italic">
                    {r.project_name || "default"}
                  </span>
                </TableCell>
                <TableCell>
                  <AttemptHistory attempts={r.attempts} limit={12} showEmptySlots={false} className="justify-end"/>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {rows.length === 0 && (
        <div className="py-24 text-center border-2 border-dashed border-gray-100 rounded-xl">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-gray-50 mb-3 text-gray-400">
             <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>
          </div>
          <h3 className="text-gray-900 font-semibold">No tests found</h3>
          <p className="text-gray-500 text-sm mt-1">This repository hasn't reported any test results yet.</p>
        </div>
      )}
    </div>
  );
};
