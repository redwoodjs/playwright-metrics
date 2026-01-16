import { listRuns } from "./actions";
import { StatusIcon } from "../components/status-icon";

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
      <div className="overflow-x-auto">
        <table className="w-full table-auto border-collapse border border-black text-sm">
          <colgroup>
            <col className="w-[22ch]" />
            <col className="w-[20ch]" />
            <col className="w-[18ch]" />
            <col className="w-[24ch]" />
            <col className="w-[14ch]" />
            <col className="w-[24ch]" />
            <col className="w-[14ch]" />
            <col className="w-[10ch]" />
            <col className="w-[10ch]" />
            <col className="w-[10ch]" />
            <col className="w-[12ch]" />
          </colgroup>
          <thead>
            <tr className="bg-gray-100">
              <th className="border border-black p-2 text-left">Run ID</th>
              <th className="border border-black p-2 text-left">Repo</th>
              <th className="border border-black p-2 text-left">Branch</th>
              <th className="border border-black p-2 text-left">Commit</th>
              <th className="border border-black p-2 text-left">PR User</th>
              <th className="border border-black p-2 text-left">Start</th>
              <th className="border border-black p-2 text-left">Duration (ms)</th>
              <th className="border border-black p-2 text-right">
                <div className="flex items-center justify-end gap-1"><StatusIcon status="passed" /></div>
              </th>
              <th className="border border-black p-2 text-right">
                <div className="flex items-center justify-end gap-1"><StatusIcon status="skipped" /></div>
              </th>
              <th className="border border-black p-2 text-right">
                <div className="flex items-center justify-end gap-1"><StatusIcon status="flaky" /></div>
              </th>
              <th className="border border-black p-2 text-right">
                <div className="flex items-center justify-end gap-1"><StatusIcon status="failed" /></div>
              </th>
            </tr>
          </thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.id}>
                <td className="border border-black p-2 align-top break-all">
                  <a className="underline" href={`/runs/${r.id}`}>{r.id}</a>
                </td>
                <td className="border border-black p-2 align-top">{r.repo}</td>
                <td className="border border-black p-2 align-top">{r.branch}</td>
                <td className="border border-black p-2 align-top break-all" title={r.commit_href ?? ""}>{r.commit_hash}</td>
                <td className="border border-black p-2 align-top">{r.pr_user}</td>
                <td className="border border-black p-2 align-top">{formatDate(r.start_time)}</td>
                <td className="border border-black p-2 align-top">{r.duration_ms}</td>
                <td className="border border-black p-2 text-right align-top">{r.expected_count}</td>
                <td className="border border-black p-2 text-right align-top">{r.skipped_count}</td>
                <td className="border border-black p-2 text-right align-top">{r.flaky_count}</td>
                <td className="border border-black p-2 text-right align-top">{r.unexpected_count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

