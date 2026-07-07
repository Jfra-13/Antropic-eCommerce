import { Link } from "wouter";

export type Crumb = { label: string; href?: string };

/** Contextual path. Last item renders as current (bold, no link). */
export function Breadcrumb({ items }: { items: Crumb[] }) {
  return (
    <nav className="flex flex-wrap items-center gap-1 text-xs md:text-sm font-sans text-muted-foreground" aria-label="Ruta">
      {items.map((item, i) => {
        const last = i === items.length - 1;
        return (
          <span key={i} className="flex items-center gap-1">
            {item.href && !last ? (
              <Link href={item.href} className="hover:text-primary transition-colors">{item.label}</Link>
            ) : (
              <span className={last ? "text-foreground font-bold" : undefined}>{item.label}</span>
            )}
            {!last && <span aria-hidden="true">/</span>}
          </span>
        );
      })}
    </nav>
  );
}
