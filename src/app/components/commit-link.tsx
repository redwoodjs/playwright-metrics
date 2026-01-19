import React from "react";
import { formatCommit } from "../shared/format";
import { link } from "../shared/links";

interface CommitLinkProps {
  org: string;
  repo: string;
  branch: string;
  commit: string;
  user?: string;
  className?: string;
}

export const CommitLink: React.FC<CommitLinkProps> = ({ org, repo, branch, commit, user, className = "" }) => {
  return (
    <div className={`flex flex-col ${className}`}>
      <a className="underline font-mono text-[10px]" href={link("/runs/:org/:repo/*", { org, repo, $0: `${branch}/${commit}` } as any)}>
        {formatCommit(commit)}
      </a>
      {user && (
        <div className="text-[10px] text-gray-400">
          by {user}
        </div>
      )}
    </div>
  );
};
