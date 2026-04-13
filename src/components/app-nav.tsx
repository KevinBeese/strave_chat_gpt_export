import Link from "next/link";

type AppNavProps = {
  current: "dashboard" | "activities" | "settings";
};

const items: Array<{ key: AppNavProps["current"]; label: string; href: string }> = [
  { key: "dashboard", label: "Dashboard", href: "/dashboard" },
  { key: "activities", label: "Activities", href: "/activities" },
  { key: "settings", label: "Settings", href: "/settings" },
];

export function AppNav({ current }: AppNavProps) {
  return (
    <nav className="flex flex-wrap gap-2 text-sm" aria-label="Hauptnavigation">
      {items.map((item) => {
        const isCurrent = item.key === current;
        return (
          <Link
            key={item.key}
            className={
              isCurrent
                ? "rounded-full bg-black/90 px-4 py-2 font-medium text-white"
                : "rounded-full border border-black/10 bg-white px-4 py-2 text-black/75 hover:bg-black/5"
            }
            href={item.href}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
