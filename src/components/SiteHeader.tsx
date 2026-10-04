"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export interface NavigationStation {
  code: string;
  name: string;
}

export default function SiteHeader({ stations }: { stations: NavigationStation[] }) {
  const pathname = usePathname();
  const [stationsOpen, setStationsOpen] = useState(false);
  const stationsMenuRef = useRef<HTMLDivElement>(null);
  const stationsButtonRef = useRef<HTMLButtonElement>(null);
  const mobileDialogRef = useRef<HTMLDialogElement>(null);
  const mobileButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!stationsOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!stationsMenuRef.current?.contains(event.target as Node)) {
        setStationsOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setStationsOpen(false);
        stationsButtonRef.current?.focus();
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [stationsOpen]);

  useEffect(() => {
    return () => {
      document.documentElement.style.overflow = "";
    };
  }, []);

  const openMobileMenu = () => {
    const dialog = mobileDialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    document.documentElement.style.overflow = "hidden";
    requestAnimationFrame(() => dialog.querySelector<HTMLAnchorElement>("a")?.focus());
  };

  const closeMobileMenu = () => {
    const dialog = mobileDialogRef.current;
    if (!dialog?.open) return;
    dialog.close();
  };

  const handleMobileClose = () => {
    document.documentElement.style.overflow = "";
    mobileButtonRef.current?.focus();
  };

  const closeNavigation = () => {
    setStationsOpen(false);
    closeMobileMenu();
  };

  const dashboardActive = pathname === "/";
  const stationsActive = pathname.startsWith("/station/");
  const mapActive = pathname === "/map";

  return (
    <header className="border-b border-black/10 dark:border-white/10">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4">
        <Link
          href="/"
          className="shrink-0 font-semibold tracking-tight"
          onClick={closeNavigation}
        >
          <span className="hidden sm:inline">Harrison Water Levels</span>
          <span className="sm:hidden">Water Levels</span>
        </Link>

        <nav className="hidden min-w-0 flex-1 items-center gap-1 md:flex" aria-label="Primary navigation">
          <NavigationLink href="/" active={dashboardActive}>
            Dashboard
          </NavigationLink>

          <div className="relative" ref={stationsMenuRef}>
            <button
              ref={stationsButtonRef}
              type="button"
              aria-expanded={stationsOpen}
              aria-controls="desktop-stations-menu"
              onClick={() => setStationsOpen((open) => !open)}
              className={navigationClass(stationsActive)}
            >
              Stations
              <span aria-hidden="true" className="text-xs">
                {stationsOpen ? "▴" : "▾"}
              </span>
            </button>
            {stationsOpen && (
              <div
                id="desktop-stations-menu"
                className="absolute left-0 top-full z-50 mt-2 max-h-[min(70vh,30rem)] w-80 overflow-y-auto rounded-lg border border-black/10 bg-white p-2 shadow-lg dark:border-white/10 dark:bg-neutral-950"
              >
                <StationLinks stations={stations} pathname={pathname} onNavigate={closeNavigation} />
              </div>
            )}
          </div>

          <NavigationLink href="/map" active={mapActive}>
            Station Map
          </NavigationLink>
        </nav>

        <a
          href="https://wateroffice.ec.gc.ca/"
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto hidden text-xs text-black/50 underline-offset-4 hover:underline dark:text-white/50 lg:block"
        >
          Data: ECCC <span aria-hidden="true">↗</span>
          <span className="sr-only"> (opens in a new tab)</span>
        </a>

        <button
          ref={mobileButtonRef}
          type="button"
          onClick={openMobileMenu}
          aria-label="Open navigation"
          aria-haspopup="dialog"
          className="ml-auto flex h-11 w-11 items-center justify-center rounded-md border border-black/15 text-xl dark:border-white/15 md:hidden"
        >
          <span aria-hidden="true">☰</span>
        </button>
      </div>

      <dialog
        ref={mobileDialogRef}
        aria-label="Navigation"
        onClose={handleMobileClose}
        onClick={(event) => {
          if (event.target === mobileDialogRef.current) closeMobileMenu();
        }}
        className="m-0 ml-auto h-dvh max-h-none w-[min(88vw,24rem)] max-w-none border-0 border-l border-black/10 bg-white p-0 text-black backdrop:bg-black/45 dark:border-white/10 dark:bg-neutral-950 dark:text-white dark:backdrop:bg-black/70"
      >
        <div className="flex h-full flex-col">
          <div className="flex h-16 shrink-0 items-center justify-between border-b border-black/10 px-4 dark:border-white/10">
            <h2 className="font-medium">Navigation</h2>
            <button
              type="button"
              onClick={closeMobileMenu}
              aria-label="Close navigation"
              className="flex h-11 w-11 items-center justify-center rounded-md text-2xl text-black/60 hover:bg-black/5 dark:text-white/60 dark:hover:bg-white/10"
            >
              <span aria-hidden="true">×</span>
            </button>
          </div>

          <nav className="flex-1 overflow-y-auto p-4" aria-label="Mobile navigation">
            <div className="space-y-1">
              <MobileNavigationLink href="/" active={dashboardActive} onClick={closeNavigation}>
                Dashboard
              </MobileNavigationLink>
              <MobileNavigationLink href="/map" active={mapActive} onClick={closeNavigation}>
                Station Map
              </MobileNavigationLink>
            </div>

            <details className="mt-4" open={stationsActive}>
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between rounded-md px-3 py-2 font-medium hover:bg-black/5 dark:hover:bg-white/10">
                Stations
                <span aria-hidden="true">▾</span>
              </summary>
              <div className="mt-1 border-l border-black/10 pl-2 dark:border-white/10">
                <StationLinks stations={stations} pathname={pathname} onNavigate={closeNavigation} />
              </div>
            </details>
          </nav>

          <div className="shrink-0 border-t border-black/10 p-4 text-sm dark:border-white/10">
            <a
              href="https://wateroffice.ec.gc.ca/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-black/60 underline underline-offset-4 dark:text-white/60"
            >
              Data source: ECCC <span aria-hidden="true">↗</span>
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          </div>
        </div>
      </dialog>
    </header>
  );
}

function NavigationLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link href={href} aria-current={active ? "page" : undefined} className={navigationClass(active)}>
      {children}
    </Link>
  );
}

function MobileNavigationLink({
  href,
  active,
  onClick,
  children,
}: {
  href: string;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      onClick={onClick}
      className={`flex min-h-11 items-center rounded-md px-3 py-2 font-medium transition-colors ${
        active
          ? "bg-black text-white dark:bg-white dark:text-black"
          : "hover:bg-black/5 dark:hover:bg-white/10"
      }`}
    >
      {children}
    </Link>
  );
}

function StationLinks({
  stations,
  pathname,
  onNavigate,
}: {
  stations: NavigationStation[];
  pathname: string;
  onNavigate: () => void;
}) {
  return (
    <ul>
      {stations.map((station) => {
        const href = `/station/${station.code}`;
        const active = pathname === href;
        return (
          <li key={station.code}>
            <Link
              href={href}
              aria-current={active ? "page" : undefined}
              onClick={onNavigate}
              className={`block rounded-md px-3 py-2 transition-colors ${
                active
                  ? "bg-black text-white dark:bg-white dark:text-black"
                  : "hover:bg-black/5 dark:hover:bg-white/10"
              }`}
            >
              <span className="block text-sm font-medium">{station.name}</span>
              <span className={`block text-xs ${active ? "opacity-70" : "text-black/45 dark:text-white/45"}`}>
                {station.code}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function navigationClass(active: boolean): string {
  return `flex min-h-10 items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
    active
      ? "bg-black text-white dark:bg-white dark:text-black"
      : "text-black/65 hover:bg-black/5 hover:text-black dark:text-white/65 dark:hover:bg-white/10 dark:hover:text-white"
  }`;
}
