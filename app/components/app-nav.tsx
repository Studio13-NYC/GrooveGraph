"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

type AppNavProps = {
  isAdmin: boolean;
};

export function AppNav({ isAdmin }: AppNavProps) {
  const router = useRouter();

  async function handleSignOut() {
    await fetch("/api/auth/signout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  return (
    <nav className="flex items-center gap-6">
      {isAdmin && (
        <>
          <Link
            href="/"
            className="text-sm text-[hsl(var(--muted-foreground))] transition-colors hover:text-[hsl(var(--foreground))]"
          >
            Explore
          </Link>
          <Link
            href="/enrichment"
            className="text-sm text-[hsl(var(--muted-foreground))] transition-colors hover:text-[hsl(var(--foreground))]"
          >
            Enrichment
          </Link>
          <button
            type="button"
            onClick={() => void handleSignOut()}
            className="text-sm text-[hsl(var(--muted-foreground))] transition-colors hover:text-[hsl(var(--foreground))]"
          >
            Sign out
          </button>
        </>
      )}
      {!isAdmin && (
        <Link
          href="/login"
          className="text-sm text-[hsl(var(--muted-foreground))] transition-colors hover:text-[hsl(var(--foreground))]"
        >
          Sign in
        </Link>
      )}
    </nav>
  );
}
