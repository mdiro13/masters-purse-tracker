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

function normalizePos(pos: string) {
  const cleaned = cleanText(pos).toUpperCase().trim();
  if (/^(T?\d+|MC|CUT|WD|DQ|DNS)$/.test(cleaned)) return cleaned;
  return null;
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
  const rowRegex = /<tr[\s\S]*?<\/tr>/gi;
  const rows = html.match(rowRegex) ?? [];

  for (const row of rows) {
    if (!/\/golf\/player\/_\/id\//i.test(row)) continue;

    const cellRegex = /<t[dh][^>]*>[\s\S]*?<\/t[dh]>/gi;
    const cells = row.match(cellRegex) ?? [];
    if (!cells.length) continue;

    let playerName: string | null = null;
    let playerCellIndex = -1;

    for (let i = 0; i < cells.length; i++) {
      const anchorMatch = cells[i].match(
        /<a[^>]+href="[^"]*\/golf\/player\/_\/id\/\d+\/[^"]*"[^>]*>([\s\S]*?)<\/a>/i
      );

      if (anchorMatch?.[1]) {
        playerName = normalizeName(anchorMatch[1]);
        playerCellIndex = i;
        break;
      }
    }

    if (!playerName || playerCellIndex === -1) continue;

    let pos: string | null = null;

    for (let i = playerCellIndex - 1; i >= 0; i--) {
      const candidate = normalizePos(cells[i]);
      if (candidate) {
        pos = candidate;
        break;
      }
    }

    if (!pos) continue;

    players.push({
      name: playerName,
      pos,
    });
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