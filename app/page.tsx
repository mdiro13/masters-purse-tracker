"use client";

import { useEffect, useMemo, useState } from "react";

type PlayerResult = {
  name: string;
  pos: string;
};

type SheetRow = {
  entry: string;
  golfers: string[];
};

type RankedEntry = {
  entry: string;
  golfers: string[];
  total: number;
};

const DEFAULT_PAYOUTS: Record<number, number> = {
  1: 4200000, 2: 2268000, 3: 1428000, 4: 1008000, 5: 840000,
  6: 756000, 7: 703500, 8: 651000, 9: 609000, 10: 567000,
  11: 525000, 12: 483000, 13: 441000, 14: 399000, 15: 378000,
  16: 357000, 17: 336000, 18: 315000, 19: 294000, 20: 273000,
  21: 252000, 22: 235200, 23: 218400, 24: 201600, 25: 184800,
  26: 168000, 27: 161700, 28: 155400, 29: 149100, 30: 142800,
  31: 136500, 32: 130200, 33: 123900, 34: 118650, 35: 113400,
  36: 108150, 37: 102900, 38: 98700, 39: 94500, 40: 90300,
  41: 86100, 42: 81900, 43: 77700, 44: 73500, 45: 69300,
  46: 65100, 47: 61950, 48: 58800, 49: 55650, 50: 52500,
};

const DEFAULT_SHEET_CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vS_eSyjhk0wD7A2VjZM3-ggJmwY9Qeu_pGqPMr3bUaGxfWWBa_iBLckvF-bz-tgApcSuu-Tb9LCnTkp/pub?output=csv";

function normalizeName(name: string) {
  return name.toLowerCase().replace(/\./g, "").replace(/,/g, "").replace(/\s+/g, " ").trim();
}

function parsePosition(pos: string): number | null {
  if (!pos) return null;
  const upper = pos.toUpperCase().trim();
  if (["MC", "CUT", "WD", "DQ", "DNS"].includes(upper)) return null;
  const numeric = upper.replace(/^T/, "");
  const value = Number.parseInt(numeric, 10);
  return Number.isFinite(value) ? value : null;
}

function payoutForPosition(pos: string, payouts: Record<number, number>, results: PlayerResult[]) {
  const parsed = parsePosition(pos);
  if (!parsed) return 0;

  const normalizedPos = pos.toUpperCase().trim();
  const isTie = normalizedPos.startsWith("T");
  if (!isTie) return payouts[parsed] ?? 0;

  const tieCount = results.filter((player) => parsePosition(player.pos) === parsed).length;
  if (tieCount <= 1) return payouts[parsed] ?? 0;

  const tiedPayouts: number[] = [];
  for (let place = parsed; place < parsed + tieCount; place++) {
    const payout = payouts[place];
    if (typeof payout === "number") {
      tiedPayouts.push(payout);
    }
  }

  if (!tiedPayouts.length) return 0;

  return Math.round(
    tiedPayouts.reduce((sum, value) => sum + value, 0) / tiedPayouts.length
  );
}

function parseCsv(text: string): SheetRow[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return [];

  const parseLine = (line: string) => {
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
        result.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  };

  const rows = lines.map(parseLine);

  return rows
    .map((cells, idx) => {
      const entry = cells[0]?.trim();
      const golfers = cells.slice(1, 7).map((c) => c?.trim()).filter(Boolean) as string[];

      const looksLikeHeader = idx === 0 && ["entry", "entry name", "name"].includes(normalizeName(entry || ""));
      if (looksLikeHeader) return null;
      if (!entry || golfers.length === 0) return null;

      return { entry, golfers };
    })
    .filter(Boolean) as SheetRow[];
}

export const dynamic = "force-dynamic";

