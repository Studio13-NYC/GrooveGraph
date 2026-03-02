/**
 * Load play history from data/bobdobbsnyc.csv and produce Artist, Album, Track
 * entities plus ReleasedOn and Contains relationships. Dedupes by normalized name/key.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Artist } from "../src/domain/entities/Artist.js";
import { Album } from "../src/domain/entities/Album.js";
import { Track } from "../src/domain/entities/Track.js";
import { ReleasedOn } from "../src/domain/relationships/ReleasedOn.js";
import { Contains } from "../src/domain/relationships/Contains.js";

const DATA_PATH = join(process.cwd(), "data", "bobdobbsnyc.csv");

function slug(s: string): string {
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

const artistsById = new Map<string, Artist>();
const albumsById = new Map<string, Album>();
const tracksById = new Map<string, Track>();
const releasedOnEdges: ReleasedOn[] = [];
const containsEdges: Contains[] = [];

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

function main(): void {
  const rows = parseCsv(DATA_PATH);
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
  }

  const artists = Array.from(artistsById.values());
  const albums = Array.from(albumsById.values());
  const tracks = Array.from(tracksById.values());

  console.log(JSON.stringify({
    summary: {
      artists: artists.length,
      albums: albums.length,
      tracks: tracks.length,
      releasedOn: releasedOnEdges.length,
      contains: containsEdges.length,
    },
    artists: artists.slice(0, 5).map((a) => ({ id: a.id, name: a.name })),
    albums: albums.slice(0, 5).map((a) => ({ id: a.id, title: a.title })),
    tracks: tracks.slice(0, 5).map((t) => ({ id: t.id, title: t.title })),
  }, null, 2));
}

main();
