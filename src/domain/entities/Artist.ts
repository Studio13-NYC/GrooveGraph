import { GraphNode } from "../GraphNode.js";

const LABEL = "Artist";

export interface ArtistProps {
  name: string;
  biography?: string;
  genres?: string[];
  active_years?: string;
  country?: string;
  image_url?: string;
  influences?: string[];
  popularity?: number;
  followers?: number;
  spotify_uri?: string;
  spotify_url?: string;
}

export class Artist extends GraphNode {
  constructor(
    id: string,
    props: ArtistProps,
    meta?: Record<string, unknown>
  ) {
    super(id, [LABEL], props as unknown as Record<string, unknown>, meta);
  }

  get name(): string {
    return this.properties.name as string;
  }
  get biography(): string | undefined {
    return this.properties.biography as string | undefined;
  }
  get genres(): string[] | undefined {
    return this.properties.genres as string[] | undefined;
  }
  get active_years(): string | undefined {
    return this.properties.active_years as string | undefined;
  }
  get country(): string | undefined {
    return this.properties.country as string | undefined;
  }
  get image_url(): string | undefined {
    return this.properties.image_url as string | undefined;
  }
  get influences(): string[] | undefined {
    return this.properties.influences as string[] | undefined;
  }
  get popularity(): number | undefined {
    return this.properties.popularity as number | undefined;
  }
  get followers(): number | undefined {
    return this.properties.followers as number | undefined;
  }
  get spotify_uri(): string | undefined {
    return this.properties.spotify_uri as string | undefined;
  }
  get spotify_url(): string | undefined {
    return this.properties.spotify_url as string | undefined;
  }
}
