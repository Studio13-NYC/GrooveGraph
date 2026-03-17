import { redirect } from "next/navigation";

export function generateStaticParams() {
  return [{}];
}

export default function GraphPage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const params = new URLSearchParams();
  const rawArtist = searchParams?.artist;
  const rawQuery = searchParams?.query;
  const artist = Array.isArray(rawArtist) ? rawArtist[0] : rawArtist;
  const query = Array.isArray(rawQuery) ? rawQuery[0] : rawQuery;

  if (query) {
    params.set("q", query);
  } else if (artist) {
    params.set("q", artist);
  }

  redirect(params.toString() ? `/?${params.toString()}` : "/");
}
