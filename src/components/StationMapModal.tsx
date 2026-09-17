"use client";

import { useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { Station } from "@/lib/types";

const StationMap = dynamic(() => import("./StationMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center text-sm text-black/50 dark:text-white/50">
      Loading map&hellip;
    </div>
  ),
});

export default function StationMapModal({ stations }: { stations: Station[] }) {
  const [isOpen, setIsOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);

  const open = () => {
    setIsOpen(true);
    dialogRef.current?.showModal();
  };
  const close = () => {
    setIsOpen(false);
    dialogRef.current?.close();
  };

  return (
    <>
      <button
        type="button"
        onClick={open}
        className="shrink-0 rounded-md border border-black/15 dark:border-white/15 px-3 py-1.5 text-sm hover:border-black/30 dark:hover:border-white/30 transition-colors"
      >
        View station map
      </button>

      <dialog
        ref={dialogRef}
        onClose={() => setIsOpen(false)}
        onClick={(e) => {
          if (e.target === dialogRef.current) close();
        }}
        aria-label="Station locations map"
        className="w-[95vw] h-[85vh] sm:w-[min(90vw,900px)] sm:h-[min(85vh,650px)] max-w-none max-h-none rounded-lg border border-black/10 dark:border-white/10 bg-background text-foreground p-0 backdrop:bg-black/50 dark:backdrop:bg-black/70"
      >
        <div className="flex h-full flex-col p-4">
          <div className="flex items-center justify-between gap-2 pb-3">
            <h2 className="font-medium">Station Locations</h2>
            <button
              type="button"
              onClick={close}
              aria-label="Close map"
              className="text-black/50 dark:text-white/50 hover:text-black dark:hover:text-white"
            >
              &times;
            </button>
          </div>
          <div className="flex-1 overflow-hidden rounded-md border border-black/10 dark:border-white/10">
            {isOpen && <StationMap stations={stations} />}
          </div>
        </div>
      </dialog>
    </>
  );
}
