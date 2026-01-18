import React from "react";
import { TableRow, TableCell } from "./table";
import { RunStats } from "./run-stats";

interface RunRowProps {
  id: string;
  repo: string;
  branch: string;
  commit: string;
  user: string;
  startTime: string | null;
  expected: number;
  skipped: number;
  flaky: number;
  unexpected: number;
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
  id,
  repo,
  branch,
  commit,
  user,
  startTime,
  expected,
  skipped,
  flaky,
  unexpected,
  statusElement
}) => {
  return (
    <TableRow>
      <TableCell className="break-all text-xs">
        <a className="underline" href={`/runs/${id}`}>
          {id}
        </a>
      </TableCell>
      <TableCell
        className="text-gray-500 italic text-xs truncate max-w-[250px]"
        title={`${repo}/${branch}@${commit}`}
      >
        {repo}/{branch}
        <div className="text-[10px] text-gray-400 not-italic">{commit}</div>
      </TableCell>
      <TableCell className="text-xs">{user || "-"}</TableCell>
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
