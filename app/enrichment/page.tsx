import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { EnrichmentReviewWorkspace } from "../components/enrichment-review-workspace";

export default function EnrichmentPage() {
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
