import { Link } from "wouter";

interface CategoryCardProps {
  label: string;
  image: string;
  active?: boolean;
  href?: string;
  onClick?: () => void;
}

export function CategoryCard({ label, image, active, href, onClick }: CategoryCardProps) {
  const inner = (
    <>
      <div
        className={`w-20 h-20 md:w-28 md:h-28 rounded-2xl overflow-hidden border-2 transition-all duration-300 ${
          active
            ? "border-[#EA4C75] ring-2 ring-[#EA4C75]/30"
            : "border-[#f0c4d0] group-hover:border-[#EA4C75]"
        }`}
      >
        <img
          src={image}
          alt={label}
          className="w-full h-full object-cover object-top transition-transform duration-300 group-hover:scale-105"
        />
      </div>
      <span
        className={`text-xs md:text-sm font-sans font-bold text-center transition-colors ${
          active ? "text-[#EA4C75]" : "text-[#8a4a5f] group-hover:text-[#EA4C75]"
        }`}
      >
        {label}
      </span>
    </>
  );

  const className =
    "group flex-none flex flex-col items-center gap-2 cursor-pointer focus:outline-none";

  if (href) {
    return (
      <Link href={href} className={className}>
        {inner}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} className={className}>
      {inner}
    </button>
  );
}
