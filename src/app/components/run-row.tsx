import { TableRow, TableCell } from "./table";
import { RunStats } from "./run-stats";
import { AttemptHistory } from "./attempt-history";

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

const formatDate = (dateStr: string | null) => {
  if (!dateStr) return "-";
  try {
    return new Date(dateStr).toLocaleString();
  } catch (e) {
    return dateStr;
  }
};

const RunStatusBadge: React.FC<{
  expected: number;
  skipped: number;
  flaky: number;
  unexpected: number;
}> = ({ expected, skipped, flaky, unexpected }) => {
  let label = "Passed";
  let colorClass = "bg-green-100 text-green-700 border-green-200";

  if (unexpected > 0) {
    label = "Failed";
    colorClass = "bg-red-100 text-red-700 border-red-200";
  } else if (flaky > 0) {
    label = "Flaky";
    colorClass = "bg-yellow-100 text-yellow-700 border-yellow-200";
  } else if (expected === 0 && skipped > 0) {
    label = "Skipped";
    colorClass = "bg-gray-100 text-gray-500 border-gray-200";
  } else if (expected === 0 && unexpected === 0 && flaky === 0 && skipped === 0) {
    label = "Empty";
    colorClass = "bg-gray-50 text-gray-400 border-gray-100";
  }

  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full border ${colorClass} font-medium uppercase tracking-wider`}>
      {label}
    </span>
  );
};

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
  const showContext = showRepo || showBranch;

  return (
    <TableRow>
      <TableCell className="text-xs">
        <div className="flex flex-col">
          <a className="underline font-mono text-[10px]" href={`/runs/${commit}`}>
            {commit.slice(0, 7)}
          </a>
          <div className="flex items-center gap-2">
            {user && (
              <div className="text-[10px] text-gray-400">
                by {user}
              </div>
            )}
          </div>
        </div>
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
          {statusElement || (
            <RunStatusBadge
              expected={expected}
              skipped={skipped}
              flaky={flaky}
              unexpected={unexpected}
            />
          )}
        </TableCell>
      )}
    </TableRow>
  );
};


