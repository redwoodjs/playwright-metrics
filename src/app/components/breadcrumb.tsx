import React from "react";

export interface BreadcrumbItem {
  label: string | React.ReactNode;
  href?: string;
  active?: boolean;
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
  actions?: React.ReactNode;
}

export const Breadcrumb: React.FC<BreadcrumbProps> = ({ items, actions }) => {
  return (
    <div className="flex items-center justify-between mb-4">
      <nav className="flex items-center gap-2 text-sm text-gray-500">
        {items.map((item, index) => (
          <React.Fragment key={index}>
            {index > 0 && <span className="text-gray-400 mx-0.5">›</span>}
            {item.href && !item.active ? (
              <a href={item.href} className="hover:underline hover:text-black">
                {item.label}
              </a>
            ) : (
              <span className={item.active ? "font-bold text-black" : ""}>
                {item.label}
              </span>
            )}
          </React.Fragment>
        ))}
      </nav>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
};
