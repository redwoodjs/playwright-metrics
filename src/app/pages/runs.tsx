import { listRuns } from "./actions";
import { Table, TableBody, TableCell, TableContainer, TableHeadCell, TableHeader, TableRow } from "../components/table";
import { RunRow } from "../components/run-row";

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
            <TableHeadCell>Commit</TableHeadCell>
            <TableHeadCell>User</TableHeadCell>
            <TableHeadCell>Start</TableHeadCell>
            <TableHeadCell className="text-right">Results</TableHeadCell>
          </TableHeader>
          <TableBody>
            {runs.map((r) => (
              <RunRow
                key={r.id}
                id={r.id}
                repo={r.repo}
                branch={r.branch}
                commit={r.commit_hash}
                user={r.pr_user}
                startTime={r.start_time}
                expected={r.expected_count}
                skipped={r.skipped_count}
                flaky={r.flaky_count}
                unexpected={r.unexpected_count}
              />
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </div>
  );
};

