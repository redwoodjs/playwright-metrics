import { listFlakiestTests } from "./actions";

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
      <div className="overflow-x-auto">
        <table className="w-full table-auto border-collapse border border-black text-sm">
          <colgroup>
            <col className="w-[28%]" />
            <col className="w-[24%]" />
            <col className="w-[10%]" />
            <col className="w-[10%]" />
            <col className="w-[8%]" />
            <col className="w-[8%]" />
            <col className="w-[12%]" />
            <col className="w-[8%]" />
          </colgroup>
          <thead>
            <tr>
              <th className="border border-black p-2 text-left">Test</th>
              <th className="border border-black p-2 text-left">File</th>
              <th className="border border-black p-2 text-right">Flaky Rate</th>
              <th className="border border-black p-2 text-right">Instability Rate</th>
              <th className="border border-black p-2 text-right">Flaky Runs</th>
              <th className="border border-black p-2 text-right">Total Runs</th>
              <th className="border border-black p-2 text-right">Retries</th>
              <th className="border border-black p-2 text-right">Retry Time (ms)</th>
              <th className="border border-black p-2 text-left">Last Flaky</th>
              <th className="border border-black p-2 text-left">Bucket</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.test_id}>
                <td className="border border-black p-2 align-top">
                  <a href={`/tests/${r.test_id}`} className="hover:underline text-black font-medium">
                    {r.title}
                  </a>
                </td>
                <td className="border border-black p-2 align-top break-all">{r.file}</td>
                <td className="border border-black p-2 text-right align-top">{(r.flaky_rate * 100).toFixed(0)}%</td>
                <td className="border border-black p-2 text-right align-top">{(r.fail_rate * 100).toFixed(0)}%</td>
                <td className="border border-black p-2 text-right align-top">{r.flaky_runs}</td>
                <td className="border border-black p-2 text-right align-top">{r.total_runs}</td>
                <td className="border border-black p-2 text-right align-top">{r.retry_count_total ?? 0}</td>
                <td className="border border-black p-2 text-right align-top">{r.retry_duration_total_ms ?? 0}</td>
                <td className="border border-black p-2 align-top">{formatDate(r.last_flaky_start_time ?? null)}</td>
                <td className="border border-black p-2 align-top">{r.bucket}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

