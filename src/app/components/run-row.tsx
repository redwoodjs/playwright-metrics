import { TableRow, TableCell } from "./table";
import { RunStats } from "./run-stats";
import { AttemptHistory } from "./attempt-history";
import { StatusIcon } from "./status-icon";
import { formatDate } from "../shared/format";
import { CommitLink } from "./commit-link";

interface RunRowProps {
  repo: string;
  branch: string;
  commit: string;
  user: string;
  startTime: string | null;
  expected: number;
  skipped: number;
  flaky: number;
  unexpected: number;
  shardCount?: number;
  statusElement?: React.ReactNode;
  showRepo?: boolean;
  showBranch?: boolean;
  showStats?: boolean;
  showStatus?: boolean;
  attemptStatuses?: string[];
}

export const RunRow: React.FC<RunRowProps> = ({
  repo,
  branch,
  commit,
  user,
  startTime,
  expected,
  skipped,
  flaky,
  unexpected,
  shardCount,
  statusElement,
  showRepo = true,
  showBranch = true,
  showStats = true,
  showStatus = true,
  attemptStatuses,
}) => {
  const getStatus = () => {
    if (unexpected > 0) return { status: "failed", label: "Failed" };
    if (flaky > 0) return { status: "flaky", label: "Flaky" };
    if (expected === 0 && skipped > 0) return { status: "skipped", label: "Skipped" };
    if (expected === 0 && unexpected === 0 && flaky === 0 && skipped === 0) return { status: "empty", label: "Empty" };
    return { status: "passed", label: "Passed" };
  };

  const { status, label } = getStatus();
  const showContext = showRepo || showBranch;
  
  // Split repo into org and repo name for the link
  const [org, repoName] = repo.split('/');

  return (
    <TableRow>
      <TableCell className="text-xs">
        <CommitLink org={org} repo={repoName} branch={branch} commit={commit} user={user} />
      </TableCell>
      {showContext && (
        <TableCell
          className="text-gray-500 italic text-xs truncate max-w-[250px]"
          title={`${repo}/${branch}@${commit}`}
        >
          {showRepo && repo}
          {showRepo && showBranch && "/"}
          {showBranch && branch}
        </TableCell>
      )}
      <TableCell className="text-xs">{formatDate(startTime)}</TableCell>
      {attemptStatuses && (
        <TableCell>
          <AttemptHistory 
            attempts={attemptStatuses.map(s => ({ status: s }))} 
            showEmptySlots={false} 
            size="sm" 
          />
        </TableCell>
      )}
      
      {showStats && (
        <TableCell className="text-right">
          <RunStats
            expected={expected}
            skipped={skipped}
            flaky={flaky}
            unexpected={unexpected}
          />
        </TableCell>
      )}
      {showStatus && (
        <TableCell className="text-right">
          <div className="flex justify-end">
            {statusElement || (
              <StatusIcon status={status} result={label} />
            )}
          </div>
        </TableCell>
      )}
    </TableRow>
  );
};


