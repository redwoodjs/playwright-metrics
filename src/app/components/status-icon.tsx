import React from "react";

export type StatusType = "passed" | "failed" | "skipped" | "flaky" | string;

interface StatusIconProps {
  status: StatusType;
  was_flaky?: boolean;
}

export const StatusIcon: React.FC<StatusIconProps> = ({ status, was_flaky }) => {
  const isFlaky = was_flaky || status === "flaky";

  if (isFlaky) {
    return (
      <div className="flex items-center gap-1 text-yellow-500 font-bold text-xs uppercase" title="Flaky">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
          <path d="M12 9v4"/>
          <path d="M12 17h.01"/>
        </svg>
        <span>Flaky</span>
      </div>
    );
  }

  switch (status) {
    case "passed":
      return (
        <div className="flex items-center gap-1 text-green-600 font-bold text-xs uppercase" title="Passed">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
          <span>Passed</span>
        </div>
      );
    case "failed":
      return (
        <div className="flex items-center gap-1 text-red-600 font-bold text-xs uppercase" title="Failed">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
          <span>Failed</span>
        </div>
      );
    case "skipped":
      return (
        <div className="flex items-center gap-1 text-gray-500 font-bold text-xs uppercase" title="Skipped">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <line x1="8" y1="12" x2="16" y2="12"/>
          </svg>
          <span>Skipped</span>
        </div>
      );
    default:
      return (
        <div className="flex items-center gap-1 text-gray-400 font-bold text-xs uppercase" title={status}>
          <span>{status}</span>
        </div>
      );
  }
};
