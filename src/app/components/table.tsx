import React from "react";

export const TableContainer = ({ children }: { children: React.ReactNode }) => (
  <div className="border border-black overflow-hidden bg-white shadow-sm">
    {children}
  </div>
);

export const Table = ({ children }: { children: React.ReactNode }) => (
  <table className="w-full text-left border-collapse">
    {children}
  </table>
);

export const TableHeader = ({ children }: { children: React.ReactNode }) => (
  <thead>
    <tr className="bg-gray-100 border-b border-black text-xs font-bold uppercase">
      {children}
    </tr>
  </thead>
);

export const TableBody = ({ children }: { children: React.ReactNode }) => (
  <tbody className="text-sm">
    {children}
  </tbody>
);

export const TableRow = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <tr className={`border-b border-gray-200 last:border-0 hover:bg-gray-50 ${className}`}>
    {children}
  </tr>
);

export const TableCell = ({ children, className = "", title, colSpan }: { children: React.ReactNode; className?: string; title?: string; colSpan?: number }) => (
  <td className={`px-1 py-2 ${className}`} title={title} colSpan={colSpan}>
    {children}
  </td>
);

export const TableHeadCell = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <th className={`px-1 py-2 ${className}`}>
    {children}
  </th>
);
