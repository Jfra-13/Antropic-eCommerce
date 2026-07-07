import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Horizontal product scroller with desktop arrow controls. Arrows enable/disable
 * based on remaining scroll on each side. Mobile keeps native swipe (arrows hidden).
 */
export function ProductCarousel({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  const update = () => {
    const el = ref.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 0);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  };

  useEffect(() => {
    update();
    const el = ref.current;
    if (!el) return;
    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      el.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  const scrollByDir = (dir: -1 | 1) => {
    const el = ref.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: "smooth" });
  };

  return (
    <div className="relative">
      <div ref={ref} className="overflow-x-auto hide-scrollbar -mx-4 px-4">
        <div className="flex gap-4 md:gap-6">{children}</div>
      </div>

      <button
        type="button"
        onClick={() => scrollByDir(-1)}
        disabled={!canLeft}
        aria-label="Anterior"
        className="hidden md:flex absolute left-0 top-[42%] -translate-y-1/2 z-10 w-11 h-11 items-center justify-center rounded-full bg-background/70 backdrop-blur-md text-muted-foreground transition-opacity disabled:opacity-30 disabled:pointer-events-none hover:text-foreground"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
      </button>
      <button
        type="button"
        onClick={() => scrollByDir(1)}
        disabled={!canRight}
        aria-label="Siguiente"
        className="hidden md:flex absolute right-0 top-[42%] -translate-y-1/2 z-10 w-11 h-11 items-center justify-center rounded-full bg-background/70 backdrop-blur-md text-muted-foreground transition-opacity disabled:opacity-30 disabled:pointer-events-none hover:text-foreground"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
      </button>
    </div>
  );
}
