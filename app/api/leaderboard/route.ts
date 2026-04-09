import { NextResponse } from "next/server";

type PlayerResult = {
  name: string;
  pos: string;
};

const ESPN_MASTERS_URL =
  "https://www.espn.com/golf/leaderboard/_/week/3/year/2026/seasontype/2";

function cleanText(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeName(name: string) {
  return cleanText(name)
    .replace(/\s+\([a-z]\)$/i, "")
    .trim();
}

function dedupePlayers(players: PlayerResult[]) {
  const seen = new Map<string, PlayerResult>();

  for (const player of players) {
    const key = player.name.toLowerCase();
    if (!seen.has(key)) {
      seen.set(key, player);
    }
  }

  return Array.from(seen.values());
}

function parseEspnHtml(html: string): PlayerResult[] {
  const players: PlayerResult[] = [];

  // Grab table rows instead of free-floating player links
  const rowRegex = /<tr[\s\S]*?<\/tr>/gi;
  const rows = html.match(rowRegex) ?? [];

  for (const row of rows) {
    // Must contain a golfer profile link
    if (!/\/golf\/player\/_\/id\//i.test(row)) continue;

    const nameMatch = row.match(
      /<a[^>]+href="[^"]*\/golf\/player\/_\/id\/\d+\/[^"]*"[^>]*>([\s\S]*?)<\/a>/i
    );
    if (!nameMatch?.[1]) continue;

    const name = normalizeName(nameMatch[1]);
    if (!name || name.length < 3) continue;

    // Position should come from the same row only
    const rowText = cleanText(row);

    // Look for a valid leaderboard position near the start of the row
    const posMatch = rowText.match(/\b(T?\d+|MC|CUT|WD|DQ|DNS)\b/i);
    if (!posMatch?.[1]) continue;

    const pos = posMatch[1].toUpperCase();

    if (/^(T?\d+|MC|CUT|WD|DQ|DNS)$/.test(pos)) {
      players.push({ name, pos });
    }
  }

  return dedupePlayers(players);
}

export async function GET() {
  try {
    const response = await fetch(ESPN_MASTERS_URL, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        Accept: "text/html,application/xhtml+xml",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return NextResponse.json(
        {
          error: `ESPN request failed with status ${response.status}`,
          players: [],
          updatedAt: new Date().toISOString(),
        },
        { status: 500 }
      );
    }

    const html = await response.text();
    const players = parseEspnHtml(html);

    if (!players.length) {
      return NextResponse.json(
        {
          error: "No players parsed from ESPN page.",
          players: [],
          updatedAt: new Date().toISOString(),
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      players,
      updatedAt: new Date().toISOString(),
      source: "ESPN Masters leaderboard",
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
        players: [],
        updatedAt: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}