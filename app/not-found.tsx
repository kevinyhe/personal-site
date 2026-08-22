import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 text-center text-[#f0f0f0]">
      <p className="text-[0.8rem] uppercase tracking-[0.2em] opacity-50">404</p>
      <h1 className="mt-4 font-serif-display text-[clamp(2.5rem,8vw,5rem)] italic leading-none">
        Page not found.
      </h1>
      <Link
        className="mt-8 text-[0.85rem] uppercase tracking-[0.04em] underline underline-offset-4 transition-opacity duration-200 hover:opacity-60"
        href="/"
      >
        Back home
      </Link>
    </main>
  );
}
