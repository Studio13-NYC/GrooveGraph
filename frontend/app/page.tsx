import { DiscoveryPipelineWorkspace } from "./components/discovery-pipeline-workspace";

export default function HomePage() {
  return (
    <section className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-lg font-semibold">Music Discovery Assistant</h1>
      </header>
      <DiscoveryPipelineWorkspace />
    </section>
  );
}
