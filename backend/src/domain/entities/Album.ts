import { GraphNode } from "../GraphNode";

const LABEL = "Album";

export interface AlbumProps {
  title: string;
  release_date?: string;
  album_type?: string;
  total_tracks?: number;
  catalog_number?: string;
  images?: Array<{ url: string; width?: number; height?: number }>;
  release_date_precision?: string;
  spotify_uri?: string;
  spotify_url?: string;
}

export class Album extends GraphNode {
  constructor(
    id: string,
    props: AlbumProps,
    meta?: Record<string, unknown>
  ) {
    super(id, [LABEL], props as unknown as Record<string, unknown>, meta);
  }

  get title(): string {
    return this.properties.title as string;
  }
  get release_date(): string | undefined {
    return this.properties.release_date as string | undefined;
  }
  get album_type(): string | undefined {
    return this.properties.album_type as string | undefined;
  }
  get total_tracks(): number | undefined {
    return this.properties.total_tracks as number | undefined;
  }
  get catalog_number(): string | undefined {
    return this.properties.catalog_number as string | undefined;
  }
  get images(): Array<{ url: string; width?: number; height?: number }> | undefined {
    return this.properties.images as Array<{ url: string; width?: number; height?: number }> | undefined;
  }
  get release_date_precision(): string | undefined {
    return this.properties.release_date_precision as string | undefined;
  }
  get spotify_uri(): string | undefined {
    return this.properties.spotify_uri as string | undefined;
  }
  get spotify_url(): string | undefined {
    return this.properties.spotify_url as string | undefined;
  }
}
