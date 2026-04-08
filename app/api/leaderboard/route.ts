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

  // ESPN golf leaderboard pages usually contain golfer profile links like:
  // /golf/player/_/id/3470/rory-mcilroy
  // We grab nearby text and try to infer position from the surrounding chunk.
  const playerRegex =
    /<a[^>]+href="[^"]*\/golf\/player\/_\/id\/\d+\/[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;

  let match: RegExpExecArray | null;

  while ((match = playerRegex.exec(html)) !== null) {
    const rawAnchor = match[0];
    const rawName = match[1];
    const name = normalizeName(rawName);

    if (!name || name.length < 3) continue;

    // Look around the player link for a position label.
    const start = Math.max(0, match.index - 500);
    const end = Math.min(html.length, match.index + rawAnchor.length + 500);
    const chunk = html.slice(start, end);

    // Try a few likely patterns
    const posPatterns = [
      /"position"[^>]*>\s*([^<]+)\s*</i,
      /"pos"[^>]*>\s*([^<]+)\s*</i,
      /\b(T?\d+|MC|CUT|WD|DQ|DNS)\b/,
    ];

    let pos = "—";

    for (const pattern of posPatterns) {
      const posMatch = chunk.match(pattern);
      if (posMatch?.[1]) {
        const candidate = cleanText(posMatch[1]).toUpperCase();
        if (/^(T?\d+|MC|CUT|WD|DQ|DNS)$/.test(candidate)) {
          pos = candidate;
          break;
        }
      }
    }

    players.push({ name, pos });
  }

  return dedupePlayers(players).filter((p) => p.pos !== "—");
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