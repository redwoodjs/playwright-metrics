import { listFlakiestTests } from "./actions";
import { Table, TableBody, TableCell, TableContainer, TableHeadCell, TableHeader, TableRow } from "../components/table";

const formatDate = (dateStr: string | null) => {
  if (!dateStr) return "-";
  try {
    return new Date(dateStr).toLocaleString();
  } catch (e) {
    return dateStr;
  }
};

export const Flakiest = async () => {
  const rows = await listFlakiestTests(50);
  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-bold">Flakiest tests</h1>
      <TableContainer>
        <Table>
          <TableHeader>
            <TableHeadCell>Test</TableHeadCell>
            <TableHeadCell>File</TableHeadCell>
            <TableHeadCell className="text-right">Flaky Rate</TableHeadCell>
            <TableHeadCell className="text-right">Instability Rate</TableHeadCell>
            <TableHeadCell className="text-right">Flaky Runs</TableHeadCell>
            <TableHeadCell className="text-right">Total Runs</TableHeadCell>
            <TableHeadCell className="text-right">Retries</TableHeadCell>
            <TableHeadCell className="text-right">Retry Time (ms)</TableHeadCell>
            <TableHeadCell>Last Flaky</TableHeadCell>
            <TableHeadCell>Bucket</TableHeadCell>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.test_id}>
                <TableCell>
                  <a href={`/test-summary/${r.test_id}`} className="hover:underline text-black font-medium">
                    {r.title}
                  </a>
                </TableCell>
                <TableCell className="break-all">{r.file}</TableCell>
                <TableCell className="text-right">{(r.flaky_rate * 100).toFixed(0)}%</TableCell>
                <TableCell className="text-right">{(r.fail_rate * 100).toFixed(0)}%</TableCell>
                <TableCell className="text-right">{r.flaky_runs}</TableCell>
                <TableCell className="text-right">{r.total_runs}</TableCell>
                <TableCell className="text-right">{r.retry_count_total ?? 0}</TableCell>
                <TableCell className="text-right">{r.retry_duration_total_ms ?? 0}</TableCell>
                <TableCell>{formatDate(r.last_flaky_start_time ?? null)}</TableCell>
                <TableCell>{r.bucket}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </div>
  );
};

