import { getRun, listRunTests } from "./actions";
import { RunTestList } from "../components/run-test-list";
import { Breadcrumb, type BreadcrumbItem } from "../components/breadcrumb";
import { formatCommit, formatDate } from "../shared/format";
import { link } from "../shared/links";
import { Runs } from "./runs";

export const RunDetail = async ({ params }: { params: { org: string; repo: string; $0?: string; commit?: string } }) => {
  const org = params.org;
  const repo = params.repo;
  
  // The catch-all $0 captures everything after /runs/:org/:repo/, including both branch and commit
  // We need to split it to separate the branch from the commit hash
  const fullPath = params.$0 || '';
  
  // Find the last segment which should be the commit hash (40 chars for full SHA or 7+ for short)
  // Split by / and take the last part as commit, rest as branch
  const segments = fullPath.split('/');
  const lastSegment = segments[segments.length - 1];
  
  // Check if the last segment looks like a commit hash
  const isCommitHash = lastSegment && lastSegment.length >= 7 && /^[a-f0-9]+$/i.test(lastSegment);
  
  // If it doesn't look like a commit hash, this is a branch-only URL - render Runs instead
  if (!isCommitHash) {
    return <Runs params={{ org, repo, $0: fullPath }} />;
  }
  
  const commitHash = lastSegment;
  const branch = segments.slice(0, -1).join('/');
  
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

  const breadcrumbItems: BreadcrumbItem[] = [
    { label: "Home", href: "/runs" },
    { label: `${org}/${repo}`, href: link("/runs/:org/:repo", { org, repo }) },
    { label: branch, href: link("/runs/:org/:repo/*", { org, repo, $0: branch } as any) },
    { label: formatCommit(run.commit_hash), active: true },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col">
        <h1 className="text-2xl font-bold mb-2">
          Test run results
        </h1>
        <Breadcrumb 
          items={breadcrumbItems} 
        />
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            
            
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

