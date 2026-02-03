import { listLogs } from "./log-actions";
import { requestInfo } from "rwsdk/worker";

export const Logs = async () => {
    const url = new URL(requestInfo.request.url);
    const runId = url.searchParams.get("runId") || undefined;
    const cursor = url.searchParams.get("cursor") || undefined;

    const { logs, cursor: nextCursor } = await listLogs(runId, 50, cursor);

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold">Ingestion Logs</h1>
                {runId && (
                    <a href="/admin/logs" className="text-sm text-blue-600 hover:underline">Clear Filter</a>
                )}
            </div>

            <div className="bg-white shadow rounded-lg overflow-hidden border border-gray-200">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Timestamp</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Event</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Run ID</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Message</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {logs.length === 0 ? (
                            <tr>
                                <td colSpan={4} className="px-6 py-4 text-center text-gray-500">No logs found</td>
                            </tr>
                        ) : (
                            logs.map((log) => (
                                <tr key={log.key} className="hover:bg-gray-50">
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        {new Date(log.timestamp).toLocaleString()}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full 
                      ${log.level === 'error' ? 'bg-red-100 text-red-800' :
                                                log.level === 'warn' ? 'bg-yellow-100 text-yellow-800' :
                                                    log.level === 'upload' ? 'bg-blue-100 text-blue-800' :
                                                        log.level === 'ingest_start' ? 'bg-indigo-100 text-indigo-800' :
                                                            log.level === 'ingest_complete' ? 'bg-green-100 text-green-800' :
                                                                'bg-gray-100 text-gray-800'}`}>
                                            {log.level}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-mono">
                                        <a href={`/admin/logs?runId=${log.runId}`} className="hover:underline text-blue-600">
                                            {log.runId}
                                        </a>
                                    </td>
                                    <td className="px-6 py-4 text-sm text-gray-900">
                                        <div>{log.message}</div>
                                        {log.context && (
                                            <pre className="mt-1 text-xs text-gray-500 overflow-x-auto">
                                                {JSON.stringify(log.context, null, 2)}
                                            </pre>
                                        )}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {nextCursor && (
                <div className="flex justify-center">
                    <a
                        href={`/admin/logs?cursor=${encodeURIComponent(nextCursor)}${runId ? `&runId=${runId}` : ""}`}
                        className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                    >
                        Load More
                    </a>
                </div>
            )}
        </div>
    );
};
