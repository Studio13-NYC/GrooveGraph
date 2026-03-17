"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const STORAGE_KEY = "gg_admin";

type AppNavProps = {
  isAdmin: boolean;
};

export function AppNav({ isAdmin: serverAdmin }: AppNavProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [clientAdmin, setClientAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    const flag = typeof sessionStorage !== "undefined" ? sessionStorage.getItem(STORAGE_KEY) : null;
    setClientAdmin(flag ? true : false);
  }, [pathname]);

  const isAdmin = clientAdmin !== null ? clientAdmin : serverAdmin;

  function handleSignOut() {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    setClientAdmin(false);
    router.push("/");
    router.refresh();
  }

  return (
    <nav className="flex items-center gap-6" data-testid="app-nav">
      <Link
        href="/"
        data-testid="nav-query"
        className="text-sm text-[hsl(var(--muted-foreground))] transition-colors hover:text-[hsl(var(--foreground))]"
      >
        Query
      </Link>
      {isAdmin && (
        <>
          <Link
            href="/enrichment"
            data-testid="nav-enrichment"
            className="text-sm text-[hsl(var(--muted-foreground))] transition-colors hover:text-[hsl(var(--foreground))]"
          >
            Enrichment
          </Link>
          <button
            type="button"
            data-testid="nav-sign-out"
            onClick={() => handleSignOut()}
            className="text-sm text-[hsl(var(--muted-foreground))] transition-colors hover:text-[hsl(var(--foreground))]"
          >
            Sign out
          </button>
        </>
      )}
      {!isAdmin && (
        <Link
          href="/login"
          data-testid="nav-sign-in"
          className="text-sm text-[hsl(var(--muted-foreground))] transition-colors hover:text-[hsl(var(--foreground))]"
        >
          Sign in
        </Link>
      )}
    </nav>
  );
}
