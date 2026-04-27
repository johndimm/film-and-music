import { NextRequest, NextResponse } from "next/server";
import { resolveImageForTitle } from "@film-music/constellations/services/resolveImageForTitle";

/**
 * Server-side image resolution for the embedded constellations graph (same contract as
 * the constellations Express server GET /api/image).
 */
export async function GET(req: NextRequest) {
  const title = (req.nextUrl.searchParams.get("title") || "").trim();
  const context = (req.nextUrl.searchParams.get("context") || "").trim();
  if (!title) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }
  try {
    const result = await resolveImageForTitle(title, context);
    return NextResponse.json(result, {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "image fetch failed";
    console.error(`[api/image] resolution failed for title="${title}" context="${context}":`, e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
