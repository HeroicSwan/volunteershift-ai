"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDays,
  FlaskConical,
  HandHeart,
  LayoutDashboard,
  Sparkles,
  UsersRound,
} from "lucide-react";
import { useVolunteerMatcherData } from "@/components/data-provider";
import { SeedDataButton } from "@/components/seed-data-button";
import { cn } from "@/lib/utils";

const navigation = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/workers", label: "Staff", icon: UsersRound },
  { href: "/shifts", label: "Shifts", icon: CalendarDays },
  { href: "/generate", label: "Generate", icon: Sparkles },
  { href: "/results", label: "Results", icon: HandHeart },
  ...(process.env.NODE_ENV === "development"
    ? [{ href: "/admin/evaluations", label: "Evals", icon: FlaskConical }]
    : []),
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { hydrated, workers, shifts, isSampleData } = useVolunteerMatcherData();
  const hasData = workers.length > 0 || shifts.length > 0;

  return (
    <div className="min-h-screen bg-oat text-ink">
      <a
        href="#main-content"
        className="fixed left-4 top-4 z-[100] -translate-y-24 rounded-2xl bg-sand px-4 py-3 text-sm font-semibold text-moss shadow-lg transition focus:translate-y-0"
      >
        Skip to main content
      </a>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-moss px-4 py-5 text-sand lg:flex">
        <Link href="/" className="flex items-center gap-3 px-3 py-2">
          <span className="grid size-10 place-items-center rounded-2xl bg-sand/15">
            <HandHeart size={22} strokeWidth={1.8} />
          </span>
          <span>
            <span className="block text-sm font-semibold tracking-[-0.02em]">VolunteerShift AI</span>
            <span className="mt-0.5 block text-[11px] text-sand/80">Scheduling workspace</span>
          </span>
        </Link>

        <nav className="mt-8 space-y-1" aria-label="Main navigation">
          {navigation.map(({ href, label, icon: Icon }) => {
            const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-11 items-center gap-3 rounded-2xl px-3.5 text-sm font-medium transition duration-300",
                  active ? "bg-sand text-moss" : "text-sand/80 hover:bg-sand/10 hover:text-sand",
                )}
              >
                <Icon size={18} strokeWidth={1.8} />
                {label}
              </Link>
            );
          })}
        </nav>

        {hydrated && !hasData && (
          <div className="mt-auto rounded-3xl bg-sand/10 p-4">
            <p className="text-sm font-semibold">Explore the workspace</p>
            <p className="mt-1 text-xs leading-5 text-sand/80">
              Add a sample team roster and one week of shifts.
            </p>
            <div className="mt-4">
              <SeedDataButton compact />
            </div>
          </div>
        )}

        <div className="mt-5 flex items-center gap-3 border-t border-sand/15 px-2 pt-5">
          <div className="grid size-9 place-items-center rounded-full bg-sage text-moss text-xs font-bold">VM</div>
          <div>
            <p className="text-xs font-semibold">Your organization</p>
            <p className="mt-0.5 text-[11px] text-sand/80">Local workspace</p>
          </div>
        </div>
      </aside>

      <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-moss/10 bg-oat/90 px-4 backdrop-blur-xl lg:hidden">
        <Link href="/" className="flex items-center gap-2.5 text-sm font-semibold tracking-[-0.02em]">
          <span className="grid size-9 place-items-center rounded-2xl bg-moss text-sand">
            <HandHeart size={19} strokeWidth={1.8} />
          </span>
          VolunteerShift AI
        </Link>
        <span className="grid size-8 place-items-center rounded-full bg-sage text-moss text-[11px] font-bold">VM</span>
      </header>

      <main id="main-content" className="relative pb-28 lg:ml-64 lg:pb-0">
        {isSampleData && (
          <div className="border-b border-moss/10 bg-sage/20 px-5 py-2.5 text-center text-xs font-medium text-ink-soft sm:text-sm">
            You’re viewing sample data. Changes are stored only in this browser.
          </div>
        )}
        <div className="mx-auto max-w-[1500px] px-4 py-7 sm:px-7 sm:py-9 xl:px-10">{children}</div>
      </main>

      <nav
        className={cn(
          "fixed inset-x-3 bottom-3 z-30 grid rounded-3xl border border-moss/15 bg-sand/95 p-1.5 shadow-[0_16px_40px_rgba(96,108,56,0.18)] backdrop-blur-xl lg:hidden",
          navigation.length === 6 ? "grid-cols-6" : "grid-cols-5",
        )}
        aria-label="Mobile navigation"
      >
        {navigation.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-12 flex-col items-center justify-center gap-1 rounded-2xl text-[10px] font-semibold transition duration-300",
                active ? "bg-moss text-sand" : "text-ink-soft hover:bg-sage/15",
              )}
            >
              <Icon size={17} strokeWidth={1.8} />
              {label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
