import { listRuns } from "./actions";
import { StatusIcon } from "../components/status-icon";
import { formatDuration } from "../shared/format";
import { Table, TableBody, TableCell, TableContainer, TableHeadCell, TableHeader, TableRow } from "../components/table";

const formatDate = (dateStr: string | null) => {
  if (!dateStr) return "-";
  try {
    return new Date(dateStr).toLocaleString();
  } catch (e) {
    return dateStr;
  }
};

export const Runs = async () => {
  const runs = await listRuns();
  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-bold">Runs</h1>
      <TableContainer>
        <Table>
          <TableHeader>
            <TableHeadCell>Run ID</TableHeadCell>
            <TableHeadCell>Context (Repo@Branch)</TableHeadCell>
            <TableHeadCell>PR User</TableHeadCell>
            <TableHeadCell>Start</TableHeadCell>
            <TableHeadCell className="text-right">
              <div className="flex items-center justify-end gap-1"><StatusIcon status="passed" /></div>
            </TableHeadCell>
            <TableHeadCell className="text-right">
              <div className="flex items-center justify-end gap-1"><StatusIcon status="skipped" /></div>
            </TableHeadCell>
            <TableHeadCell className="text-right">
              <div className="flex items-center justify-end gap-1"><StatusIcon status="flaky" /></div>
            </TableHeadCell>
            <TableHeadCell className="text-right">
              <div className="flex items-center justify-end gap-1"><StatusIcon status="failed" /></div>
            </TableHeadCell>
            <TableHeadCell className="text-right">Actions</TableHeadCell>
          </TableHeader>
          <TableBody>
            {runs.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="break-all">
                  <a className="underline" href={`/runs/${r.id}`}>{r.id}</a>
                </TableCell>
                <TableCell className="text-gray-500 italic text-xs truncate max-w-[250px]" title={`${r.repo}/${r.branch}@${r.commit_hash}`}>
                  {r.repo}/{r.branch}
                  <div className="text-[10px] text-gray-400 not-italic">@{r.commit_hash}</div>
                </TableCell>
                <TableCell>{r.pr_user}</TableCell>
                <TableCell>{formatDate(r.start_time)}</TableCell>
                <TableCell className="text-right">{r.expected_count}</TableCell>
                <TableCell className="text-right">{r.skipped_count}</TableCell>
                <TableCell className="text-right">{r.flaky_count}</TableCell>
                <TableCell className="text-right">{r.unexpected_count}</TableCell>
                <TableCell className="text-right">
                  <a 
                    href={`/runs/${r.id}`} 
                    className="text-black underline hover:no-underline text-xs"
                  >
                    View Run Details →
                  </a>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </div>
  );
};

