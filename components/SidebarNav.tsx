"use client";

import {
  IconChartBar,
  IconFileSpreadsheet,
  IconSettings,
  IconTarget,
  IconTrophy,
} from "@tabler/icons-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "./ui/cn";

const NAV_ITEMS = [
  { href: "/league-setup", label: "League Setup", Icon: IconSettings },
  { href: "/import-rankings", label: "Import Rankings", Icon: IconFileSpreadsheet },
  { href: "/draft-room", label: "Draft Room", Icon: IconTarget },
  { href: "/team-comparisons", label: "Team Comparisons", Icon: IconChartBar },
  { href: "/draft-results", label: "Draft Results", Icon: IconTrophy },
] as const;

/**
 * Persistent desktop navigation. The active destination is carried by a
 * darker surface and a solid left indicator — no accent color anywhere.
 */
export function SidebarNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="w-[212px] shrink-0 border-r border-fh-border bg-fh-surface"
    >
      <ul>
        {NAV_ITEMS.map(({ href, label, Icon }) => {
          const active = pathname === href;
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex h-11 items-center gap-3 pr-4 pl-6 text-fh-body transition-colors",
                  active
                    ? "bg-fh-selected font-semibold text-fh-ink"
                    : "font-medium text-fh-ink-2 hover:bg-fh-subtle hover:text-fh-ink",
                )}
              >
                {active && (
                  <span
                    aria-hidden
                    className="absolute top-0 left-0 h-full w-[3px] bg-fh-inverse"
                  />
                )}
                <Icon size={20} stroke={1.8} aria-hidden className="shrink-0" />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
