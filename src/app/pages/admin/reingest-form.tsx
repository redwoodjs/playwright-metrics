"use client";

import type { BranchGroup } from "./reingest-actions";

type ReingestFormProps = {
  prGroups: BranchGroup[];
};

export const ReingestForm = ({ prGroups }: ReingestFormProps) => {
  return (
    <form method="POST" action="/admin/reingest" className="space-y-6">
      {prGroups.map((group, groupIdx) => {
        // Collect unique PRs in this branch group for display
        const prs = new Map<string, { title: string; href: string }>();
        group.objects.forEach((obj) => {
          if (obj.prHref && obj.prTitle) {
            prs.set(obj.prHref, { title: obj.prTitle, href: obj.prHref });
          }
        });

        return (
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
                  checkboxes.forEach(
                    (cb) => (cb.checked = e.currentTarget.checked)
                  );
                }}
              />
              <label
                htmlFor={`group-${groupIdx}`}
                className="font-semibold cursor-pointer"
              >
                {group.repo} / {group.branch}
              </label>
              <span className="text-sm text-gray-500">
                ({group.objects.length}{" "}
                {group.objects.length === 1 ? "file" : "files"})
              </span>
            </div>

            {prs.size > 0 && (
              <div className="pl-6 mb-2 flex flex-wrap gap-x-4 gap-y-1">
                {Array.from(prs.values()).map((pr) => (
                  <a
                    key={pr.href}
                    href={pr.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs underline text-blue-600 truncate max-w-xs"
                    title={pr.title}
                  >
                    PR: {pr.title}
                  </a>
                ))}
              </div>
            )}

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
                  <label
                    htmlFor={`obj-${obj.key}`}
                    className="cursor-pointer flex-1"
                  >
                    <span className="font-mono text-xs">
                      {obj.commit.substring(0, 7)}/{obj.runId}
                    </span>
                    {obj.prUser && (
                      <span className="text-gray-500 ml-2">
                        by {obj.prUser}
                      </span>
                    )}
                    {obj.uploaded && (
                      <span className="text-gray-500 ml-2">
                        ({new Date(obj.uploaded).toLocaleDateString()})
                      </span>
                    )}
                  </label>
                </div>
              ))}
            </div>
          </div>
        );
      })}

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
  );
};
