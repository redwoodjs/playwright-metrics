import React from "react";

export type StatusType = "passed" | "failed" | "skipped" | "flaky" | string;

interface StatusIconProps {
  status: StatusType;
  was_flaky?: boolean;
  result?: number | string;
}

const IconWrapper: React.FC<{ children: React.ReactNode; colorClass: string; title: string; result?: number | string }> = ({ 
  children, 
  colorClass, 
  title, 
  result 
}) => {
  return (
    <div className="flex items-center gap-1.5 text-[10px] tabular-nums h-5" title={title}>
      <div className={`flex-shrink-0 flex items-center justify-center w-3.5 h-3.5 ${colorClass}`}>
        {children}
      </div>
      <div className={`font-bold ${colorClass}`}>
        {result ?? ""}
      </div>
    </div>
  );
};

export const StatusIcon: React.FC<StatusIconProps> = ({ status, was_flaky, result }) => {
  const isFlaky = was_flaky || status === "flaky";

  if (isFlaky) {
    return (
      <IconWrapper colorClass="text-yellow-500" title="Flaky" result={result}>
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
          <path d="M12 9v4"/>
          <path d="M12 17h.01"/>
        </svg>
      </IconWrapper>
    );
  }

  switch (status) {
    case "passed":
      return (
        <IconWrapper colorClass="text-green-600" title="Passed" result={result}>
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </IconWrapper>
      );
    case "failed":
      return (
        <IconWrapper colorClass="text-red-600" title="Failed" result={result}>
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </IconWrapper>
      );
    case "skipped":
      return (
        <IconWrapper colorClass="text-gray-500" title="Skipped" result={result}>
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <line x1="8" y1="12" x2="16" y2="12"/>
          </svg>
        </IconWrapper>
      );
    default:
      return (
        <div className="flex items-center gap-1.5 text-gray-400 font-bold text-xs uppercase tabular-nums" title={status}>
          <span>{result}</span>
        </div>
      );
  }
};
