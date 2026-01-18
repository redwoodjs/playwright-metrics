import React from "react";
import { StatusIcon } from "./status-icon";

interface RunStatsProps {
  expected: number;
  skipped: number;
  flaky: number;
  unexpected: number;
}

export const RunStats: React.FC<RunStatsProps> = ({ 
  expected, 
  skipped, 
  flaky, 
  unexpected
}) => {
  return (
    <div className="flex items-center justify-end gap-x-2 tabular-nums text-xs min-w-max">
      <div className="w-12">
        <StatusIcon status="passed" result={expected} />
      </div>
      <div className="w-12">
        <StatusIcon status="skipped" result={skipped} />
      </div>
      <div className="w-12">
        <StatusIcon status="flaky" result={flaky} />
      </div>
      <div className="w-12">
        <StatusIcon status="failed" result={unexpected} />
      </div>
    </div>
  );
};
