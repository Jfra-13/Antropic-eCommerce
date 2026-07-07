import { Link } from "wouter";

type Item = { label: string; value: string | null };

interface CategoryPillsProps {
  items: Item[];
  active?: string | null;
  // Link mode (Home): each pill navigates. Callback mode (Search): controlled.
  hrefFor?: (value: string | null) => string;
  onSelect?: (value: string | null) => void;
}

const pillClass = (isActive: boolean) =>
  `flex-none whitespace-nowrap border px-4 py-2 text-sm font-sans font-bold transition-colors ${
    isActive
      ? "bg-foreground text-background border-foreground"
      : "bg-background text-foreground border-border hover:border-foreground"
  }`;

export function CategoryPills({ items, active, hrefFor, onSelect }: CategoryPillsProps) {
  return (
    <div className="overflow-x-auto hide-scrollbar">
      <div className="flex gap-2 w-max px-1 py-1">
        {items.map((item) => {
          const isActive = active === item.value;
          if (hrefFor) {
            return (
              <Link key={item.label} href={hrefFor(item.value)} className={pillClass(isActive)}>
                {item.label}
              </Link>
            );
          }
          return (
            <button
              key={item.label}
              type="button"
              onClick={() => onSelect?.(item.value)}
              className={pillClass(isActive)}
            >
              {item.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
