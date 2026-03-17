import { QueryBuilderSlice } from "./components/query-builder-slice";

export default function HomePage() {
  return (
    <section className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-lg font-semibold">Ontology Query Builder</h1>
        <p className="max-w-3xl text-sm text-[hsl(var(--muted-foreground))]">
          A single interface for discovery: compose intent, shape clauses, interpret fuzzy prompts,
          and inspect graph-ready Cypher in one place.
        </p>
      </header>
      <QueryBuilderSlice />
    </section>
  );
}
