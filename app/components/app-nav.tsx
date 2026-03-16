"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

const STORAGE_KEY = "gg_admin";

type AppNavProps = {
  isAdmin: boolean;
};

export function AppNav({ isAdmin: serverAdmin }: AppNavProps) {
  const router = useRouter();
  const [clientAdmin, setClientAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    const flag = typeof sessionStorage !== "undefined" ? sessionStorage.getItem(STORAGE_KEY) : null;
    setClientAdmin(flag ? true : false);
  }, []);

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
          className="text-sm text-[hsl(var(--muted-foreground))] transition-colors hover:text-[hsl(var(--foreground))]"
        >
          Sign in
        </Link>
      )}
    </nav>
  );
}
