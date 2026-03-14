/**
 * Seed the graph with example Studio, Label, Person, Genre, Session, and Release
 * nodes and link them to existing Artist/Album/Track nodes so the graph
 * visualization can show all entity and relationship types.
 */
import type { GraphStore } from "../store/index";
import { Studio } from "../domain/entities/Studio";
import { Label } from "../domain/entities/Label";
import { Person } from "../domain/entities/Person";
import { Genre } from "../domain/entities/Genre";
import { Session } from "../domain/entities/Session";
import { Release } from "../domain/entities/Release";
import { RecordedAt } from "../domain/relationships/RecordedAt";
import { ReleasedBy } from "../domain/relationships/ReleasedBy";
import { WrittenBy } from "../domain/relationships/WrittenBy";
import { ProducedBy } from "../domain/relationships/ProducedBy";
import { PartOfGenre } from "../domain/relationships/PartOfGenre";
import { RecordedInSession } from "../domain/relationships/RecordedInSession";
import { MemberOf } from "../domain/relationships/MemberOf";

export async function seedAdditionalEntities(store: GraphStore): Promise<void> {
  const artists = await store.findNodes({ label: "Artist", maxResults: 80 });
  const albums = await store.findNodes({ label: "Album", maxResults: 80 });
  const tracks = await store.findNodes({ label: "Track", maxResults: 120 });

  if (artists.length === 0 || albums.length === 0 || tracks.length === 0) {
    return;
  }

  const studios = [
    new Studio("studio-electric-lady", { name: "Electric Lady Studios", location: "New York, NY" }),
    new Studio("studio-abbey-road", { name: "Abbey Road Studios", location: "London, UK" }),
    new Studio("studio-blackbird", { name: "Blackbird Studio", location: "Nashville, TN" }),
  ];

  const labels = [
    new Label("label-columbia", { name: "Columbia Records" }),
    new Label("label-interscope", { name: "Interscope Records" }),
    new Label("label-mca", { name: "MCA Nashville" }),
  ];

  const persons = [
    new Person("person-jack-antonoff", { name: "Jack Antonoff", roles: ["producer", "musician"] }),
    new Person("person-danger-mouse", { name: "Danger Mouse", roles: ["producer"] }),
    new Person("person-ian-fitchuk", { name: "Ian Fitchuk", roles: ["producer", "engineer"] }),
  ];

  const genres = [
    new Genre("genre-country", { name: "Country" }),
    new Genre("genre-rnb", { name: "R&B" }),
    new Genre("genre-rock", { name: "Rock" }),
    new Genre("genre-indie", { name: "Indie" }),
  ];

  const sessions = [
    new Session("session-nashville-1", { name: "Blackbird Session 2021", date: "2021", studio_name: "Blackbird Studio" }),
    new Session("session-ny-1", { name: "Electric Lady Session", date: "2022", studio_name: "Electric Lady Studios" }),
  ];

  const releases = [
    new Release("release-deeper-well-vinyl", { title: "Deeper Well (vinyl)", format: "vinyl", release_date: "2024" }),
  ];

  await store.runInTransaction(async () => {
    for (const node of studios) await store.createNode(node);
    for (const node of labels) await store.createNode(node);
    for (const node of persons) await store.createNode(node);
    for (const node of genres) await store.createNode(node);
    for (const node of sessions) await store.createNode(node);
    for (const node of releases) await store.createNode(node);

    const studioIds = studios.map((s) => s.id);
    const labelIds = labels.map((l) => l.id);
    const personIds = persons.map((p) => p.id);
    const genreIds = genres.map((g) => g.id);
    const sessionIds = sessions.map((s) => s.id);

    for (let i = 0; i < Math.min(15, tracks.length); i++) {
      const track = tracks[i];
      const studioId = studioIds[i % studioIds.length];
      await store.createEdge(new RecordedAt(`recorded-${track.id}-${studioId}`, track.id, studioId));
    }

    for (let i = 0; i < Math.min(12, albums.length); i++) {
      const album = albums[i];
      const labelId = labelIds[i % labelIds.length];
      await store.createEdge(new ReleasedBy(`releasedby-${album.id}-${labelId}`, album.id, labelId));
    }

    for (let i = 0; i < Math.min(15, tracks.length); i++) {
      const track = tracks[i];
      const personId = personIds[i % personIds.length];
      await store.createEdge(new WrittenBy(`writtenby-${track.id}-${personId}`, track.id, personId));
    }

    for (let i = 0; i < Math.min(12, tracks.length); i++) {
      const track = tracks[i];
      const personId = personIds[(i + 1) % personIds.length];
      await store.createEdge(new ProducedBy(`producedby-${track.id}-${personId}`, track.id, personId));
    }

    for (let i = 0; i < artists.length; i++) {
      const artist = artists[i];
      const genreId = genreIds[i % genreIds.length];
      await store.createEdge(new PartOfGenre(`partofgenre-artist-${artist.id}-${genreId}`, artist.id, genreId));
    }
    for (let i = 0; i < Math.min(25, tracks.length); i++) {
      const track = tracks[i];
      const genreId = genreIds[i % genreIds.length];
      await store.createEdge(new PartOfGenre(`partofgenre-track-${track.id}-${genreId}`, track.id, genreId));
    }

    for (let i = 0; i < Math.min(8, tracks.length); i++) {
      const track = tracks[i];
      const sessionId = sessionIds[i % sessionIds.length];
      await store.createEdge(new RecordedInSession(`recordedinsession-${track.id}-${sessionId}`, track.id, sessionId));
    }

    await store.createEdge(new MemberOf("memberof-jack-beyonce", personIds[0], artists[0].id, { role: "producer" }));
  });
}
