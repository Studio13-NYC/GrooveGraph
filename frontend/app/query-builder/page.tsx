import { QueryBuilderSlice } from "../components/query-builder-slice";

export default function QueryBuilderPage() {
  return (
    <section className="space-y-4">
      <header>
        <h1 className="text-lg font-semibold">Ontology Query Builder</h1>
        <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
          Build a first-row query and compile it into a live Cypher preview.
        </p>
      </header>
      <QueryBuilderSlice />
    </section>
  );
}
