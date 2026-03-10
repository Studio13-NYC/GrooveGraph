import { redirect } from "next/navigation";

export default function GraphPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const params = new URLSearchParams();
  const rawArtist = searchParams?.artist;
  const rawEntityType = searchParams?.entityType;
  const rawQuery = searchParams?.query;
  const artist = Array.isArray(rawArtist) ? rawArtist[0] : rawArtist;
  const entityType = Array.isArray(rawEntityType) ? rawEntityType[0] : rawEntityType;
  const query = Array.isArray(rawQuery) ? rawQuery[0] : rawQuery;

  params.set("view", "graph");
  params.set("entityType", entityType ?? "Artist");
  if (query) {
    params.set("query", query);
  } else if (artist) {
    params.set("query", artist);
  }

  redirect(`/?${params.toString()}`);
}
