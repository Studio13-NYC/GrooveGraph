"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";

const ADMIN_USERNAME = "nickknyc";
const STORAGE_KEY = "gg_admin";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const trimmed = username.trim();
    if (trimmed !== ADMIN_USERNAME) {
      setError("Invalid admin username");
      return;
    }
    setLoading(true);
    try {
      sessionStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* ignore */
    }
    router.push("/");
    router.refresh();
    setLoading(false);
  }

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col justify-center">
      <Card>
        <CardHeader>
          <CardTitle>Admin sign-in</CardTitle>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            Enter the reserved admin username to access Enrichment and full nav.
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="block text-sm font-medium" htmlFor="username">
              Admin username
            </label>
            <Input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="username"
              autoComplete="username"
              disabled={loading}
              className="w-full"
            />
            {error && (
              <p className="text-sm text-red-600 dark:text-red-400" role="alert">
                {error}
              </p>
            )}
            <div className="flex gap-3">
              <Button type="submit" disabled={loading}>
                {loading ? "Signing in…" : "Sign in"}
              </Button>
              <Button type="button" variant="outline" onClick={() => router.push("/")}>
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
