import { GraphNode } from "../GraphNode.js";

const LABEL = "Track";

export interface TrackProps {
  title: string;
  duration_ms?: number;
  explicit?: boolean;
  popularity?: number;
  preview_url?: string;
  isrc?: string;
  lyrics?: string;
  tempo?: number;
  key?: string;
  genre?: string;
  spotify_uri?: string;
  spotify_url?: string;
}

export class Track extends GraphNode {
  constructor(
    id: string,
    props: TrackProps,
    meta?: Record<string, unknown>
  ) {
    super(id, [LABEL], props as unknown as Record<string, unknown>, meta);
  }

  get title(): string {
    return this.properties.title as string;
  }
  get duration_ms(): number | undefined {
    return this.properties.duration_ms as number | undefined;
  }
  get explicit(): boolean | undefined {
    return this.properties.explicit as boolean | undefined;
  }
  get popularity(): number | undefined {
    return this.properties.popularity as number | undefined;
  }
  get preview_url(): string | undefined {
    return this.properties.preview_url as string | undefined;
  }
  get isrc(): string | undefined {
    return this.properties.isrc as string | undefined;
  }
  get lyrics(): string | undefined {
    return this.properties.lyrics as string | undefined;
  }
  get tempo(): number | undefined {
    return this.properties.tempo as number | undefined;
  }
  get key(): string | undefined {
    return this.properties.key as string | undefined;
  }
  get genre(): string | undefined {
    return this.properties.genre as string | undefined;
  }
  get spotify_uri(): string | undefined {
    return this.properties.spotify_uri as string | undefined;
  }
  get spotify_url(): string | undefined {
    return this.properties.spotify_url as string | undefined;
  }
}
