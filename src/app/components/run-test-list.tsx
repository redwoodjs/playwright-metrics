"use client";

import React, { useState, useMemo } from "react";
import { Table, TableBody, TableCell, TableContainer, TableHeadCell, TableHeader, TableRow } from "./table";
import { StatusIcon } from "./status-icon";
import { type RunTestRow } from "@/app/pages/actions";
import { AttemptHistory } from "./attempt-history";

interface RunTestListProps {
  tests: RunTestRow[];
  runStats: {
    expected: number;
    skipped: number;
    flaky: number;
    unexpected: number;
  };
}

export const RunTestList: React.FC<RunTestListProps> = ({ tests, runStats }) => {
  const [filter, setFilter] = useState<string | null>(null);

  const filteredTests = useMemo(() => {
    if (!filter) return tests;
    return tests.filter((t) => {
      if (filter === "passed") return t.final_status === "passed" && !t.was_flaky;
      if (filter === "skipped") return t.final_status === "skipped" || t.status === "skipped";
      if (filter === "flaky") return t.was_flaky;
      if (filter === "failed") return t.final_status === "failed" || t.final_status === "timedOut" || t.final_status === "interrupted";
      return true;
    });
  }, [tests, filter]);

  const handleStatusClick = (status: string | null) => {
    setFilter(prev => prev === status ? null : status);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between ">
        <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider">
          Results {filter ? `(${filter})` : ""}
        </h2>
        <div className="flex items-center justify-end gap-x-4 tabular-nums text-xs min-w-max">
          {[
            { label: "passed", count: runStats.expected },
            { label: "skipped", count: runStats.skipped },
            { label: "flaky", count: runStats.flaky },
            { label: "failed", count: runStats.unexpected },
          ].map((item) => (
            <div 
              key={item.label}
              onClick={() => handleStatusClick(item.label)}
              className={`cursor-pointer hover:bg-gray-50 p-1 rounded transition-colors ${
                filter === item.label ? 'bg-gray-100 ring-1 ring-gray-200' : ''
              }`}
            >
              <StatusIcon status={item.label} result={item.label + ' ' +item.count} />
            </div>
          ))}
        </div>
      </div>

      <TableContainer>
        <Table>
          <TableHeader>
            <TableHeadCell>Spec</TableHeadCell>
            <TableHeadCell>Project</TableHeadCell>
            <TableHeadCell>Attempts</TableHeadCell>
            <TableHeadCell>Status</TableHeadCell>
          </TableHeader>
          <TableBody>
            {filteredTests.map((test) => (
              <TableRow key={test.id}>
                <TableCell>
                  <a 
                    href={`/specs/${test.test_id}`}
                    className="flex flex-col group"
                  >
                    <div className="font-medium text-xs truncate max-w-[400px] hover:underline" title={test.title ?? ""}>
                      {test.title}
                    </div>
                    <div className="text-[10px] text-gray-400 truncate max-w-[400px]" title={`${test.file}:${test.line}`}>
                      {test.file}:{test.line}
                    </div>
                  </a>
                </TableCell>
                <TableCell className="text-xs text-gray-500 italic">
                  {test.project_name}
                </TableCell>
                <TableCell>
                  <AttemptHistory 
                    attempts={test.attempt_statuses.map(status => ({ status }))} 
                    limit={12} 
                    showEmptySlots={false}
                  />
                </TableCell>
                <TableCell>
                  <StatusIcon status={test.final_status ?? ""} result={test.final_status ?? ""} was_flaky={test.was_flaky} />
                </TableCell>
              </TableRow>
            ))}
            {filteredTests.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-12 text-center text-gray-500 italic">
                  No tests match the current filter.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </div>
  );
};
