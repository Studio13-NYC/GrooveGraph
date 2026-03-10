# Neo4j Aura

GrooveGraph uses Neo4j Aura as its graph store. Configure credentials in `.env.local` (git-ignored):

```
NEO4J_URI=neo4j+s://<instance-id>.databases.neo4j.io
NEO4J_USERNAME=<instance-id>
NEO4J_PASSWORD=<your-password>
NEO4J_DATABASE=<instance-id>
```

Create a free instance at [console.neo4j.io](https://console.neo4j.io). Wait ~60 seconds after creation before connecting.

Load graph data with `npm run load:neo4j`. See [STORAGE_ABSTRACTION.md](STORAGE_ABSTRACTION.md) for the Neo4jGraphStore implementation.
