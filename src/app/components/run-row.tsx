import React from "react";
import { TableRow, TableCell } from "./table";
import { RunStats } from "./run-stats";

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
}

const formatDate = (dateStr: string | null) => {
  if (!dateStr) return "-";
  try {
    return new Date(dateStr).toLocaleString();
  } catch (e) {
    return dateStr;
  }
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
  statusElement
}) => {
  return (
    <TableRow>
      <TableCell className="text-xs">
        <div className="flex flex-col">
          <a className="underline font-mono text-[10px]" href={`/runs/${commit}`}>
            {commit.slice(0, 7)}
          </a>
          {user && (
            <div className="text-[10px] text-gray-400">
              by {user}
            </div>
          )}
        </div>
      </TableCell>
      <TableCell
        className="text-gray-500 italic text-xs truncate max-w-[250px]"
        title={`${repo}/${branch}@${commit}`}
      >
        {repo}/{branch}
        <div className="flex items-center gap-1.5 mt-0.5">
          {shardCount && shardCount > 1 && (
            <div className="text-[10px] bg-gray-100 text-gray-500 px-1 rounded flex items-center gap-0.5 not-italic" title={`${shardCount} shards connected`}>
              <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/></svg>
              {shardCount} shards
            </div>
          )}
        </div>
      </TableCell>
      <TableCell className="text-xs">{formatDate(startTime)}</TableCell>
      {statusElement && <TableCell>{statusElement}</TableCell>}
      <TableCell className="text-right">
        <RunStats
          expected={expected}
          skipped={skipped}
          flaky={flaky}
          unexpected={unexpected}
        />
      </TableCell>
    </TableRow>
  );
};
