"use client";

/**
 * Client component for branch filtering
 */
export const BranchFilter = ({ branch, branches, sortBy }: { branch: string, branches: string[], sortBy: string }) => {
    return (
        <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500 font-medium">Branch:</span>
            <select
                className="text-sm border border-gray-300 rounded-md px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-orange-500"
                value={branch}
                onChange={(e) => {
                    const val = e.target.value;
                    const url = new URL(window.location.href);
                    if (val) url.searchParams.set("branch", val);
                    else url.searchParams.delete("branch");
                    // Ensure we keep the sort
                    if (sortBy) url.searchParams.set("sort", sortBy);
                    window.location.href = url.pathname + url.search;
                }}
            >
                <option value="">All branches</option>
                {branches.filter(Boolean).map((b) => (
                    <option key={b} value={b}>
                        {b}
                    </option>
                ))}
            </select>
        </div>
    );
};
