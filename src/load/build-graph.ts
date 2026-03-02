/**
 * Build an InMemoryGraphStore from play history CSV (bobdobbsnyc.csv).
 * Shared by CLI scripts and Next.js API routes.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Artist } from "../domain/entities/Artist.js";
import { Album } from "../domain/entities/Album.js";
import { Track } from "../domain/entities/Track.js";
import { ReleasedOn } from "../domain/relationships/ReleasedOn.js";
import { Contains } from "../domain/relationships/Contains.js";
import { PerformedBy } from "../domain/relationships/PerformedBy.js";
import type { GraphStore } from "../store/index.js";
import { InMemoryGraphStore } from "../store/index.js";

const DEFAULT_CSV_PATH = join(process.cwd(), "data", "bobdobbsnyc.csv");

export function slug(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

function parseCsv(path: string): Array<{ artist: string; album: string; track: string; played_at: string }> {
  const text = readFileSync(path, "utf-8");
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  return lines.map((line) => {
    const parts = line.split(",").map((p) => p.trim());
    return {
      artist: parts[0] ?? "",
      album: parts[1] ?? "",
      track: parts[2] ?? "",
      played_at: parts[3] ?? "",
    };
  });
}

/**
 * Build and populate the graph store from the play history CSV.
 * Uses DEFAULT_CSV_PATH if csvPath is not provided.
 */
export async function buildGraphStoreFromPlayHistory(csvPath?: string): Promise<GraphStore> {
  const path = csvPath ?? DEFAULT_CSV_PATH;
  const artistsById = new Map<string, Artist>();
  const albumsById = new Map<string, Album>();
  const tracksById = new Map<string, Track>();
  const releasedOnEdges: ReleasedOn[] = [];
  const containsEdges: Contains[] = [];
  const performedByEdges: PerformedBy[] = [];

  function getOrCreateArtist(name: string): Artist {
    const id = `artist-${slug(name)}`;
    let artist = artistsById.get(id);
    if (!artist) {
      artist = new Artist(id, { name });
      artistsById.set(id, artist);
    }
    return artist;
  }

  function getOrCreateAlbum(artistName: string, title: string): Album {
    const id = `album-${slug(artistName)}-${slug(title)}`;
    let album = albumsById.get(id);
    if (!album) {
      album = new Album(id, { title });
      albumsById.set(id, album);
    }
    return album;
  }

  function getOrCreateTrack(artistName: string, albumTitle: string, trackTitle: string): Track {
    const id = `track-${slug(artistName)}-${slug(albumTitle)}-${slug(trackTitle)}`;
    let track = tracksById.get(id);
    if (!track) {
      track = new Track(id, { title: trackTitle });
      tracksById.set(id, track);
    }
    return track;
  }

  const rows = parseCsv(path);
  for (const row of rows) {
    if (!row.artist || !row.album || !row.track) continue;
    const artist = getOrCreateArtist(row.artist);
    const album = getOrCreateAlbum(row.artist, row.album);
    const track = getOrCreateTrack(row.artist, row.album, row.track);
    const releasedOnId = `released-${track.id}-${album.id}`;
    if (!releasedOnEdges.some((e) => e.id === releasedOnId)) {
      releasedOnEdges.push(new ReleasedOn(releasedOnId, track.id, album.id));
    }
    const containsId = `contains-${album.id}-${track.id}`;
    if (!containsEdges.some((e) => e.id === containsId)) {
      containsEdges.push(new Contains(containsId, album.id, track.id));
    }
    const performedById = `performed-${track.id}-${artist.id}`;
    if (!performedByEdges.some((e) => e.id === performedById)) {
      performedByEdges.push(new PerformedBy(performedById, track.id, artist.id));
    }
  }

  const store = new InMemoryGraphStore();
  await store.runInTransaction(async () => {
    for (const node of artistsById.values()) await store.createNode(node);
    for (const node of albumsById.values()) await store.createNode(node);
    for (const node of tracksById.values()) await store.createNode(node);
    for (const edge of releasedOnEdges) await store.createEdge(edge);
    for (const edge of containsEdges) await store.createEdge(edge);
    for (const edge of performedByEdges) await store.createEdge(edge);
  });

  return store;
}
