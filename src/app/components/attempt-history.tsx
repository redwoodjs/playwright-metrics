import React from "react";

export type AttemptStatus = "pass" | "fail" | "flaky" | "skip" | string;

interface AttemptHistoryProps {
  attempts: {
    status: AttemptStatus;
    retry?: number;
    run_id?: string;
  }[];
  limit?: number;
  showEmptySlots?: boolean;
  className?: string;
  size?: "sm" | "md";
}

export const AttemptHistory: React.FC<AttemptHistoryProps> = ({ 
  attempts, 
  limit = 12, 
  showEmptySlots = true,
  className = "",
  size = "md"
}) => {
  const boxWidth = size === "sm" ? "w-2" : "w-2.5";
  const boxHeight = size === "sm" ? "h-3" : "h-3.5";
  
  return (
    <div className={`flex items-center gap-0.5 ${className}`}>
      {attempts.slice(-limit).map((att, idx) => {
        let bgColor = "bg-gray-200";
        const status = att.status;
        
        if (status === "pass" || status === "passed") bgColor = "bg-green-500";
        else if (status === "fail" || status === "failed" || status === "unexpected" || status === "timedOut" || status === "interrupted") bgColor = "bg-red-500";
        else if (status === "flaky") bgColor = "bg-yellow-500";
        else if (status === "skip" || status === "skipped") bgColor = "bg-gray-300";

        return (
          <div 
            key={`${att.run_id || idx}-${att.retry || 0}`} 
            className={`${boxWidth} ${boxHeight} rounded-sm ${bgColor} transition-transform hover:scale-110 cursor-help shadow-sm`}
            title={`${status}${att.retry !== undefined ? ` (retry ${att.retry})` : ""}`}
          />
        );
      })}
      
      {/* Fill with empty slots if needed to maintain alignment */}
      {showEmptySlots && attempts.length < limit && Array.from({ length: limit - attempts.length }).map((_, i) => (
        <div 
          key={`empty-${i}`} 
          className={`${boxWidth} ${boxHeight} rounded-sm bg-gray-50 border border-gray-100 flex-shrink-0`} 
        />
      ))}
    </div>
  );
};
