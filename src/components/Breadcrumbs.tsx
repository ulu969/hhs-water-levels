import Link from "next/link";

export default function Breadcrumbs({ current }: { current: string }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-4 text-sm text-black/55 dark:text-white/55">
      <ol className="flex flex-wrap items-center gap-2">
        <li>
          <Link href="/" className="underline-offset-4 hover:underline">
            Dashboard
          </Link>
        </li>
        <li aria-hidden="true">/</li>
        <li aria-current="page" className="text-black dark:text-white">
          {current}
        </li>
      </ol>
    </nav>
  );
}
