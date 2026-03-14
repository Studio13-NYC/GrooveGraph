import { Suspense } from "react";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { Loader2 } from "lucide-react";
import { getAuthSession, isAdmin } from "@/lib/auth";
import { EnrichmentReviewWorkspace } from "../components/enrichment-review-workspace";

export default async function EnrichmentPage() {
  const isStaticExport = process.env.NEXT_STATIC_EXPORT === "1";
  if (!isStaticExport) {
    const cookieStore = await cookies();
    const session = getAuthSession(cookieStore);
    if (!isAdmin(session)) {
      redirect("/");
    }
  }
  return (
    <Suspense
      fallback={
        <div className="flex h-[70vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-[hsl(var(--muted-foreground))]" />
        </div>
      }
    >
      <EnrichmentReviewWorkspace />
    </Suspense>
  );
}
