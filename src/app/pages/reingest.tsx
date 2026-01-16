import { listR2Objects } from "./reingest-actions";

export const Reingest = async () => {
  const prGroups = await listR2Objects();

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Re-ingest R2 Data</h1>
      <p className="text-sm text-gray-600">
        Select files to re-ingest from R2 bucket. Files are grouped by Pull Request.
      </p>

      <form method="POST" action="/admin/reingest" className="space-y-6">
        {prGroups.map((group, groupIdx) => (
          <div key={groupIdx} className="border border-black p-4 space-y-2">
            <div className="flex items-center gap-2 mb-3">
              <input
                type="checkbox"
                id={`group-${groupIdx}`}
                className="group-checkbox"
                data-group={groupIdx}
                onChange={(e) => {
                  const checkboxes = document.querySelectorAll(
                    `input[data-group-item="${groupIdx}"]`
                  ) as NodeListOf<HTMLInputElement>;
                  checkboxes.forEach((cb) => (cb.checked = e.currentTarget.checked));
                }}
              />
              <label htmlFor={`group-${groupIdx}`} className="font-semibold cursor-pointer">
                {group.prTitle || `No PR - ${group.objects[0]?.repo}/${group.objects[0]?.branch}`}
              </label>
              {group.prHref && (
                <a
                  href={group.prHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm underline text-blue-600"
                >
                  View PR
                </a>
              )}
              {group.prUser && (
                <span className="text-sm text-gray-500">by {group.prUser}</span>
              )}
              <span className="text-sm text-gray-500">
                ({group.objects.length} {group.objects.length === 1 ? "file" : "files"})
              </span>
            </div>

            <div className="pl-6 space-y-1">
              {group.objects.map((obj) => (
                <div key={obj.key} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="keys"
                    value={obj.key}
                    id={`obj-${obj.key}`}
                    data-group-item={groupIdx}
                    className="object-checkbox"
                  />
                  <label htmlFor={`obj-${obj.key}`} className="cursor-pointer flex-1">
                    <span className="font-mono text-xs">
                      {obj.repo}/{obj.branch}/{obj.commit.substring(0, 7)}/{obj.runId}
                    </span>
                    {obj.uploaded && (
                      <span className="text-gray-500 ml-2">
                        (uploaded: {new Date(obj.uploaded).toLocaleDateString()})
                      </span>
                    )}
                  </label>
                </div>
              ))}
            </div>
          </div>
        ))}

        <div className="flex gap-2">
          <button
            type="submit"
            className="px-4 py-2 bg-black text-white hover:bg-gray-800"
          >
            Re-ingest Selected Files
          </button>
          <button
            type="button"
            onClick={() => {
              const checkboxes = document.querySelectorAll(
                'input[type="checkbox"]'
              ) as NodeListOf<HTMLInputElement>;
              checkboxes.forEach((cb) => (cb.checked = true));
            }}
            className="px-4 py-2 border border-black hover:bg-gray-100"
          >
            Select All
          </button>
          <button
            type="button"
            onClick={() => {
              const checkboxes = document.querySelectorAll(
                'input[type="checkbox"]'
              ) as NodeListOf<HTMLInputElement>;
              checkboxes.forEach((cb) => (cb.checked = false));
            }}
            className="px-4 py-2 border border-black hover:bg-gray-100"
          >
            Deselect All
          </button>
        </div>
      </form>
    </div>
  );
};
