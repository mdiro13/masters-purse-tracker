import { NextResponse } from "next/server";

type PlayerResult = {
  name: string;
  pos: string;
};

const GOOGLE_SCORES_CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vTq0BaspphCKf0LVA_vq-MQN3qARbvod0o8XRkS2IFEGEv4IqIWHVjhuQPP99Lv4wK0wArTMKlG9jbH/pub?output=csv";

function cleanText(value: string) {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeName(name: string) {
  return cleanText(name)
    .replace(/\s+\([a-z]\)$/i, "")
    .trim();
}

function normalizePos(pos: string) {
  const cleaned = cleanText(pos).toUpperCase();
  if (/^(T?\d+|MC|CUT|WD|DQ|DNS|-)$/.test(cleaned)) return cleaned;
  return null;
}

function parseCsvLine(line: string) {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  result.push(current);
  return result.map((cell) => cell.trim());
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

function parseScoresCsv(text: string): PlayerResult[] {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  const rows = lines.map(parseCsvLine);

  const players: PlayerResult[] = [];

  for (const row of rows) {
    if (!row.length) continue;

    let pos: string | null = null;
    let name: string | null = null;

    for (let i = 0; i < row.length; i++) {
      const cell = cleanText(row[i]);
      const maybePos = normalizePos(cell);

      if (!pos && maybePos && maybePos !== "-") {
        pos = maybePos;
      }

      if (!name) {
        const maybeName = normalizeName(cell);

        const looksLikeName =
          maybeName.length >= 3 &&
          /[A-Za-z]/.test(maybeName) &&
          !/^(POS|PLAYER|SCORE|TODAY|THRU|R1|R2|R3|R4|TOT|COUNTRY|MASTERS SCORES|SHEET1)$/i.test(
            maybeName
          ) &&
          !/^(T?\d+|MC|CUT|WD|DQ|DNS|-)$/.test(maybeName.toUpperCase());

        if (looksLikeName) {
          name = maybeName;
        }
      }
    }

    if (!pos || !name) continue;

    players.push({ name, pos });
  }

  return dedupePlayers(players);
}

export async function GET() {
  try {
    const response = await fetch(GOOGLE_SCORES_CSV_URL, {
      cache: "no-store",
      headers: {
        Accept: "text/csv,text/plain,*/*",
      },
    });

    if (!response.ok) {
      return NextResponse.json(
        {
          error: `Google Sheet request failed with status ${response.status}`,
          players: [],
          updatedAt: new Date().toISOString(),
        },
        { status: 500 }
      );
    }

    const csvText = await response.text();
    const players = parseScoresCsv(csvText);

    if (!players.length) {
      return NextResponse.json(
        {
          error: "No players parsed from Google Sheet CSV.",
          players: [],
          updatedAt: new Date().toISOString(),
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      players,
      playerCount: players.length,
      sample: players.slice(0, 40),
      updatedAt: new Date().toISOString(),
      source: "Google Sheet leaderboard",
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