export default function Page() {
  const [sheetRows, setSheetRows] = useState<SheetRow[]>([]);
  const [results, setResults] = useState<PlayerResult[]>([]);
  const [updatedAt, setUpdatedAt] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [entrySearch, setEntrySearch] = useState("");

  const resultMap = useMemo(() => {
    const map = new Map<string, PlayerResult>();
    for (const player of results) {
      map.set(normalizeName(player.name), player);
    }
    return map;
  }, [results]);

  const ranked = useMemo<(RankedEntry & { place: string })[]>(() => {
    const rows = sheetRows.map((row) => {
      const total = row.golfers.reduce((sum, golferName) => {
        const found = resultMap.get(normalizeName(golferName));
        const pos = found?.pos ?? "—";
        return sum + payoutForPosition(pos, DEFAULT_PAYOUTS, results);
      }, 0);

      return {
        entry: row.entry.toUpperCase(),
        golfers: row.golfers.map((g) => g.toUpperCase()),
        total,
      };
    });

    const sorted = rows.sort((a, b) => b.total - a.total);

    let currentPlace = 1;

    return sorted.map((row, index) => {
      if (index > 0 && row.total < sorted[index - 1].total) {
        currentPlace = index + 1;
      }

      const isTie = sorted.filter((r) => r.total === row.total).length > 1;

      return {
        ...row,
        place: isTie ? `T${currentPlace}` : `${currentPlace}`,
      };
    });
  }, [sheetRows, resultMap, results]);

  const filteredRanked = useMemo(() => {
    const search = entrySearch.trim().toLowerCase();
    if (!search) return ranked;

    return ranked.filter((row) => row.entry.toLowerCase().includes(search));
  }, [ranked, entrySearch]);

  async function loadSheet() {
    const response = await fetch(DEFAULT_SHEET_CSV_URL, { cache: "no-store" });
    const text = await response.text();
    const rows = parseCsv(text);
    if (!rows.length) throw new Error("Sheet loaded, but no valid rows were found.");
    setSheetRows(rows);
  }

  async function loadLeaderboard() {
    const response = await fetch("/api/leaderboard", { cache: "no-store" });
    if (!response.ok) throw new Error("Could not load leaderboard data.");
    const payload = await response.json();
    if (!payload?.players?.length) throw new Error("Leaderboard payload was empty.");
    setResults(payload.players);
    setUpdatedAt(new Date().toLocaleString());
  }

  async function refreshAll() {
    setLoading(true);
    setError("");
    try {
      await loadSheet();
      await loadLeaderboard();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refreshAll();

    const interval = setInterval(() => {
      refreshAll();
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  const strongBorder = "4px solid #222";
  const regularBorder = "1px solid #222";
  const placeColWidth = 56;
  const entryColWidth = 180;

  return (
    <>
      <style jsx global>{`
        body { margin: 0; }
        * { box-sizing: border-box; }

        @media (max-width: 900px) {
          .page-shell {
            padding: 12px !important;
          }

          .board {
            margin: 12px auto !important;
            border-width: 6px !important;
          }

          .board-header {
            padding: 12px 56px !important;
          }

          .leaders-title {
            font-size: 30px !important;
          }

          .masters-logo {
            height: 84px !important;
          }

          .header-controls {
            display: flex !important;
            flex-direction: column !important;
            gap: 6px !important;
            align-items: center !important;
          }

          .updated-text {
            margin-left: 0 !important;
            font-size: 11px !important;
          }

          .table-wrap {
            overflow-x: auto !important;
            -webkit-overflow-scrolling: touch;
          }

          .leaderboard-table {
            min-width: 1180px !important;
          }
        }

        @media (max-width: 520px) {
          .page-shell {
            padding: 8px !important;
          }

          .board {
            margin: 8px auto !important;
            border-width: 4px !important;
          }

          .board-header {
            padding: 10px 44px !important;
          }

          .leaders-title {
            font-size: 24px !important;
          }

          .masters-logo {
            height: 60px !important;
          }

          .refresh-button {
            font-size: 12px !important;
            padding: 6px 10px !important;
          }

          .table-wrap {
            overflow-x: auto !important;
            -webkit-overflow-scrolling: touch;
          }

          .leaderboard-table {
            min-width: 1180px !important;
          }
        }
      `}</style>
      <main
        className="page-shell"
        style={{
          minHeight: "100vh",
          background: "#00563F",
          padding: 24,
          fontFamily: "Arial, Helvetica, sans-serif",
        }}
      >
        <div
          className="board"
          style={{
            maxWidth: 1400,
            margin: "24px auto",
            background: "#ffffff",
            border: "10px solid #ffffff",
            boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
          }}
        >
          <div className="board-header" style={{ position: "relative", padding: "16px 0" }}>
            <div className="leaders-title" style={{ textAlign: "center", fontSize: 44, fontWeight: 900 }}>LEADERS</div>

            <img
              className="masters-logo"
              src="/masters.png"
              style={{
                position: "absolute",
                left: 0,
                top: "50%",
                transform: "translateY(-50%)",
                height: 60,
              }}
            />

            <img
              className="masters-logo"
              src="/masters.png"
              style={{
                position: "absolute",
                right: 0,
                top: "50%",
                transform: "translateY(-50%)",
                height: 60,
              }}
            />

            <div className="header-controls" style={{ marginTop: 8, textAlign: "center" }}>
              <button className="refresh-button" onClick={refreshAll} disabled={loading}>
                {loading ? "REFRESHING..." : "REFRESH"}
              </button>
              {updatedAt ? (
                <span className="updated-text" style={{ marginLeft: 12, fontSize: 12 }}>
                  Updated: {updatedAt}
                </span>
              ) : null}

              <div style={{ marginTop: 10 }}>
                <input
                  type="text"
                  value={entrySearch}
                  onChange={(e) => setEntrySearch(e.target.value)}
                  placeholder="Search entry name"
                  style={{
                    width: 220,
                    maxWidth: "90%",
                    padding: "8px 10px",
                    fontSize: 12,
                    border: "1px solid #222",
                    outline: "none",
                    textAlign: "center",
                  }}
                />
              </div>
            </div>
          </div>

          {error ? (
            <div
              style={{
                margin: 16,
                padding: 12,
                border: "2px solid #b42318",
                color: "#b42318",
                fontWeight: 400,
              }}
            >
              {error}
            </div>
          ) : null}

          <div className="table-wrap" style={{ overflowX: "auto" }}>
            <table
              className="leaderboard-table"
              style={{
                width: "100%",
                borderCollapse: "collapse",
                tableLayout: "fixed",
                background: "#ffffff",
              }}
            >
              <thead>
                <tr>
                  {[
                    "PLACE",
                    "ENTRY NAME",
                    "GOLFER 1",
                    "GOLFER 2",
                    "GOLFER 3",
                    "GOLFER 4",
                    "GOLFER 5",
                    "GOLFER 6",
                    "TOTAL PURSE $",
                  ].map((header, index) => {
                    const widths = [
                      `${placeColWidth}px`,
                      `${entryColWidth}px`,
                      "10%",
                      "10%",
                      "10%",
                      "10%",
                      "10%",
                      "10%",
                      "14%",
                    ];

                    return (
                      <th
                        key={header}
                        style={{
                          width: widths[index],
                          borderTop: strongBorder,
                          borderBottom: strongBorder,
                          borderLeft: index === 0 ? strongBorder : regularBorder,
                          borderRight: index === 8 ? strongBorder : regularBorder,
                          padding: index === 0 ? "10px 2px" : "10px 6px",
                          fontWeight: 900,
                          fontSize: 12,
                          textAlign: "center",
                          ...(index === 0
                            ? {
                                position: "sticky",
                                left: 0,
                                zIndex: 5,
                                background: "#ffffff",
                                boxShadow: "2px 0 0 #222",
                                minWidth: placeColWidth,
                                maxWidth: placeColWidth,
                                width: placeColWidth,
                              }
                            : {}),
                          ...(index === 1
                            ? {
                                position: "sticky",
                                left: placeColWidth,
                                zIndex: 4,
                                background: "#ffffff",
                                boxShadow: "2px 0 0 #222",
                                minWidth: entryColWidth,
                                maxWidth: entryColWidth,
                                width: entryColWidth,
                              }
                            : {}),
                        }}
                      >
                        {header}
                      </th>
                    );
                  })}
                </tr>
              </thead>

              <tbody>
                {filteredRanked.map((row, rowIndex) => {
                  const useStrongBottomBorder = rowIndex === 0 || (rowIndex + 1) % 3 === 0;

                  return (
                    <tr key={`${row.entry}-${rowIndex}`}>
                      <td
                        style={{
                          borderTop: regularBorder,
                          borderBottom: useStrongBottomBorder ? strongBorder : regularBorder,
                          borderLeft: strongBorder,
                          borderRight: regularBorder,
                          padding: "10px 2px",
                          fontWeight: 900,
                          textAlign: "center",
                          position: "sticky",
                          left: 0,
                          zIndex: 4,
                          background: "#ffffff",
                          boxShadow: "2px 0 0 #222",
                          minWidth: placeColWidth,
                          maxWidth: placeColWidth,
                          width: placeColWidth,
                        }}
                      >
                        {row.place}
                      </td>

                      <td
                        style={{
                          borderTop: regularBorder,
                          borderBottom: useStrongBottomBorder ? strongBorder : regularBorder,
                          borderLeft: regularBorder,
                          borderRight: regularBorder,
                          padding: "10px 6px",
                          fontWeight: 900,
                          textAlign: "center",
                          position: "sticky",
                          left: placeColWidth,
                          zIndex: 3,
                          background: "#ffffff",
                          boxShadow: "2px 0 0 #222",
                          minWidth: entryColWidth,
                          maxWidth: entryColWidth,
                          width: entryColWidth,
                        }}
                      >
                        {row.entry}
                      </td>

                      {row.golfers.map((golfer, golferIndex) => (
                        <td
                          key={`${row.entry}-${golferIndex}`}
                          style={{
                            borderTop: regularBorder,
                            borderBottom: useStrongBottomBorder ? strongBorder : regularBorder,
                            borderLeft: regularBorder,
                            borderRight: regularBorder,
                            padding: "10px 6px",
                            textAlign: "center",
                            fontSize: 13,
                            fontWeight: 400,
                            whiteSpace: "normal",
                            wordBreak: "break-word",
                            lineHeight: 1.15,
                          }}
                        >
                          {golfer}
                        </td>
                      ))}

                      <td
                        style={{
                          borderTop: regularBorder,
                          borderBottom: useStrongBottomBorder ? strongBorder : regularBorder,
                          borderLeft: regularBorder,
                          borderRight: strongBorder,
                          padding: "10px 6px",
                          textAlign: "center",
                          fontWeight: 900,
                          fontSize: 14,
                        }}
                      >
                        ${row.total.toLocaleString()}
                      </td>
                    </tr>
                  );
                })}

                {!filteredRanked.length && !loading ? (
                  <tr>
                    <td
                      colSpan={9}
                      style={{
                        borderTop: strongBorder,
                        borderBottom: strongBorder,
                        borderLeft: strongBorder,
                        borderRight: strongBorder,
                        padding: 20,
                        textAlign: "center",
                        fontWeight: 900,
                      }}
                    >
                      {ranked.length ? "NO MATCHING ENTRIES" : "NO ROWS LOADED"}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </>
  );
}