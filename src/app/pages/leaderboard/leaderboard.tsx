import { requestInfo } from "rwsdk/worker"
import { getLeaderboardData } from "./actions";
import { Histogram } from "@/app/components/histogram";

function formatWasteTime(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) {
    return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

export const Leaderboard = async () => {
  const url = new URL(requestInfo.request.url);
  const sortBy = url.searchParams.get("sort") || "rate";
  const rows = await getLeaderboardData(50, sortBy as any);

  const sortOptions = [
    { label: "Rate", value: "rate" },
    { label: "Flaky", value: "runs" },
    { label: "Waste Time", value: "waste" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Flakiness Leaderboard</h1>
        <div className="flex items-center gap-2 bg-gray-100 p-1 rounded-md text-sm border border-gray-200">
          <span className="px-2 text-gray-500 font-medium">Sort by:</span>
          {sortOptions.map((opt) => (
            <a
              key={opt.value}
              href={`?sort=${opt.value}`}
              className={`px-3 py-1 rounded-sm transition-colors ${
                sortBy === opt.value
                  ? "bg-white text-orange-600 font-bold shadow-sm"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              {opt.label}
            </a>
          ))}
        </div>
      </div>
      <div className="space-y-3">
        {rows.map((row) => (
          <div
            key={row.test_id}
            className="border border-gray-300 rounded-lg p-4 bg-white flex items-center gap-4"
          >
            {/* Test info */}
            <div className="flex-1 min-w-0">
              <div className="font-bold text-base mb-1">{row.title || "Untitled test"}</div>
              <div className="text-sm text-gray-600 truncate">{row.file || "Unknown file"}</div>
            </div>

            {/* Metrics */}
            <div className="flex items-center gap-6">
              {/* Rate */}
              <div className="text-right">
                <div className="text-xs text-gray-500">RATE</div>
                <div className="text-lg font-bold text-red-600">
                  {(row.flaky_rate * 100).toFixed(0)}%
                </div>
              </div>

              {/* Flaky/Total */}
              <div className="text-right min-w-[8rem]">
                <div className="text-xs text-gray-500 uppercase">Flaky / Total</div>
                <div className="text-lg font-bold">
                  {row.flaky_runs} / {row.total_runs}
                </div>
              </div>

              {/* Waste */}
              <div className="text-right">
                <div className="text-xs text-gray-500">WASTE</div>
                <div className="text-lg font-bold">
                  {formatWasteTime(row.waste_time_ms)}
                </div>
              </div>

              {/* Histogram */}
              <div className="flex items-center">
                <Histogram results={row.recent_results} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
