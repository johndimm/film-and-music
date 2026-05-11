import { type NextRequest, NextResponse } from "next/server";

const UPSTREAM_UA =
  process.env.WIKIMEDIA_USER_AGENT?.trim() ||
  "FilmAndMusicSoundings/1.0 (https://github.com/johndimm/film-and-music) Next.js Wikimedia proxy";

function isAllowedWikimediaApiUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:") return false;
    if (u.pathname !== "/w/api.php") return false;
    const h = u.hostname;
    return (
      h === "en.wikipedia.org" ||
      h === "commons.wikimedia.org" ||
      h === "www.wikidata.org"
    );
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest) {
  const target = request.nextUrl.searchParams.get("u");
  if (!target || !isAllowedWikimediaApiUrl(target)) {
    return NextResponse.json({ error: "invalid or missing u" }, { status: 400 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      headers: {
        Accept: "application/json,text/plain;q=0.9,*/*;q=0.8",
        "User-Agent": UPSTREAM_UA,
      },
      signal: request.signal,
      cache: "no-store",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "upstream failed";
    return NextResponse.json({ error: "wikimedia_upstream", message: msg }, { status: 502 });
  }

  const body = await upstream.arrayBuffer();
  const ct = upstream.headers.get("Content-Type") || "application/json; charset=utf-8";
  return new NextResponse(body, {
    status: upstream.status,
    headers: {
      "Content-Type": ct,
      "Cache-Control": "private, no-store",
    },
  });
}
