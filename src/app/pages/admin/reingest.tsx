import { listR2Objects } from "./reingest-actions";
import { ReingestForm } from "./reingest-form";

export const Reingest = async () => {
  const branchGroups = await listR2Objects();

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Re-ingest R2 Data</h1>
      <p className="text-sm text-gray-600">
        Select files to re-ingest from R2 bucket. Files are grouped by Branch.
      </p>

      {branchGroups.length === 0 ? (
        <div className="border border-black p-4">
          <p>No R2 objects found in the bucket.</p>
        </div>
      ) : (
        <ReingestForm prGroups={branchGroups} />
      )}
    </div>
  );
};
