import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { ExplorationWorkspace } from "./components/exploration-workspace";

export default function HomePage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-[70vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-[hsl(var(--muted-foreground))]" />
        </div>
      }
    >
      <ExplorationWorkspace />
    </Suspense>
  );
}
