import React, { useState, useMemo, useEffect, useRef } from "react";
import { Home, Trophy, CalendarDays, Users, ArrowLeftRight, Play, ChevronRight, TrendingUp, TrendingDown, Pencil, Check, X, Landmark, Building2, Star, Swords, Medal, Lock, GraduationCap, ArrowUpCircle, RotateCw, Layers, Trash2, Award, MessageCircle, Maximize, Minimize, Download, Upload, Bell, UserCog } from "lucide-react";

// ---------------------------------------------------------------
// window.storage polyfill — this game was originally built for the
// claude.ai artifact sandbox, which provides window.storage out of
// the box. Outside that sandbox we back it with the browser's own
// IndexedDB (which has a far higher storage quota than localStorage —
// often 50MB+ vs. localStorage's typical 5-10MB), using the exact
// same {key, value} response shape so none of the game logic below
// needs to change. Any saves already sitting in localStorage from
// before this change are migrated over automatically, once, the
// first time storage is touched.
// ---------------------------------------------------------------
if (typeof window !== "undefined" && !window.storage) {
  const IDB_NAME = "tranarbanken-db";
  const IDB_STORE = "kv";
  let dbPromise = null;
  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      if (!window.indexedDB) { reject(new Error("IndexedDB unavailable")); return; }
      const req = window.indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(IDB_STORE)) req.result.createObjectStore(IDB_STORE); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }
  async function idbGet(key) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const req = db.transaction(IDB_STORE, "readonly").objectStore(IDB_STORE).get(key);
      req.onsuccess = () => resolve(req.result === undefined ? null : req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async function idbSet(key, value) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
  async function idbDelete(key) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
  async function idbKeys() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const req = db.transaction(IDB_STORE, "readonly").objectStore(IDB_STORE).getAllKeys();
      req.onsuccess = () => resolve(req.result.map(String));
      req.onerror = () => reject(req.error);
    });
  }
  // Plain localStorage fallback — used whenever IndexedDB itself fails for any reason.
  // Some iOS Safari configurations have flaky/unreliable IndexedDB support even outside
  // Private Browsing, so rather than failing outright, every operation below quietly
  // retries against localStorage before giving up.
  function lsGet(key) { const v = localStorage.getItem(key); return v === null ? null : v; }
  function lsSet(key, value) { localStorage.setItem(key, value); }
  function lsDelete(key) { localStorage.removeItem(key); }
  function lsKeys(prefix) { return Object.keys(localStorage).filter(k => !prefix || k.startsWith(prefix)); }
  let migratePromise = null;
  function migrateFromLocalStorage() {
    if (migratePromise) return migratePromise;
    migratePromise = (async () => {
      try {
        const already = await idbGet("tranarbanken-migrated-v1");
        if (already) return;
        const keysToMove = Object.keys(localStorage).filter(k => k.startsWith("tranarbanken-"));
        for (const k of keysToMove) {
          const v = localStorage.getItem(k);
          if (v !== null) await idbSet(k, v);
        }
        keysToMove.forEach(k => { try { localStorage.removeItem(k); } catch (e) {} });
        await idbSet("tranarbanken-migrated-v1", "1");
      } catch (e) { /* best-effort; if migration fails, saves just stay wherever they already were */ }
    })();
    return migratePromise;
  }
  window.storage = {
    async get(key) {
      try {
        await migrateFromLocalStorage();
        const v = await idbGet(key);
        return v === null || v === undefined ? null : { key, value: v };
      } catch (e) {
        try { const v = lsGet(key); return v === null ? null : { key, value: v }; }
        catch (e2) { return null; }
      }
    },
    async set(key, value) {
      // Deliberately does NOT swallow the final error here (unlike get/delete/list) — a failed
      // save is serious enough that the caller needs to know about it and can warn the person,
      // rather than silently losing progress. IndexedDB failures fall back to localStorage first
      // though, so most real-world hiccups (e.g. flaky iOS Safari IndexedDB) never reach that point.
      try {
        await migrateFromLocalStorage();
        await idbSet(key, value);
        return { key, value };
      } catch (e) {
        lsSet(key, value);
        return { key, value };
      }
    },
    async delete(key) {
      try { await migrateFromLocalStorage(); await idbDelete(key); return { key, deleted: true }; }
      catch (e) {
        try { lsDelete(key); return { key, deleted: true }; }
        catch (e2) { return null; }
      }
    },
    async list(prefix) {
      try {
        await migrateFromLocalStorage();
        const keys = (await idbKeys()).filter(k => !prefix || k.startsWith(prefix));
        return { keys, prefix };
      } catch (e) {
        try { const keys = lsKeys(prefix); return { keys, prefix }; }
        catch (e2) { return null; }
      }
    },
  };
}

/* ---------------------------------------------------------------
   TRÄNARBÄNKEN — fiktivt managerspel
   5 länder × 3 divisioner × 20 klubbar = 300 klubbar.
   Upp-/nedflyttning, Kimby Mästerskapet (grupper + 2-mannaduster),
   Kimby Cupen (rakt slutspel + 2-mannaduster), inhemsk cup,
   akademi, rykte/fanbase som byggs upp över tid.
----------------------------------------------------------------*/

const C = {
  turf: "#1F352C", turfDeep: "#13221D", turfLine: "#2C4139",
  paper: "#EEEAE0", paperDim: "#DFD9C8", ink: "#1E2A22", inkSoft: "#5C6B60",
  gold: "#D9A94B", goldSoft: "#E8C468", win: "#3F8A6B", loss: "#C0584C", draw: "#8C9184",
};

function rnd(min, max) { return Math.random() * (max - min) + min; }
function rndInt(min, max) { return Math.floor(rnd(min, max + 1)); }
function pick(arr) { return arr[rndInt(0, arr.length - 1)]; }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function uid() { return Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 8); }
function shuffle(arr) { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = rndInt(0, i); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function poisson(lambda) {
  const L = Math.exp(-lambda); let k = 0, p = 1;
  do { k++; p *= Math.random(); } while (p > L);
  return k - 1;
}
function expectedGoals(attack, defense, atHome) {
  const diff = (attack - defense) / 12;
  return clamp(1.25 + diff * 0.6 + (atHome ? 0.2 : -0.05), 0.25, 4.5);
}
// How well a squad's actual sub-attributes back up its raw attack/defense numbers — usable for ANY
// club's squad, not just the user's. A squad genuinely playing to its numbers (or better) gets a small
// boost; one padded by less relevant attributes gets a small penalty. Deliberately modest and capped.
function squadQualityIndex(squad) {
  if (!squad || !squad.length) return 1;
  const sample = squad.slice(0, 16); // cap cost for large squads, a representative slice is enough
  const deltas = sample.map(p => {
    const rawEstimate = p.pos === "MV" ? p.defense : (p.attack + p.defense) / 2;
    return overallOf(p) - rawEstimate;
  });
  const avgDelta = deltas.reduce((s, d) => s + d, 0) / sample.length;
  return 1 + clamp(avgDelta * 0.006, -0.1, 0.1);
}
// A team's recent results give a modest, bounded momentum signal — same idea as individual player form,
// scaled up to the team level so a club on a genuine hot or cold streak plays a little above or below
// its nominal strength, whether that's the user's club or any AI-controlled one.
function teamFormMult(recentResults) {
  if (!recentResults || recentResults.length < 3) return 1;
  const score = recentResults.reduce((s, r) => s + (r === "win" ? 1 : r === "loss" ? -1 : 0), 0) / recentResults.length;
  return 1 + clamp(score * 0.06, -0.08, 0.08);
}
const SEASON_BASE_YEAR = 2026; // Season 1 = 2026/2027, matching a real European club season
function seasonLabel(season) { const y = SEASON_BASE_YEAR + (season - 1); return `${y}/${y + 1}`; }
function preSeasonStartDate(season) { return new Date(Date.UTC(SEASON_BASE_YEAR + (season - 1), 6, 1)); } // 1 July
function roundDate(season, round) {
  const kickoff = new Date(Date.UTC(SEASON_BASE_YEAR + (season - 1), 7, 9)); // 9 August kickoff
  const winterBreakAfterRound = 19; // short winter break, like most European leagues
  let days = round * 7;
  if (round > winterBreakAfterRound) days += 14;
  const d = new Date(kickoff);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}
const SV_MONTHS_SHORT = ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
function formatGameDate(date) { return `${date.getUTCDate()} ${SV_MONTHS_SHORT[date.getUTCMonth()]} ${date.getUTCFullYear()}`; }
function formatGameDateShort(date) { return `${date.getUTCDate()} ${SV_MONTHS_SHORT[date.getUTCMonth()]}`; }
function formatMoney(v) {
  const sign = v < 0 ? "-" : "";
  const abs = Math.abs(v);
  if (abs >= 1000) return `${sign}£${(abs / 1000).toFixed(1)}M`;
  return `${sign}£${Math.round(abs)}k`;
}

const POS_ORDER = ["MV", "FÖ", "MF", "AN"];
const POS_LABEL = { MV: "Målvakt", FÖ: "Försvarare", MF: "Mittfältare", AN: "Anfallare" };

// ---------- Specific positions & tactics grid ----------
// Pitch grid: 6 columns (depth, 0=own goal → 5=opponent goal) × 5 rows (width, 0=top → 4=bottom) = 30 squares.
const GRID_COLS = 6;
const GRID_ROWS = 5;
const SPECIFIC_POSITIONS = {
  MV: [{ code: "MV", label: "Målvakt", col: 0, row: 2 }],
  FÖ: [
    { code: "CB", label: "Mittback", col: 1, row: 2 },
    { code: "VB", label: "Vänsterback", col: 1, row: 0 },
    { code: "HB", label: "Högerback", col: 1, row: 4 },
    { code: "VWB", label: "Vänster wingback", col: 2, row: 0 },
    { code: "HWB", label: "Höger wingback", col: 2, row: 4 },
  ],
  MF: [
    { code: "CDM", label: "Defensiv mittfältare", col: 2, row: 2 },
    { code: "CM", label: "Central mittfältare", col: 3, row: 2 },
    { code: "CAM", label: "Offensiv mittfältare", col: 4, row: 2 },
    { code: "VM", label: "Vänster mittfältare", col: 3, row: 0 },
    { code: "HM", label: "Höger mittfältare", col: 3, row: 4 },
    { code: "VOM", label: "Vänster offensiv mittfältare", col: 4, row: 0 },
    { code: "HOM", label: "Höger offensiv mittfältare", col: 4, row: 4 },
  ],
  AN: [
    { code: "ST", label: "Anfallare", col: 5, row: 2 },
    { code: "VF", label: "Vänsterforward", col: 5, row: 0 },
    { code: "HF", label: "Högerforward", col: 5, row: 4 },
  ],
};
const SPECIFIC_POSITION_LOOKUP = Object.values(SPECIFIC_POSITIONS).flat().reduce((acc, p) => { acc[p.code] = p; return acc; }, {});
function randomSpecificPosition(pos) {
  // Some forwards drift into an advanced wide midfield role, and vice versa for midfielders (handled in distributeSpecificPositions).
  if (pos === "AN" && Math.random() < 0.18) return pick(["VOM", "HOM"]);
  const options = SPECIFIC_POSITIONS[pos] || SPECIFIC_POSITIONS.MF;
  return pick(options).code;
}
function sideFilterPosition(pos, side) {
  const options = SPECIFIC_POSITIONS[pos] || SPECIFIC_POSITIONS.MF;
  const targetRow = side === "left" ? 0 : side === "right" ? 4 : 2;
  const matching = options.filter(o => o.row === targetRow);
  return matching.length ? pick(matching).code : pick(options).code;
}
function specificPositionLabel(code) { return SPECIFIC_POSITION_LOOKUP[code]?.label || code || ""; }
function positionFit(specificPos, col, row) {
  const anchor = SPECIFIC_POSITION_LOOKUP[specificPos];
  if (!anchor) return 0.6;
  // The central striker slot (ST, col 5 row 2) accepts any forward as a strong match — strikers and
  // wide forwards regularly interchange there, so a VF/HF shouldn't be penalized for their own natural
  // anchor sitting off-center when being evaluated specifically for the ST spot.
  if (col === 5 && row === 2 && anchor.col === 5) return 1;
  // Central position types (anchor row 2 — CB/CDM/CM/CAM) are shown with the identical label across
  // grid rows 1-3 (see nearestPositionForCell), so their fit should treat all three rows as an equally
  // perfect match, not just the exact middle row — otherwise the same-looking tile shows inconsistent
  // colors depending on which of the three central rows it happens to sit in.
  const rowDist = anchor.row === 2
    ? (row >= 1 && row <= 3 ? 0 : Math.min(Math.abs(row - 1), Math.abs(row - 3)))
    : Math.abs(row - anchor.row);
  const dist = Math.sqrt((col - anchor.col) ** 2 + rowDist ** 2);
  return clamp(1 - dist / 4, 0.3, 1);
}
// Layers position-training progress on top of the natural fit — a player actively trained toward a nearby
// position gradually becomes genuinely better suited there, not just "tolerated" out of position.
function effectivePositionFit(player, col, row) {
  const base = positionFit(player.specificPosition, col, row);
  const targetCode = nearestPositionForCell(col, row);
  const bonus = player?.trainedPositions?.[targetCode] || 0;
  return clamp(base + bonus, 0, 1);
}
// Position training: a player can be actively trained toward a nearby-but-currently-weak ("red") position,
// gradually gaining a genuine fit bonus there plus a small attribute nudge — represents deliberate positional
// coaching, distinct from natural age-based development.
function tickPositionTraining(p) {
  if (!p.trainingTarget) return p;
  const { position } = p.trainingTarget;
  const anchor = SPECIFIC_POSITION_LOOKUP[position];
  if (!anchor) return { ...p, trainingTarget: null };
  const currentBonus = p.trainedPositions?.[position] || 0;
  const gain = rnd(0.01, 0.025);
  const newBonus = clamp(currentBonus + gain, 0, 0.35);
  let attack = p.attack, defense = p.defense;
  if (Math.random() < 0.35) {
    // Forward/attacking anchors (higher col) lean the nudge toward attack; defensive anchors toward defense.
    if (anchor.col >= 3) attack = clamp(attack + rnd(0.08, 0.22), 15, 99);
    else defense = clamp(defense + rnd(0.08, 0.22), 15, 99);
  }
  return { ...p, attack, defense, trainedPositions: { ...(p.trainedPositions || {}), [position]: newBonus } };
}
function eligibleTrainingPositions(player) {
  return Object.keys(SPECIFIC_POSITION_LOOKUP).filter(code => {
    const anchor = SPECIFIC_POSITION_LOOKUP[code];
    const fit = effectivePositionFit(player, anchor.col, anchor.row);
    // Any position the player isn't already essentially perfect at is trainable — whether it's their
    // exact primary spot, a secondary position they already cover reasonably well, or a genuinely new,
    // unfamiliar ("red") position. Training just narrows the remaining gap at the usual pace either way.
    return fit >= 0.3 && fit < 0.995;
  });
}
function nearestPositionForCell(col, row) {
  const anchors = Object.values(SPECIFIC_POSITION_LOOKUP);
  // First find which tactical "line" (column) this cell belongs to.
  let bestCol = null, bestColDist = Infinity;
  anchors.forEach(p => { const d = Math.abs(col - p.col); if (d < bestColDist) { bestColDist = d; bestCol = p.col; } });
  const lineAnchors = anchors.filter(p => p.col === bestCol);
  // Within that line: only the very top/bottom rows (0 and 4) are the wide flanks.
  // The three rows in between (1, 2, 3) are all treated as the central position.
  const targetRow = row <= 0 ? 0 : row >= 4 ? 4 : 2;
  let best = null, bestDist = Infinity;
  lineAnchors.forEach(p => { const d = Math.abs(p.row - targetRow); if (d < bestDist) { bestDist = d; best = p; } });
  return best ? best.code : "";
}
function teamPositionFit(cells, squad) {
  const entries = Object.entries(cells || {});
  if (!entries.length) return 1;
  let sum = 0, count = 0;
  entries.forEach(([key, playerId]) => {
    if (!playerId) return;
    const player = squad.find(p => p.id === playerId);
    if (!player) return;
    const [col, row] = key.split("-").map(Number);
    sum += effectivePositionFit(player, col, row);
    count++;
  });
  return count ? sum / count : 1;
}
function cellKey(col, row) { return `${col}-${row}`; }

// ---------- Countries ----------
const LEAGUE_FLAG = { england: "🇬🇧", italy: "🇮🇹", spain: "🇪🇸", germany: "🇩🇪", france: "🇫🇷" };
// Windows renders flag emoji as plain two-letter text (a known OS/font limitation — not a bug), while
// Mac/iOS/Android show real flag icons. Drawing simple SVG flags instead makes them look identical and
// correct on every platform, with no dependency on the OS's emoji font.
function CountryFlag({ country, size = 28 }) {
  const h = size, w = Math.round(size * 1.4);
  const flags = {
    england: (
      <svg width={w} height={h} viewBox="0 0 30 20"><rect width="30" height="20" fill="#00247D" />
        <path d="M0,0 L30,20 M30,0 L0,20" stroke="#fff" strokeWidth="4" /><path d="M0,0 L30,20 M30,0 L0,20" stroke="#CF142B" strokeWidth="1.5" />
        <path d="M15,0 V20 M0,10 H30" stroke="#fff" strokeWidth="6" /><path d="M15,0 V20 M0,10 H30" stroke="#CF142B" strokeWidth="3.5" /></svg>
    ),
    italy: <svg width={w} height={h} viewBox="0 0 30 20"><rect width="10" height="20" fill="#009246" /><rect x="10" width="10" height="20" fill="#fff" /><rect x="20" width="10" height="20" fill="#CE2B37" /></svg>,
    spain: <svg width={w} height={h} viewBox="0 0 30 20"><rect width="30" height="20" fill="#AA151B" /><rect y="5" width="30" height="10" fill="#F1BF00" /></svg>,
    germany: <svg width={w} height={h} viewBox="0 0 30 20"><rect width="30" height="6.66" fill="#000" /><rect y="6.66" width="30" height="6.66" fill="#DD0000" /><rect y="13.33" width="30" height="6.67" fill="#FFCE00" /></svg>,
    france: <svg width={w} height={h} viewBox="0 0 30 20"><rect width="10" height="20" fill="#0055A4" /><rect x="10" width="10" height="20" fill="#fff" /><rect x="20" width="10" height="20" fill="#EF4135" /></svg>,
  };
  return <span style={{ display: "inline-flex", width: w, height: h, borderRadius: 3, overflow: "hidden", boxShadow: "0 0 0 1px rgba(0,0,0,0.15)", flexShrink: 0 }}>{flags[country] || null}</span>;
}
const TICKET_TIERS = {
  t1: { price: 8, label: "£8", desc: "Mycket lågt pris — fulla läktare, minimal marginal per biljett.", fillMult: 1.22, incomeMult: 0.5, fanAdj: 0.55 },
  t2: { price: 12, label: "£12", desc: "Lågt pris — fler i publiken, mindre per biljett.", fillMult: 1.12, incomeMult: 0.7, fanAdj: 0.35 },
  t3: { price: 16, label: "£16", desc: "Balanserat pris för en vanlig matchdag.", fillMult: 1.0, incomeMult: 1.0, fanAdj: 0 },
  t4: { price: 22, label: "£22", desc: "Något högre pris — mer per biljett, något färre kommer.", fillMult: 0.88, incomeMult: 1.3, fanAdj: -0.25 },
  t5: { price: 30, label: "£30", desc: "Högt pris — riskerar märkbart tomma läktare.", fillMult: 0.72, incomeMult: 1.65, fanAdj: -0.45 },
  t6: { price: 45, label: "£45", desc: "Premiumpris — maximal intäkt per biljett, stor risk för tomma läktare.", fillMult: 0.55, incomeMult: 2.1, fanAdj: -0.7 },
};
const LEAGUES = [
  { id: "england", name: "England", blurb: "Fysisk intensitet och fullsatta arenor varje helg.", cupName: "Silverskölden" },
  { id: "italy", name: "Italien", blurb: "Taktisk skicklighet och stolta klubbtraditioner.", cupName: "Coppa Regina" },
  { id: "spain", name: "Spanien", blurb: "Teknisk finess och het rivalitet i solen.", cupName: "Copa Imperial" },
  { id: "germany", name: "Tyskland", blurb: "Organisation, disciplin och lojala supportrar.", cupName: "Kaiserpokal" },
  { id: "france", name: "Frankrike", blurb: "Talangfabriker och snabb, ung fotboll.", cupName: "Coupe Impériale" },
];
// Division 1 in each country keeps the old fictional league name as its own competition brand (like a
// real top-flight often has a unique name), while Division 2/3 are simply relabeled Division 1/2 —
// this is purely a DISPLAY layer; the underlying division numbers (1/2/3) driving all game logic are untouched.
const DIVISION_DISPLAY_NAME = {
  england: { 1: "The Football League", 2: "Division 1", 3: "Division 2" },
  italy: { 1: "Campionato d'Italia", 2: "Division 1", 3: "Division 2" },
  spain: { 1: "Primera Liga", 2: "Division 1", 3: "Division 2" },
  germany: { 1: "Bundesmeisterschaft", 2: "Division 1", 3: "Division 2" },
  france: { 1: "Ligue Nationale", 2: "Division 1", 3: "Division 2" },
};
function divisionLabel(leagueId, division) {
  return DIVISION_DISPLAY_NAME[leagueId]?.[division] || `Division ${division}`;
}
const DIVISION_BLURB = {
  1: "Högsta serien — etablerade klubbar, tuffast konkurrens, bäst ekonomi.",
  2: "Mellanskiktet — ambitiösa klubbar som drömmer om avancemang.",
  3: "Lägsta serien — knapp ekonomi och små arenor, men en lång resa att ta sig an.",
};
const CUP1_ARENAS = ["Stadion Aurora", "Parc du Millénium", "Nordkronan Arena", "Stadio Imperiale", "Costa Real Arena", "Kejsarvallen"];
const CUP2_ARENAS = ["Arena Meridian", "Stade Solaire", "Silverfältet", "Westtor Arena", "Piazza Grande Arena", "Hamnarenan"];

const DIFFICULTY_SETTINGS = {
  latt: { label: "Lätt", desc: "Färre skador, lugnare transferfönster, mer tålmodig styrelse.", injuryMult: 0.6, rivalMult: 0.5, boardMult: 0.7 },
  normal: { label: "Normal", desc: "Standardinställning — balanserad upplevelse.", injuryMult: 1, rivalMult: 1, boardMult: 1 },
  svar: { label: "Svår", desc: "Fler skador, hårdare konkurrens om spelare, otåligare styrelse.", injuryMult: 1.6, rivalMult: 1.7, boardMult: 1.35 },
};
const ARCHETYPES = {
  storklubb: { tierMin: 76, tierMax: 90, incomeMult: 1.4, growth: 0.28, startBudget: 11000, startDev: { arena: 3, akademi: 2, scouting: 3, sponsring: 3 }, repAdj: 18, fanAdj: 16 },
  medelklubb: { tierMin: 62, tierMax: 75, incomeMult: 1.0, growth: 0.15, startBudget: 5000, startDev: { arena: 2, akademi: 1, scouting: 2, sponsring: 2 }, repAdj: 0, fanAdj: 0 },
  arbetarklubb: { tierMin: 58, tierMax: 70, incomeMult: 1.22, growth: 0.1, startBudget: 2600, startDev: { arena: 1, akademi: 1, scouting: 1, sponsring: 1 }, repAdj: -5, fanAdj: 14 },
  nyrik: { tierMin: 40, tierMax: 56, incomeMult: 1.55, growth: 0.38, startBudget: 15000, startDev: { arena: 2, akademi: 1, scouting: 2, sponsring: 2 }, repAdj: -22, fanAdj: -16 },
  akademiklubb: { tierMin: 55, tierMax: 68, incomeMult: 0.85, growth: 0.25, startBudget: 2000, startDev: { arena: 1, akademi: 3, scouting: 2, sponsring: 1 }, repAdj: -3, fanAdj: -6 },
  utmanare: { tierMin: 60, tierMax: 74, incomeMult: 1.08, growth: 0.32, startBudget: 4600, startDev: { arena: 1, akademi: 2, scouting: 2, sponsring: 1 }, repAdj: 7, fanAdj: 2 },
};
// Per-club starting budget overrides — takes priority over the archetype's default startBudget formula.
const CLUB_BUDGET_OVERRIDES = { eng11: 7000, eng_d3_wrex: 3000, eng20: 4000, eng9: 4000, eng5: 4000 }; // Elland Whites (Leeds) £7.0M · Wrexham Dargons £3.0M · Wearside Sunderland £4.0M · Merseyside Toffees (Everton) £4.0M · Millwall Rovers £4.0M
// Arena stand levels overridden per club so a specific real-world-ish capacity is hit exactly,
// instead of the usual archetype/division formula. Feeds arenaCapacityForClub / startArenaStands.
const CLUB_ARENA_STANDS_OVERRIDES = { eng_d3_wrex: { north: 1, south: 1, east: 0, west: 0 } }; // Wrexham Dargons — ~11,000 seats
const ARCHETYPE_DESC = {
  storklubb: "Stor, anrik klubb med höga förväntningar och bra ekonomi.",
  medelklubb: "Stabil klubb i mitten av tabellen med jämn utveckling.",
  arbetarklubb: "Passionerade fans och stark hemmaplansstämning, men begränsad budget.",
  nyrik: "Nya, rika ägare — men truppen är fortfarande svag och ryktet lågt. Investeringarna tar tid att märkas på plan.",
  akademiklubb: "Fokus på ungdomsutveckling — billiga men lovande talanger.",
  utmanare: "Ambitiös klubb på frammarsch med stark tillväxtpotential.",
};
const ARCHETYPE_LABEL = { storklubb: "Storklubb", medelklubb: "Medelklubb", arbetarklubb: "Arbetarklubb", nyrik: "Nyrik klubb", akademiklubb: "Akademiklubb", utmanare: "Utmanare" };
const ARCHETYPE_TRADEOFFS = {
  storklubb: {
    pros: ["Stor startbudget för nivån och bra faciliteter direkt", "Högt rykte gör värvningar enklare", "Stor hemmapublik ger bra matchdagsintäkter"],
    cons: ["Höga förväntningar från styrelsen redan säsong 1", "Långsammare organisk tillväxt — redan nära toppen"],
  },
  medelklubb: {
    pros: ["Balanserad start utan svaga punkter", "Rimliga, uppnåeliga mål från styrelsen"],
    cons: ["Inget som sticker ut — måste byggas upp överallt", "Ingen tydlig fördel att luta sig mot tidigt"],
  },
  arbetarklubb: {
    pros: ["Bästa matchdagsintäkterna relativt storlek (+22%)", "Lojala fans redan från start"],
    cons: ["Mycket liten startbudget för nivån", "Långsam organisk tillväxt", "Lågt inledande rykte"],
  },
  nyrik: {
    pros: ["Mycket hög startbudget för nivån — värva fritt direkt", "Snabbast tillväxttakt av alla klubbtyper"],
    cons: ["Mycket lågt rykte — svårt att locka stjärnor trots pengarna", "Svag, skeptisk fanbase måste byggas upp", "Historielös identitet i ligan"],
  },
  akademiklubb: {
    pros: ["Bästa ungdomsakademin i ligan från start", "Billiga, lovande talanger att fostra"],
    cons: ["Minst startbudget för nivån av alla klubbtyper", "Svagast matchdagsekonomi (-15%)", "Tar tid innan akademin ger utdelning"],
  },
  utmanare: {
    pros: ["Stark tillväxttakt", "Redan gott rykte i förhållande till storleken"],
    cons: ["Måttlig budget — inga genvägar", "Inga extrema fördelar att utnyttja tidigt"],
  },
};

const SPELIDE_LABELS = { balanserad: "Balanserad utveckling", ungdomsfokus: "Ungdomsfokus", anfallsspel: "Direkt anfallsspel", forsvarsspel: "Kompakt försvarsspel" };
const SPELIDE_DESC = {
  balanserad: "Ingen särskild inriktning — jämn utveckling på alla plan.",
  ungdomsfokus: "Akademin växer snabbare, men A-laget tappar lite skärpa.",
  anfallsspel: "Permanent offensiv prägel — mer anfall, sämre försvar.",
  forsvarsspel: "Permanent defensiv prägel — mer försvar, mindre anfall.",
};
const SPELIDE_MODS = {
  balanserad: { attack: 1, defense: 1, akademiGrowth: 1 },
  ungdomsfokus: { attack: 0.94, defense: 0.96, akademiGrowth: 1.5 },
  anfallsspel: { attack: 1.12, defense: 0.9, akademiGrowth: 1 },
  forsvarsspel: { attack: 0.9, defense: 1.12, akademiGrowth: 1 },
};

// ---------- Tactical instructions ----------
const PRESS_OPTIONS = {
  lagt: { label: "Lågt press", defMult: 0.97, cardMult: 0.85 },
  medel: { label: "Medel press", defMult: 1, cardMult: 1 },
  hogt: { label: "Högt press", defMult: 1.06, cardMult: 1.3 },
};
const POSSESSION_OPTIONS = {
  direkt: { label: "Direkt", atkMult: 1.05, defMult: 0.98 },
  balanserat: { label: "Balanserat", atkMult: 1, defMult: 1 },
  kort: { label: "Kort", atkMult: 0.97, defMult: 1.05 },
};
const POSSESSION_APPROACH_OPTIONS = {
  mer: { label: "Mer", atkMult: 0.98, defMult: 1.03, possBias: 9 },
  balanserat: { label: "Balanserat", atkMult: 1, defMult: 1, possBias: 0 },
  mindre: { label: "Mindre", atkMult: 1.03, defMult: 0.98, possBias: -9 },
};
const TEMPO_OPTIONS = {
  kontrollerat: { label: "Kontrollerat", atkMult: 0.99, defMult: 1.03 },
  balanserat: { label: "Balanserat", atkMult: 1, defMult: 1 },
  snabbt: { label: "Snabba omställningar", atkMult: 1.05, defMult: 0.98 },
};
const RISK_OPTIONS = {
  forsiktigt: { label: "Försiktigt", atkMult: 0.95, defMult: 1.06, cardMult: 0.8 },
  balanserat: { label: "Balanserat", atkMult: 1, defMult: 1, cardMult: 1 },
  risktagande: { label: "Risktagande", atkMult: 1.07, defMult: 0.93, cardMult: 1.25 },
};
const TACTICAL_DIALS = [
  { key: "press", label: "Press", options: PRESS_OPTIONS },
  { key: "possession", label: "Passningsspel", options: POSSESSION_OPTIONS },
  { key: "possessionApproach", label: "Bollinnehav", options: POSSESSION_APPROACH_OPTIONS },
  { key: "tempo", label: "Omställningar", options: TEMPO_OPTIONS },
  { key: "risk", label: "Försiktighet", options: RISK_OPTIONS },
];
const DEFAULT_TACTICAL_SETTINGS = { press: "medel", possession: "balanserat", possessionApproach: "balanserat", tempo: "balanserat", risk: "balanserat" };
function combinedTacticalMods(settings) {
  const s = settings || DEFAULT_TACTICAL_SETTINGS;
  const p = PRESS_OPTIONS[s.press] || PRESS_OPTIONS.medel;
  const po = POSSESSION_OPTIONS[s.possession] || POSSESSION_OPTIONS.balanserat;
  const pa = POSSESSION_APPROACH_OPTIONS[s.possessionApproach] || POSSESSION_APPROACH_OPTIONS.balanserat;
  const t = TEMPO_OPTIONS[s.tempo] || TEMPO_OPTIONS.balanserat;
  const r = RISK_OPTIONS[s.risk] || RISK_OPTIONS.balanserat;
  return {
    atkMult: (po.atkMult ?? 1) * (pa.atkMult ?? 1) * (t.atkMult ?? 1) * (r.atkMult ?? 1),
    defMult: (p.defMult ?? 1) * (po.defMult ?? 1) * (pa.defMult ?? 1) * (t.defMult ?? 1) * (r.defMult ?? 1),
    cardMult: (p.cardMult ?? 1) * (r.cardMult ?? 1),
    possBias: pa.possBias ?? 0,
  };
}

// ---------- Hand-authored flagship clubs (become Division 1 anchors) ----------
const CLUB_DATA = [
  { id: "eng1", league: "england", name: "Liverpool Athletic", short: "LIV", color: "#C8102E", archetype: "storklubb" },
  { id: "eng2", league: "england", name: "Manchester Rovers", short: "MAN", color: "#6CABDD", archetype: "storklubb" },
  { id: "eng3", league: "england", name: "Thames Ironworks F.C.", short: "TIW", color: "#7A1E33", archetype: "storklubb" },
  { id: "eng4", league: "england", name: "North London Gunners", short: "NLG", color: "#EF0107", archetype: "storklubb" },
  { id: "eng5", league: "england", name: "Millwall Rovers", short: "MIL", color: "#0C2340", archetype: "arbetarklubb" },
  { id: "eng6", league: "england", name: "Coventry", short: "COV", color: "#78D0F7", archetype: "arbetarklubb" },
  { id: "eng7", league: "england", name: "Trafford United", short: "TRA", color: "#DA020E", archetype: "storklubb" },
  { id: "eng8", league: "england", name: "Stamford Athletic", short: "STA", color: "#034694", archetype: "storklubb" },
  { id: "eng9", league: "england", name: "Merseyside Toffees", short: "MER", color: "#003399", archetype: "arbetarklubb" },
  { id: "eng10", league: "england", name: "White Hart Wanderers", short: "WHW", color: "#FFFFFF", archetype: "storklubb" },
  { id: "eng11", league: "england", name: "Elland Whites", short: "ELL", color: "#FFFFFF", archetype: "utmanare" },
  { id: "eng12", league: "england", name: "Tyneside Magpies", short: "TYN", color: "#000000", archetype: "nyrik" },
  { id: "eng13", league: "england", name: "Villa Claret", short: "VIL", color: "#670E36", archetype: "utmanare" },
  { id: "eng14", league: "england", name: "Molineux Wolves", short: "WOL", color: "#FDB913", archetype: "utmanare" },
  { id: "eng15", league: "england", name: "Trent Forest", short: "FOR", color: "#DD0000", archetype: "utmanare" },
  { id: "eng16", league: "england", name: "Fox City", short: "LEI", color: "#003090", archetype: "utmanare" },
  { id: "eng17", league: "england", name: "Saints Southampton", short: "SOU", color: "#D71920", archetype: "medelklubb" },
  { id: "eng18", league: "england", name: "Seagulls Brighton", short: "BRI", color: "#0057B8", archetype: "utmanare" },
  { id: "eng19", league: "england", name: "Eagles Palace", short: "CRY", color: "#1B458F", archetype: "medelklubb" },
  { id: "eng20", league: "england", name: "Wearside Sunderland", short: "SUN", color: "#EB172B", archetype: "arbetarklubb" },

  { id: "ita1", league: "italy", name: "Roma 1927", short: "ROM", color: "#A9182C", archetype: "storklubb" },
  { id: "ita2", league: "italy", name: "Milano 1899", short: "MIL", color: "#A2001D", archetype: "storklubb" },
  { id: "ita3", league: "italy", name: "Milano Nerazzurri", short: "INT", color: "#0068A8", archetype: "storklubb" },
  { id: "ita4", league: "italy", name: "Piemonte Bianconeri", short: "PIE", color: "#000000", archetype: "storklubb" },
  { id: "ita5", league: "italy", name: "Verona 1913", short: "VER", color: "#E0B02A", archetype: "arbetarklubb" },
  { id: "ita6", league: "italy", name: "Pescara 1920", short: "PES", color: "#3FA6D9", archetype: "nyrik" },
  { id: "ita7", league: "italy", name: "Empoli Calcio", short: "EMP", color: "#1B4F8A", archetype: "akademiklubb" },
  { id: "ita8", league: "italy", name: "Partenope Napoli", short: "NAP", color: "#1E88C7", archetype: "storklubb" },
  { id: "ita9", league: "italy", name: "Udine Sportiva", short: "UDI", color: "#1A1A1A", archetype: "medelklubb" },
  { id: "ita10", league: "italy", name: "Lucca Unione", short: "LUC", color: "#A9182C", archetype: "medelklubb" },
  { id: "ita11", league: "italy", name: "Firenze Viola", short: "FIO", color: "#5B2A86", archetype: "utmanare" },
  { id: "ita12", league: "italy", name: "Orobica Bergamo", short: "ORO", color: "#1B3A5C", archetype: "utmanare" },
  { id: "ita13", league: "italy", name: "Torino Granata", short: "TOR", color: "#8B1D28", archetype: "utmanare" },
  { id: "ita14", league: "italy", name: "Laziale Capitolina", short: "LAZ", color: "#87CEEB", archetype: "storklubb" },
  { id: "ita15", league: "italy", name: "Genova Blucerchiata", short: "SAM", color: "#1E3A8A", archetype: "medelklubb" },
  { id: "ita16", league: "italy", name: "Bologna Rossoblù", short: "BOL", color: "#8B0000", archetype: "medelklubb" },
  { id: "ita17", league: "italy", name: "Cagliari Isolana", short: "CAG", color: "#A61C3C", archetype: "utmanare" },
  { id: "ita18", league: "italy", name: "Genova Rossoblù", short: "GEN", color: "#1E2A5E", archetype: "arbetarklubb" },
  { id: "ita19", league: "italy", name: "Sassuolo Neroverde", short: "SAS", color: "#1A7A3C", archetype: "akademiklubb" },
  { id: "ita20", league: "italy", name: "Parma Ducale", short: "PAR", color: "#FFD700", archetype: "utmanare" },

  { id: "esp1", league: "spain", name: "CF Madrid", short: "MAD", color: "#F5F5F0", archetype: "storklubb" },
  { id: "esp2", league: "spain", name: "Deportivo Barcelona", short: "BAR", color: "#004D98", archetype: "storklubb" },
  { id: "esp3", league: "spain", name: "Atlético Rojiblanco", short: "ATL", color: "#C8102E", archetype: "storklubb" },
  { id: "esp4", league: "spain", name: "Unión Albacete", short: "ALB", color: "#F5F5F0", archetype: "medelklubb" },
  { id: "esp5", league: "spain", name: "UD Santander", short: "SAN", color: "#2E8B57", archetype: "arbetarklubb" },
  { id: "esp6", league: "spain", name: "Hispalense Sevilla", short: "SEV", color: "#D2001C", archetype: "utmanare" },
  { id: "esp7", league: "spain", name: "CF Badajoz", short: "BAD", color: "#2A5CAA", archetype: "akademiklubb" },
  { id: "esp8", league: "spain", name: "Real Gijón", short: "GIJ", color: "#C8102E", archetype: "utmanare" },
  { id: "esp9", league: "spain", name: "Bilbao Vizcaya", short: "BIL", color: "#EE2523", archetype: "akademiklubb" },
  { id: "esp10", league: "spain", name: "Unión Lleida", short: "LLE", color: "#1B7A72", archetype: "medelklubb" },
  { id: "esp11", league: "spain", name: "Turia Valencia", short: "VLC", color: "#EE7100", archetype: "utmanare" },
  { id: "esp12", league: "spain", name: "Real Donosti", short: "DON", color: "#0067B1", archetype: "akademiklubb" },
  { id: "esp13", league: "spain", name: "Submarino Villarreal", short: "VIL", color: "#FFE500", archetype: "utmanare" },
  { id: "esp14", league: "spain", name: "Verdiblanco Betis", short: "BET", color: "#00954C", archetype: "medelklubb" },
  { id: "esp15", league: "spain", name: "Célticos Vigo", short: "CEL", color: "#8AC3EE", archetype: "medelklubb" },
  { id: "esp16", league: "spain", name: "Periquito Espanyol", short: "ESP", color: "#0A4C96", archetype: "akademiklubb" },
  { id: "esp17", league: "spain", name: "Osasuna Rojillo", short: "OSA", color: "#D2001C", archetype: "arbetarklubb" },
  { id: "esp18", league: "spain", name: "Getafe Azulón", short: "GET", color: "#005CA9", archetype: "medelklubb" },
  { id: "esp19", league: "spain", name: "Elche Franjiverde", short: "ELX", color: "#026937", archetype: "utmanare" },
  { id: "esp20", league: "spain", name: "Mallorca Illenc", short: "MLL", color: "#CB1616", archetype: "utmanare" },

  { id: "ger1", league: "germany", name: "München 1900", short: "MUN", color: "#DC052D", archetype: "storklubb" },
  { id: "ger2", league: "germany", name: "Dortmund 1909", short: "DOR", color: "#F2C230", archetype: "storklubb" },
  { id: "ger3", league: "germany", name: "Gelsenkirchen Knappen", short: "GEL", color: "#004C9D", archetype: "arbetarklubb" },
  { id: "ger4", league: "germany", name: "Leverkusen Werkself", short: "LEV", color: "#E32221", archetype: "utmanare" },
  { id: "ger5", league: "germany", name: "Leipzig Rasenballsport", short: "LEI", color: "#DD0741", archetype: "nyrik" },
  { id: "ger6", league: "germany", name: "Karlsruhe Kickers", short: "KAR", color: "#1B458F", archetype: "nyrik" },
  { id: "ger7", league: "germany", name: "Dresden Sportfreunde", short: "DRE", color: "#E0B02A", archetype: "akademiklubb" },
  { id: "ger8", league: "germany", name: "Duisburg SV", short: "DUI", color: "#1A1A1A", archetype: "utmanare" },
  { id: "ger9", league: "germany", name: "Offenbach FC", short: "OFF", color: "#C8102E", archetype: "medelklubb" },
  { id: "ger10", league: "germany", name: "Aachen SC", short: "AAC", color: "#1A1A1A", archetype: "medelklubb" },
  { id: "ger11", league: "germany", name: "Weser Bremen", short: "BRE", color: "#00863F", archetype: "arbetarklubb" },
  { id: "ger12", league: "germany", name: "Main Frankfurt", short: "FRA", color: "#E1000F", archetype: "utmanare" },
  { id: "ger13", league: "germany", name: "Niederrhein Fohlen", short: "MGL", color: "#00693E", archetype: "storklubb" },
  { id: "ger14", league: "germany", name: "Elbe Hamburg", short: "HAM", color: "#0C1C8C", archetype: "utmanare" },
  { id: "ger15", league: "germany", name: "Wolfsrudel Wolfsburg", short: "WOB", color: "#65B32E", archetype: "nyrik" },
  { id: "ger16", league: "germany", name: "Hauptstadt Union", short: "UNI", color: "#EB1923", archetype: "arbetarklubb" },
  { id: "ger17", league: "germany", name: "Breisgau Freiburg", short: "FRE", color: "#1A1A1A", archetype: "akademiklubb" },
  { id: "ger18", league: "germany", name: "Neckar Stuttgart", short: "STU", color: "#E32219", archetype: "medelklubb" },
  { id: "ger19", league: "germany", name: "Rheinhessen Mainz", short: "MAI", color: "#C4122E", archetype: "medelklubb" },
  { id: "ger20", league: "germany", name: "Kraichgau Hoffenheim", short: "HOF", color: "#1961B5", archetype: "nyrik" },

  { id: "fra1", league: "france", name: "FC Paris", short: "PAR", color: "#004170", archetype: "storklubb" },
  { id: "fra2", league: "france", name: "Racing Marseille", short: "MAR", color: "#3FA6D9", archetype: "storklubb" },
  { id: "fra3", league: "france", name: "Rhône Lyonnais", short: "LYO", color: "#1B458F", archetype: "storklubb" },
  { id: "fra4", league: "france", name: "AS Monégasque", short: "MON", color: "#CE1126", archetype: "nyrik" },
  { id: "fra5", league: "france", name: "Stade Mulhouse", short: "MUL", color: "#1B458F", archetype: "arbetarklubb" },
  { id: "fra6", league: "france", name: "Olympique Caen", short: "CAE", color: "#C1272D", archetype: "nyrik" },
  { id: "fra7", league: "france", name: "FC Pau", short: "PAU", color: "#1B7A72", archetype: "akademiklubb" },
  { id: "fra8", league: "france", name: "AS Le Mans", short: "LEX", color: "#1B458F", archetype: "utmanare" },
  { id: "fra9", league: "france", name: "US Valenciennes", short: "VAL", color: "#B22222", archetype: "medelklubb" },
  { id: "fra10", league: "france", name: "Lille Nordistes", short: "LIL", color: "#C8102E", archetype: "akademiklubb" },
  { id: "fra11", league: "france", name: "Les Verts Forez", short: "STE", color: "#00A651", archetype: "arbetarklubb" },
  { id: "fra12", league: "france", name: "Gironde Bordeaux", short: "BOR", color: "#002F6C", archetype: "utmanare" },
  { id: "fra13", league: "france", name: "Sang et Or Lens", short: "LEN", color: "#FFD200", archetype: "arbetarklubb" },
  { id: "fra14", league: "france", name: "Rennais Bretagne", short: "REN", color: "#E2001A", archetype: "medelklubb" },
  { id: "fra15", league: "france", name: "Nantais Canaris", short: "NAN", color: "#FFCD00", archetype: "medelklubb" },
  { id: "fra16", league: "france", name: "Niçois Côte d'Azur", short: "NIC", color: "#D2101F", archetype: "utmanare" },
  { id: "fra17", league: "france", name: "Strasbourgeois Alsace", short: "STR", color: "#1B4CA0", archetype: "medelklubb" },
  { id: "fra18", league: "france", name: "Toulousain Violet", short: "TOU", color: "#6B2C91", archetype: "utmanare" },
  { id: "fra19", league: "france", name: "Montpelliérain Paillade", short: "MTP", color: "#F6871F", archetype: "akademiklubb" },
  { id: "fra20", league: "france", name: "Rémois Champagne", short: "REI", color: "#E2001A", archetype: "utmanare" },
];

// A handful of recognizable clubs placed directly into Division 2, so the second tier isn't 100% procedural either.
const CLUB_DATA_D2 = [
  { id: "eng_d2_sund", league: "england", name: "Bramall Blades", short: "SHU", color: "#EE2737", archetype: "arbetarklubb" },
  { id: "eng_d2_midd", league: "england", name: "Teesside Boro", short: "MID", color: "#CC0000", archetype: "medelklubb" },
  { id: "eng_d2_covn", league: "england", name: "Wigan Wanderers", short: "WIG", color: "#1B458F", archetype: "medelklubb" },
  { id: "ita_d2_peru", league: "italy", name: "Perugia Grifone", short: "PER", color: "#A61C3C", archetype: "medelklubb" },
  { id: "ita_d2_bari", league: "italy", name: "Bari Biancorosso", short: "BAR", color: "#C8102E", archetype: "arbetarklubb" },
  { id: "ita_d2_pale", league: "italy", name: "Palermo Rosanero", short: "PAL", color: "#EE2A7B", archetype: "utmanare" },
  { id: "esp_d2_zara", league: "spain", name: "Maño Zaragoza", short: "ZAR", color: "#0067B1", archetype: "medelklubb" },
  { id: "esp_d2_ovie", league: "spain", name: "Carbayón Oviedo", short: "OVI", color: "#0B4EA2", archetype: "arbetarklubb" },
  { id: "esp_d2_lega", league: "spain", name: "Pepinero Leganés", short: "LEG", color: "#0033A0", archetype: "akademiklubb" },
  { id: "ger_d2_nurn", league: "germany", name: "Franken Nürnberg", short: "NUR", color: "#C4122E", archetype: "arbetarklubb" },
  { id: "ger_d2_kaut", league: "germany", name: "Betzenberg Lautern", short: "KAI", color: "#EE1C25", archetype: "arbetarklubb" },
  { id: "ger_d2_dues", league: "germany", name: "Fortuna Düssel", short: "DUS", color: "#E2001A", archetype: "medelklubb" },
  { id: "fra_d2_metz", league: "france", name: "Messin Lorraine", short: "MET", color: "#8B1538", archetype: "medelklubb" },
  { id: "fra_d2_ajac", league: "france", name: "Corse Ajaccio", short: "AJA", color: "#D2101F", archetype: "utmanare" },
  { id: "fra_d2_hava", league: "france", name: "Havrais Normandie", short: "HAV", color: "#1B4CA0", archetype: "akademiklubb" },
];
// A named Division 3 club — Wrexham AFC's traditional red, set up as a nyrik (nouveau riche) club.
const CLUB_DATA_D3 = [
  { id: "eng_d3_wrex", league: "england", name: "Wrexham Dargons", short: "WRX", color: "#C8102E", archetype: "nyrik" },
];

// ---------- Procedural club generation for the rest of the pyramid ----------
const COUNTRY_NAME_PARTS = {
  england: { cities: ["Sheffield", "Nottingham", "Coventry", "Derby", "Stoke", "Sunderland", "Middlesbrough", "Hull", "Bradford", "Norwich", "Southampton", "Portsmouth", "Brighton", "Reading", "Preston", "Swindon", "Peterborough", "Cambridge", "York", "Exeter", "Bournemouth", "Crewe", "Carlisle", "Colchester", "Northampton", "Mansfield", "Grimsby", "Rotherham", "Doncaster", "Chester", "Lincoln", "Torquay", "Yeovil", "Cheltenham", "Shrewsbury", "Walsall", "Stockport", "Burnley", "Macclesfield", "Gillingham", "Barnsley", "Huddersfield", "Wigan", "Blackpool"], suffixes: ["United", "City", "Town", "Athletic", "Rovers", "Wanderers", "Albion"], cityFirst: true },
  italy: { cities: ["Verona", "Venezia", "Padova", "Trieste", "Brescia", "Parma", "Modena", "Perugia", "Livorno", "Ravenna", "Cagliari", "Foggia", "Salerno", "Ferrara", "Sassari", "Monza", "Siracusa", "Pescara", "Bergamo", "Forlì", "Trento", "Vicenza", "Terni", "Novara", "Piacenza", "Ancona", "Udine", "Arezzo", "Cesena", "Lecce", "Pisa", "Como", "Varese", "Bolzano", "Pavia", "Catanzaro", "Taranto", "Rimini", "Empoli", "Prato", "Cremona", "Lucca", "Grosseto", "Avellino"], suffixes: ["Calcio", "AC", "Sportiva", "Unione", "1913", "1920"], cityFirst: true },
  spain: { cities: ["Valencia", "Zaragoza", "Murcia", "Palma", "Alicante", "Córdoba", "Valladolid", "Vigo", "Gijón", "Granada", "Vitoria", "Elche", "Oviedo", "Santander", "Cádiz", "Jerez", "Pamplona", "Almería", "Salamanca", "Huelva", "León", "Burgos", "Tarragona", "Cartagena", "Lleida", "Badajoz", "Toledo", "Sabadell", "Girona", "Castellón", "Logroño", "Ourense", "Albacete", "Getafe", "Reus", "Mérida", "Ferrol", "Lugo", "Talavera", "Manresa", "Algeciras"], suffixes: ["CF", "Real", "Deportivo", "Unión", "UD", "Balompié"], cityFirst: false },
  germany: { cities: ["Dortmund", "Essen", "Bremen", "Dresden", "Hannover", "Nürnberg", "Duisburg", "Bochum", "Wuppertal", "Bielefeld", "Bonn", "Mannheim", "Karlsruhe", "Wiesbaden", "Münster", "Augsburg", "Gelsenkirchen", "Braunschweig", "Kiel", "Chemnitz", "Aachen", "Halle", "Magdeburg", "Freiburg", "Krefeld", "Lübeck", "Rostock", "Kassel", "Hagen", "Saarbrücken", "Potsdam", "Mainz", "Oldenburg", "Osnabrück", "Darmstadt", "Regensburg", "Würzburg", "Ingolstadt", "Paderborn", "Ulm", "Offenbach", "Fürth", "Erlangen", "Trier"], suffixes: ["SV", "FC", "SC", "TSV", "VfL", "Kickers", "Sportfreunde"], cityFirst: true },
  france: { cities: ["Toulouse", "Nantes", "Strasbourg", "Montpellier", "Bordeaux", "Lille", "Rennes", "Reims", "Le Havre", "Toulon", "Grenoble", "Dijon", "Angers", "Nîmes", "Le Mans", "Clermont-Ferrand", "Brest", "Tours", "Limoges", "Amiens", "Metz", "Perpignan", "Besançon", "Orléans", "Rouen", "Mulhouse", "Caen", "Nancy", "Roubaix", "Avignon", "Poitiers", "Pau", "Colmar", "Vannes", "Bastia", "Valenciennes", "Béziers", "Lorient", "Niort", "Chambéry", "Annecy", "Laval", "Guingamp"], suffixes: ["FC", "AS", "US", "Racing", "Stade", "Olympique"], cityFirst: false },
};
const FORBIDDEN_CITY_SUFFIX = {
  "england|Sheffield": ["United"], "england|Bristol": ["City", "Rovers"], "england|Oxford": ["United"],
  "england|Ipswich": ["Town"], "england|Luton": ["Town"], "england|Charlton": ["Athletic"],
  "england|Bolton": ["Wanderers"], "england|Blackburn": ["Rovers"], "england|Wigan": ["Athletic"],
  "spain|Bilbao": ["Athletic"], "france|Marseille": ["Olympique"], "france|Lyon": ["Olympique"],
};
const COLOR_POOL = ["#C1272D", "#1F4E99", "#2F8F5B", "#D99A2B", "#6C3FA0", "#D2601F", "#1B2A55", "#1E8A82", "#7A2048", "#4FA8E0", "#3FA6D9", "#A82631", "#E0B02A", "#6A4C93", "#555A66", "#C9A227", "#B22222", "#2A5CAA", "#D6A419", "#1E7A46", "#9A2E2E", "#274690", "#D4772B", "#2E7D4F"];
// Real-world clubs from these cities have well-known colours — even the procedurally generated
// (non-named) clubs should reflect that if their city is recognisable, e.g. Hull is amber/orange,
// Norwich is yellow/green. Falls back to the random COLOR_POOL for smaller/less iconic towns.
const CITY_COLORS = {
  england: {
    Sheffield: "#003D7C", Nottingham: "#000000", Derby: "#FFFFFF", Stoke: "#E03A3E", Hull: "#F5A12E",
    Bradford: "#8A1538", Norwich: "#FFF200", Portsmouth: "#1B458F", Reading: "#004494", Swindon: "#E4032E",
    Peterborough: "#1C1CB4", Cambridge: "#F2A900", Exeter: "#ED1C24", Bournemouth: "#B50E12", Crewe: "#DA020E",
    Carlisle: "#1B458F", Colchester: "#0033A0", Northampton: "#870A3B", Mansfield: "#F2A900", Grimsby: "#000000",
    Rotherham: "#DA291C", Doncaster: "#E4032E", Lincoln: "#C8102E", Yeovil: "#00A651", Cheltenham: "#DA020E",
    Shrewsbury: "#F2A900", Walsall: "#D0021B", Stockport: "#0057B8", Burnley: "#6C1D45", Gillingham: "#0033A0",
    Barnsley: "#D0021B", Huddersfield: "#0066B3", Blackpool: "#FF7900", Preston: "#FFFFFF",
  },
  italy: {
    Venezia: "#F7941D", Brescia: "#0057B8", Modena: "#FFD200", Livorno: "#7A1E33", Ferrara: "#87CEEB",
    Monza: "#C8102E", Como: "#0057B8", Catanzaro: "#FFD200", Taranto: "#C8102E", Rimini: "#C8102E",
    Cremona: "#8B1D28", Lecce: "#FFD200", Pisa: "#001489", Varese: "#C8102E", Novara: "#0033A0",
    Vicenza: "#FFFFFF", Salerno: "#7A1E33", Avellino: "#00A651",
  },
  spain: {
    Valencia: "#F5A100", Zaragoza: "#0067B1", Murcia: "#8B1538", Palma: "#CB1616", Alicante: "#0033A0",
    Córdoba: "#FFFFFF", Valladolid: "#5B2A86", Vigo: "#8AC3EE", Gijón: "#D2001C", Granada: "#C8102E",
    Vitoria: "#0033A0", Elche: "#026937", Oviedo: "#0B4EA2", Santander: "#00954C", Cádiz: "#FFE500",
    Almería: "#C8102E", León: "#0033A0", Girona: "#C8102E", Castellón: "#00954C",
  },
  germany: {
    Bremen: "#00863F", Nürnberg: "#C4122E", Duisburg: "#1A1A1A", Bochum: "#0033A0", Bielefeld: "#1A1A1A",
    Karlsruhe: "#1B458F", Gelsenkirchen: "#004C9D", Braunschweig: "#F2C230", Kiel: "#0033A0", Aachen: "#000000",
    Magdeburg: "#0033A0", Freiburg: "#000000", Rostock: "#1A1A1A", Saarbrücken: "#0033A0", Mainz: "#C4122E",
    Osnabrück: "#7A1E33", Darmstadt: "#003DA5", Regensburg: "#C8102E", Ingolstadt: "#C8102E", Fürth: "#1A7A3C",
  },
  france: {
    Toulouse: "#6B2C91", Nantes: "#FFCD00", Strasbourg: "#1B4CA0", Montpellier: "#F6871F", Rennes: "#E2001A",
    Reims: "#E2001A", "Le Havre": "#1B4CA0", Grenoble: "#C8102E", Angers: "#000000", Brest: "#C8102E",
    Metz: "#8B1538", Amiens: "#0033A0", Caen: "#C1272D", Nancy: "#8B1538", Lorient: "#F7941D",
    Niort: "#00954C", Guingamp: "#C8102E",
  },
};
function colorForClubName(country, name) {
  const map = CITY_COLORS[country];
  if (!map) return null;
  for (const city of Object.keys(map)) {
    if (name.includes(city)) return map[city];
  }
  return null;
}

function makeProceduralName(country, usedNames) {
  const p = COUNTRY_NAME_PARTS[country];
  for (let tries = 0; tries < 40; tries++) {
    const city = pick(p.cities);
    const forbidden = FORBIDDEN_CITY_SUFFIX[`${country}|${city}`] || [];
    const validSuffixes = p.suffixes.filter(s => !forbidden.includes(s));
    const suffix = pick(validSuffixes.length ? validSuffixes : p.suffixes);
    const name = p.cityFirst ? `${city} ${suffix}` : `${suffix} ${city}`;
    if (!usedNames.has(name)) { usedNames.add(name); return name; }
  }
  // fallback: guaranteed-unique with a numeric tag if the pool is exhausted
  let n = 2, fallback;
  do { fallback = `${pick(p.cities)} ${n}`; n++; } while (usedNames.has(fallback) && n < 50);
  usedNames.add(fallback);
  return fallback;
}
function shortCodeFrom(name) {
  const letters = name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 3);
  return letters || "CLB";
}

const DIV1_EXTRA_ARCHETYPES = ["medelklubb", "medelklubb", "utmanare", "arbetarklubb", "akademiklubb"];
const DIV2_ARCHETYPES = ["medelklubb", "medelklubb", "arbetarklubb", "utmanare", "akademiklubb"];
const DIV3_ARCHETYPES = ["arbetarklubb", "arbetarklubb", "akademiklubb", "medelklubb", "utmanare"];

function generateWorld() {
  const clubs = {};
  LEAGUES.forEach(country => {
    const usedNames = new Set();
    CLUB_DATA.filter(c => c.league === country.id).forEach(c => {
      const arche = ARCHETYPES[c.archetype];
      usedNames.add(c.name);
      const squad = withSeededRandom(c.id + "squad", () => makeSquad(country.id, c.archetype, 1, arche.startDev.akademi));
      const strength = withSeededRandom(c.id + "strength", () => deriveClubStrength(squad));
      clubs[c.id] = { id: c.id, league: c.league, division: 1, name: c.name, short: c.short, color: c.color, archetype: c.archetype, strength, manager: generateManager(country.id), squad, youthSquad: Array.from({ length: academyProspectCountForLevel(arche.startDev.akademi) }, () => generateYouthProspect(arche.startDev.akademi, 0, country.id)) };
    });
    const namedCount = CLUB_DATA.filter(c => c.league === country.id).length;
    const fillerCount = Math.max(0, 20 - namedCount);
    for (let i = 0; i < fillerCount; i++) {
      const id = `${country.id}_d1_p${i}`;
      const { archetype, name, strength, squad } = withSeededRandom(id + "identity", () => {
        const archetype = pick(DIV1_EXTRA_ARCHETYPES);
        const arche = ARCHETYPES[archetype];
        const name = makeProceduralName(country.id, usedNames);
        const squad = makeSquad(country.id, archetype, 1, arche.startDev.akademi);
        const strength = deriveClubStrength(squad);
        return { archetype, name, strength, squad };
      });
      clubs[id] = { id, league: country.id, division: 1, name, short: shortCodeFrom(name), color: colorForClubName(country.id, name) || pick(COLOR_POOL), archetype, strength, manager: generateManager(country.id), squad, youthSquad: Array.from({ length: academyProspectCountForLevel(ARCHETYPES[archetype].startDev.akademi) }, () => generateYouthProspect(ARCHETYPES[archetype].startDev.akademi, 0, country.id)) };
    }
    CLUB_DATA_D2.filter(c => c.league === country.id).forEach(c => {
      const arche = ARCHETYPES[c.archetype];
      usedNames.add(c.name);
      const squad = withSeededRandom(c.id + "squad", () => makeSquad(country.id, c.archetype, 2, arche.startDev.akademi));
      const strength = withSeededRandom(c.id + "strength", () => deriveClubStrength(squad));
      clubs[c.id] = { id: c.id, league: c.league, division: 2, name: c.name, short: c.short, color: c.color, archetype: c.archetype, strength, manager: generateManager(country.id), squad, youthSquad: Array.from({ length: academyProspectCountForLevel(Math.max(1, arche.startDev.akademi - 1)) }, () => generateYouthProspect(Math.max(1, arche.startDev.akademi - 1), 0, country.id)) };
    });
    const namedD2Count = CLUB_DATA_D2.filter(c => c.league === country.id).length;
    for (let i = 0; i < 20 - namedD2Count; i++) {
      const id = `${country.id}_d2_p${i}`;
      const { archetype, name, strength, squad } = withSeededRandom(id + "identity", () => {
        const archetype = pick(DIV2_ARCHETYPES);
        const arche = ARCHETYPES[archetype];
        const name = makeProceduralName(country.id, usedNames);
        const squad = makeSquad(country.id, archetype, 2, arche.startDev.akademi);
        const strength = deriveClubStrength(squad);
        return { archetype, name, strength, squad };
      });
      clubs[id] = { id, league: country.id, division: 2, name, short: shortCodeFrom(name), color: colorForClubName(country.id, name) || pick(COLOR_POOL), archetype, strength, manager: generateManager(country.id), squad, youthSquad: Array.from({ length: academyProspectCountForLevel(Math.max(1, ARCHETYPES[archetype].startDev.akademi - 1)) }, () => generateYouthProspect(Math.max(1, ARCHETYPES[archetype].startDev.akademi - 1), 0, country.id)) };
    }
    CLUB_DATA_D3.filter(c => c.league === country.id).forEach(c => {
      const arche = ARCHETYPES[c.archetype];
      usedNames.add(c.name);
      const squad = withSeededRandom(c.id + "squad", () => makeSquad(country.id, c.archetype, 3, arche.startDev.akademi));
      const strength = withSeededRandom(c.id + "strength", () => deriveClubStrength(squad));
      clubs[c.id] = { id: c.id, league: c.league, division: 3, name: c.name, short: c.short, color: c.color, archetype: c.archetype, strength, manager: generateManager(country.id), squad, youthSquad: Array.from({ length: academyProspectCountForLevel(Math.max(1, arche.startDev.akademi - 2)) }, () => generateYouthProspect(Math.max(1, arche.startDev.akademi - 2), 0, country.id)) };
    });
    const namedD3Count = CLUB_DATA_D3.filter(c => c.league === country.id).length;
    for (let i = 0; i < 20 - namedD3Count; i++) {
      const id = `${country.id}_d3_p${i}`;
      const { archetype, name, strength, squad } = withSeededRandom(id + "identity", () => {
        const archetype = pick(DIV3_ARCHETYPES);
        const arche = ARCHETYPES[archetype];
        const name = makeProceduralName(country.id, usedNames);
        const squad = makeSquad(country.id, archetype, 3, arche.startDev.akademi);
        const strength = deriveClubStrength(squad);
        return { archetype, name, strength, squad };
      });
      clubs[id] = { id, league: country.id, division: 3, name, short: shortCodeFrom(name), color: colorForClubName(country.id, name) || pick(COLOR_POOL), archetype, strength, manager: generateManager(country.id), squad, youthSquad: Array.from({ length: academyProspectCountForLevel(Math.max(1, ARCHETYPES[archetype].startDev.akademi - 2)) }, () => generateYouthProspect(Math.max(1, ARCHETYPES[archetype].startDev.akademi - 2), 0, country.id)) };
    }
  });
  assignRivals(clubs);
  return clubs;
}
const FORCED_RIVALRIES = [
  ["eng3", "eng5"], // Thames Ironworks F.C. vs Millwall Rovers
  ["eng1", "eng9"], // Liverpool Athletic vs Merseyside Toffees — Merseyside Derby
  ["eng4", "eng10"], // North London Gunners vs White Hart Wanderers — North London Derby
  ["eng2", "eng7"], // Manchester Rovers vs Trafford United — Manchester Derby
  ["eng20", "eng12"], // Wearside Sunderland vs Tyneside Magpies — Tyne-Wear Derby
  ["ita2", "ita3"], // Milano 1899 vs Milano Nerazzurri — Derby della Madonnina
  ["esp1", "esp2"], // CF Madrid vs Deportivo Barcelona — El Clásico
  ["ger1", "ger2"], // München 1900 vs Dortmund 1909 — Der Klassiker
  ["fra1", "fra2"], // FC Paris vs Racing Marseille — Le Classique
];
function assignRivals(clubs) {
  const forcedIds = new Set();
  FORCED_RIVALRIES.forEach(([a, b]) => {
    if (clubs[a] && clubs[b]) {
      clubs[a].rivalId = b;
      clubs[b].rivalId = a;
      forcedIds.add(a); forcedIds.add(b);
    }
  });
  LEAGUES.forEach(country => {
    [1, 2, 3].forEach(div => {
      const ids = shuffle(clubsInPool(country.id, div, clubs).map(c => c.id).filter(id => !forcedIds.has(id)));
      for (let i = 0; i + 1 < ids.length; i += 2) {
        clubs[ids[i]].rivalId = ids[i + 1];
        clubs[ids[i + 1]].rivalId = ids[i];
      }
    });
  });
}
function clubsInPool(countryId, division, clubs) { return Object.values(clubs).filter(c => c.league === countryId && c.division === division); }

// ---------- Name pools (players) ----------
const ENG_FIRST = ["James","Oliver","Harry","Jack","George","Charlie","Thomas","William","Alfie","Henry","Josh","Daniel","Ryan","Callum","Lewis","Connor","Ben","Sam","Jake","Liam"];
const ENG_LAST = ["Smith","Jones","Taylor","Brown","Wilson","Evans","Thomas","Roberts","Johnson","Walker","Wright","Robinson","Wood","Thompson","White","Watson","Jackson","Turner","Hughes","Edwards"];
const ITA_FIRST = ["Marco","Luca","Matteo","Andrea","Alessandro","Francesco","Davide","Simone","Federico","Lorenzo","Riccardo","Antonio","Giovanni","Stefano","Paolo","Fabio","Gabriele","Nicola","Emanuele","Giuseppe"];
const ITA_LAST = ["Rossi","Russo","Ferrari","Esposito","Bianchi","Romano","Colombo","Ricci","Marino","Greco","Bruno","Gallo","Conti","De Luca","Costa","Giordano","Mancini","Rizzo","Lombardi","Moretti"];
const ESP_FIRST = ["Álvaro","Javier","Sergio","Pablo","Adrián","Diego","Iker","Marc","Rubén","Hugo","Mario","Carlos","Raúl","Álex","Antonio","Manuel","Jorge","Víctor","Pedro","Iván"];
const ESP_LAST = ["García","Martínez","López","Sánchez","Pérez","Gómez","Fernández","Ruiz","Díaz","Moreno","Muñoz","Álvarez","Romero","Navarro","Torres","Domínguez","Vázquez","Ramos","Gil","Serrano"];
const GER_FIRST = ["Lukas","Maximilian","Leon","Finn","Jonas","Felix","Paul","Niklas","Tim","Julian","Moritz","Tobias","Sebastian","Florian","Jan","Philipp","David","Simon","Christian","Daniel"];
const GER_LAST = ["Müller","Schmidt","Schneider","Fischer","Weber","Meyer","Wagner","Becker","Schulz","Hoffmann","Koch","Richter","Klein","Wolf","Neumann","Schwarz","Braun","Krüger","Zimmermann","Hartmann"];
const FRA_FIRST = ["Lucas","Hugo","Théo","Nathan","Enzo","Louis","Léo","Gabriel","Rayan","Mathis","Antoine","Baptiste","Maxime","Julien","Nicolas","Alexandre","Romain","Kevin","Adrien","Yanis"];
const FRA_LAST = ["Martin","Bernard","Dubois","Thomas","Robert","Petit","Durand","Leroy","Moreau","Simon","Laurent","Lefebvre","Michel","Garcia","David","Bertrand","Roux","Vincent","Fournier","Morel"];
const SA_FIRST = ["Thiago","Matías","Rodrigo","Gabriel","Facundo","Bruno","Diego","Nicolás","Rafael","Santiago"];
const SA_LAST = ["Silva","Fernández","Rodrigues","González","Almeida","Martínez","Souza","Pereira","Ramírez","Costa"];
const AF_FIRST = ["Kwame","Amadou","Yaya","Sadio","Ibrahim","Emeka","Moussa","Chidi","Baba","Osei"];
const AF_LAST = ["Mensah","Diallo","Traoré","Okafor","Camara","Koné","Adeyemi","Bello","Diarra","Touré"];
const AS_FIRST = ["Haruto","Minjun","Wei","Kenji","Jin","Ryo","Sun","Tetsuo","Hyun","Daichi"];
const AS_LAST = ["Tanaka","Kim","Park","Sato","Nakamura","Lee","Chen","Watanabe","Suzuki","Yamamoto"];
const NA_FIRST = ["Jordan","Tyler","Cole","Ricardo","Diego","Marco","Ethan","Caleb","Mason","Jayden"];
const NA_LAST = ["Johnson","Rivera","Reyna","Morales","Aaronson","Adams","Wright","Turner","Bello","Hernández"];

const NATIONALITY_POOLS = {
  england: { first: ENG_FIRST, last: ENG_LAST, label: "England" },
  italy: { first: ITA_FIRST, last: ITA_LAST, label: "Italien" },
  spain: { first: ESP_FIRST, last: ESP_LAST, label: "Spanien" },
  germany: { first: GER_FIRST, last: GER_LAST, label: "Tyskland" },
  france: { first: FRA_FIRST, last: FRA_LAST, label: "Frankrike" },
  sydamerika: { first: SA_FIRST, last: SA_LAST, label: "Sydamerika" },
  afrika: { first: AF_FIRST, last: AF_LAST, label: "Afrika" },
  asien: { first: AS_FIRST, last: AS_LAST, label: "Asien" },
  nordamerika: { first: NA_FIRST, last: NA_LAST, label: "Nordamerika" },
};
const NATIONALITY_KEYS = Object.keys(NATIONALITY_POOLS);
const EUROPEAN_NATIONALITIES = ["england", "italy", "spain", "germany", "france"];
function nationalityLabel(nat) { return NATIONALITY_POOLS[nat]?.label || "Okänd"; }
function randomDomesticNationality(clubCountry) {
  // Most players are homegrown; some are imports from anywhere in the wider football world.
  if (Math.random() < 0.72) return clubCountry;
  return pick(NATIONALITY_KEYS.filter(n => n !== clubCountry));
}
function nameForNationality(nat) {
  const pool = NATIONALITY_POOLS[nat] || NATIONALITY_POOLS.england;
  return `${pick(pool.first)} ${pick(pool.last)}`;
}

const REGION_LABELS = { europa: "Europa", sydamerika: "Sydamerika", afrika: "Afrika", asien: "Asien", nordamerika: "Nordamerika" };
const REGION_UNLOCK = { europa: 1, sydamerika: 3, afrika: 3, asien: 5, nordamerika: 4 };
const REGION_BIAS = {
  europa: { attack: 0, defense: 0, priceMult: 1.0 },
  sydamerika: { attack: 5, defense: -3, priceMult: 1.15, nationality: "sydamerika" },
  afrika: { attack: 2, defense: 2, priceMult: 1.1, nationality: "afrika" },
  asien: { attack: -2, defense: 4, priceMult: 1.05, nationality: "asien" },
  nordamerika: { attack: 1, defense: 1, priceMult: 1.08, nationality: "nordamerika" },
};

function randomPlayerName(nationality) { return nameForNationality(nationality || pick(NATIONALITY_KEYS)); }
function generateManager(clubCountry) {
  const nationality = Math.random() < 0.78 ? clubCountry : pick(NATIONALITY_KEYS.filter(n => n !== clubCountry));
  return { name: nameForNationality(nationality), nationality };
}
function computeWage(value, attack, defense) {
  return Math.max(4, Math.round(value * 0.011 + ((attack + defense) / 2) * 0.15));
}
const PERSONALITIES = ["Balanserad", "Balanserad", "Balanserad", "Balanserad", "Balanserad", "Ledare", "Lojal", "Ambitiös", "Problemspelare"];
const PERSONALITY_DESC = {
  Balanserad: "Inga särskilda utmärkande drag.",
  Ledare: "Stabiliserar laget — trivseln svänger mindre, i med- och motgång.",
  Lojal: "Ber sällan om en övergång, även vid missnöje.",
  Ambitiös: "Vill vinna titlar och spela regelbundet — annars växer missnöjet snabbt.",
  Problemspelare: "Trivseln svänger kraftigt, med ökad risk för gula kort.",
};
function makePlayer(pos, homeCountry, forcedSpecificPosition, archetype, division, youthSlot) {
  const arche = ARCHETYPES[archetype];
  const archShift = arche ? Math.round(((arche.tierMin + arche.tierMax) / 2 - 68.5) * 0.6) : 0;
  const divPenalty = division === 3 ? 26 : division === 2 ? 14 : 0;
  const shift = archShift - divPenalty;
  let attack, defense;
  if (pos === "MV") { attack = rndInt(15, 30); defense = rndInt(58, 78); }
  else if (pos === "FÖ") { attack = rndInt(28, 48); defense = rndInt(55, 80); }
  else if (pos === "MF") { attack = rndInt(48, 72); defense = rndInt(42, 66); }
  else { attack = rndInt(60, 84); defense = rndInt(22, 45); }
  attack = clamp(attack + shift, 15, 96);
  defense = clamp(defense + shift, 15, 96);
  if (youthSlot) { attack = clamp(Math.round(attack * 0.82), 15, 90); defense = clamp(Math.round(defense * 0.82), 15, 90); }
  const value = Math.round((((attack + defense) / 2) * 8 + rndInt(-25, 35)) * 1.1);
  const nationality = homeCountry ? randomDomesticNationality(homeCountry) : pick(NATIONALITY_KEYS);
  const age = youthSlot ? rndInt(18, 21) : rndInt(18, 33);
  const finalValue = Math.max(40, value);
  const id = uid();
  // Potential is a ceiling — must never sit below the player's actual position-weighted overall, not
  // the naive attack/defense average. Uses the real id so the sub-attribute jitter matches exactly what
  // will later be computed for this same player — a preview computed without the real id would roll
  // different jitter and could let the real overall creep past the potential set here.
  const overall = overallOf({ id, pos, attack, defense });
  const ageRoom = youthSlot ? rndInt(16, 28) : age <= 21 ? rndInt(8, 22) : age <= 25 ? rndInt(3, 12) : age <= 29 ? rndInt(0, 5) : 0;
  const potential = clamp(Math.round(overall + ageRoom), overall, 99);
  return { id, name: randomPlayerName(nationality), nationality, age, pos, specificPosition: forcedSpecificPosition || randomSpecificPosition(pos), attack, defense, potential, value: finalValue, wage: computeWage(finalValue, attack, defense), contractYears: rndInt(1, 4), injuryWeeks: 0, yellowCards: 0, suspendedMatches: 0, morale: 70, personality: pick(PERSONALITIES), apps: 0, goals: 0, assists: 0, seasonLog: [], ratingSum: 0 };
}
function distributeSpecificPositions(pos, count) {
  if (pos !== "FÖ" && pos !== "MF") return Array.from({ length: count }, () => randomSpecificPosition(pos));
  const leftOptions = pos === "FÖ" ? ["VB", "VWB"] : ["VM", "VOM"];
  const rightOptions = pos === "FÖ" ? ["HB", "HWB"] : ["HM", "HOM"];
  const centerOptions = pos === "FÖ" ? ["CB"] : ["CDM", "CM", "CAM"];
  const guaranteed = [pick(leftOptions), pick(rightOptions), pick(centerOptions), pick(centerOptions)];
  const allOptions = SPECIFIC_POSITIONS[pos].map(p => p.code);
  const result = guaranteed.slice(0, count);
  for (let i = result.length; i < count; i++) result.push(pick(allOptions));
  return shuffle(result);
}
function makeSquad(homeCountry, archetype, division, akademiLevel = 2) {
  const counts = { MV: 2, FÖ: 7, MF: 7, AN: 4 };
  const squad = [];
  const youthSlotChance = clamp(0.1 + (akademiLevel - 1) * 0.09, 0.08, 0.5);
  Object.entries(counts).forEach(([pos, n]) => {
    const specificPositions = distributeSpecificPositions(pos, n);
    for (let i = 0; i < n; i++) squad.push(makePlayer(pos, homeCountry, specificPositions[i], archetype, division, Math.random() < youthSlotChance));
  });
  for (let i = 0; i < 2; i++) squad.push(makePlayer(pick(POS_ORDER), homeCountry, null, archetype, division, false));
  squad.forEach((p, i) => { p.number = i + 1; });
  return squad;
}
// Derives a club's matchday strength rating from its actual squad instead of an independent random roll,
// so two clubs with similarly good squads end up similarly rated. The starting XI (by quality) is weighted
// heavily since that's who actually plays, with squad depth mattering a little less. A small random margin
// (±noise) is layered on top — enough to allow "weaker on paper" clubs to occasionally punch above their
// weight over a season, without decoupling the rating from squad reality the way the old system did.
// Plain average overall across every player in the squad — used to show the club's overall
// rating and matching 10-star display, both at club selection and live in the Squad tab.
function squadOverallRating(squad) {
  if (!squad || !squad.length) return 0;
  return Math.round(squad.reduce((s, p) => s + overallOf(p), 0) / squad.length);
}
function deriveClubStrength(squad, noise = 5) {
  const sorted = [...squad].sort((a, b) => overallOf(b) - overallOf(a));
  const bestXI = sorted.slice(0, 11);
  const rest = sorted.slice(11);
  const bestAvg = bestXI.reduce((s, p) => s + overallOf(p), 0) / Math.max(1, bestXI.length);
  const restAvg = rest.length ? rest.reduce((s, p) => s + overallOf(p), 0) / rest.length : bestAvg;
  const rating = bestAvg * 0.85 + restAvg * 0.15;
  return clamp(Math.round(rating + rnd(-noise, noise)), 20, 97);
}
function assignSquadNumber(squad) {
  const used = new Set(squad.map(p => p.number).filter(n => n !== undefined && n !== null));
  for (let n = 1; n <= 99; n++) if (!used.has(n)) return n;
  return rndInt(1, 99);
}
function playerInitials(name) {
  const parts = name.trim().split(/\s+/);
  return parts.length >= 2 ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase() : name.slice(0, 2).toUpperCase();
}
function pickOwningClub(clubs, overall) {
  const pool = Object.values(clubs);
  let best = null, bestScore = Infinity;
  pool.forEach(c => { const score = Math.abs(c.strength - overall) + rnd(0, 8); if (score < bestScore) { bestScore = score; best = c; } });
  return best ? best.id : null;
}
function makeScoutPlayer(pos, region, rating, clubs) {
  const bias = REGION_BIAS[region];
  const scale = clamp(0.6 + rating * 0.08, 0.6, 1.35);
  let attack, defense;
  if (pos === "MV") { attack = rndInt(15, 30); defense = rndInt(58, 78); }
  else if (pos === "FÖ") { attack = rndInt(28, 48); defense = rndInt(55, 80); }
  else if (pos === "MF") { attack = rndInt(48, 72); defense = rndInt(42, 66); }
  else { attack = rndInt(60, 84); defense = rndInt(22, 45); }
  attack = clamp(Math.round((attack + bias.attack) * scale), 20, 97);
  defense = clamp(Math.round((defense + bias.defense) * scale), 20, 97);
  const value = Math.max(60, Math.round((((attack + defense) / 2) * 8 * bias.priceMult + rndInt(-25, 35)) * 1.1));
  const nationality = bias.nationality || pick(EUROPEAN_NATIONALITIES);
  const age = rndInt(19, 31);
  const clubId = clubs ? pickOwningClub(clubs, (attack + defense) / 2) : null;
  const overallish = (attack + defense) / 2;
  const rivalInterest = (age <= 23 && overallish >= 55 && Math.random() < 0.22) ? pick(["En storklubb", "Ett par klubbar från kontinenten", "En ambitiös uppstickarklubb", "Flera klubbar i toppdivisionerna"]) : null;
  return { id: uid(), name: randomPlayerName(nationality), nationality, age, pos, specificPosition: randomSpecificPosition(pos), attack, defense, value, wage: computeWage(value, attack, defense), clubId, contractYears: rndInt(2, 5), injuryWeeks: 0, yellowCards: 0, suspendedMatches: 0, morale: 70, apps: 0, goals: 0, ratingSum: 0, rivalInterest };
}
function effectiveScoutRating(dev, reputation, analysBonus = 0) { return clamp(dev.scouting + reputation / 25 + analysBonus * 0.4, 1, 9.5); }
// A standalone player from outside the simulated leagues — "Övriga världen". Not owned by any of the
// 300 clubs; represents the wider footballing world you can only reach through scouting. Spans a wide
// quality range on purpose, since a pool this size should have everything from fringe players to gems.
function generateWorldPoolPlayer(region) {
  const bias = REGION_BIAS[region] || REGION_BIAS.europa;
  const pos = pick(POS_ORDER);
  const qualityRoll = Math.random();
  const tierBase = qualityRoll < 0.55 ? rnd(28, 48) : qualityRoll < 0.88 ? rnd(45, 65) : rnd(62, 85);
  let attack, defense;
  if (pos === "MV") { attack = rndInt(15, 30); defense = clamp(Math.round(tierBase * 1.05), 15, 90); }
  else if (pos === "FÖ") { attack = clamp(Math.round(tierBase * 0.55), 15, 80); defense = clamp(Math.round(tierBase * 1.05), 15, 90); }
  else if (pos === "MF") { attack = clamp(Math.round(tierBase * 0.95), 15, 88); defense = clamp(Math.round(tierBase * 0.75), 15, 85); }
  else { attack = clamp(Math.round(tierBase * 1.1), 15, 92); defense = clamp(Math.round(tierBase * 0.4), 15, 70); }
  attack = clamp(Math.round(attack + bias.attack), 15, 95);
  defense = clamp(Math.round(defense + bias.defense), 15, 95);
  const value = Math.max(50, Math.round((((attack + defense) / 2) * 7.5 * bias.priceMult + rndInt(-20, 30)) * 1.05));
  const nationality = bias.nationality || pick(EUROPEAN_NATIONALITIES);
  const age = rndInt(18, 32);
  const player = { id: uid(), name: randomPlayerName(nationality), nationality, age, pos, specificPosition: randomSpecificPosition(pos), attack, defense, value, wage: computeWage(value, attack, defense), region, contractYears: rndInt(1, 4), injuryWeeks: 0, yellowCards: 0, suspendedMatches: 0, morale: 70, apps: 0, goals: 0, assists: 0, ratingSum: 0 };
  // Potential is a ceiling, so it can never sit below the player's actual current overall — computed the
  // same position-weighted way "overall" itself is, not a naive attack/defense average that can badly
  // under-count a lopsided player (e.g. a striker whose weak defense barely factors into their real overall).
  const currentOverall = overallOf(player);
  player.potential = clamp(currentOverall + rndInt(0, 12), currentOverall, 96);
  return player;
}
// The full "Övriga världen" pool — counts per region reflect roughly how much of the real footballing
// world each region represents outside the leagues actually simulated in the game.
const WORLD_POOL_COUNTS = { sydamerika: 100, europa: 200, afrika: 50, asien: 25, nordamerika: 25 };
function generateWorldPool() {
  const pool = {};
  Object.entries(WORLD_POOL_COUNTS).forEach(([region, count]) => {
    pool[region] = withSeededRandom("worldpool" + region, () => Array.from({ length: count }, () => generateWorldPoolPlayer(region)));
  });
  return pool;
}
// Draws a handful of candidates out of the persistent world pool for the scout market. A weak scouting
// network surfaces a near-random slice of the pool — you might stumble onto anyone. A strong network
// reliably filters toward the genuinely best players actually sitting in that region's pool right now.
// Samples a fresh random slice of the pool WITHOUT removing anyone — used to rotate what's visible in
// the scout market each round. Only signing a player actually removes them from the pool for good.
function sampleFromWorldPool(poolForRegion, scoutingRating, count) {
  if (!poolForRegion || !poolForRegion.length) return [];
  const noise = clamp(1 - scoutingRating / 10, 0.1, 0.95);
  const scored = poolForRegion.map(p => ({ p, score: overallOf(p) + (Math.random() * 2 - 1) * 60 * noise }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, count).map(s => s.p);
}
function drawFromWorldPool(poolForRegion, scoutingRating, count) {
  if (!poolForRegion || !poolForRegion.length) return { picks: [], remaining: poolForRegion || [] };
  const noise = clamp(1 - scoutingRating / 10, 0.1, 0.95);
  const scored = poolForRegion.map(p => ({ p, score: overallOf(p) + (Math.random() * 2 - 1) * 60 * noise }));
  scored.sort((a, b) => b.score - a.score);
  const picks = scored.slice(0, count).map(s => s.p);
  const pickedIds = new Set(picks.map(p => p.id));
  const remaining = poolForRegion.filter(p => !pickedIds.has(p.id));
  return { picks, remaining };
}

// ---------- Scout missions (targeted search with filters) ----------
function scoutMissionDuration(scoutLevel) { return clamp(7 - (scoutLevel || 0) * 1.1, 2, 7); }
// Time (in rounds) to scout a SPECIFIC, already-visible player and reveal their true numbers — separate
// from a full scout mission (which searches for a new candidate). Same club-scouting-level dependency,
// just a shorter, more targeted job since you already know who you're looking at.
function playerScoutDuration(scoutLevel) { return scoutMissionDuration(scoutLevel); }
// Before a player is scouted, their overall/potential are shown as an honest-but-fuzzy range rather than
// an exact number — deliberately makes "window shopping" for obvious bargains much harder. The true value
// always falls inside the shown range, but where within it is randomized so the range's midpoint isn't a
// reliable shortcut either. World-pool ("Övriga världen") players get a wider span since your network has
// essentially no first-hand knowledge of leagues outside the simulated ones.
function fuzzyStatRange(trueValue, playerId, seedSuffix, isWorldPool) {
  const span = isWorldPool ? 13 : 7;
  const rng = seededRandom(String(playerId) + seedSuffix);
  const posInRange = rng();
  const lo = clamp(Math.round(trueValue - span * posInRange), 1, 99);
  const hi = clamp(lo + span, 1, 99);
  return [lo, hi];
}
function isPlayerScouted(player, scoutedPlayerIds, userClubId) {
  if (player.clubId === userClubId || (!player.clubId && player.ownSquad)) return true; // your own players are always known
  return (scoutedPlayerIds || []).includes(player.id);
}
function scoutMissionCeiling(scoutLevel, division) {
  const divAdj = division === 1 ? 0 : division === 2 ? -8 : division === 3 ? -16 : 0;
  const base = scoutLevel ? clamp(58 + scoutLevel * 7, 58, 95) : 62;
  return clamp(base + divAdj, 38, 95);
}
function findRealScoutCandidates(mission, clubs, userClubId, count, worldPool) {
  const attrFilters = mission.attributeFilters || {};
  const activeAttrKeys = Object.keys(attrFilters).filter(k => attrFilters[k]);
  const passesFilters = p => {
    if (mission.posFilter && p.pos !== mission.posFilter) return false;
    if (mission.ageMin && p.age < mission.ageMin) return false;
    if (mission.ageMax && p.age > mission.ageMax) return false;
    if (mission.maxValue && p.value > mission.maxValue) return false;
    if (mission.maxWage && p.wage > mission.maxWage) return false;
    if (mission.minPotential && (p.potential || 0) < mission.minPotential) return false;
    if (activeAttrKeys.length) {
      const attrs = getAttrs(p);
      if (!activeAttrKeys.every(k => attrs[k] >= attrFilters[k])) return false;
    }
    return true;
  };
  const candidates = [];
  if (mission.worldPoolRegion && worldPool) {
    // Searching "Övriga världen" specifically pulls from the same persistent, depleting pool that's
    // browsable directly in the Spelare tab — not a separate made-up set of players.
    const regions = mission.worldPoolRegion === "any" ? Object.keys(worldPool) : [mission.worldPoolRegion];
    regions.forEach(region => {
      (worldPool[region] || []).forEach(p => { if (passesFilters(p)) candidates.push({ player: p, clubId: null }); });
    });
  } else {
    Object.values(clubs).forEach(club => {
      if (club.id === userClubId || !club.squad) return;
      club.squad.forEach(p => { if (passesFilters(p)) candidates.push({ player: p, clubId: club.id }); });
    });
  }
  if (!candidates.length) return [];
  const shuffled = shuffle(candidates);
  return shuffled.slice(0, count).map(c => ({ ...c.player, clubId: c.clubId }));
}
// How keen a player would genuinely be on joining your club — used both for the "Intresserad av din klubb"
// scout filter and later to flag a reluctant sign so overpaying to convince them has real consequences.
// A rough but sensible read on fit: is this a step up or down for them, are they the settling-down type
// or still chasing something bigger, and does age make them more or less open to a less glamorous move.
function playerInterestInClub(player, reputation, division) {
  const overall = overallOf(player);
  const clubCeiling = 30 + (reputation || 30) * 0.6 - (division - 1) * 6;
  let score = 55 + (clubCeiling - overall) * 1.1; // a step up for them scores higher than a step down
  if (player.personality === "Ambitiös") score -= 14;
  else if (player.personality === "Lojal") score += 6;
  else if (player.personality === "Ödmjuk") score += 8;
  else if (player.personality === "Ledare") score -= 4;
  if (player.age <= 21) score += 10;
  else if (player.age >= 31) score += 6;
  const rng = seededRandom(String(player.id) + "clubinterest" + reputation);
  score += (rng() - 0.5) * 24;
  return clamp(Math.round(score), 2, 96);
}
function interestLabel(score) {
  if (score >= 65) return { text: "Positiv till klubben", color: "#3F8F6B" };
  if (score >= 40) return { text: "Avvaktande", color: "#C99A3E" };
  return { text: "Ovillig", color: "#B4443B" };
}
function generateScoutCandidates(mission, scoutLevel, clubs, division, userClubId, reputation, count, worldPool) {
  const wanted = count || clamp(1 + Math.floor((scoutLevel || 0) / 1.5), 1, 4);
  const passesInterest = p => !mission.interestedOnly || playerInterestInClub(p, reputation, division) >= 55;
  const results = [];
  const seenIds = new Set();
  const realPool = findRealScoutCandidates(mission, clubs, userClubId, wanted * 4, worldPool).filter(passesInterest);
  for (const r of realPool) {
    if (results.length >= wanted) break;
    if (seenIds.has(r.id)) continue;
    seenIds.add(r.id);
    results.push(r);
  }
  let guard = 0;
  // World-pool searches only draw from the real, finite pool — no synthetic backfill, since "make up a
  // random extra player" would defeat the point of scouting a specific, persistent region.
  while (results.length < wanted && guard < wanted * 8 && !mission.worldPoolRegion) {
    guard++;
    const synth = generateSyntheticScoutCandidate(mission, scoutLevel, clubs, division);
    if (!synth || !passesInterest(synth)) continue;
    results.push(synth);
  }
  return results;
}
function generateSyntheticScoutCandidate(mission, scoutLevel, clubs, division) {
  const ceiling = scoutMissionCeiling(scoutLevel, division);
  const floor = clamp(ceiling - 18, 26, ceiling - 4);
  const attrFilters = mission.attributeFilters || {};
  const activeAttrKeys = Object.keys(attrFilters).filter(k => attrFilters[k]);
  let best = null;
  const maxTries = 16;
  for (let tries = 0; tries < maxTries; tries++) {
    const pos = mission.posFilter || pick(POS_ORDER);
    const age = rndInt(mission.ageMin || 17, mission.ageMax || 34);
    const overallTarget = rnd(floor, ceiling);
    let attack, defense;
    if (pos === "MV") { defense = overallTarget + rnd(-3, 3); attack = overallTarget * 0.35 + rnd(-5, 5); }
    else if (pos === "FÖ") { defense = overallTarget + rnd(-3, 3); attack = overallTarget * 0.6 + rnd(-5, 5); }
    else if (pos === "MF") { defense = overallTarget * 0.85 + rnd(-4, 4); attack = overallTarget * 0.95 + rnd(-4, 4); }
    else { attack = overallTarget + rnd(-3, 3); defense = overallTarget * 0.45 + rnd(-5, 5); }
    attack = clamp(Math.round(attack), 15, 96);
    defense = clamp(Math.round(defense), 15, 96);
    let value = Math.max(60, Math.round((((attack + defense) / 2) * 8 + rndInt(-20, 30)) * 1.1));
    if (mission.maxValue && value > mission.maxValue) { if (tries < maxTries - 1) continue; value = mission.maxValue; }
    const wage = computeWage(value, attack, defense);
    if (mission.maxWage && wage > mission.maxWage) { if (tries < maxTries - 1) continue; }
    const nationality = pick(NATIONALITY_KEYS);
    const clubId = pickOwningClub(clubs, (attack + defense) / 2);
    const ageRoom = clamp((26 - age) * 2.2, 0, 22);
    // Potential is a ceiling — computed using the real id so the sub-attribute jitter matches exactly
    // what will later be shown for this same player.
    const candidateId = uid();
    const currentOverall = overallOf({ id: candidateId, pos, attack, defense });
    const potential = clamp(Math.round(currentOverall + ageRoom + rnd(-4, 8)), currentOverall, 99);
    if (mission.minPotential && potential < mission.minPotential) { if (tries < maxTries - 1) continue; }
    const specificPosition = mission.sideFilter ? sideFilterPosition(pos, mission.sideFilter) : randomSpecificPosition(pos);
    const candidate = { id: candidateId, name: randomPlayerName(nationality), nationality, age, pos, specificPosition, attack, defense, potential, value, wage: mission.maxWage ? Math.min(wage, mission.maxWage) : wage, clubId, contractYears: rndInt(1, 4), injuryWeeks: 0, yellowCards: 0, suspendedMatches: 0, morale: 70, personality: pick(PERSONALITIES), apps: 0, goals: 0, assists: 0, seasonLog: [], ratingSum: 0 };
    if (activeAttrKeys.length) {
      const attrs = getAttrs(candidate);
      const meetsAll = activeAttrKeys.every(k => attrs[k] >= attrFilters[k]);
      if (!meetsAll && tries < maxTries - 1) continue;
    }
    best = candidate;
    break;
  }
  return best;
}

// ---------- Transfer negotiations ----------
function scoutUncertainty(scoutLevel) { return clamp(12 - scoutLevel * 2.3, 0, 12); }
function scoutRangeText(value, scoutLevel) {
  const u = Math.round(scoutUncertainty(scoutLevel));
  if (u <= 0) return `${Math.round(value)}`;
  return `${clamp(Math.round(value - u), 15, 99)}–${clamp(Math.round(value + u), 15, 99)}`;
}
const SCOUT_ATTR_LABEL = { shooting: "avslut", passing: "passningsspel", dribbling: "dribbling", pace: "fart", defending: "försvarsspel", physical: "fysik" };
const SCOUT_STRONG_LINES = {
  shooting: ["har ett dödligt avslut och hittar nät från lägen andra inte ens ser", "är kylig framför mål — den typen av avslutare som avgör jämna matcher", "läser målchanser exceptionellt väl och placerar bollen med precision"],
  passing: ["ser passningar innan de öppnar sig och spelar med imponerande precision", "dikterar tempot med sitt passningsspel — sällan ett felval i bollinnehav", "har ett vasst öga för genombrottspassningar som bryter upp försvarslinjer"],
  dribbling: ["är trixig och svårfångad — tar sig förbi motståndare med lätthet", "har fantastisk bollkontroll under press och skapar utrymme ur ingenting", "dribblar med en självsäkerhet som gör försvarare nervösa"],
  pace: ["har explosiv fart som gör denne till ett ständigt hot i öppna ytor", "vinner racet mot backar konsekvent — accelerationen är ett verkligt vapen", "är svår att hänga med i på omställning tack vare rå snabbhet"],
  defending: ["läser spelet defensivt exceptionellt väl och vinner dueller konsekvent", "är obehaglig att möta en mot en — timing i tacklingar är imponerande", "har ett skarpt positioneringssinne som täpper till luckor innan de uppstår"],
  physical: ["är fysiskt dominant och vinner nästan varje närkamp", "har den kroppsstyrka som krävs för att hantera tuffare motstånd", "är svår att knuffa av bollen tack vare ren fysisk styrka"],
};
const SCOUT_WEAK_LINES = {
  shooting: ["avslutet är fortfarande opolerat — chanser går till spillo som borde resultera i mål", "saknar än så länge den kallblodighet framför mål som krävs på högsta nivå", "träffbilden är inkonsekvent, särskilt från distans"],
  passing: ["passningsspelet är riskabelt under press och kan kosta bollinnehav", "saknar variation i passningsspelet — blir förutsägbar när motståndaren pressar", "tempoväxlingarna i spelet är fortfarande för enahanda"],
  dribbling: ["blir lätt av bollen i trängda lägen och tar för många risker", "har begränsad repertoar i en mot en-situationer", "tappar ofta kontrollen vid hög press"],
  pace: ["saknar den toppfart som krävs för att hota på omställning", "hänger inte med i tempot när matchen öppnar upp sig", "blir sårbar mot snabbare motståndare i öppna ytor"],
  defending: ["det defensiva spelet har tydliga hål — positioneringen sviker i pressade lägen", "är sårbar en mot en och kan dras med i onödiga dueller", "läser inte alltid spelet tillräckligt snabbt defensivt"],
  physical: ["kan bli fysiskt starkare för att hävda sig mot tuffare motstånd", "förlorar för många närkamper mot fysiskt överlägsna motståndare", "orken sviker mot slutet av matcher"],
};
function scoutComment(candidate) {
  const attrs = getAttrs(candidate);
  const entries = Object.entries(attrs).filter(([k]) => k !== "physical" || candidate.pos !== "MV");
  entries.sort((a, b) => b[1] - a[1]);
  const overall = overallOf(candidate);
  const rng = seededRandom(String(candidate.id) + "scoutreport" + Date.now() + Math.random());
  const tierLine = overall >= 80 ? "En spelare av verklig toppklass." : overall >= 68 ? "En riktigt solid spelare för den här nivån." : overall >= 55 ? "En användbar spelare med tydlig roll i truppen." : "Fortfarande ett stycke kvar till att vara en nyckelspelare.";

  const strong1 = entries[0], strong2 = entries[1];
  const weak1 = entries[entries.length - 1], weak2 = entries[entries.length - 2];
  const strongText = `${SCOUT_ATTR_LABEL[strong1[0]] || strong1[0]}: ${pick(SCOUT_STRONG_LINES[strong1[0]] || ["presterar konsekvent på hög nivå"])}. Även ${SCOUT_ATTR_LABEL[strong2[0]] || strong2[0]} sticker ut positivt.`;
  const weakText = `${SCOUT_ATTR_LABEL[weak1[0]] || weak1[0]}: ${pick(SCOUT_WEAK_LINES[weak1[0]] || ["har utrymme för förbättring"])}. Även ${SCOUT_ATTR_LABEL[weak2[0]] || weak2[0]} är ett område att jobba på.`;

  const potentialGap = (candidate.potential || overall) - overall;
  let potentialLine;
  if (candidate.age <= 21 && potentialGap >= 14) potentialLine = "Potentialen är genuint hög — scouten bedömer att spelaren om några år kan bli avsevärt mycket bättre än sitt nuvarande betyg antyder. Väl värd att investera utvecklingstid i.";
  else if (candidate.age <= 23 && potentialGap >= 8) potentialLine = "Det finns fortfarande en tydlig utvecklingskurva kvar — rätt speltid och coaching bör lyfta nivån ytterligare.";
  else if (candidate.age >= 30 && potentialGap <= 2) potentialLine = "Spelaren är nu i sin sportsliga topp — förvänta ingen ytterligare utveckling, snarare en gradvis avtagande kurva de kommande säsongerna.";
  else if (potentialGap <= 2) potentialLine = "Taket verkar redan nått — det här är sannolikt ungefär den spelare man får långsiktigt.";
  else potentialLine = "Viss marginal för utveckling kvar, men inget dramatiskt att vänta.";

  const personalityLine = candidate.personality && candidate.personality !== "Balanserad" ? ` Personlighetsmässigt beskrivs spelaren som "${candidate.personality}" — ${PERSONALITY_DESC[candidate.personality]?.toLowerCase() || ""}` : "";
  const injuryProne = injuryProneness(candidate);
  const durabilityLine = injuryProne === "Skör" ? " Skadehistoriken är en tydlig varningsflagga — kroppen verkar inte tåla hög belastning särskilt väl." : injuryProne === "Robust" ? " Fysiskt robust och sällan skadedrabbad — pålitlig rent kroppsligt." : "";

  const verdict = overall >= 75 ? "Sammantaget: en värvning som skulle stärka de flesta trupper omedelbart."
    : overall >= 62 ? "Sammantaget: en gedigen komplettering, om än inte en spelare som förändrar laget i grunden."
    : candidate.age <= 21 ? "Sammantaget: inte färdig ännu, men värd att bevaka som ett långsiktigt projekt."
    : "Sammantaget: en rollspelare snarare än en nyckelvärvning — väg priset noga mot vad som faktiskt levereras.";

  return `${tierLine} Starkast i ${strongText} Svagast i ${weakText} ${potentialLine}${personalityLine}${durabilityLine} ${verdict}`;
}
const SCOUT_PRESETS = [
  { key: "malfarlig", label: "Målfarlig anfallare", posFilter: "AN", attrs: { shooting: 68 } },
  { key: "bollforande", label: "Bollförande försvarare", posFilter: "FÖ", attrs: { passing: 62 } },
  { key: "box2box", label: "Box-to-box mittfältare", posFilter: "MF", attrs: { physical: 62, passing: 55 } },
  { key: "snabb", label: "Snabb kantspelare", posFilter: null, attrs: { pace: 70 } },
  { key: "lovande", label: "Ung talang med hög potential", posFilter: null, attrs: {}, minPotential: 78, ageMax: 21 },
];
const SELL_THRESHOLD = { storklubb: 1.28, nyrik: 1.32, medelklubb: 1.05, arbetarklubb: 0.92, akademiklubb: 0.88, utmanare: 1.0 };
// A world-pool ("Övriga världen") player has no real owning club — negotiating for one goes through the
// same UI as any transfer, but stands in for "the player's representatives" rather than a selling club.
// A lightweight neutral placeholder lets the whole existing negotiation flow work unchanged instead of
// needing every club.field read in NegotiationView to be made defensive against a missing club.
function syntheticFreeAgentClub(player) {
  return { id: null, name: "Spelarens läger", short: "FRI", archetype: "medelklubb", strength: overallOf(player), league: player.region || player.nationality, goodwill: 50, color: "#5b6b63" };
}
function sellerOpeningLine(club, player) {
  const first = player.name.split(" ")[0];
  const lines = {
    storklubb: [`Vi lyssnar på bud för ${first}, men det blir ingen fyndaffär.`, `${first} är central för oss — priset speglar det.`],
    nyrik: [`Vi säljer bara om priset är rätt för oss.`, `${first} har högt värde i vårt system just nu.`],
    medelklubb: [`Vi kan diskutera ${first}, kom med ett seriöst bud.`],
    arbetarklubb: [`Om priset känns rimligt lyssnar vi gärna.`, `Vi är öppna för en affär kring ${first}.`],
    akademiklubb: [`${first} är en av våra bästa akademialster — det kostar.`],
    utmanare: [`Vi bygger något här, men allt går att diskutera för rätt pris.`],
  };
  if (!club) return pick([`${first} spelar utan klubb just nu — vi lyssnar på erbjudanden direkt från spelarens läger.`, `${first} är fri att skriva på för vem som helst just nu.`]);
  return pick(lines[club.archetype] || lines.medelklubb);
}
function negoAcceptLine() { return pick(["Det där kan vi leva med. Affär!", "Rimligt — vi tackar ja.", "Okej, vi är överens.", "Det duger. Affär klar."]); }
function negoCounterLine(counterAmount) { return pick([`Nära, men vi vill ha ${formatMoney(counterAmount)} istället.`, `Vi uppskattar budet, men ${formatMoney(counterAmount)} känns mer rätt.`, `Höj lite till ${formatMoney(counterAmount)} så pratar vi.`]); }
function negoRejectLine(player) { const first = player.name.split(" ")[0]; return pick([`Nej, det där är för lågt för ${first}.`, `Vi säljer inte till det priset.`, `Kom tillbaka med ett bättre bud.`]); }
function playerWageOpeningLine(player) {
  const first = player.name.split(" ")[0];
  const lines = {
    Ambitiös: [`Jag vill vinna titlar här — lönen får spegla ambitionen.`, `Ge mig rätt villkor så levererar jag på plan.`],
    Lojal: [`Jag trivs redan här, vi hittar nog en lösning tillsammans.`],
    Ledare: [`Jag bryr mig mest om truppen, men lönen ska förstås vara rättvis.`],
    Problemspelare: [`Ni får bjuda rejält om ni vill ha mig kvar.`],
    Balanserad: [`Låt oss se vad ni erbjuder.`],
  };
  return pick(lines[player.personality] || lines.Balanserad);
}
function wageAcceptLine() { return pick(["Det känns schysst — deal!", "Jag är nöjd med det.", "Vi är överens."]); }
function wageCounterLine(counterWage) { return pick([`Kan vi mötas vid ${formatMoney(counterWage)}/omgång?`, `Jag hade tänkt mig närmare ${formatMoney(counterWage)}/omgång.`]); }
function wageRejectLine() { return pick(["Det där räcker inte för mig.", "Nej, jag behöver ett bättre erbjudande.", "Det känns för lågt just nu."]); }
function NegotiationThread({ messages }) {
  return (
    <div className="space-y-2">
      {messages.map((m, i) => (
        <div key={i} style={{ display: "flex", justifyContent: m.from === "you" ? "flex-end" : "flex-start" }}>
          <div style={{
            maxWidth: "82%", padding: "8px 12px", borderRadius: 14, fontSize: 12.5, lineHeight: 1.4,
            background: m.from === "you" ? C.gold : C.paperDim, color: m.from === "you" ? C.turfDeep : C.ink,
            borderBottomRightRadius: m.from === "you" ? 3 : 14, borderBottomLeftRadius: m.from === "you" ? 14 : 3,
            fontWeight: m.from === "you" ? 600 : 400,
          }}>{m.text}</div>
        </div>
      ))}
    </div>
  );
}
const NEGOTIATION_MAX_ATTEMPTS = 3;
function negotiationWalkAwayChance(offerRatio, reputation) {
  const shortfall = clamp(1 - offerRatio, 0, 1);
  const repDiscount = clamp(reputation / 900, 0, 0.25);
  return clamp(shortfall * 0.55 - repDiscount, 0.02, 0.55);
}
function negotiationDrift(value, attemptsUsed) { return value * (1 + attemptsUsed * 0.035); }
function rivalStealChance(attemptsUsed, rivalMult) { return clamp((attemptsUsed - 1) * 0.12 * rivalMult, 0, 0.4); }
function negotiationLeverage(reputation, counterpartPrestige) { return clamp((reputation - counterpartPrestige) / 100, -1, 1); }
function leverageReading(score) {
  if (score >= 0.22) return { text: "Övertaget: ni", color: C.win, sub: "Ert rykte väger tungt i förhandlingen." };
  if (score <= -0.22) return { text: "Övertaget: dem", color: C.loss, sub: "Motparten har starkare kort på hand just nu." };
  return { text: "Jämnt läge", color: C.gold, sub: "Ingen sida har ett tydligt övertag." };
}
function opportunityChance(score) { return clamp(0.06 + Math.max(0, score) * 0.32, 0.05, 0.38); }
function LeverageBadge({ score }) {
  const r = leverageReading(score);
  return (
    <div className="flex items-center justify-between px-3 py-2 rounded-xl" style={{ background: "rgba(0,0,0,0.04)" }}>
      <div>
        <div className="text-9 uppercase tracking-wide font-semibold" style={{ color: C.inkSoft }}>Läget i förhandlingen</div>
        <div className="text-10 mt-0.5" style={{ color: C.inkSoft }}>{r.sub}</div>
      </div>
      <span className="text-11 font-bold" style={{ color: r.color }}>{r.text}</span>
    </div>
  );
}
function clubRelationshipLabel(goodwill, isDerby) {
  const gw = goodwill ?? 50;
  if (isDerby) return { text: "Lokal ärkerival", color: C.loss };
  if (gw >= 80) return { text: "Utmärkt relation", color: C.win };
  if (gw >= 65) return { text: "God relation", color: C.win };
  if (gw >= 35) return { text: "Ingen speciell relation", color: C.inkSoft };
  if (gw >= 20) return { text: "Ansträngd relation", color: C.loss };
  return { text: "Mycket dålig relation", color: C.loss };
}
// Fans react to transfer news relative to their OWN club's current level, not some fixed "star" threshold —
// a genuine upgrade means just as much to a Division 3 side as a marquee name means to a giant, and lower-tier
// fans react proportionally more per point of upgrade since a real step forward is rarer for them.
function divisionFanScale(club) { return club ? ({ 1: 1, 2: 1.3, 3: 1.6 }[club.division] || 1) : 1; }
function fanSigningReaction(player, price, isDerby, squad, club) {
  const overall = overallOf(player);
  const squadAvg = squad && squad.length ? squad.reduce((s, p) => s + overallOf(p), 0) / squad.length : overall;
  const upgradeGap = overall - squadAvg; // how much better than the club's current level this signing is
  const scale = divisionFanScale(club);
  let delta = clamp(upgradeGap * 0.5, -3, 8) * scale;
  if (isDerby) delta += (overall >= squadAvg ? rnd(4, 9) : rnd(1, 3)) * scale;
  const overpayRatio = price / Math.max(1, player.value);
  if (overpayRatio > 1.6 && upgradeGap < 3) delta -= rnd(1, 4) * scale;
  return clamp(Math.round(delta * 10) / 10, -9, 15);
}
// Selling a clearly-better-than-average player upsets fans regardless of division — losing your best
// player stings the same whether you're top-flight or Division 3. Getting strong money for a fringe
// player barely registers either way; selling a key player cheaply is the most unpopular combination.
function fanSaleReaction(player, price, squad, club) {
  const overall = overallOf(player);
  const rest = (squad || []).filter(p => p.id !== player.id);
  const restAvg = rest.length ? rest.reduce((s, p) => s + overallOf(p), 0) / rest.length : overall;
  const wasKeyPlayer = overall - restAvg >= 5;
  const scale = divisionFanScale(club);
  const valueRatio = price / Math.max(1, player.value);
  let delta = wasKeyPlayer ? -rnd(3, 7) * scale : rnd(0, 1.5);
  if (valueRatio >= 1.3) delta += rnd(1, 3);
  else if (valueRatio < 0.8 && wasKeyPlayer) delta -= rnd(1, 3) * scale;
  return clamp(Math.round(delta * 10) / 10, -10, 6);
}
// Giant-killer bonus: beating a side whose strength is well above your own squad's level is a genuine
// achievement — it should lift the club's reputation and fanbase, and reflect well on the manager
// personally, scaled by how big the gap actually was. Small gaps give nothing; this is for real upsets.
function giantKillerBonus(gap) {
  if (gap < 12) return null;
  if (gap < 20) return { tier: "notable", fan: rnd(1.5, 3), rep: rnd(0.5, 1.5), mgrRep: rnd(0.5, 1.5) };
  if (gap < 30) return { tier: "big", fan: rnd(3, 6), rep: rnd(1.5, 3), mgrRep: rnd(2, 4) };
  return { tier: "mega", fan: rnd(6, 10), rep: rnd(3, 5), mgrRep: rnd(4, 7) };
}
function negotiateOffer(offerAmount, value, club, reputation, rivalBoost = 1, player = null, sellOnPctOffered = 0, isDerby = false) {
  const goodwillMult = 1 + clamp((50 - (club.goodwill ?? 50)) / 200, -0.1, 0.25);
  // Clubs that are as big or bigger than you (by matchday strength vs. your reputation) fight much harder
  // to keep their best players and biggest talents — a genuine "they simply won't sell to a rival" wall.
  let prestigeMult = 1;
  if (player) {
    const overall = overallOf(player);
    const isBigTalent = overall >= 78 || (player.potential && player.potential >= 80 && player.potential - overall >= 6);
    if (isBigTalent && (club.strength || 0) >= reputation) {
      const gap = clamp(((club.strength || 0) - reputation) / 35, 0, 1);
      prestigeMult = 1.55 + gap * 0.85; // up to ~2.4x harder to agree a fee
    }
  }
  // Selling to the local arch-rival is close to unthinkable — a very steep (but not impossible) wall.
  const derbyMult = isDerby ? 2.0 : 1;
  // Offering a bigger sell-on percentage is real leverage — the selling club accepts a lower fee now
  // in exchange for a cut of a future sale.
  const sellOnLeverage = clamp(1 - (sellOnPctOffered / 100) * 0.35, 0.72, 1);
  const threshold = (SELL_THRESHOLD[club.archetype] || 1.1) * value * (1 - reputation / 500) * rivalBoost * goodwillMult * prestigeMult * derbyMult * sellOnLeverage;
  const ratio = offerAmount / threshold;
  if (ratio >= 1) return { result: "accept" };
  if (ratio >= 0.8) return { result: "counter", counterPrice: Math.round(threshold * rnd(0.98, 1.06)) };
  return { result: "reject" };
}
function generatePlayerLoanOffers(clubs, userClubId, division) {
  if (Math.random() > 0.35) return [];
  const count = rndInt(1, 2);
  const otherClubs = Object.values(clubs).filter(c => c.id !== userClubId);
  return Array.from({ length: count }, () => {
    const fromClub = pick(otherClubs);
    const pos = pick(POS_ORDER);
    const player = makePlayer(pos, fromClub.league, null, fromClub.archetype, fromClub.division);
    return { id: uid(), player, fromClubId: fromClub.id, fromClubName: fromClub.name, weeksLeft: rndInt(10, 24) };
  });
}
// Purely informational "who's watching this player" signal for the profile overview — deterministic per
// round (so it doesn't flicker every re-render) but shifts over time as strength gaps change. This is
// separate from generateIncomingOffers below; showing interest here never by itself creates an offer.
function computeInterestedClubs(player, clubs, userClubId, round) {
  const overall = overallOf(player);
  if (overall < 45) return [];
  const rng = seededRandom(String(player.id) + "interest" + Math.floor(round / 4));
  const candidates = Object.values(clubs).filter(c => c.id !== userClubId && Math.abs(c.strength - overall) < 18);
  if (!candidates.length) return [];
  const count = rng() < 0.35 ? 0 : rng() < 0.7 ? 1 : rng() < 0.92 ? 2 : 3;
  if (!count) return [];
  const shuffled = [...candidates].sort(() => rng() - 0.5);
  return shuffled.slice(0, Math.min(count, shuffled.length));
}
function generateIncomingOffers(squad, clubs, userClubId, reputation, round) {
  const otherClubs = Object.values(clubs).filter(c => c.id !== userClubId);
  const offers = [];
  const listed = squad.filter(p => p.transferListed && overallOf(p) >= 40);
  listed.forEach(p => {
    if (Math.random() < 0.65) {
      const overall = overallOf(p);
      const near = otherClubs.filter(c => Math.abs(c.strength - overall) < 20);
      const buyer = near.length ? pick(near) : pick(otherClubs);
      const mult = rnd(0.75, 1.25) * (1 + reputation / 500);
      offers.push({ id: uid(), playerId: p.id, playerName: p.name, buyerId: buyer.id, buyerName: buyer.name, offer: Math.round(p.value * mult) });
    }
  });
  // Hinting that a player might be available doesn't create a deal by itself — it just meaningfully
  // improves their odds of drawing a real offer for a while afterwards, same as real transfer speculation.
  const recentlyHinted = squad.filter(p => !p.transferListed && p.hintedSaleRound != null && round != null && (round - p.hintedSaleRound) <= 10 && overallOf(p) >= 45);
  recentlyHinted.forEach(p => {
    if (Math.random() < 0.3) {
      const overall = overallOf(p);
      const near = otherClubs.filter(c => Math.abs(c.strength - overall) < 20);
      const buyer = near.length ? pick(near) : pick(otherClubs);
      const mult = rnd(0.85, 1.35) * (1 + reputation / 450);
      offers.push({ id: uid(), playerId: p.id, playerName: p.name, buyerId: buyer.id, buyerName: buyer.name, offer: Math.round(p.value * mult) });
    }
  });
  const eligible = squad.filter(p => !p.transferListed && p.contractYears <= 3 && overallOf(p) >= 52 && !recentlyHinted.includes(p));
  if (eligible.length) {
    const count = rndInt(0, Math.min(2, eligible.length));
    if (count > 0) {
      const chosen = shuffle(eligible).slice(0, count);
      chosen.forEach(p => {
        const overall = overallOf(p);
        const near = otherClubs.filter(c => Math.abs(c.strength - overall) < 20);
        const buyer = near.length ? pick(near) : pick(otherClubs);
        const mult = rnd(0.9, 1.5) * (1 + reputation / 400);
        offers.push({ id: uid(), playerId: p.id, playerName: p.name, buyerId: buyer.id, buyerName: buyer.name, offer: Math.round(p.value * mult) });
      });
    }
  }
  return offers;
}
// AI clubs asking to borrow YOUR loan-listed players — mirrors buy-offer logic but for loans.
// Mostly targets players you've explicitly loan-listed, occasionally shows interest in a blocked
// young talent (high potential, low current game-time relative to squad) even if unlisted.
function generateIncomingLoanRequests(squad, clubs, userClubId) {
  const otherClubs = Object.values(clubs).filter(c => c.id !== userClubId);
  const requests = [];
  const loanListed = squad.filter(p => p.loanListed && !p.loanWeeksLeft);
  loanListed.forEach(p => {
    if (Math.random() < 0.5) {
      const overall = overallOf(p);
      const near = otherClubs.filter(c => Math.abs(c.strength - overall) < 22);
      const borrower = near.length ? pick(near) : pick(otherClubs);
      requests.push({ id: uid(), playerId: p.id, playerName: p.name, borrowerId: borrower.id, borrowerName: borrower.name, weeks: rndInt(10, 24) });
    }
  });
  const youngTalent = squad.filter(p => !p.loanListed && !p.loanWeeksLeft && p.age <= 21 && (p.potential || 0) - overallOf(p) >= 12);
  if (youngTalent.length && Math.random() < 0.25) {
    const p = pick(youngTalent);
    const borrower = pick(otherClubs);
    requests.push({ id: uid(), playerId: p.id, playerName: p.name, borrowerId: borrower.id, borrowerName: borrower.name, weeks: rndInt(10, 24) });
  }
  return requests;
}
// AI clubs actively manage their own transfer/loan lists — surplus depth or ageing fringe players get
// transfer-listed, blocked young talents occasionally get loan-listed for development elsewhere.
// Runs across the whole world periodically (season start, transfer window open) rather than every render.
function refreshWorldListings(clubs, userClubId) {
  const updated = { ...clubs };
  Object.values(clubs).forEach(club => {
    if (club.id === userClubId || !club.squad) return;
    const posCounts = {};
    club.squad.forEach(p => { posCounts[p.pos] = (posCounts[p.pos] || 0) + 1; });
    let changed = false;
    const newSquad = club.squad.map(p => {
      let transferListed = !!p.transferListed, loanListed = !!p.loanListed;
      const overall = overallOf(p);
      const isSurplus = (posCounts[p.pos] || 0) > 5 && overall < 55;
      const isAging = p.age >= 31 && overall < 60;
      if (!transferListed && (isSurplus || isAging) && Math.random() < 0.22) transferListed = true;
      const isBlockedTalent = p.age <= 21 && (p.potential || 0) - overall >= 12;
      if (!loanListed && isBlockedTalent && Math.random() < 0.18) loanListed = true;
      if (transferListed !== !!p.transferListed || loanListed !== !!p.loanListed) { changed = true; return { ...p, transferListed, loanListed }; }
      return p;
    });
    if (changed) updated[club.id] = { ...club, squad: newSquad };
  });
  return updated;
}
// AI clubs now actually trade transfer-listed players with EACH OTHER too, not just with you.
// Buyers are weighted toward richer archetypes (storklubb/nyrik) and clubs whose strength roughly
// matches the player's level — a Division 3 minnow won't suddenly buy a star. Runs alongside the
// listing refresh at each transfer window, so squads across the world genuinely evolve over time.
function simulateAITransfers(clubs, userClubId, season, round) {
  let updated = { ...clubs };
  const otherIds = Object.values(clubs).filter(c => c.id !== userClubId).map(c => c.id);
  const listedPairs = [];
  otherIds.forEach(id => { (clubs[id].squad || []).forEach(p => { if (p.transferListed) listedPairs.push({ playerId: p.id, sellerId: id }); }); });
  const newsItems = [];
  const records = [];
  shuffle(listedPairs).forEach(({ playerId, sellerId }) => {
    if (Math.random() > 0.35) return;
    const seller = updated[sellerId];
    const player = seller?.squad.find(p => p.id === playerId);
    if (!player) return;
    const overall = overallOf(player);
    const candidates = otherIds.filter(id => id !== sellerId).map(id => updated[id]).filter(c => c && c.strength >= overall - 15);
    if (!candidates.length) return;
    const weighted = candidates.map(c => ({ c, weight: (ARCHETYPES[c.archetype]?.incomeMult || 1) * clamp(1 - Math.abs(c.strength - overall) / 40, 0.1, 1) }));
    const totalWeight = weighted.reduce((s, x) => s + x.weight, 0);
    let r = rnd(0, totalWeight), chosen = weighted[0].c;
    for (const w of weighted) { r -= w.weight; if (r <= 0) { chosen = w.c; break; } }
    const fee = Math.round(player.value * rnd(0.75, 1.15));
    updated = {
      ...updated,
      [sellerId]: { ...seller, squad: seller.squad.filter(p => p.id !== playerId) },
      [chosen.id]: { ...updated[chosen.id], squad: [...updated[chosen.id].squad, { ...player, transferListed: false, loanListed: false }] },
    };
    records.push({ id: uid(), season, round, playerId: player.id, playerName: player.name, playerPos: player.specificPosition, fromClubId: sellerId, fromClubName: seller.name, fromColor: seller.color, toClubId: chosen.id, toClubName: chosen.name, toColor: chosen.color, fee, leagueId: seller.league });
    if (overall >= 62 || Math.random() < 0.2) newsItems.push(`${player.name} lämnar ${seller.name} för ${chosen.name}.`);
  });
  return { clubs: updated, newsItems: newsItems.slice(0, 3), records };
}
// ---------- Partner club (feeder club) ----------
// A smaller partner club makes loans between you effectively frictionless — no negotiation, no fee,
// instant in either direction. Candidates are smaller clubs from the same country.
function generatePartnerCandidates(clubs, userClub, count = 3) {
  const pool = Object.values(clubs).filter(c => c.id !== userClub.id && c.league === userClub.league && c.strength < userClub.strength - 5);
  return shuffle(pool).slice(0, count).map(c => c.id);
}


// ---------- Detailed player attributes (1-95, deterministic per player so they stay stable across renders) ----------
function seededRandom(seedStr) {
  let h = 0;
  for (let i = 0; i < seedStr.length; i++) h = (Math.imul(31, h) + seedStr.charCodeAt(i)) | 0;
  return function () {
    h = Math.imul(h ^ (h >>> 15), h | 1);
    h ^= h + Math.imul(h ^ (h >>> 7), h | 61);
    return ((h ^ (h >>> 14)) >>> 0) / 4294967296;
  };
}
function withSeededRandom(seedStr, fn) {
  const original = Math.random;
  Math.random = seededRandom(seedStr);
  try {
    return fn();
  } finally {
    Math.random = original;
  }
}
const POSITION_WEIGHTS = {
  MV: { shooting: 0.35, passing: 0.2, dribbling: 0, pace: 0, defending: 0.3, physical: 0.15 },
  FÖ: { shooting: 0.05, passing: 0.15, dribbling: 0.05, pace: 0.15, defending: 0.4, physical: 0.2 },
  MF: { shooting: 0.15, passing: 0.3, dribbling: 0.2, pace: 0.1, defending: 0.15, physical: 0.1 },
  AN: { shooting: 0.35, passing: 0.1, dribbling: 0.25, pace: 0.2, defending: 0, physical: 0.1 },
};
const ATTR_LABELS_OUTFIELD = { shooting: "Avslut", passing: "Passning", dribbling: "Dribbling", pace: "Fart", defending: "Försvarsspel", physical: "Fysik" };
const ATTR_LABELS_MV = { shooting: "Reflexer", passing: "Uppspel", dribbling: "Fotarbete", pace: "Utgångar", defending: "Positionering", physical: "Fysik" };
function attrLabels(pos) { return pos === "MV" ? ATTR_LABELS_MV : ATTR_LABELS_OUTFIELD; }
function getAttrs(player) {
  const rng = seededRandom(String(player.id) + "attrs");
  const j = () => Math.floor(rng() * 17) - 8;
  const a = clamp(player.attack, 12, 96), d = clamp(player.defense, 12, 96);
  const derived = {
    shooting: clamp(Math.round((player.pos === "FÖ" || player.pos === "MV" ? d * 0.3 + a * 0.3 : a) + j()), 8, 96),
    passing: clamp(Math.round(a * 0.4 + d * 0.4 + j()), 8, 96),
    dribbling: clamp(Math.round(a * 0.9 + j()), 8, 96),
    pace: clamp(Math.round(a * 0.7 + d * 0.2 + j()), 8, 96),
    defending: clamp(Math.round(d * 0.95 + j()), 8, 96),
    physical: clamp(Math.round(((a + d) / 2) * 0.85 + j()), 8, 96),
  };
  // Database-set overrides win over the derived values, so a custom database can hand-tune sub-attributes
  // instead of always deriving them from attack/defense.
  return {
    shooting: player.shooting ?? derived.shooting, passing: player.passing ?? derived.passing, dribbling: player.dribbling ?? derived.dribbling,
    pace: player.pace ?? derived.pace, defending: player.defending ?? derived.defending, physical: player.physical ?? derived.physical,
  };
}
function weakFoot(player) {
  if (player.weakFoot != null) return player.weakFoot;
  const roll = seededRandom(String(player.id) + "weakfoot")();
  if (roll < 0.08) return 5;
  if (roll < 0.22) return 4;
  if (roll < 0.55) return 3;
  if (roll < 0.85) return 2;
  return 1;
}
function headingAbility(player) {
  if (player.headingAbility != null) return player.headingAbility;
  const rng = seededRandom(String(player.id) + "heading");
  const j = Math.floor(rng() * 21) - 10;
  const a = clamp(player.attack, 12, 96), d = clamp(player.defense, 12, 96);
  const base = player.pos === "FÖ" ? d * 0.55 + a * 0.2 : player.pos === "AN" ? a * 0.55 + d * 0.1 : player.pos === "MV" ? d * 0.3 : (a + d) / 2 * 0.4;
  return clamp(Math.round(base + j), 10, 96);
}
function injuryProneness(player) {
  if (player.injuryProneness) return player.injuryProneness;
  const roll = seededRandom(String(player.id) + "injuryprone")();
  if (roll < 0.15) return "Skör";
  if (roll < 0.85) return "Normal";
  return "Robust";
}
function injuryProneMult(player) {
  const p = injuryProneness(player);
  return p === "Skör" ? 1.6 : p === "Robust" ? 0.6 : 1;
}
function clutchFactor(player) {
  if (player.clutchFactor != null) return player.clutchFactor;
  const rng = seededRandom(String(player.id) + "clutch")();
  return Math.round((rng - 0.5) * 2 * 10) / 10;
}
// Uthållighet — independent of raw physical strength (a physically imposing player isn't necessarily
// the one who's still sharp in minute 88). Lightly correlated with physical, mostly its own thing.
function endurance(player) {
  if (player.endurance != null) return player.endurance;
  const rng = seededRandom(String(player.id) + "endurance");
  const physicalLean = clamp(player.attack, 12, 96) * 0.15 + clamp(player.defense, 12, 96) * 0.15;
  return clamp(Math.round(physicalLean + rng() * 70 + 8), 10, 96);
}
// How much slower (>1) or faster (<1) a player's stamina drains relative to the flat baseline — high
// endurance genuinely changes the shape of a season, not just a single match.
function enduranceMult(player) {
  const e = endurance(player);
  return clamp(1.55 - e / 72, 0.55, 1.5);
}
// Beslutsamhet — how reliably a talented young player actually closes the gap to their potential,
// versus one who plateaus early despite similar raw ability. Personality nudges it, since an "Ambitiös"
// or "Ledare" type tends to push themselves, while a "Problemspelare" is more prone to drifting.
function determination(player) {
  if (player.determination != null) return player.determination;
  const rng = seededRandom(String(player.id) + "determination")();
  let base = Math.round(15 + rng * 80);
  if (player.personality === "Ambitiös" || player.personality === "Ledare") base += 10;
  else if (player.personality === "Problemspelare") base -= 12;
  return clamp(base, 5, 99);
}
// Scales the random per-season growth-toward-potential roll — a determined prospect reliably closes in
// on their ceiling, a low-determination one is a genuine gamble even with excellent numbers on paper.
function determinationMult(player) {
  const d = determination(player);
  return clamp(0.55 + d / 110, 0.55, 1.45);
}
function clutchLabel(cf) {
  if (cf >= 0.6) return "Stormatchsspelare";
  if (cf <= -0.6) return "Kan tyngas i stora matcher";
  return "Jämn i stora matcher";
}
function overallOf(player) {
  const attrs = getAttrs(player);
  const w = POSITION_WEIGHTS[player.pos] || POSITION_WEIGHTS.MF;
  return clamp(Math.round(Object.keys(w).reduce((s, k) => s + attrs[k] * w[k], 0)), 1, 95);
}
function bestAttribute(player) {
  const attrs = getAttrs(player);
  const labels = attrLabels(player.pos);
  let bestKey = null, bestVal = -1;
  Object.entries(attrs).forEach(([key, val]) => { if (val > bestVal) { bestVal = val; bestKey = key; } });
  return { key: bestKey, label: labels[bestKey], value: bestVal };
}
function overallTier(overall) {
  if (overall >= 85) return { label: "Världsklass", color: C.gold };
  if (overall >= 72) return { label: "Mycket bra", color: C.win };
  if (overall >= 58) return { label: "Solid", color: "#3F7AB0" };
  return { label: "Utvecklingsbar", color: C.inkSoft };
}
function pickBestXI(squad) {
  const fit = squad.filter(p => !p.injuryWeeks && !p.suspendedMatches && !p.internationalDuty);
  const byOverall = (a, b) => overallOf(b) - overallOf(a);
  const gks = fit.filter(p => p.pos === "MV").sort(byOverall);
  const df = fit.filter(p => p.pos === "FÖ").sort(byOverall);
  const mf = fit.filter(p => p.pos === "MF").sort(byOverall);
  const fw = fit.filter(p => p.pos === "AN").sort(byOverall);
  // Fill a realistic, balanced shape (1 GK, 4 DF, 4 MF, 2 FW — a standard 4-4-2) position-by-position first,
  // so a squad never starts with e.g. a winger plugged in at center back just because their overall is higher.
  const chosen = [...gks.slice(0, 1)];
  const chosenIds = new Set(chosen.map(p => p.id));
  const buckets = { FÖ: df, MF: mf, AN: fw };
  Object.entries({ FÖ: 4, MF: 4, AN: 2 }).forEach(([pos, n]) => {
    buckets[pos].slice(0, n).forEach(p => { chosen.push(p); chosenIds.add(p.id); });
  });
  // Only if a squad is too thin in some position to fill its quota, top up with the best remaining outfield players.
  const remainingSlots = 11 - chosen.length;
  if (remainingSlots > 0) {
    const leftover = fit.filter(p => p.pos !== "MV" && !chosenIds.has(p.id)).sort(byOverall);
    chosen.push(...leftover.slice(0, remainingSlots));
  }
  return chosen;
}
function getXI(squad, startingXI) {
  if (startingXI && startingXI.length === 11) {
    const matched = startingXI.map(id => squad.find(p => p.id === id)).filter(p => p && !p.injuryWeeks && !p.suspendedMatches && !p.internationalDuty);
    if (matched.length === 11) return matched;
  }
  return pickBestXI(squad);
}
// Checks whether the manager's own saved starting XI (not the auto-fallback) is actually match-ready —
// used to block kicking off a match and instead force the manager to fix their own lineup, rather than
// silently substituting an unavailable player without them noticing.
const COMPETITION_LABEL = { league: "ligan", domestic: "den inhemska cupen", cup1: "Kimby Mästerskapet", cup2: "Kimby Cupen" };
const COMPETITION_LABEL_SHORT = { league: "Ligan", domestic: "Inhemska cupen", cup1: "Kimby Mästerskapet", cup2: "Kimby Cupen" };
const SUSPENSION_FIELD = { league: "suspendedMatches", domestic: "suspendedDomestic", cup1: "suspendedCup1", cup2: "suspendedCup2" };
// Full per-player match simulation for cup matches (injuries, cards -> competition-specific suspension,
// appearances, ratings) — previously cup matches only computed the scoreline and never touched player
// stats at all, so cup-only cards/injuries/apps simply couldn't happen. Deliberately a self-contained,
// slightly simplified sibling of the league finalizer's player loop (no season-long chemistry bonus),
// so it can be reused safely across all four cup competitions without touching the tuned league logic.
// Cup matches previously had zero financial impact at all — no attendance, no income, no travel cost.
// This brings them in line with league rounds: a home cup tie fills the stadium and earns matchday income
// the same way, while an away cup tie costs the club a flat travel/logistics fee instead.
function simulateCupMatchFinances(g, isHome, oppStrength, isDerby) {
  if (!isHome) {
    const travelCost = Math.round(rnd(4, 12) * (1 + (oppStrength || 50) / 300));
    return { attendance: null, arenaCapacity: null, income: -travelCost, isAway: true };
  }
  const userArchetype = ARCHETYPES[g.clubs[g.userClubId].archetype];
  const ticketTier = TICKET_TIERS[g.ticketPrice] || TICKET_TIERS.t3;
  const derbyDraw = isDerby ? 0.3 : 0;
  const oppDraw = clamp(((oppStrength || 50) - 50) / 200, 0, 0.25);
  // Cup magic: a cup tie draws a bit of extra buzz on its own, separate from league form/table position.
  const cupDraw = 0.08;
  const crowdDraw = Math.min(derbyDraw + oppDraw + cupDraw, 0.45);
  const attendance = Math.min(arenaCapacityOf(g.dev, g.arenaStands), Math.round((3000 + g.fanbase * 180) * ticketTier.fillMult * (1 + crowdDraw)));
  const incomeTickets = Math.round(attendance * 0.009 * userArchetype.incomeMult * ticketTier.incomeMult) + Object.values(g.arenaStands).reduce((s, l) => s + l, 0) * 8;
  const incomeRestaurant = g.arenaFacilities.restaurant * 18;
  const incomeShop = g.arenaFacilities.shop * 10;
  return { attendance, arenaCapacity: arenaCapacityOf(g.dev, g.arenaStands), income: incomeTickets + incomeRestaurant + incomeShop, isAway: false };
}
function simulateCupMatchPlayerUpdates(xi, fullSquad, staff, tacticalSettings, difficulty, teamTalk, competition, scorerObjects, assistProviders) {
  const scorers = scorerObjects;
  const suspField = SUSPENSION_FIELD[competition] || "suspendedDomestic";
  const yellowField = competition === "league" ? "yellowCards" : `yellowCards_${competition}`;
  const physioLevel = staff?.physio ? staff.physio.level : 0;
  const assistantLevel = staff?.assistant ? staff.assistant.level : 0;
  const difficultySettings = DIFFICULTY_SETTINGS[difficulty] || DIFFICULTY_SETTINGS.normal;
  const talkCardMult = (TEAM_TALK_OPTIONS[teamTalk] || TEAM_TALK_OPTIONS.neutral).cardMult;
  const refereeStrictness = rnd(0.75, 1.3);
  const tacticCardMult = combinedTacticalMods(tacticalSettings).cardMult * talkCardMult * refereeStrictness;
  let injuredPlayer = null;
  const cardEvents = {};
  xi.forEach(pl => {
    const attrs = getAttrs(pl);
    const staminaRisk = clamp((70 - (pl.stamina ?? 100)) / 700, 0, 0.07);
    const chance = clamp((0.045 - attrs.physical / 2200 - physioLevel * 0.003 + staminaRisk) * difficultySettings.injuryMult * injuryProneMult(pl), 0.005, 0.12);
    if (!injuredPlayer && Math.random() < chance) injuredPlayer = pl;
    const personalityCardMult = pl.personality === "Problemspelare" ? 1.6 : 1;
    const positionCardMult = pl.pos === "MV" ? 0.15 : pl.pos === "FÖ" ? 1.4 : pl.pos === "MF" ? 1.1 : 0.7;
    const yellowChance = clamp((0.09 - assistantLevel * 0.008) * tacticCardMult * personalityCardMult * positionCardMult, 0.005, 0.24);
    const redChance = clamp((0.012 - assistantLevel * 0.001) * tacticCardMult * personalityCardMult * positionCardMult, 0.0005, 0.035);
    if (Math.random() < redChance) cardEvents[pl.id] = "red";
    else if (Math.random() < yellowChance) cardEvents[pl.id] = "yellow";
  });
  const fitnessCoachLevel = staff?.fitnessCoach ? staff.fitnessCoach.level : 0;
  const xiIds = new Set(xi.map(p => p.id));
  const newSquad = fullSquad.map(pl => {
    // Anyone still serving a suspension in THIS competition has it tick down by one now that a match
    // in this competition has been played, regardless of whether they personally featured.
    const tickedSuspension = Math.max(0, (pl[suspField] || 0) - (xiIds.has(pl.id) ? 0 : 1));
    if (!xiIds.has(pl.id)) return pl[suspField] > 0 ? { ...pl, [suspField]: tickedSuspension } : pl;
    const goals = scorers.filter(s => s.id === pl.id).length;
    const assists = assistProviders.filter(a => a && a.id === pl.id).length;
    const rating = clamp(6.0 + rnd(-0.6, 0.6) + goals * 1.1 + assists * 0.5, 3.5, 9.8);
    const gotInjured = injuredPlayer && injuredPlayer.id === pl.id;
    const baseInjuryWeeks = gotInjured ? pick([1, 1, 2, 2, 3, 5, 8]) : pl.injuryWeeks;
    const injuryWeeks = gotInjured ? Math.max(1, Math.round(baseInjuryWeeks * (1 - physioLevel * 0.06))) : baseInjuryWeeks;
    const card = cardEvents[pl.id];
    let yellowCards = pl[yellowField] || 0, suspended = pl[suspField] || 0;
    if (card === "red") suspended += rndInt(1, 2);
    else if (card === "yellow") { yellowCards += 1; if (yellowCards >= 5) { suspended += 1; yellowCards -= 5; } }
    const newStamina = clamp((pl.stamina ?? 100) - Math.max(1, (rndInt(4, 8) - fitnessCoachLevel * 0.4) * enduranceMult(pl)), 0, 100);
    // Competition-specific goal/assist/card counters, tracked alongside the season-wide combined totals,
    // so cup performance can be viewed on its own instead of only as part of one blended number.
    const compGoalsField = `goals_${competition}`, compAssistsField = `assists_${competition}`;
    const compYellowField = `seasonYellowCards_${competition}`, compRedField = `seasonRedCards_${competition}`;
    return { ...pl, apps: (pl.apps || 0) + 1, goals: (pl.goals || 0) + goals, assists: (pl.assists || 0) + assists, ratingSum: (pl.ratingSum || 0) + rating, recentRatings: [...(pl.recentRatings || []), rating].slice(-5), injuryWeeks, stamina: newStamina, [yellowField]: yellowCards, [suspField]: suspended, seasonYellowCards: (pl.seasonYellowCards || 0) + (card === "yellow" ? 1 : 0), seasonRedCards: (pl.seasonRedCards || 0) + (card === "red" ? 1 : 0), [compGoalsField]: (pl[compGoalsField] || 0) + goals, [compAssistsField]: (pl[compAssistsField] || 0) + assists, [compYellowField]: (pl[compYellowField] || 0) + (card === "yellow" ? 1 : 0), [compRedField]: (pl[compRedField] || 0) + (card === "red" ? 1 : 0) };
  });
  return { newSquad, injuredPlayer, cardEvents };
}
function lineupIssues(squad, startingXI, competition = "league") {
  if (!startingXI || startingXI.length !== 11) return ["Ingen komplett startelva vald (11 spelare krävs)."];
  const suspField = SUSPENSION_FIELD[competition] || "suspendedMatches";
  const issues = [];
  startingXI.forEach(id => {
    const p = squad.find(pl => pl.id === id);
    if (!p) { issues.push("En vald spelare i startelvan finns inte längre i truppen."); return; }
    if (p.injuryWeeks > 0) issues.push(`${p.name} är skadad — ${p.injuryWeeks} omgångar kvar.`);
    else if ((p[suspField] || 0) > 0) issues.push(`${p.name} är avstängd i ${COMPETITION_LABEL[competition] || "tävlingen"} — ${p[suspField]} omgångar kvar.`);
    else if (p.internationalDuty) issues.push(`${p.name} är på landslagsuppdrag.`);
  });
  return issues;
}

// ---------- Formations ----------
const FORMATION_CODES = ["4-4-2", "4-3-3", "4-2-3-1", "4-1-2-1-2", "3-5-2", "3-2-1-3-1", "5-2-2-1", "3-1-3-2-1", "4-5-1", "3-4-3"];
function parseFormation(code) {
  const lines = code.split("-").map(Number);
  const n = lines.length;
  const slots = [{ id: "gk", role: "MV", x: 6, y: 50 }];
  lines.forEach((count, li) => {
    // A front line of exactly two should read as two central strikers (ST) by default, not spread all the
    // way to the wide edges like a back four or midfield four would — that's what previously turned "two
    // strikers" into two wide attacking midfielders. It also needs to sit far enough forward to actually
    // land on the striker column instead of the attacking-midfielder column just behind it.
    const isNarrowAttackPair = li === n - 1 && count === 2;
    const x = isNarrowAttackPair ? 94 : 22 + (n === 1 ? 0 : (li / (n - 1)) * 66);
    let role = "MF";
    if (li === 0) role = "FÖ";
    else if (li === n - 1) role = "AN";
    for (let i = 0; i < count; i++) {
      const y = count === 1 ? 50 : isNarrowAttackPair ? 25 + i * 50 : 10 + (i / (count - 1)) * 80;
      slots.push({ id: `${li}-${i}`, role, x, y });
    }
  });
  return slots;
}
function autoAssignFormation(slots, squad, xiIds) {
  const pool = xiIds.map(id => squad.find(p => p.id === id)).filter(Boolean);
  const used = new Set();
  const map = {};
  slots.forEach(slot => {
    const match = pool.find(p => !used.has(p.id) && p.pos === slot.role);
    if (match) { map[slot.id] = match.id; used.add(match.id); }
  });
  const leftoverSlots = slots.filter(s => !map[s.id]);
  const leftoverPlayers = pool.filter(p => !used.has(p.id));
  leftoverSlots.forEach((slot, i) => { if (leftoverPlayers[i]) { map[slot.id] = leftoverPlayers[i].id; used.add(leftoverPlayers[i].id); } });
  return map;
}

function contractDemand(player) {
  const rng = seededRandom(String(player.id) + "contract" + player.contractYears);
  const avgRating = player.apps ? player.ratingSum / player.apps : 6.2;
  const formBonus = clamp((avgRating - 6) * 0.15, -0.15, 0.3);
  const years = player.age < 24 ? (rng() < 0.5 ? 3 : 4) : player.age < 30 ? (rng() < 0.5 ? 2 : 3) : (rng() < 0.5 ? 1 : 2);
  const newValue = Math.round(player.value * (1.08 + formBonus + rng() * 0.1));
  return { years, newValue };
}
// A homegrown talent who's clearly outgrown the club that raised them — young, academy-produced, and
// now meaningfully better than the club's own reputation would suggest a player of their level "should"
// be at. This is exactly the profile that gets restless: proven itself at first-team level, wants a step up.
function isBreakoutStar(player, clubReputation) {
  if (!player.academyProduct || player.age > 26) return false;
  const overall = overallOf(player);
  const repImpliedCeiling = 35 + (clubReputation || 30) * 0.55;
  const outgrown = overall - repImpliedCeiling >= 12 && (player.apps || 0) >= 8;
  if (!outgrown) return false;
  // A player who has genuinely bought into the manager's vision for the club gives it real time before
  // getting restless again — high trust effectively suppresses the "wants to leave" flag for a while.
  if ((player.visionTrust || 0) >= 55) return false;
  return true;
}

// ---------- Club Vision system: a manager can pitch a concrete, dated future to a breakout talent to
// earn their patience — but the promise is tracked and judged against reality every season after.
const VISION_GOAL_TYPES = {
  top_position: { label: "Nå en topplacering", describe: n => `Sluta på plats ${n.target} eller bättre i ligan`, defaultTarget: 5 },
  promotion: { label: "Ta klubben uppåt", describe: () => "Bli uppflyttad till en högre division", defaultTarget: null },
  trophy: { label: "Vinna en trofé", describe: () => "Vinna ligan eller en cup", defaultTarget: null },
  investment: { label: "Investera i truppen", describe: n => `Investera minst ${formatMoney(n.target)} i nya spelare`, defaultTarget: 3000 },
  academy_graduates: { label: "Satsa på akademin", describe: n => `Flytta upp minst ${n.target} akademispelare till A-laget`, defaultTarget: 2 },
};
function createClubVision(yearSpan, goalSpecs, currentSeason, startDivision) {
  return {
    id: uid(), createdSeason: currentSeason, targetSeason: currentSeason + yearSpan, yearSpan, startDivision,
    goals: goalSpecs.map(g => ({ type: g.type, target: g.target ?? VISION_GOAL_TYPES[g.type].defaultTarget, achieved: false, achievedSeason: null })),
    pitches: {}, // playerId -> { believedSeason, trust }
    resolved: false, success: null,
  };
}
// Checks each goal against actual game history/state and marks it achieved the moment it's first met —
// once achieved a goal stays achieved even if things later slip (a promise kept is kept).
function evaluateVisionGoals(vision, g) {
  const spentSinceVision = (g.transferHistory || []).filter(t => t.toClubId === g.userClubId && t.season >= vision.createdSeason).reduce((s, t) => s + t.fee, 0);
  const graduatesSinceVision = g.squad.filter(p => p.academyProduct && p.promotedSeason >= vision.createdSeason).length;
  const seasonsSoFar = (g.history || []).filter(h => h.season >= vision.createdSeason);
  return vision.goals.map(goal => {
    if (goal.achieved) return goal;
    let met = false;
    if (goal.type === "top_position") met = seasonsSoFar.some(h => h.division === vision.startDivision && h.pos <= goal.target);
    else if (goal.type === "promotion") met = seasonsSoFar.some(h => h.division < vision.startDivision);
    else if (goal.type === "trophy") met = seasonsSoFar.some(h => h.pos === 1 || h.cup1Result?.startsWith("Mästare") || h.cup2Result?.startsWith("Mästare") || h.domesticCupResult?.startsWith("Mästare"));
    else if (goal.type === "investment") met = spentSinceVision >= goal.target;
    else if (goal.type === "academy_graduates") met = graduatesSinceVision >= goal.target;
    return met ? { ...goal, achieved: true, achievedSeason: g.season } : goal;
  });
}
function visionProgressSummary(vision, g) {
  const goals = evaluateVisionGoals(vision, g);
  const achievedCount = goals.filter(gl => gl.achieved).length;
  const yearsLeft = vision.targetSeason - g.season;
  const yearsElapsed = g.season - vision.createdSeason;
  const paceExpected = vision.yearSpan > 0 ? yearsElapsed / vision.yearSpan : 1;
  const paceActual = goals.length ? achievedCount / goals.length : 0;
  const onTrack = paceActual >= paceExpected - 0.15;
  return { goals, achievedCount, total: goals.length, yearsLeft, onTrack, expired: g.season >= vision.targetSeason };
}
// Selling a multi-year vision to a genuine breakout talent is meant to be hard — a real, uncertain
// pitch rather than a guaranteed retention tool. Deliberately capped low even in the best case.
function pitchVisionSuccessChance(player, manager, vision, clubReputation) {
  let chance = 0.14;
  chance += clamp(((manager?.reputation || 30) - 30) * 0.0025, -0.05, 0.08);
  chance += clamp(((manager?.attributes?.forhandling || 50) - 50) * 0.0015, -0.04, 0.06);
  if (player.personality === "Lojal") chance += 0.13;
  else if (player.personality === "Ledare") chance += 0.05;
  else if (player.personality === "Ambitiös") chance -= 0.09;
  else if (player.personality === "Problemspelare") chance -= 0.13;
  chance -= Math.max(0, vision.goals.length - 1) * 0.03;
  const idealSpan = 3;
  chance -= Math.abs(vision.yearSpan - idealSpan) * 0.02;
  // A vision pitched to a player who's already deep into their breakout (much better than the club
  // "deserves") is an even harder sell — they know their own market value.
  const overall = overallOf(player);
  const repImpliedCeiling = 35 + (clubReputation || 30) * 0.55;
  chance -= clamp((overall - repImpliedCeiling - 12) * 0.006, 0, 0.1);
  return clamp(chance, 0.04, 0.4);
}

// ---------- Club facility sub-parts (Arena/Akademi/Scouting details) ----------
const STAND_NAMES = { north: "Norra läktaren", south: "Södra läktaren", east: "Östra läktaren", west: "Västra läktaren" };
const STAND_TIER_NAMES = ["Ståplats", "Sittplatser", "Numrerade platser", "Läktartak", "VIP-loger"];
function startPartLevel_(prestigeScore, max) { return clamp(prestigeScore >= 82 ? 3 : prestigeScore >= 70 ? 2 : 1, 1, max); }
function startArenaStands(club, division) {
  if (CLUB_ARENA_STANDS_OVERRIDES[club.id]) return CLUB_ARENA_STANDS_OVERRIDES[club.id];
  const rng = seededRandom(club.id + "arenastands");
  const arche = ARCHETYPES[club.archetype];
  const prestigeScore = (arche.tierMin + arche.tierMax) / 2 - (division - 1) * 8;
  const base = startPartLevel_(prestigeScore, 5);
  if (division === 1) {
    return { north: base, south: base, east: Math.max(1, base - 1), west: Math.max(1, base - 1) };
  }
  if (division === 2) {
    const isRough = prestigeScore < 25 && rng() < 0.12;
    if (isRough) {
      return { north: Math.max(1, base), south: 0, east: 0, west: 0 };
    }
    return {
      north: base, south: rng() < 0.7 ? Math.max(1, base - 1) : 0,
      east: rng() < 0.4 ? 1 : 0, west: rng() < 0.25 ? 1 : 0,
    };
  }
  // division 3: often just one main stand on the long side, rest bare ground
  return {
    north: Math.max(1, base),
    south: rng() < 0.3 ? 1 : 0,
    east: 0, west: 0,
  };
}
function arenaCapacityForClub(club, division) {
  if (club.baseArenaCapacity) return club.baseArenaCapacity;
  const stands = startArenaStands(club, division);
  const arche = ARCHETYPES[club.archetype];
  const devArena = Math.max(1, arche.startDev.arena - (division - 1));
  return Math.round(4000 + devArena * 2000 + Object.values(stands).reduce((s, l) => s + standCapacity(l), 0));
}
function standCapacity(level) { return level <= 0 ? 0 : 1200 + level * 1300; }
function constructionSeatDelta(ac) {
  if (!ac) return 0;
  const perLevel = ac.stand === "arena" ? 2000 : 1300;
  return (ac.toLevel - ac.fromLevel) * perLevel;
}
function arenaConstructionDuration(targetLevel) { return clamp(6 + (targetLevel - 1) * 9, 6, 50); }
function arenaCapacityOf(dev, stands) {
  const s = stands || { north: 1, south: 1, east: 1, west: 1 };
  return Math.round(4000 + dev.arena * 2000 + Object.values(s).reduce((sum, l) => sum + standCapacity(l), 0));
}
function partUpgradeCost(category, level) {
  const base = { arenaStands: 350, arenaFacilities: 300, akademiParts: 380, scoutingParts: 460 }[category];
  const exponent = category === "scoutingParts" ? 1.8 : 1.55;
  const effLevel = category === "arenaStands" ? level + 0.6 : level;
  return Math.round(base * Math.pow(effLevel, exponent));
}
const PART_MAX = { arenaStands: 5, arenaFacilities: 3, akademiParts: 3, scoutingParts: 3 };

const SPONSOR_NAME_POOL = {
  main: ["Nordisk Bank", "Solar Energi AB", "TeknikVaruhuset", "Bryggeri Kronan", "Fraktbolaget Nord", "Försäkring Trygg", "Kristallteknik"],
  stadium: ["Kristallbanken Arena", "Solkraft Arena", "Hamnstaden Arena", "Silverfabriken Arena", "Nordluft Arena", "Vintergatan Arena"],
  local: ["Stadens Bageri", "Bilverkstaden", "Café Mötesplatsen", "Sportbutiken", "Byggvaruhuset", "Restaurang Hörnan"],
};
const SPONSOR_SLOT_LABEL = { main: "Huvudsponsor (matchtröja)", stadium: "Arenapartner (namnrätt)", local: "Lokala partners" };
const SPONSOR_TYPES = {
  ambitios: { label: "Ambitiös partner", desc: "Vill synas och växa med er, men förväntar sig resultat.", walkMod: 1.1, improveMod: 1.2 },
  forsiktig: { label: "Försiktig partner", desc: "Håller hårt i pengarna — svårförhandlad.", walkMod: 0.85, improveMod: 0.55 },
  lojal: { label: "Lojal partner", desc: "Vill bygga en långsiktig relation, mer följsam.", walkMod: 0.7, improveMod: 1.0 },
};
function generateSponsorOffers(slotType, reputation) {
  const pool = SPONSOR_NAME_POOL[slotType];
  const baseIncome = slotType === "main" ? 15 : slotType === "stadium" ? 12 : 6;
  const repMult = 0.6 + reputation / 100;
  const used = new Set();
  return Array.from({ length: 3 }, () => {
    let name = pick(pool);
    let tries = 0; while (used.has(name) && tries < 8) { name = pick(pool); tries++; }
    used.add(name);
    const income = Math.round(baseIncome * repMult * rnd(0.8, 1.3));
    const bonus = Math.round(income * rnd(2, 5));
    const type = pick(Object.keys(SPONSOR_TYPES));
    const contractLength = rndInt(19, 38);
    return { id: uid(), name, income, bonus, type, contractLength };
  });
}
function negotiateSponsor(offer, reputation, attemptsUsed = 0) {
  const type = SPONSOR_TYPES[offer.type] || SPONSOR_TYPES.forsiktig;
  const walkChance = clamp((0.13 - reputation / 700 + attemptsUsed * 0.1) * type.walkMod, 0.04, 0.48);
  if (Math.random() < walkChance) return { result: "walk", line: pick(["Tyvärr, vi går vidare med en annan partner.", "Det här känns inte rätt för oss längre — vi drar oss ur.", "Efter internt samtal väljer vi att avstå."]) };
  const improveChance = clamp((0.22 + reputation / 400) * type.improveMod, 0.12, 0.5);
  if (Math.random() < improveChance) {
    return { result: "improved", offer: { ...offer, income: Math.round(offer.income * rnd(1.1, 1.25)), bonus: Math.round(offer.bonus * rnd(1.05, 1.15)) }, line: pick(["Er profil är stark just nu — vi höjer erbjudandet.", "Okej, vi kan sträcka oss lite längre för det här.", "Ni har ett argument — här är ett bättre bud."]) };
  }
  if (Math.random() < 0.4) {
    const skewUp = Math.random() < 0.5;
    const newOffer = skewUp
      ? { ...offer, income: Math.round(offer.income * rnd(0.82, 0.93)), bonus: Math.round(offer.bonus * rnd(1.35, 1.7)) }
      : { ...offer, income: Math.round(offer.income * rnd(1.08, 1.18)), bonus: Math.round(offer.bonus * rnd(0.55, 0.75)) };
    return { result: "counter", offer: newOffer, line: skewUp ? pick(["Vad sägs om lägre löpande intäkt men en större signeringsbonus istället?", "Vi kan lägga mer upfront men mindre per omgång."]) : pick(["Vi höjer hellre den löpande delen, men sänker bonusen.", "Så här: mer varje omgång, mindre i handen direkt."]) };
  }
  return { result: "same", line: pick(["Det här är vårt bästa erbjudande.", "Vi håller fast vid villkoren vi redan lagt.", "Samma summa står kvar — ta det eller lämna det."]) };
}

// ---------- Staff ----------
const STAFF_ROLE_LABEL = { assistant: "Assisterande tränare", physio: "Fysioterapeut", scout: "Huvudscout", gkCoach: "Målvaktstränare", analyst: "Analytiker", fitnessCoach: "Fystränare" };
const STAFF_ROLE_DESC = {
  assistant: "Bättre matchdagsdisciplin — färre gula/röda kort och en liten prestationsboost.",
  physio: "Minskar skaderisken i match och kortar återhämtningstiden vid skador.",
  scout: "Höjer kvalitetstaket på spelare ni hittar, både i A-laget och på ungdomsmarknaden.",
  gkCoach: "Höjer lagets försvarsstyrka i matcher genom bättre målvaktsspel.",
  analyst: "Höjer lagets anfallsstyrka i matcher genom bättre matchförberedelse.",
  fitnessCoach: "Snabbare återhämtning mellan matcher och mindre uttröttning under match.",
};
function generateStaffOffers(role, homeCountry) {
  return Array.from({ length: 3 }, () => {
    const nationality = Math.random() < 0.6 ? homeCountry : pick(NATIONALITY_KEYS);
    const level = rndInt(1, 5);
    const wage = Math.round((20 + level * 22) * rnd(0.85, 1.2));
    return { id: uid(), name: nameForNationality(nationality), nationality, level, wage };
  });
}
function staffFairWage(level) { return Math.round(20 + level * 22); }

// ---------- Board confidence ----------
function boardTargetLabel(archetype, division) {
  if (division === 1) {
    if (archetype === "storklubb") return { label: "Sluta topp 3", check: pos => pos <= 3 };
    if (archetype === "nyrik") return { label: "Sluta topp 8", check: pos => pos <= 8 };
    if (archetype === "arbetarklubb" || archetype === "akademiklubb") return { label: "Undvik nedflyttning", check: pos => pos <= 17 };
    return { label: "Sluta övre halvan", check: pos => pos <= 10 };
  }
  if (division === 2) return { label: "Kvala in till uppflyttningsstriden (topp 8)", check: pos => pos <= 8 };
  return { label: "Sluta övre halvan", check: pos => pos <= 10 };
}

// ---------- Transfer installment plans ----------
// A financed portion of a transfer fee, paid monthly with a flat 8% interest cost on top —
// it should sting (interest is real money lost) but makes otherwise-unaffordable deals possible.
function installmentPlan(amountFinanced, months) {
  const m = clamp(Math.round(months), 1, 24);
  const totalWithInterest = Math.round(amountFinanced * (1 + 0.08 * (m / 12)));
  const monthlyPayment = Math.round(totalWithInterest / m);
  return { months: m, amountFinanced: Math.round(amountFinanced), totalWithInterest, interestCost: totalWithInterest - Math.round(amountFinanced), monthlyPayment };
}
function monthKeyFor(season, round) {
  const d = roundDate(season, round);
  return d.getUTCFullYear() * 12 + d.getUTCMonth();
}

// ---------- Loans ----------
function generateLoanOffers(reputation) {
  const maxLoan = 1500 + reputation * 40;
  return [
    { id: uid(), amount: Math.round(maxLoan * 0.3), years: 2, rate: 0.06 },
    { id: uid(), amount: Math.round(maxLoan * 0.6), years: 3, rate: 0.09 },
    { id: uid(), amount: Math.round(maxLoan * 1.0), years: 5, rate: 0.13 },
  ];
}
function loanInstallment(loan) { return Math.round((loan.amount * (1 + loan.rate * loan.years)) / loan.years); }

// ---------- Team talks ----------
const TEAM_TALK_OPTIONS = {
  lugna: { label: "Lugna ner", desc: "Sänker pulsen inför matchen.", atkMult: 0.97, defMult: 1.04, cardMult: 0.85 },
  neutral: { label: "Håll tyst", desc: "Låt spelet göra pratet.", atkMult: 1, defMult: 1, cardMult: 1 },
  elda: { label: "Elda på", desc: "Piska upp stämningen inför avspark.", atkMult: 1.06, defMult: 0.97, cardMult: 1.2 },
};

// ---------- Press conferences ----------
function pressConferenceOptions(result) {
  if (result === "win") return [
    { key: "cred", label: "Ge cred till spelarna", desc: "Bra för lagmoralen.", fanbaseDelta: 2, reputationDelta: 0, moraleTarget: "best", moraleDelta: 6 },
    { key: "jordnara", label: "Håll fötterna på jorden", desc: "Stabilt och tryggt.", fanbaseDelta: 0, reputationDelta: 2, moraleTarget: null, moraleDelta: 0 },
    { key: "kaxig", label: "Var kaxig", desc: "Fansen älskar det — men sätter press inför nästa match.", fanbaseDelta: 5, reputationDelta: -1, moraleTarget: null, moraleDelta: 0 },
  ];
  if (result === "loss") return [
    { key: "skuld", label: "Ta på dig skulden", desc: "Skyddar spelarna, bra för truppens moral.", fanbaseDelta: 0, reputationDelta: -1, moraleTarget: "all", moraleDelta: 4 },
    { key: "otur", label: "Skyll på otur", desc: "Räddar ansiktet kortsiktigt.", fanbaseDelta: -2, reputationDelta: 0, moraleTarget: null, moraleDelta: 0 },
    { key: "arlig", label: "Var ärlig om bristerna", desc: "Ger respekt men kan reta den som pekas ut.", fanbaseDelta: 1, reputationDelta: 3, moraleTarget: "worst", moraleDelta: -5 },
  ];
  return [
    { key: "positiv", label: "Fokusera på det positiva", desc: "Håller stämningen uppe.", fanbaseDelta: 1, reputationDelta: 0, moraleTarget: "all", moraleDelta: 2 },
    { key: "neutral", label: "Konstatera läget", desc: "Varken eller.", fanbaseDelta: 0, reputationDelta: 1, moraleTarget: null, moraleDelta: 0 },
    { key: "krav", label: "Efterlys mer", desc: "Sätter press på truppen inför nästa match.", fanbaseDelta: -1, reputationDelta: 2, moraleTarget: "worst", moraleDelta: -3 },
  ];
}
function presentationPressOptions(targetLabel) {
  return [
    { key: "audacious", label: "Sätt höga mål öppet", desc: `Lova att nå målet ("${targetLabel}") offentligt — bygger fanbase direkt men höjer förväntningarna.`, fanbaseDelta: 6, boardConfidenceDelta: -4, managerRepDelta: 2 },
    { key: "humble", label: "Var ödmjuk och metodisk", desc: "Prata om långsiktigt arbete — tryggt för styrelsen, mindre hajp bland fansen.", fanbaseDelta: 1, boardConfidenceDelta: 5, managerRepDelta: 0 },
    { key: "confident", label: "Visa lugn självsäkerhet", desc: "Balanserad ton som ger respekt utan att lova för mycket.", fanbaseDelta: 3, boardConfidenceDelta: 1, managerRepDelta: 1 },
  ];
}

// ---------- Player chats ----------
const CHAT_APPROACHES = {
  uppmuntra: { label: "Uppmuntra", desc: "Tryggt och pålitligt — en liten men säker moralboost.", baseDelta: 6, variance: 2 },
  utmana: { label: "Utmana", desc: "Högre risk — kan tända spelaren eller baksmälla.", baseDelta: 10, variance: 14 },
  lyssna: { label: "Lyssna", desc: "Tar tag i grundproblemet — bäst effekt på riktigt missnöjda spelare.", baseDelta: 8, variance: 3 },
};
function chatOutcome(approach, currentMorale) {
  const cfg = CHAT_APPROACHES[approach];
  let delta = cfg.baseDelta + rnd(-cfg.variance, cfg.variance);
  if (approach === "lyssna" && currentMorale <= 35) delta += 6;
  if (approach === "utmana" && Math.random() < 0.25) delta = -Math.abs(delta) * 0.6;
  return Math.round(delta);
}

// ---------- Tactical familiarity ----------
function familiarityBonus(familiarity) { return clamp((familiarity || 0) / 100, 0, 1) * 0.06; }


// ---------- Wages & fair play ----------
function wageBudgetCap(reputation, division, sponsringLevel) {
  const divBase = { 1: 900, 2: 450, 3: 220 }[division];
  return Math.round(divBase * (0.55 + reputation / 100) + sponsringLevel * 45);
}
function totalWageBill(squad) { return squad.reduce((s, p) => s + effectiveWage(p), 0); }
function effectiveWage(p) { return p.loanWeeksLeft ? Math.round((p.wage || 0) * (p.loanWageSharePct ?? 100) / 100) : (p.wage || 0); }
function wageDemand(player, clubReputation = 50, clubBudget = null) {
  const rng = seededRandom(String(player.id) + "wage" + player.contractYears);
  const avgRating = player.apps ? player.ratingSum / player.apps : 6.2;
  // Performance: sustained good form pushes demands up, poor form pulls them down — the single biggest lever.
  const formBonus = clamp((avgRating - 6) * 0.25, -0.25, 0.5);
  const overallish = (player.attack + player.defense) / 2;
  // Potential: young players with a big gap between current ability and ceiling can reasonably ask for a bit
  // more on the promise of growth — but this fades out for players who've already matured (25+).
  const potentialGap = Math.max(0, (player.potential ?? overallish) - overallish);
  const youthPremium = player.age <= 24 ? clamp(potentialGap * 0.16, 0, 9) : player.age <= 27 ? clamp(potentialGap * 0.06, 0, 4) : 0;
  // Age: past-peak players (30+) see their leverage taper off as sporting value depreciates, regardless of
  // a still-decent current rating — an aging player shouldn't keep demanding ever-higher wages forever.
  const ageFactor = player.age <= 29 ? 1 : clamp(1 - (player.age - 29) * 0.045, 0.55, 1);
  // Club economy: a player can reasonably point to a wealthier, higher-reputation club's ability to pay —
  // but this alone can't manufacture a demand out of nowhere; it's a moderate multiplier, not the main driver.
  const repFactor = clamp(0.82 + (clubReputation ?? 50) / 250, 0.82, 1.18);
  const budgetFactor = clubBudget != null ? clamp(0.9 + clubBudget / 60000, 0.85, 1.15) : 1;
  const rawTarget = (overallish * 0.55 + youthPremium) * (1 + formBonus) * ageFactor * repFactor * budgetFactor + rng() * 6;
  // Hard guardrail: without this, a single strong run of form or a lucky roll could double someone's wage
  // demand overnight. Cap any single renegotiation to a season-reasonable band around the current wage.
  const capped = clamp(rawTarget, player.wage * 0.75, player.wage * 1.4);
  return Math.round(Math.max(4, Math.max(player.wage, capped)));
}
function negotiateWage(offerWage, targetWage, reputation, sweetenerScore = 0, isDerby = false, negotiationSkill = 50) {
  const derbyPenalty = isDerby ? 1.3 : 1;
  // A skilled negotiator manager narrows the gap a little before the player's demand is even checked —
  // represents getting more favourable framing/terms into a deal, not a guaranteed win.
  const skillMult = 1 - clamp(negotiationSkill - 50, -30, 40) * 0.0015;
  const effectiveTarget = targetWage * (1 - sweetenerScore) * derbyPenalty * skillMult;
  const ratio = offerWage / effectiveTarget;
  if (ratio >= 1) return { result: "accept" };
  if (ratio >= 0.82) return { result: "counter", counterWage: Math.round(effectiveTarget * rnd(0.98, 1.05)) };
  return { result: "reject" };
}
// Extra perks a player values beyond pure wage: a proposed release clause (job-security/prestige value),
// a sign-on bonus (paid once, from the transfer budget, not wages), and a house+car package. Each softens
// how much weekly wage the player insists on. Capped so wage negotiation still matters most.
function perkSweetenerScore(releaseClauseOffer, signOnBonus, houseCar, playerValue) {
  let score = 0;
  if (releaseClauseOffer > 0) score += clamp((releaseClauseOffer / Math.max(1, playerValue)) * 0.025, 0, 0.05);
  if (signOnBonus > 0) score += clamp((signOnBonus / Math.max(1, playerValue * 0.2)) * 0.05, 0, 0.09);
  if (houseCar) score += 0.05;
  return clamp(score, 0, 0.18);
}

// ---------- Ownership & governance ----------
const OWNER_TYPES = {
  talmodig: { label: "Tålmodig investerare", desc: "Skjuter till kapital utan att kräva mycket tillbaka, men tappar tålamod om ni misslyckas flera säsonger i rad.", patienceDecay: 0.6 },
  kravande: { label: "Krävande ägare", desc: "Ger stora resurser men vill se resultat direkt — förtroendet svänger snabbt åt båda hållen.", patienceDecay: 1.4 },
  sparsam: { label: "Sparsam ägare", desc: "Håller hårt i pengarna och kräver ibland utdelning, men är svår att reta upp.", patienceDecay: 0.4 },
};
function ownerRequestChance(owner, type) {
  const base = owner.patience / 110;
  const typeMod = type === "budget" ? (owner.type === "talmodig" ? 1.2 : owner.type === "sparsam" ? 0.55 : 0.9)
    : type === "contract" ? (owner.type === "talmodig" ? 0.75 : owner.type === "kravande" ? 0.35 : 0.55)
    : (owner.type === "kravande" ? 0.65 : 1.0);
  return clamp(base * typeMod, 0.06, 0.85);
}
function generateOwner(reputation) {
  const type = pick(Object.keys(OWNER_TYPES));
  const nationality = pick(NATIONALITY_KEYS);
  return { name: nameForNationality(nationality), nationality, type, patience: clamp(55 + reputation / 5, 40, 85) };
}
function ownerSeasonEvent(owner, boardTargetMet, budget) {
  const type = OWNER_TYPES[owner.type] || OWNER_TYPES.talmodig;
  const patienceDelta = (boardTargetMet ? rnd(4, 10) : -rnd(6, 14)) * type.patienceDecay;
  const newPatience = clamp(owner.patience + patienceDelta, 0, 100);
  let cashDelta = 0, message = null;
  if (owner.type === "talmodig" && Math.random() < 0.3) { cashDelta = rndInt(400, 1200); message = `${owner.name} skjuter till ${formatMoney(cashDelta)} i nytt kapital.`; }
  else if (owner.type === "kravande" && boardTargetMet && Math.random() < 0.25) { cashDelta = rndInt(300, 900); message = `${owner.name} belönar en bra säsong med ${formatMoney(cashDelta)}.`; }
  else if (owner.type === "sparsam" && budget > 2000 && Math.random() < 0.35) { cashDelta = -rndInt(200, 600); message = `${owner.name} kräver utdelning: ${formatMoney(cashDelta)}.`; }
  return { newPatience, cashDelta, message };
}
function generateTakeoverBid(reputation) {
  const type = pick(["storsatsare", "sanerare"]);
  const nationality = pick(NATIONALITY_KEYS);
  const capitalBoost = type === "storsatsare" ? rndInt(1500, 4000) : rndInt(200, 600);
  return { id: uid(), name: nameForNationality(nationality), nationality, type, capitalBoost };
}

// ---------- Manager career ----------
const MANAGER_ATTR_LABELS = { taktik: "Taktisk skicklighet", motivation: "Motivation & ledarskap", forhandling: "Förhandlingsvana", utveckling: "Talangutveckling" };
const MANAGER_ATTR_ICONS = { taktik: "📋", motivation: "🔥", forhandling: "🤝", utveckling: "🌱" };
function initialManager(name, nationality, division, clubId, clubName, season) {
  const base = { 1: 42, 2: 34, 3: 26 }[division] || 30;
  return {
    name: name || "Ny tränare", nationality: nationality || pick(NATIONALITY_KEYS),
    reputation: base, wage: Math.round(base * 2.2), contractYears: 3, yearsAsManager: 0,
    attributes: { taktik: rndInt(base - 8, base + 8), motivation: rndInt(base - 8, base + 8), forhandling: rndInt(base - 8, base + 8), utveckling: rndInt(base - 8, base + 8) },
    interestedClub: null,
    stints: clubId ? [{ clubId, clubName, startSeason: season ?? 1, endSeason: null, trophies: [] }] : [],
    visions: [],
  };
}
function managerSeasonGrowth(manager, boardTargetMet, trophyCount) {
  const repDelta = (boardTargetMet ? rnd(3, 7) : -rnd(1, 4)) + trophyCount * 4;
  const newReputation = clamp(manager.reputation + repDelta, 5, 99);
  const attrKeys = Object.keys(manager.attributes);
  const grownKey = pick(attrKeys);
  const attrDelta = boardTargetMet ? rnd(1, 3) : rnd(-1, 1.5);
  const newAttributes = { ...manager.attributes, [grownKey]: clamp(Math.round(manager.attributes[grownKey] + attrDelta), 10, 99) };
  return { newReputation, newAttributes };
}
function generateInterestedClub(managerReputation, clubs, userClubId) {
  const pool = Object.values(clubs).filter(c => c.id !== userClubId && c.strength >= 55 + managerReputation / 3);
  if (!pool.length) return null;
  const club = pick(pool);
  const offeredWage = Math.round((40 + managerReputation * 1.8) * rnd(1.1, 1.5));
  return { id: uid(), clubId: club.id, clubName: club.name, offeredWage };
}
function useInterestAsLeverage(currentWage, managerReputation) {
  const bump = Math.round(currentWage * rnd(1.15, 1.35) + managerReputation * 0.3);
  return Math.max(currentWage + 4, bump);
}

// ---------- Manager job market ----------
// When a manager's contract runs out — or they're sacked — this builds a set of realistic job offers
// from other clubs across every country and division, weighted toward clubs whose prestige roughly
// matches the manager's current reputation (with some spread so both reaches and safe options appear).
function generateJobOffers(reputation, clubs, excludeClubId, count = 4) {
  const pool = Object.values(clubs).filter(c => c.id !== excludeClubId);
  if (!pool.length) return [];
  const scored = pool.map(c => ({ c, fit: Math.abs(c.strength - reputation) + rnd(0, 10) })).sort((a, b) => a.fit - b.fit);
  const shortlist = scored.slice(0, Math.max(count * 3, 12)).map(x => x.c);
  const picked = shuffle(shortlist).slice(0, count);
  return picked.map(c => {
    const divMult = c.division === 1 ? 1.3 : c.division === 2 ? 1 : 0.7;
    const offeredWage = Math.round((30 + reputation * 1.6) * rnd(0.85, 1.3) * divMult);
    return { id: uid(), clubId: c.id, clubName: c.name, league: c.league, division: c.division, archetype: c.archetype, offeredWage };
  });
}

// ---------- Assistant manager ----------
function assistantManagerUnlockedViaOrg(staff) { return Object.values(staff).filter(Boolean).length >= 3; }
function generateAssistantManagerOffers(nationality, orgReady) {
  return Array.from({ length: 2 }, () => {
    const level = rndInt(3, 5);
    const nat = pick(NATIONALITY_KEYS);
    const baseWage = Math.round((60 + level * 25) * rnd(0.9, 1.1));
    const wage = orgReady ? baseWage : Math.round(baseWage * 2.4);
    return { id: uid(), name: nameForNationality(nat), nationality: nat, level, wage };
  });
}
function generateManagerTips(g, userClub) {
  const tips = [];
  const cap = wageBudgetCap(g.reputation, userClub.division, g.dev.sponsring);
  const wageTotal = totalWageBill(g.squad);
  if (wageTotal > cap * 0.92) tips.push("Löneutrymmet börjar bli knappt — undvik nya högavlönade värvningar just nu.");
  const unhappyCount = g.squad.filter(p => p.morale <= 35).length;
  if (unhappyCount >= 2) tips.push(`${unhappyCount} spelare i truppen är missnöjda — ett samtal eller två kan hjälpa.`);
  POS_ORDER.forEach(pos => {
    const count = g.squad.filter(p => p.pos === pos && !p.injuryWeeks && !p.suspendedMatches && !p.internationalDuty).length;
    if (count < 3) tips.push(`Tunt på ${POS_LABEL[pos].toLowerCase()} — bara ${count} tillgängliga spelare.`);
  });
  if ((g.formationFamiliarity || 0) < 25) tips.push("Ni har bytt taktik ofta senaste tiden — den tar tid att sätta sig.");
  const expiringCount = g.squad.filter(p => p.contractYears <= 1).length;
  if (expiringCount > 0) tips.push(`${expiringCount} spelare har kontrakt som går ut inom ett år.`);
  if (g.boardConfidence <= 35) tips.push("Styrelsens förtroende är lågt — prioritera resultat i de kommande matcherna.");
  if (g.budget < 0) tips.push("Budgeten är i minus — se över löner eller sälj en spelare.");
  if (!tips.length) tips.push("Allt ser stabilt ut just nu. Fortsätt som vanligt.");
  return tips.slice(0, 5);
}

// ---------- Revenue streams ----------
function tvDealIncome(reputation, division) {
  const divMult = { 1: 1, 2: 0.4, 3: 0.15 }[division];
  return Math.round((40 + reputation * 1.1) * divMult);
}
const MERCH_PRICING = {
  budget: { label: "Budget", desc: "Låga priser, hög volym — bra för fanlojalitet.", mult: 0.82 },
  standard: { label: "Standard", desc: "Balanserat utbud och pris.", mult: 1.0 },
  premium: { label: "Premium", desc: "Höga priser — kräver stark fanbase för att löna sig fullt ut.", mult: 1.32 },
};
function merchandiseIncome(fanbase, shopLevel, pricing = "standard") {
  const base = fanbase * 0.6 + shopLevel * 15;
  const tier = MERCH_PRICING[pricing] || MERCH_PRICING.standard;
  const fanSensitivity = pricing === "premium" ? clamp(fanbase / 70, 0.6, 1.15) : 1;
  return Math.round(base * tier.mult * fanSensitivity);
}
function generateTourOffers(reputation) {
  return [
    {
      id: uid(), name: "Turné i Asien", cost: 250, incomeMin: 300, incomeMax: 700, repBonus: 3, injuryRisk: 0.16, prepBonus: 1, opponents: ["Tokyo All-Stars", "Seoul United", "Shanghai Select XI", "Bangkok Select XI"],
      pros: ["Störst intäkter och synlighet", "Högst rykteshöjning"],
      cons: ["Lång resa sliter på truppen — högre skaderisk i försäsongen", "Minst tid kvar för taktisk inövning hemma"],
    },
    {
      id: uid(), name: "Turné i Nordamerika", cost: 180, incomeMin: 200, incomeMax: 500, repBonus: 2, injuryRisk: 0.09, prepBonus: 3, opponents: ["LA All-Stars", "New York Select XI", "Toronto United", "Mexico City All-Stars"],
      pros: ["Bra balans mellan intäkter och belastning", "Rimlig taktisk förberedelsetid"],
      cons: ["Måttlig skaderisk", "Varken bäst på intäkter eller förberedelse"],
    },
    {
      id: uid(), name: "Lokal försäsongsturné", cost: 60, incomeMin: 60, incomeMax: 160, repBonus: 1, injuryRisk: 0.02, prepBonus: 5, opponents: ["Grannlaget IF", "Regionsserien XI", "Lokala Utmanarna", "Distriktslaget"],
      pros: ["Lägst skaderisk — ingen lång resa", "Bäst taktisk vana inför säsongsstart"],
      cons: ["Minst intäkter", "Minst rykteshöjning"],
    },
  ];
}
function simulateTourMatches(offer) {
  return offer.opponents.map(name => ({ opponent: name, us: rndInt(0, 4), them: rndInt(0, 3) }));
}

// ---------- National team call-ups ----------
const INTERNATIONAL_BREAK_ROUNDS = [4, 12, 22, 30];
function processInternationalBreak(squad) {
  const messages = [];
  let repBonus = 0;
  const newSquad = squad.map(p => {
    const overall = overallOf(p);
    const chance = clamp((overall - 58) / 140, 0, 0.35);
    if (Math.random() < chance) {
      messages.push(`${p.name} kallas upp till ${nationalityLabel(p.nationality)}s landslag och missar nästa match.`);
      repBonus += 0.4;
      const injured = Math.random() < 0.05;
      if (injured) { messages[messages.length - 1] += " Ådrog sig en skada i landslagstjänst."; return { ...p, injuryWeeks: pick([1, 1, 2]) }; }
      return { ...p, internationalDuty: true };
    }
    return p;
  });
  return { newSquad, messages, repBonus };
}

// ---------- Random narrative events ----------
function processRandomEvents(squad, youthSquad, sponsors, incomingOffers, clubs, userClubId, reputation, windowOpen) {
  const messages = [];
  const importantEvents = [];
  let newYouth = youthSquad;
  let newSponsors = sponsors;
  // Tick down active sponsor contracts one round at a time — this is the only place contracts end
  // (expiry) or persist; signing a new one mid-contract is blocked elsewhere, and early termination
  // goes through its own explicit, penalised action.
  Object.entries(sponsors || {}).forEach(([slot, deal]) => {
    if (!deal || deal.roundsRemaining === undefined) return;
    const remaining = deal.roundsRemaining - 1;
    if (remaining <= 0) {
      newSponsors = { ...newSponsors, [slot]: null };
      importantEvents.push({ text: `Sponsoravtalet med ${deal.name} har löpt ut.`, category: "Ekonomi" });
    } else {
      newSponsors = { ...newSponsors, [slot]: { ...deal, roundsRemaining: remaining } };
    }
  });
  let newOffers = incomingOffers;
  let newSquad = squad;
  let budgetDelta = 0;

  if (youthSquad.length && Math.random() < 0.05) {
    const idx = rndInt(0, youthSquad.length - 1);
    const boost = rnd(2, 5);
    newYouth = youthSquad.map((y, i) => i === idx ? { ...y, attack: clamp(y.attack + boost, 15, 99), defense: clamp(y.defense + boost * 0.6, 15, 99) } : y);
    messages.push(`${youthSquad[idx].name} gör ett genombrott på träningen!`);
  }

  const clubBudgetForWages = clubs[userClubId]?.budget;
  const underpaid = squad.filter(p => p.wage < wageDemand(p, reputation, clubBudgetForWages) * 0.8 && overallOf(p) >= 68);
  if (underpaid.length && Math.random() < 0.08) {
    const p = pick(underpaid);
    const newWage = Math.round(wageDemand(p, reputation, clubBudgetForWages) * rnd(0.9, 1.05));
    newSquad = squad.map(pl => pl.id === p.id ? { ...pl, wage: newWage } : pl);
    messages.push(`${p.name}s agent förhandlar fram en löneförhöjning till ${formatMoney(newWage)}/omg.`);
  }

  const clausedPlayers = newSquad.filter(p => p.releaseClause);
  if (windowOpen && clausedPlayers.length && Math.random() < 0.1) {
    const p = pick(clausedPlayers);
    // A release clause means the SELLING club has no say — any club willing to pay it gets the deal done,
    // no negotiation possible. What the club can't force, though, is the player's own willingness to
    // actually go there — so the clause being triggered isn't automatically a done deal.
    const overall = overallOf(p);
    const candidateBuyers = Object.values(clubs).filter(c => c.id !== userClubId && Math.abs(c.strength - overall) < 22);
    const buyer = candidateBuyers.length ? pick(candidateBuyers) : pick(Object.values(clubs).filter(c => c.id !== userClubId));
    if (buyer) {
      const buyerInterest = playerInterestInClub(p, buyer.strength, buyer.division || 1);
      const playerAccepts = buyerInterest >= 30 || Math.random() < 0.7;
      if (playerAccepts) {
        newSquad = newSquad.filter(pl => pl.id !== p.id);
        budgetDelta += p.releaseClause;
        const text = `${buyer.name} löste ut ${p.name}s utköpsklausul för ${formatMoney(p.releaseClause)} — spelaren är klar för flytten.`;
        messages.push(text);
        importantEvents.push({
          text, category: "Övergångar",
          detail: { competition: "Utköpsklausul", homeName: buyer.name, awayName: p.name, homeScore: null, awayScore: null,
            rows: [{ label: "Klausul", value: formatMoney(p.releaseClause) }, { label: "Position", value: p.specificPosition || p.pos }],
            note: `${p.name} lämnar för ${formatMoney(p.releaseClause)} — klubben kunde inte stoppa affären, men spelaren valde själv att tacka ja.` },
          releaseClauseSale: { playerId: p.id, buyerId: buyer.id, fee: p.releaseClause },
        });
      } else {
        newSquad = newSquad.map(pl => pl.id === p.id ? { ...pl, morale: clamp((pl.morale ?? 70) - 6, 0, 100) } : pl);
        const text = `${buyer.name} försökte lösa ut ${p.name}s utköpsklausul för ${formatMoney(p.releaseClause)} — men spelaren tackade nej till flytten.`;
        messages.push(text);
        importantEvents.push({
          text, category: "Övergångar",
          detail: { competition: "Utköpsklausul (avböjd)", homeName: buyer.name, awayName: p.name, homeScore: null, awayScore: null,
            rows: [{ label: "Klausul", value: formatMoney(p.releaseClause) }],
            note: `${p.name} stannar kvar — klubben kunde inte förhindra budet, men spelaren ville inte gå till ${buyer.name} just nu.` },
        });
      }
    }
  }

  const unhappy = squad.filter(p => p.personality !== "Lojal" && (p.morale <= 22 || (p.personality === "Ambitiös" && p.morale <= 38)));
  if (unhappy.length && Math.random() < 0.12 && !incomingOffers.some(o => unhappy.some(u => u.id === o.playerId))) {
    const p = pick(unhappy);
    const overall = overallOf(p);
    const otherClubs = Object.values(clubs).filter(c => c.id !== userClubId);
    const near = otherClubs.filter(c => Math.abs(c.strength - overall) < 25);
    const buyer = near.length ? pick(near) : pick(otherClubs);
    const offer = { id: uid(), playerId: p.id, playerName: p.name, buyerId: buyer.id, buyerName: buyer.name, offer: Math.round(p.value * rnd(0.75, 0.95)), requested: true };
    newOffers = [...incomingOffers, offer];
    messages.push(`${p.name} har begärt en övergång — ${buyer.name} hör genast av sig.`);
    importantEvents.push({ text: `${p.name} har begärt en övergång — missnöjd med sin situation, ${buyer.name} hör genast av sig.`, category: "Missnöje" });
  }

  return { newYouth, newSponsors, newOffers, newSquad, messages, budgetDelta, importantEvents };
}

// How many academy prospects a club starts with, scaled by academy development level — a club with a
// genuinely strong academy (e.g. an akademiklubb archetype in Division 1) fields several promising
// youngsters from day one, while a bottom-table Division 2/3 side typically has just the one.
function academyProspectCountForLevel(akademiLevel) {
  if (akademiLevel >= 3) return 3;
  if (akademiLevel >= 2) return 2;
  return 1;
}
function generateYouthProspect(akademiLevel, intakeBonus = 0, homeCountry) {
  const potentialBase = 45 + akademiLevel * 8 + intakeBonus * 3;
  const variance = 25 - akademiLevel * 3;
  const potential = clamp(rndInt(potentialBase - variance, potentialBase + variance), 35, 99);
  const pos = pick(POS_ORDER);
  const startFactor = 0.35 + Math.random() * 0.15;
  const attack = clamp(Math.round(potential * startFactor * (pos === "AN" ? 1.15 : pos === "MF" ? 1.0 : pos === "FÖ" ? 0.7 : 0.4)), 15, 60);
  const defense = clamp(Math.round(potential * startFactor * (pos === "FÖ" || pos === "MV" ? 1.15 : pos === "MF" ? 0.9 : 0.5)), 15, 60);
  const age = rndInt(15, 17);
  const id = uid();
  const value = youthProspectValue(attack, defense, potential, id);
  const foreignChance = clamp(0.05 + intakeBonus * 0.08, 0.05, 0.3);
  const nationality = homeCountry ? (Math.random() < foreignChance ? pick(NATIONALITY_KEYS.filter(n => n !== homeCountry)) : homeCountry) : pick(NATIONALITY_KEYS);
  return { id, name: randomPlayerName(nationality), nationality, age, pos, specificPosition: randomSpecificPosition(pos), attack, defense, potential, yearsInAcademy: 0, value, apps: 0, goals: 0, ratingSum: 0 };
}
function developmentDeltas(pl, rating) {
  const overall = (pl.attack + pl.defense) / 2;
  const potential = pl.potential ?? Math.min(99, overall + 5);
  const gap = potential - overall;
  const gapFactor = clamp(gap / 15, -0.6, 1.4); // slows near potential, can even reverse slightly if over it
  const baseDelta = rating >= 7.4 ? rnd(0.1, 0.4) : rating < 5.4 ? -rnd(0.05, 0.25) : 0;
  const growthDelta = baseDelta > 0 ? baseDelta * Math.max(gapFactor, 0.12) : baseDelta;
  const ageDecline = pl.age >= 31 ? -rnd(0.02, 0.05) * (pl.age - 30) : 0;
  const total = growthDelta + ageDecline;
  const attackShare = pl.pos === "AN" ? 0.65 : pl.pos === "MF" ? 0.5 : pl.pos === "FÖ" ? 0.3 : 0.2;
  return { attackDelta: total * (0.6 + attackShare * 0.8), defenseDelta: total * (0.6 + (1 - attackShare) * 0.8) };
}
// Academy prospect valuation — pure potential, nothing else. Deliberately NOT scaled by age or current
// ability: if a 16-year-old with 95 potential cost less than the same player at 20, it would create an
// obvious exploit — scout for high-potential teenagers, buy them dirt cheap while young, and let them
// develop for free. The price you pay reflects the ceiling you're buying into, full stop, regardless of
// how far along that journey the player currently is.
function youthProspectValue(attack, defense, potential, id) {
  const breakpoints = [[40, 30], [50, 60], [60, 150], [70, 280], [80, 450], [88, 650], [93, 900], [99, 1300]];
  let value = breakpoints[breakpoints.length - 1][1];
  for (let i = 0; i < breakpoints.length - 1; i++) {
    const [p1, v1] = breakpoints[i], [p2, v2] = breakpoints[i + 1];
    if (potential <= p2) {
      const t = clamp((potential - p1) / (p2 - p1), 0, 1);
      value = v1 + (v2 - v1) * t;
      break;
    }
  }
  // A touch of natural market variance so it doesn't feel like a fixed price list — seeded per player,
  // not re-rolled on every render, so the same prospect always shows the same value. Two players sharing
  // an identical potential can still land a bit apart, same as real scouting valuations would.
  if (id) {
    const noise = seededRandom(String(id) + "youthvalue")();
    value *= 0.93 + noise * 0.15; // roughly ±7%
  }
  return Math.max(30, Math.round(value));
}
function growYouth(y, akademiLevel, spelide, coachBonus = 0) {
  const reliability = akademiLevel / 5;
  const gap = y.potential - (y.attack + y.defense) / 2;
  const detMult = determinationMult(y);
  const bustChance = clamp((0.35 - akademiLevel * 0.06 - coachBonus * 0.04) / detMult, 0.02, 0.4);
  let growth = Math.random() < bustChance ? rnd(-1.5, 0.5) : rnd(1, 4) * (0.4 + reliability * 0.8) * detMult * (gap > 0 ? 1 : 0.3);
  growth *= SPELIDE_MODS[spelide].akademiGrowth;
  const attackShare = y.pos === "AN" ? 0.6 : y.pos === "MF" ? 0.5 : y.pos === "FÖ" ? 0.35 : 0.25;
  const attack = clamp(y.attack + growth * attackShare * 2, 15, 99);
  const defense = clamp(y.defense + growth * (1 - attackShare) * 2, 15, 99);
  return { ...y, attack, defense, yearsInAcademy: y.yearsInAcademy + 1, value: youthProspectValue(attack, defense, y.potential, y.id) };
}
function potentialStars(potential) { return clamp(Math.round(potential / 20), 1, 5); }



// ---------- Schedule & standings ----------
// ---------- Transfer windows ----------
const TRANSFER_WINDOWS = [[0, 6], [18, 23]];
function transferWindowOpen(round) { return TRANSFER_WINDOWS.some(([a, b]) => round >= a && round <= b); }
function roundsUntilWindowCloses(round) {
  const w = TRANSFER_WINDOWS.find(([a, b]) => round >= a && round <= b);
  return w ? w[1] - round : null;
}
function roundsUntilWindowOpens(round) {
  const next = TRANSFER_WINDOWS.map(([a]) => a).find(a => a > round);
  return next !== undefined ? next - round : null;
}

function seededResolveGroup(teamIds, clubs, seed, revealedMatchdays) {
  return withSeededRandom(seed, () => {
    const fullSchedule = generateGroupSchedule(teamIds);
    const sched = fullSchedule.map((round, ri) => round.map(f => {
      const home = clubs[f.home], away = clubs[f.away];
      if (!home || !away) return f;
      if (revealedMatchdays !== undefined && ri >= revealedMatchdays) return f; // not played yet
      const hg = poisson(expectedGoals(home.strength, away.strength, true));
      const ag = poisson(expectedGoals(away.strength, home.strength, false));
      return { ...f, homeGoals: hg, awayGoals: ag };
    }));
    return { schedule: sched, standings: computeStandings(sched, teamIds) };
  });
}
const CUP_LAUNCH_ROUND = { domestic: 2, cup1: 3, cup2: 6 };
function spreadRounds(start, end, count) {
  if (count <= 0) return [];
  if (count === 1) return [end];
  const step = (end - start) / (count - 1);
  return Array.from({ length: count }, (_, i) => Math.round(start + step * i));
}
function cupDueSchedule(type, fieldSize) {
  if (type === "domestic") {
    const roundsNeeded = Math.max(1, Math.ceil(Math.log2(Math.max(2, fieldSize))));
    return spreadRounds(2, 28, roundsNeeded); // widest field, starts earliest, final lands earliest of the three
  }
  if (type === "cup2") {
    return spreadRounds(6, 33, 7); // R16(2 legs) + QF(2 legs) + SF(2 legs) + Final = 7 steps, final lands mid-pack
  }
  if (type === "cup1knockout") {
    return [...spreadRounds(27, 33, 4), 38]; // QF(2 legs) + SF(2 legs) within the season, Final pinned to round 38 — a genuine "eftersäsong" week after the league's last round (37)
  }
  return [];
}
function seededResolveBracket(teamIds, clubs, seed, userClubId, resultLog) {
  return withSeededRandom(seed, () => {
    const rounds = [];
    let current = [...teamIds];
    // Once the user's club has been forced out of "current" (either eliminated for real, or the field
    // is past the point resultLog covers), the rest of the bracket goes back to pure strength-based
    // simulation — there's no more real data to reconcile against.
    while (current.length > 1) {
      const roundSizeBefore = current.length;
      const logEntry = userClubId && resultLog ? resultLog.find(r => r.round === roundSizeBefore) : null;
      const roundMatches = [];
      const next = [];
      for (let i = 0; i < current.length; i += 2) {
        const a = current[i], b = current[i + 1];
        if (!b) { next.push(a); roundMatches.push({ home: a, away: null, winner: a }); continue; }
        const involvesUser = logEntry && (a === userClubId || b === userClubId);
        if (involvesUser) {
          // Trust the real result over the random roll — and if the simulated opponent doesn't match
          // who the user actually faced, swap in the real opponent so the bracket stays honest about it.
          const realOppId = logEntry.oppId;
          const userIsA = a === userClubId;
          const homeId = userIsA ? userClubId : realOppId;
          const awayId = userIsA ? realOppId : userClubId;
          const winner = logEntry.won ? userClubId : realOppId;
          next.push(winner);
          roundMatches.push({ home: homeId, away: awayId, winner });
          continue;
        }
        const ca = clubs[a], cb = clubs[b];
        if (!ca || !cb) { next.push(a); roundMatches.push({ home: a, away: b, winner: a }); continue; }
        const scoreA = ca.strength + rnd(-13, 13), scoreB = cb.strength + rnd(-13, 13);
        const winner = scoreA >= scoreB ? a : b;
        next.push(winner);
        roundMatches.push({ home: a, away: b, winner });
      }
      rounds.push(roundMatches);
      current = next;
    }
    return rounds;
  });
}
function generateAllSchedules(clubs) {
  const schedules = {};
  LEAGUES.forEach(country => {
    [1, 2, 3].forEach(div => {
      const ids = clubsInPool(country.id, div, clubs).map(c => c.id);
      schedules[`${country.id}_d${div}`] = generateSchedule(ids);
    });
  });
  return schedules;
}
function simulateOtherDivisionsRound(allSchedules, clubs, round, skipKey) {
  const updated = {};
  Object.entries(allSchedules || {}).forEach(([key, schedule]) => {
    if (key === skipKey || round >= schedule.length) { updated[key] = schedule; return; }
    updated[key] = schedule.map((r, ri) => {
      if (ri !== round) return r;
      return r.map(f => {
        const home = clubs[f.home], away = clubs[f.away];
        if (!home || !away || f.homeGoals !== null) return f;
        // Same idea as the user's own matches, scaled down and simplified for performance across an
        // entire world's worth of fixtures — actual squad quality and recent form nudge the nominal
        // strength number a little, so two same-archetype clubs don't play as pure statistical twins.
        const homeEff = home.strength * squadQualityIndex(home.squad) * teamFormMult(recentForm(schedule, round, f.home));
        const awayEff = away.strength * squadQualityIndex(away.squad) * teamFormMult(recentForm(schedule, round, f.away));
        const hg = poisson(expectedGoals(homeEff, awayEff, true));
        const ag = poisson(expectedGoals(awayEff, homeEff, false));
        return { ...f, homeGoals: hg, awayGoals: ag };
      });
    });
  });
  return updated;
}
function generateSchedule(teamIds) {
  const teams = [...teamIds];
  const n = teams.length;
  const rounds = [];
  for (let r = 0; r < n - 1; r++) {
    const roundFixtures = [];
    for (let i = 0; i < n / 2; i++) {
      let home = teams[i], away = teams[n - 1 - i];
      if (r % 2 === 1) [home, away] = [away, home];
      roundFixtures.push({ home, away, homeGoals: null, awayGoals: null });
    }
    rounds.push(roundFixtures);
    teams.splice(1, 0, teams.pop());
  }
  const secondLeg = rounds.map(round => round.map(f => ({ home: f.away, away: f.home, homeGoals: null, awayGoals: null })));
  return [...rounds, ...secondLeg];
}
function generateGroupSchedule(teamIds) {
  const teams = [...teamIds];
  const n = teams.length;
  const firstLeg = [];
  for (let r = 0; r < n - 1; r++) {
    const roundFixtures = [];
    for (let i = 0; i < n / 2; i++) {
      let home = teams[i], away = teams[n - 1 - i];
      if (r % 2 === 1) [home, away] = [away, home];
      roundFixtures.push({ home, away, homeGoals: null, awayGoals: null });
    }
    firstLeg.push(roundFixtures);
    teams.splice(1, 0, teams.pop());
  }
  const secondLeg = firstLeg.map(round => round.map(f => ({ home: f.away, away: f.home, homeGoals: null, awayGoals: null })));
  return [...firstLeg, ...secondLeg];
}
function computeStandings(schedule, clubIds) {
  const table = {};
  clubIds.forEach(id => { table[id] = { id, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, pts: 0 }; });
  schedule.forEach(round => round.forEach(f => {
    if (f.homeGoals === null) return;
    const h = table[f.home], a = table[f.away];
    if (!h || !a) return;
    h.played++; a.played++; h.gf += f.homeGoals; h.ga += f.awayGoals; a.gf += f.awayGoals; a.ga += f.homeGoals;
    if (f.homeGoals > f.awayGoals) { h.won++; h.pts += 3; a.lost++; }
    else if (f.homeGoals < f.awayGoals) { a.won++; a.pts += 3; h.lost++; }
    else { h.drawn++; a.drawn++; h.pts++; a.pts++; }
  }));
  return Object.values(table).sort((x, y) => (y.pts - x.pts) || ((y.gf - y.ga) - (x.gf - x.ga)) || (y.gf - x.gf));
}
function instantSeasonTable(clubIds, clubs) {
  const table = {};
  clubIds.forEach(id => { table[id] = { id, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, pts: 0 }; });
  for (let i = 0; i < clubIds.length; i++) {
    for (let j = 0; j < clubIds.length; j++) {
      if (i === j) continue;
      const home = clubs[clubIds[i]], away = clubs[clubIds[j]];
      const lh = expectedGoals(home.strength, away.strength, true), la = expectedGoals(away.strength, home.strength, false);
      const hg = poisson(lh), ag = poisson(la);
      const h = table[clubIds[i]], a = table[clubIds[j]];
      h.played++; a.played++; h.gf += hg; h.ga += ag; a.gf += ag; a.ga += hg;
      if (hg > ag) { h.won++; h.pts += 3; a.lost++; } else if (hg < ag) { a.won++; a.pts += 3; h.lost++; } else { h.drawn++; a.drawn++; h.pts++; a.pts++; }
    }
  }
  return Object.values(table).sort((x, y) => (y.pts - x.pts) || ((y.gf - y.ga) - (x.gf - x.ga)) || (y.gf - x.gf));
}

// Fatigued players don't just get a worse post-match rating narrative — they genuinely underperform
// on the pitch. This scales a player's effective attack/defense down as their stamina drops, feeding
// directly into the actual match simulation (goals scored), not just cosmetic commentary afterward.
function staminaMult(stamina) {
  const s = stamina ?? 100;
  if (s >= 70) return 1;
  if (s >= 50) return 0.94;
  if (s >= 30) return 0.85;
  return 0.72;
}
// A player's last few performances give a genuine, bounded read on current form — someone on a hot
// streak plays a little sharper than their base numbers suggest, someone out of form a little worse.
// Needs at least 3 recent ratings before it kicks in, so a single fluke game doesn't swing things.
function formMult(player) {
  const recent = player.recentRatings || [];
  if (recent.length < 3) return 1;
  const avg = recent.reduce((s, r) => s + r, 0) / recent.length;
  return 1 + clamp((avg - 6.3) * 0.05, -0.12, 0.12);
}
function userStrength(xi, tactic, spelide, tacticalSettings, fitScore, staff, managerAttrs) {
  let attack = xi.reduce((s, p) => s + p.attack * staminaMult(p.stamina) * formMult(p) * (p.pos === "AN" ? 1.3 : p.pos === "MF" ? 1.1 : 0.5), 0) / xi.length;
  let defense = xi.reduce((s, p) => s + p.defense * staminaMult(p.stamina) * formMult(p) * (p.pos === "FÖ" || p.pos === "MV" ? 1.3 : p.pos === "MF" ? 0.9 : 0.5), 0) / xi.length;
  if (tactic === "anfall") { attack *= 1.16; defense *= 0.88; }
  if (tactic === "forsvar") { attack *= 0.86; defense *= 1.16; }
  const mods = SPELIDE_MODS[spelide] || SPELIDE_MODS.balanserad;
  attack *= mods.attack; defense *= mods.defense;
  if (tacticalSettings) {
    const tMods = combinedTacticalMods(tacticalSettings);
    attack *= tMods.atkMult; defense *= tMods.defMult;
  }
  if (fitScore !== undefined && fitScore !== null) {
    const fitMult = 0.75 + 0.25 * clamp(fitScore, 0.3, 1);
    attack *= fitMult; defense *= fitMult;
  }
  // Quality (sub-attribute alignment), staff bonuses, and manager tactical skill are all "background"
  // advantages a well-run club builds up over time — summed as deltas and capped TOGETHER, rather than
  // each multiplying independently, so a club that's strong on every front doesn't snowball into an
  // unrealistic combined edge no AI-controlled club could ever match.
  const qualityDeltas = xi.map(p => {
    const rawEstimate = p.pos === "MV" ? p.defense : (p.attack + p.defense) / 2;
    return overallOf(p) - rawEstimate;
  });
  const avgQualityDelta = qualityDeltas.reduce((s, d) => s + d, 0) / xi.length;
  let backgroundDeltaAtk = clamp(avgQualityDelta * 0.006, -0.12, 0.12);
  let backgroundDeltaDef = backgroundDeltaAtk;
  if (staff) {
    const gkLevel = staff.gkCoach?.level || 0;
    const analystLevel = staff.analyst?.level || 0;
    backgroundDeltaDef += gkLevel * 0.012;
    backgroundDeltaAtk += analystLevel * 0.009;
  }
  if (managerAttrs) {
    const taktikDelta = clamp((managerAttrs.taktik || 50) - 50, -30, 45) * 0.0025;
    backgroundDeltaAtk += taktikDelta;
    backgroundDeltaDef += taktikDelta;
  }
  backgroundDeltaAtk = clamp(backgroundDeltaAtk, -0.06, 0.06);
  backgroundDeltaDef = clamp(backgroundDeltaDef, -0.06, 0.06);
  attack *= 1 + backgroundDeltaAtk; defense *= 1 + backgroundDeltaDef;
  return { attack: clamp(attack, 20, 99), defense: clamp(defense, 20, 99) };
}
function pickScorerDetailed(squad, count, setPieceTakers) {
  const outfield = squad.filter(p => p.pos !== "MV");
  const openPlayWeighted = [];
  outfield.forEach(p => {
    // Weighted by actual finishing quality (position-aware — a defender's "shooting" is already
    // dampened relative to a striker's, since scoring chances mostly come from being in the right
    // areas with the composure to finish, not raw attack rating alone), further scaled by how often
    // that position realistically gets those chances in the first place.
    const posMult = p.pos === "AN" ? 2.2 : p.pos === "MF" ? 1.1 : 0.22;
    const shooting = getAttrs(p).shooting;
    const weight = Math.max(0, Math.round((shooting / 12) * posMult));
    for (let i = 0; i < weight; i++) openPlayWeighted.push(p);
  });
  const penaltyTakers = ((setPieceTakers && setPieceTakers.penalties) || []).map(id => squad.find(p => p.id === id)).filter(Boolean);
  const freeKickTaker = setPieceTakers && setPieceTakers.freeKick ? squad.find(p => p.id === setPieceTakers.freeKick) : null;
  const results = [];
  for (let i = 0; i < count; i++) {
    const roll = Math.random();
    if (roll < 0.08 && penaltyTakers.length) {
      results.push({ player: penaltyTakers[0], method: "penalty" });
    } else if (roll < 0.13 && freeKickTaker) {
      results.push({ player: freeKickTaker, method: "freekick" });
    } else if (outfield.length && Math.random() < 0.2) {
      // Headers from set pieces do favour physically strong players, including center-backs — that part
      // is realistic — but still need genuine finishing composure, not just height and strength alone.
      const setPieceWeighted = [];
      outfield.forEach(p => { const attrs = getAttrs(p); const w = Math.max(1, Math.round((attrs.physical * 0.6 + attrs.shooting * 0.4) / 14)); for (let j = 0; j < w; j++) setPieceWeighted.push(p); });
      results.push({ player: pick(setPieceWeighted), method: "header" });
    } else {
      results.push({ player: openPlayWeighted.length ? pick(openPlayWeighted) : pick(outfield.length ? outfield : squad), method: "openplay" });
    }
  }
  return results;
}
function pickScorer(squad, count, setPieceTakers) {
  return pickScorerDetailed(squad, count, setPieceTakers).map(r => r.player);
}
// Lightweight per-match stat distribution for AI-vs-AI matches (no live simulation exists for these,
// so goals/assists/cards are distributed statistically) — feeds the division stats league.
// Computes end-of-season awards: top scorer, top points (goals+assists), player of the year (best
// average rating, min appearances), and manager of the year (biggest overperformance vs squad prestige)
// — one set per country/division, plus one global set across the whole world.
function computeSeasonAwards(clubs, userClubId, userSquad, worldStandings) {
  const squadFor = clubId => clubId === userClubId ? userSquad : (clubs[clubId]?.squad || []);
  function topFor(pred, valueFn, minApps = 0) {
    let best = null;
    Object.values(clubs).forEach(c => {
      if (!pred(c)) return;
      squadFor(c.id).forEach(p => {
        if ((p.apps || 0) < minApps) return;
        const val = valueFn(p);
        if (val <= 0) return;
        if (!best || val > best.value) best = { player: p, clubId: c.id, clubName: c.name, clubColor: c.color, value: val };
      });
    });
    return best;
  }
  function managerOfYearFor(pred) {
    let best = null;
    Object.entries(worldStandings).forEach(([countryId, divs]) => {
      Object.entries(divs).forEach(([div, standingsArr]) => {
        const n = standingsArr.length;
        standingsArr.forEach((s, idx) => {
          const c = clubs[s.id];
          if (!c || !pred(c)) return;
          const arche = ARCHETYPES[c.archetype];
          const prestige = (arche.tierMin + arche.tierMax) / 2;
          const posScore = (n - idx) / n;
          const overperformance = posScore - clamp((prestige - 50) / 100, -0.3, 0.3);
          const manager = c.id === userClubId ? { name: "Ni (manager)", nationality: null } : c.manager;
          if (!best || overperformance > best.value) best = { manager, clubId: c.id, clubName: c.name, clubColor: c.color, value: overperformance, pos: idx + 1 };
        });
      });
    });
    return best;
  }
  const globalPred = () => true;
  const global = {
    topScorer: topFor(globalPred, p => p.goals || 0),
    topPoints: topFor(globalPred, p => (p.goals || 0) + (p.assists || 0)),
    playerOfYear: topFor(globalPred, p => p.apps ? p.ratingSum / p.apps : 0, 10),
    managerOfYear: managerOfYearFor(globalPred),
  };
  const byDivision = {};
  LEAGUES.forEach(country => {
    [1, 2, 3].forEach(div => {
      const pred = c => c.league === country.id && c.division === div;
      byDivision[`${country.id}_d${div}`] = {
        countryId: country.id, countryName: country.name, division: div,
        topScorer: topFor(pred, p => p.goals || 0),
        topPoints: topFor(pred, p => (p.goals || 0) + (p.assists || 0)),
        playerOfYear: topFor(pred, p => p.apps ? p.ratingSum / p.apps : 0, 8),
        managerOfYear: managerOfYearFor(pred),
      };
    });
  });
  return { global, byDivision };
}
function distributeMatchStats(squad, goalCount) {
  if (!squad.length) return squad;
  // Tick down existing injuries/suspensions first, and figure out who's actually available this match —
  // without this, AI clubs' best players would play every single game forever, which skews stats unrealistically.
  const ticked = squad.map(p => ({
    ...p,
    injuryWeeks: Math.max(0, (p.injuryWeeks || 0) - 1),
    suspendedMatches: Math.max(0, (p.suspendedMatches || 0) - 1),
  }));
  const available = ticked.filter(p => p.injuryWeeks === 0 && p.suspendedMatches === 0);
  const outfield = available.filter(p => p.pos !== "MV");
  if (!outfield.length) return ticked;
  const scorerWeighted = [];
  outfield.forEach(p => {
    const posMult = p.pos === "AN" ? 2.2 : p.pos === "MF" ? 1.1 : 0.22;
    const shooting = getAttrs(p).shooting;
    const weight = Math.max(0, Math.round((shooting / 12) * posMult));
    for (let i = 0; i < weight; i++) scorerWeighted.push(p.id);
  });
  const assistWeighted = [];
  outfield.forEach(p => {
    const posMult = p.pos === "MF" ? 2.4 : p.pos === "AN" ? 1.3 : 0.6;
    const passing = getAttrs(p).passing;
    const weight = Math.max(0, Math.round((passing / 14) * posMult));
    for (let i = 0; i < weight; i++) assistWeighted.push(p.id);
  });
  const goalInc = {}, assistInc = {};
  for (let i = 0; i < goalCount; i++) {
    const scorerId = scorerWeighted.length ? pick(scorerWeighted) : pick(outfield).id;
    goalInc[scorerId] = (goalInc[scorerId] || 0) + 1;
    if (Math.random() < 0.78) {
      const assisterId = assistWeighted.length ? pick(assistWeighted) : pick(outfield).id;
      if (assisterId !== scorerId) assistInc[assisterId] = (assistInc[assisterId] || 0) + 1;
    }
  }
  const yellowInc = new Set(), redInc = new Set();
  available.forEach(p => {
    if (p.pos === "MV") return; // goalkeepers essentially never pick up cards in open play
    // Defenders and physical, duel-heavy players realistically rack up more cards than attackers —
    // scaled by both position (more tackling/duels) and physical intensity.
    const posMult = p.pos === "FÖ" ? 1.5 : p.pos === "MF" ? 1.15 : 0.7;
    const physicalMult = 0.75 + (getAttrs(p).physical / 100) * 0.5;
    const cardMult = posMult * physicalMult;
    const roll = Math.random();
    if (roll < 0.003 * cardMult) redInc.add(p.id);
    else if (roll < 0.05 * cardMult) yellowInc.add(p.id);
  });
  // A plausible "starting XI" (1 keeper + best ~10 outfield by attribute, roughly matching a real lineup)
  // actually plays this match, drawn only from currently available (non-injured, non-suspended) players.
  const keeper = available.find(p => p.pos === "MV");
  const rankedOutfield = [...outfield].sort((a, b) => overallOf(b) - overallOf(a));
  const playedIds = new Set([keeper?.id, ...rankedOutfield.slice(0, 10).map(p => p.id)].filter(Boolean));
  const newInjuryWeeks = {};
  playedIds.forEach(id => {
    if (Math.random() < 0.035) newInjuryWeeks[id] = rndInt(1, 4);
  });
  return ticked.map(p => {
    const played = playedIds.has(p.id);
    const gotRed = redInc.has(p.id);
    if (!played && !goalInc[p.id] && !assistInc[p.id] && !yellowInc.has(p.id) && !gotRed) return p;
    const rating = played ? clamp(6.1 + (goalInc[p.id] || 0) * 0.7 + (assistInc[p.id] || 0) * 0.4 - (gotRed ? 1.2 : 0) - (yellowInc.has(p.id) ? 0.15 : 0) + rnd(-0.5, 0.5), 3, 10) : 0;
    return {
      ...p,
      goals: (p.goals || 0) + (goalInc[p.id] || 0),
      assists: (p.assists || 0) + (assistInc[p.id] || 0),
      seasonYellowCards: (p.seasonYellowCards || 0) + (yellowInc.has(p.id) ? 1 : 0),
      seasonRedCards: (p.seasonRedCards || 0) + (gotRed ? 1 : 0),
      goals_league: (p.goals_league || 0) + (goalInc[p.id] || 0),
      assists_league: (p.assists_league || 0) + (assistInc[p.id] || 0),
      seasonYellowCards_league: (p.seasonYellowCards_league || 0) + (yellowInc.has(p.id) ? 1 : 0),
      seasonRedCards_league: (p.seasonRedCards_league || 0) + (gotRed ? 1 : 0),
      apps: (p.apps || 0) + (played ? 1 : 0),
      ratingSum: (p.ratingSum || 0) + rating,
      injuryWeeks: newInjuryWeeks[p.id] ?? p.injuryWeeks,
      suspendedMatches: gotRed ? Math.max(p.suspendedMatches, rndInt(1, 2)) : p.suspendedMatches,
    };
  });
}
// Simulates a full penalty shootout kick by kick (not just an instant coin-flip result), so it can be
// played back visually. Takers are drawn from the user's own configured penalty order when available,
// falling back to the best attackers/midfielders on both sides. Best-of-5 then sudden death.
function simulatePenaltyShootout(userSquad, oppSquad, userAttack, oppStrength, setPieceTakers) {
  const orderFor = squad => {
    const outfield = squad.filter(p => p.pos !== "MV");
    const ranked = [...outfield].sort((a, b) => (b.attack * 0.7 + overallOf(b) * 0.3) - (a.attack * 0.7 + overallOf(a) * 0.3));
    return ranked.length ? ranked : squad;
  };
  const userOrder = (setPieceTakers?.penalties?.length
    ? setPieceTakers.penalties.map(id => userSquad.find(p => p.id === id)).filter(Boolean)
    : []).concat(orderFor(userSquad)).filter((p, i, arr) => arr.findIndex(x => x.id === p.id) === i);
  const oppOrder = orderFor(oppSquad);
  const userProb = clamp(0.72 + (userAttack - oppStrength) / 400, 0.55, 0.9);
  const oppProb = clamp(0.72 + (oppStrength - userAttack) / 400, 0.55, 0.9);
  const kicks = [];
  let userScore = 0, oppScore = 0, userTaken = 0, oppTaken = 0;
  const nextTaker = (order, idx) => order[idx % order.length] || { name: "Okänd spelare" };
  // Mathematically decided once the trailing side can no longer catch up even scoring every remaining kick —
  // real shootouts end the moment that happens rather than always going through all 5 kicks each.
  const decided = () => userScore > oppScore + (5 - oppTaken) || oppScore > userScore + (5 - userTaken);

  let round = 0;
  while (round < 5 && !decided()) {
    if (!decided()) {
      const p = nextTaker(userOrder, round);
      const scored = Math.random() < userProb;
      if (scored) userScore++;
      userTaken++;
      kicks.push({ team: "user", playerName: p.name, scored, round: round + 1 });
    }
    if (!decided()) {
      const p = nextTaker(oppOrder, round);
      const scored = Math.random() < oppProb;
      if (scored) oppScore++;
      oppTaken++;
      kicks.push({ team: "opp", playerName: p.name, scored, round: round + 1 });
    }
    round++;
  }
  let sdRound = round;
  while (userScore === oppScore && sdRound < round + 15) {
    const uP = nextTaker(userOrder, sdRound), oP = nextTaker(oppOrder, sdRound);
    const uScored = Math.random() < userProb;
    if (uScored) userScore++;
    kicks.push({ team: "user", playerName: uP.name, scored: uScored, round: sdRound + 1 });
    const oScored = Math.random() < oppProb;
    if (oScored) oppScore++;
    kicks.push({ team: "opp", playerName: oP.name, scored: oScored, round: sdRound + 1 });
    sdRound++;
  }
  return { kicks, userScore, oppScore, userWon: userScore > oppScore, label: `${userScore}-${oppScore}` };
}
function pickAssist(squad, scorer, setPieceTakers) {
  if (Math.random() < 0.22) return null;
  const candidates = squad.filter(p => p.pos !== "MV" && p.id !== scorer.id);
  if (!candidates.length) return null;
  const cornerIds = new Set([setPieceTakers?.cornerLeft, setPieceTakers?.cornerRight].filter(Boolean));
  const weighted = [];
  candidates.forEach(p => {
    // Weighted by actual passing quality, not raw attack — assists are about vision and delivery,
    // and a corner-taker's set-piece delivery skill matters more there than open-play creativity alone.
    const w = (p.pos === "MF" ? 2.4 : p.pos === "AN" ? 1.3 : p.pos === "FÖ" ? 0.6 : 1) * (cornerIds.has(p.id) ? 1.8 : 1);
    const passing = getAttrs(p).passing;
    const weight = Math.max(0, Math.round((passing / 14) * w));
    for (let i = 0; i < weight; i++) weighted.push(p);
  });
  return weighted.length ? pick(weighted) : pick(candidates);
}
function ratingsForResult(squad, scorerNames, result, assistNames, oppGoals) {
  const scorerCounts = {}; scorerNames.forEach(n => { scorerCounts[n] = (scorerCounts[n] || 0) + 1; });
  const assistCounts = {}; (assistNames || []).forEach(n => { if (n) assistCounts[n] = (assistCounts[n] || 0) + 1; });
  const cleanSheet = oppGoals === 0;
  return squad.map(p => {
    const goals = scorerCounts[p.name] || 0;
    const assists = assistCounts[p.name] || 0;
    // A genuinely better player performs more consistently — the position-relevant attribute gives a
    // real (if modest) baseline nudge, so a strong defender or passer tends to rate a bit higher on
    // average even in matches where they don't score or assist, not just pure random noise every time.
    const attrs = getAttrs(p);
    const relevantQuality = p.pos === "MV" ? attrs.defending : p.pos === "FÖ" ? attrs.defending : p.pos === "MF" ? (attrs.passing + attrs.defending) / 2 : attrs.dribbling;
    const qualityBonus = clamp((relevantQuality - 55) * 0.006, -0.25, 0.35);
    let rating = 6.0 + rnd(-0.5, 0.5) + qualityBonus + (result === "win" ? 0.35 : result === "loss" ? -0.25 : 0) + goals * 1.1 + assists * 0.55;
    if (cleanSheet && (p.pos === "MV" || p.pos === "FÖ")) {
      // A clean sheet built on genuinely strong defending earns more credit than one that was mostly luck.
      rating += 0.15 + clamp((attrs.defending - 55) * 0.006, -0.1, 0.25);
    }
    rating = clamp(rating, 3.5, 9.8);
    return { id: p.id, name: p.name, pos: p.pos, rating: Math.round(rating * 10) / 10, goals, assists };
  }).sort((a, b) => b.rating - a.rating);
}

// In bad conditions (rain, wind, snow), a technical, passing-and-dribbling-heavy lineup loses more of its
// edge than a physical, direct one — control and touch matter less when the pitch and ball are working
// against you. Good weather doesn't differentiate; it's specifically the rough days that separate styles.
function weatherTeamMult(xi, weatherMult) {
  if (weatherMult >= 1 || !xi.length) return 1;
  const severity = 1 - weatherMult;
  const avgTechnical = xi.reduce((s, p) => { const a = getAttrs(p); return s + (a.dribbling + a.passing) / 2; }, 0) / xi.length;
  const avgPhysical = xi.reduce((s, p) => { const a = getAttrs(p); return s + (a.physical + a.pace) / 2; }, 0) / xi.length;
  const technicalLean = (avgTechnical - avgPhysical) / 100;
  return 1 - clamp(technicalLean * severity * 1.5, -0.06, 0.06);
}
// ---------- Weather, scouting reports, and match-moment flavor ----------
const WEATHER_OPTIONS = [
  { name: "Strålande sol", icon: "☀️", mult: 1.05 },
  { name: "Molnigt", icon: "☁️", mult: 1.0 },
  { name: "Lätt regn", icon: "🌧️", mult: 0.94 },
  { name: "Blåsigt", icon: "💨", mult: 0.95 },
  { name: "Snöfall", icon: "❄️", mult: 0.88 },
];
function weatherForMatch(seedKey) {
  const rng = seededRandom(seedKey);
  return WEATHER_OPTIONS[Math.floor(rng() * WEATHER_OPTIONS.length)];
}
const OPP_NEWS_LINES = [
  "Rykten talar om ett skadebekymmer i deras försvar.",
  "Deras tränare antyder att ett par ordinarie namn vilas denna omgång.",
  "Uppges ha en nyckelspelare tveksam till spel efter förra matchen.",
  "Ingen tydlig skadeoro rapporterad, men truppläget är osäkert att bedöma utifrån.",
];
function oppTeamNewsNote(oppClub, round) {
  const rng = seededRandom(`oppnews${round}${oppClub.id}`);
  if (rng() < 0.55) return "Inga bekräftade frånvaron från deras sida — trupplistan är svår att läsa utifrån.";
  return OPP_NEWS_LINES[Math.floor(rng() * OPP_NEWS_LINES.length)];
}
const ARCHETYPE_SCOUT_LINES = {
  storklubb: "Djup trupp och stabil organisation genom hela matchen.",
  medelklubb: "Ett jämnt lag utan uppenbara svagheter.",
  arbetarklubb: "Extremt farliga hemma tack vare sina fans.",
  nyrik: "Talangfull trupp, men ibland oprövad ihop.",
  akademiklubb: "Snabba, unga spelare — kan sakna rutin i pressade lägen.",
  utmanare: "Ambitiöst lag på frammarsch. Underskatta dem inte.",
};
function scoutingReport(userAttack, userDefense, opp) {
  const diff = opp.strength - (userAttack + userDefense) / 2;
  const strengthLine = diff > 12 ? "Klart överlägsna motståndare — en tuff match väntar." : diff > 4 ? "Något starkare motstånd." : diff > -4 ? "Jämnstarka lag." : diff > -12 ? "Ni är favoriter." : "Ni är klara favoriter.";
  return { strengthLine, archLine: ARCHETYPE_SCOUT_LINES[opp.archetype] || "" };
}
const FLAVOR_MOMENTS = [
  "Nära det där — stolpen räddar.", "Fin räddning i sista sekund.", "Publiken kommer upp på fötterna.",
  "Frispark i farlig position, men inget kommer av den.", "Hörna efter hörna utan utdelning.",
  "Hård tackling ger gult kort i mittfältet.", "Snyggt kombinationsspel, men sista passningen brister.",
  "Domaren vinkar bort ett offside-mål.", "Skottet går rakt på målvakten.", "Bra omställning, men avslutet blir svagt.",
];
function describeGoal(detail, assistProvider) {
  const { player, method } = detail;
  if (method === "penalty") return `${player.name} är kall som is och sätter straffen säkert!`;
  if (method === "freekick") return `${player.name} curlar in en frispark i krysset!`;
  if (method === "header") return assistProvider ? `${player.name} nickar in på inlägg av ${assistProvider.name}!` : `${player.name} nickar in!`;
  const weakFootTag = weakFoot(player) <= 2 && Math.random() < 0.25 ? " med den svagare foten" : "";
  return assistProvider ? `${player.name} sätter dit den${weakFootTag} efter fint spel av ${assistProvider.name}!` : `${player.name} sätter dit den${weakFootTag}!`;
}
const NEAR_MISS_TEMPLATES = ["{p} nickar i stolpen!", "{p} skjuter utanför från nära håll.", "Ribban räddar för {p}!", "{p}s skott tar en deflektion och går utanför.", "{p} sätter en frispark rakt i muren."];
function personalityMoments(unionXi, isDerby) {
  const moments = [];
  const leader = unionXi.find(p => p.personality === "Ledare");
  if (leader && Math.random() < 0.45) moments.push(`${leader.name} samlar laget och pratar lugnt.`);
  const problem = unionXi.find(p => p.personality === "Problemspelare");
  if (problem && Math.random() < 0.3) moments.push(`${problem.name} muckar gräl med domaren.`);
  if (isDerby) {
    const clutchPlayer = unionXi.filter(p => clutchFactor(p) >= 0.6)[0];
    if (clutchPlayer && Math.random() < 0.4) moments.push(`${clutchPlayer.name} verkar trivas extra bra i den här stämningen.`);
    const nervousPlayer = unionXi.filter(p => clutchFactor(p) <= -0.6)[0];
    if (nervousPlayer && Math.random() < 0.3) moments.push(`${nervousPlayer.name} verkar spänd inför den här stora matchen.`);
  }
  return moments;
}
function chemistryMoment(unionXi, chemistryPairs) {
  if (!chemistryPairs) return null;
  const pairs = [];
  for (let i = 0; i < unionXi.length; i++) for (let j = i + 1; j < unionXi.length; j++) {
    const key = [unionXi[i].id, unionXi[j].id].sort().join("|");
    const games = chemistryPairs[key] || 0;
    if (games >= 15) pairs.push({ a: unionXi[i], b: unionXi[j], games });
  }
  if (!pairs.length) return null;
  const p = pick(pairs);
  return `${p.a.name} och ${p.b.name} hittar varandra igen — de känner varandras spel efter ${p.games} matcher tillsammans.`;
}
function generateKeyMoments(userGoals, oppGoals, scorerDetails, assistProviders, oppName, injuredName, isDerby, unionXi, chemistryPairs) {
  const events = [];
  scorerDetails.forEach((detail, i) => events.push({ minute: rndInt(2, 90), type: "goal-user", text: describeGoal(detail, assistProviders[i]) }));
  for (let i = 0; i < oppGoals; i++) events.push({ minute: rndInt(2, 90), type: "goal-opp", text: `${oppName} hittar nätet.` });
  if (injuredName) events.push({ minute: rndInt(15, 88), type: "note", text: `${injuredName} tvingas utgå skadad.` });
  const flavorCount = rndInt(2, 4);
  const usedFlavors = new Set();
  for (let i = 0; i < flavorCount; i++) {
    let text; let tries = 0;
    do { text = pick(FLAVOR_MOMENTS); tries++; } while (usedFlavors.has(text) && tries < 8);
    usedFlavors.add(text);
    events.push({ minute: rndInt(2, 89), type: "note", text });
  }
  if (unionXi && Math.random() < 0.6) events.push({ minute: rndInt(3, 87), type: "note", text: pick(NEAR_MISS_TEMPLATES).replace("{p}", pick(unionXi.filter(p => p.pos !== "MV")).name) });
  if (unionXi) personalityMoments(unionXi, isDerby).forEach(text => { if (Math.random() < 0.7) events.push({ minute: rndInt(5, 85), type: "note", text }); });
  if (unionXi) { const chem = chemistryMoment(unionXi, chemistryPairs); if (chem && Math.random() < 0.4) events.push({ minute: rndInt(10, 80), type: "note", text: chem }); }
  events.sort((a, b) => a.minute - b.minute);
  if (Math.abs(userGoals - oppGoals) <= 1) events.push({ minute: 90, type: "note", text: "Jämnt läge ända in i slutminuterna." });
  const timeline = events.slice(0, 14);
  const lines = timeline.map(e => `${e.minute}' — ${e.text}`);
  return { lines, timeline };
}
function generateMatchStats(userAttack, oppStrength, userGoals, oppGoals) {
  const ratio = clamp(userAttack / Math.max(1, oppStrength), 0.55, 1.85);
  const possession = clamp(Math.round(50 + (ratio - 1) * 28 + rnd(-5, 5)), 28, 74);
  const userShots = Math.max(userGoals + rndInt(0, 2), Math.round(rnd(7, 15) * (0.55 + possession / 130)));
  const userShotsOnTarget = clamp(Math.max(userGoals, Math.round(userShots * rnd(0.32, 0.5))), userGoals, userShots);
  const oppShots = Math.max(oppGoals + rndInt(0, 2), Math.round(rnd(7, 15) * (0.55 + (100 - possession) / 130)));
  const oppShotsOnTarget = clamp(Math.max(oppGoals, Math.round(oppShots * rnd(0.32, 0.5))), oppGoals, oppShots);
  return {
    possession, userShots, userShotsOnTarget, oppShots, oppShotsOnTarget,
    userCorners: rndInt(2, 9), oppCorners: rndInt(2, 9),
    userFouls: rndInt(6, 14), oppFouls: rndInt(6, 14),
  };
}

// ---------- Domestic cup engine (single match knockout, byes on odd counts) ----------
function processDomesticCupRound(teams, clubs, userClubId, squad, tactic, spelide, startingXI, tacticalSettings) {
  const xi = getXI(squad, startingXI);
  const list = [...teams];
  const winners = [];
  if (list.length % 2 === 1) { const idx = rndInt(0, list.length - 1); winners.push(list[idx]); list.splice(idx, 1); }
  let userReport = null;
  for (let i = 0; i < list.length; i += 2) {
    const a = list[i], b = list[i + 1];
    if (a === userClubId || b === userClubId) {
      const oppId = a === userClubId ? b : a;
      const opp = clubs[oppId];
      const { attack, defense } = userStrength(xi, tactic, spelide, tacticalSettings);
      const userGoals = poisson(expectedGoals(attack, opp.strength, false)), oppGoals = poisson(expectedGoals(opp.strength, defense, false));
      let penalties = null, userWon;
      if (userGoals === oppGoals) {
        const winProb = clamp(0.5 + (attack - opp.strength) / 200, 0.3, 0.7);
        userWon = Math.random() < winProb;
        penalties = userWon ? `${rndInt(4, 6)}-${rndInt(2, 4)}` : `${rndInt(2, 4)}-${rndInt(4, 6)}`;
      } else { userWon = userGoals > oppGoals; }
      const scorers = pickScorer(xi, userGoals).map(p => p.name);
      const ratings = ratingsForResult(xi, scorers, userWon ? "win" : "loss", null, oppGoals);
      const winnerId = userWon ? userClubId : oppId;
      winners.push(winnerId);
      userReport = { oppName: opp.name, oppColor: opp.color, userColor: clubs[userClubId]?.color, userGoals, oppGoals, penalties, result: userWon ? "win" : "loss", ratings };
    } else {
      const A = clubs[a], B = clubs[b];
      const ag = poisson(expectedGoals(A.strength, B.strength, false)), bg = poisson(expectedGoals(B.strength, A.strength, false));
      winners.push(ag === bg ? pick([a, b]) : (ag > bg ? a : b));
    }
  }
  return { winners, userReport };
}
function instantResolveKnockout(teamIds, clubs) {
  let list = shuffle(teamIds);
  while (list.length > 1) {
    const round = [...list];
    const next = [];
    if (round.length % 2 === 1) { const idx = rndInt(0, round.length - 1); next.push(round[idx]); round.splice(idx, 1); }
    for (let i = 0; i < round.length; i += 2) {
      const A = clubs[round[i]], B = clubs[round[i + 1]];
      const ag = poisson(expectedGoals(A.strength, B.strength, false)), bg = poisson(expectedGoals(B.strength, A.strength, false));
      next.push(ag === bg ? pick([round[i], round[i + 1]]) : (ag > bg ? round[i] : round[i + 1]));
    }
    list = next;
  }
  return list[0];
}
function domesticCupField(countryId, clubs) { return shuffle([1, 2, 3].flatMap(d => clubsInPool(countryId, d, clubs).map(c => c.id))); }
// Resolves who plays whom this domestic cup round, including which team (if any) gets a bye when
// the field is odd — seeded so the preview shown before the match and the actual match played
// always agree on the same pairing, instead of computing it independently and risking a mismatch.
function resolveDomesticPairing(teams, seed) {
  const list = [...teams];
  let byeTeam = null;
  if (list.length % 2 === 1) {
    const rng = seededRandom(seed);
    const idx = Math.floor(rng() * list.length);
    byeTeam = list[idx];
    list.splice(idx, 1);
  }
  const pairs = [];
  for (let i = 0; i < list.length; i += 2) pairs.push([list[i], list[i + 1]]);
  return { pairs, byeTeam };
}

// ---------- Continental cup engine (groups + two-legged knockout) ----------
function simulateDecisiveMatch(strengthA, strengthB, aHome) {
  let ga = poisson(expectedGoals(strengthA, strengthB, aHome));
  let gb = poisson(expectedGoals(strengthB, strengthA, !aHome));
  if (ga === gb) { ga += Math.random() < 0.25 ? 1 : 0; gb += Math.random() < 0.25 ? 1 : 0; }
  let winner;
  if (ga > gb) winner = "A"; else if (gb > ga) winner = "B";
  else { const p = clamp(0.5 + (strengthA - strengthB) / 200, 0.35, 0.65); winner = Math.random() < p ? "A" : "B"; }
  return { goalsA: ga, goalsB: gb, winner };
}
function resolveTie(x, y, clubs) {
  const X = clubs[x], Y = clubs[y];
  const leg1 = simulateDecisiveMatch(X.strength, Y.strength, true);
  const leg2 = simulateDecisiveMatch(Y.strength, X.strength, true);
  const xGoals = leg1.goalsA + leg2.goalsB, yGoals = leg1.goalsB + leg2.goalsA;
  const xLegWins = (leg1.winner === "A" ? 1 : 0) + (leg2.winner === "B" ? 1 : 0);
  if (xLegWins === 2) return x;
  if (xLegWins === 0) return y;
  if (xGoals > yGoals) return x;
  if (yGoals > xGoals) return y;
  return Math.random() < 0.5 ? x : y;
}
function setupKnockoutRound(teams, clubs, userClubId) {
  const list = shuffle([...teams]);
  const pendingOtherWinners = [];
  let tie = null;
  for (let i = 0; i < list.length; i += 2) {
    const a = list[i], b = list[i + 1];
    if (a === userClubId || b === userClubId) {
      const oppId = a === userClubId ? b : a;
      tie = { oppId, userHomeLeg1: Math.random() < 0.5, leg: 1, leg1: null, leg2: null };
    } else {
      pendingOtherWinners.push(resolveTie(a, b, clubs));
    }
  }
  return { pendingOtherWinners, tie };
}
function simulateUserDecisiveLeg(oppStrength, squad, tactic, spelide, userIsHome, startingXI, tacticalSettings) {
  const xi = getXI(squad, startingXI);
  const { attack, defense } = userStrength(xi, tactic, spelide, tacticalSettings);
  let userGoals = poisson(expectedGoals(attack, oppStrength, userIsHome));
  let oppGoals = poisson(expectedGoals(oppStrength, defense, !userIsHome));
  if (userGoals === oppGoals) { userGoals += Math.random() < 0.25 ? 1 : 0; oppGoals += Math.random() < 0.25 ? 1 : 0; }
  let penalties = null, userWon;
  if (userGoals === oppGoals) {
    const p = clamp(0.5 + (attack - oppStrength) / 200, 0.35, 0.65);
    userWon = Math.random() < p;
    penalties = userWon ? `${rndInt(4, 6)}-${rndInt(2, 4)}` : `${rndInt(2, 4)}-${rndInt(4, 6)}`;
  } else userWon = userGoals > oppGoals;
  const scorers = pickScorer(xi, userGoals).map(p => p.name);
  const ratings = ratingsForResult(xi, scorers, userWon ? "win" : "loss", null, oppGoals);
  return { userGoals, oppGoals, penalties, userWon, ratings };
}
function topTwoByStrengthNoise(teamIds, clubs) {
  return [...teamIds].map(id => ({ id, score: clubs[id].strength + rnd(-10, 10) })).sort((a, b) => b.score - a.score).slice(0, 2).map(x => x.id);
}
function drawCup1Groups(qualifiers, clubs) {
  const shuffled = shuffle(qualifiers);
  const groups = [[], [], [], []];
  shuffled.forEach(id => {
    const country = clubs[id].league;
    let target = groups.findIndex(g2 => g2.length < 4 && !g2.some(x => clubs[x].league === country));
    if (target === -1) target = groups.findIndex(g2 => g2.length < 4);
    groups[target].push(id);
  });
  return groups;
}
function bracketName(n) { return n === 16 ? "Åttondelsfinal" : n === 8 ? "Kvartsfinal" : n === 4 ? "Semifinal" : "Final"; }
function milestoneFromRoundName(roundName) {
  if (roundName === "Kvartsfinal") return "quarterfinal";
  if (roundName === "Semifinal") return "semifinal";
  if (roundName === "Final") return "runnerup";
  return "participation";
}
function eliminationText(cup) {
  if (cup.roundName === "Gruppspelet") return "Utslagna i gruppspelet";
  return `Utslagna ${roundNameWithArticle(cup.roundName)}`;
}
const CUP1_PRIZES = { participation: 300, quarterfinal: 550, semifinal: 1000, runnerup: 1800, winner: 3500 };
// League "merit money" for final table position — paid every season regardless of cup results, so
// genuine improvement (climbing the table) has a reliable, predictable payoff, not just occasional
// cup windfalls. Concentrated toward the top few places; bottom half gets little to nothing.
function leaguePositionPrize(pos, division, totalTeams = 20) {
  const divMult = { 1: 1, 2: 0.4, 3: 0.15 }[division] || 1;
  const rank = (totalTeams - pos) / (totalTeams - 1);
  return Math.round(3000 * Math.pow(Math.max(0, rank), 3.2) * divMult);
}
const CUP2_PRIZES = { participation: 150, quarterfinal: 280, semifinal: 500, runnerup: 850, winner: 1700 };
const DOMESTIC_PRIZES = { participation: 15, quarterfinal: 70, semifinal: 150, runnerup: 280, winner: 650 };

// ---------- Continental qualification ----------
function buildSeason1Qualifiers(clubs) {
  // Hand-picked season-1 qualifiers, based on the real 2000/2001 Champions League and UEFA Cup fields.
  // Matched by recognizable NAME patterns rather than hardcoded club IDs — a custom or imported database
  // can freely use its own KlubbID scheme, so matching on the name (which stays recognizable whether it's
  // the default fictional name or a renamed real club name) is what actually makes this reliable.
  // Order matters within each league: more specific patterns (e.g. "nerazzurri"/"inter") are checked
  // before more generic ones (e.g. "milan") so a club can't be claimed by the wrong entry.
  const CUP1_PATTERNS = {
    england: [["trafford", "manchester united", "man utd", "man united"], ["north london", "arsenal", "gunners"], ["elland", "leeds"]],
    italy: [["piemonte", "juventus", "juve"], ["laziale", "lazio"], ["milano 1899", "ac milan", "milan"]],
    spain: [["cf madrid", "real madrid"], ["deportivo barcelona", "barcelona", "barca"], ["turia", "valencia"], ["deportivo la coru", "la coruna", "la coruña", "santander"]],
    france: [["fc paris", "psg", "paris saint"], ["monegasque", "monaco"], ["rhone", "lyonnais", "lyon"]],
    germany: [["leverkusen"], ["elbe hamburg", "hamburg", "hsv"], ["münchen 1900", "munchen", "münchen", "bayern"]],
  };
  const CUP2_PATTERNS = {
    england: [["liverpool"], ["stamford", "chelsea"], ["villa claret", "aston villa"]],
    italy: [["nerazzurri", "inter milan", "inter"], ["parma"], ["udine", "udinese"], ["roma 1927", "as roma", "roma"]],
    spain: [["osasuna", "alav"], ["celticos", "celta"], ["periquito", "espanyol"]],
    france: [["sang et or", "lens", "sedan"], ["nantais", "nantes"], ["gironde", "bordeaux"]],
    germany: [["weser", "bremen", "werder"], ["rheinhessen", "mainz", "kaiserslautern", "lautern"], ["neckar", "stuttgart"]],
  };
  // Tries each pattern for a slot IN ORDER across all clubs, rather than treating them as equally-weighted
  // alternatives — so a more specific, preferred name (e.g. an actual "Deportivo La Coruña" in a custom
  // database) always wins over a looser fallback (e.g. "Santander"), instead of whichever happens to be
  // found first by iteration order.
  function matchByPatterns(leagueClubs, patternGroups, exclude) {
    const claimed = new Set(exclude);
    const result = [];
    patternGroups.forEach(patterns => {
      let found = null;
      for (const p of patterns) {
        found = leagueClubs.find(c => !claimed.has(c.id) && c.name.toLowerCase().includes(p));
        if (found) break;
      }
      if (found) { result.push(found.id); claimed.add(found.id); }
    });
    return result;
  }
  const cup1List = [], cup2List = [];
  LEAGUES.forEach(l => {
    const leagueClubs = Object.values(clubs).filter(c => c.league === l.id && c.division === 1);
    const c1 = matchByPatterns(leagueClubs, CUP1_PATTERNS[l.id] || [], []);
    const c2 = matchByPatterns(leagueClubs, CUP2_PATTERNS[l.id] || [], c1);
    // If name-matching came up short for this league (e.g. a heavily customized database with
    // unrecognizable names), fall back to the strongest remaining Division 1 sides from that league.
    const targetC1 = (CUP1_PATTERNS[l.id] || []).length, targetC2 = (CUP2_PATTERNS[l.id] || []).length;
    if (c1.length < targetC1) {
      const remaining = leagueClubs.filter(c => !c1.includes(c.id) && !c2.includes(c.id)).sort((a, b) => b.strength - a.strength);
      for (const c of remaining) { if (c1.length >= targetC1) break; c1.push(c.id); }
    }
    if (c2.length < targetC2) {
      const remaining = leagueClubs.filter(c => !c1.includes(c.id) && !c2.includes(c.id)).sort((a, b) => b.strength - a.strength);
      for (const c of remaining) { if (c2.length >= targetC2) break; c2.push(c.id); }
    }
    cup1List.push(...c1);
    cup2List.push(...c2);
  });
  // Global safety net in case any league is short on Division 1 clubs entirely.
  if (cup1List.length < 16) {
    const remaining = Object.values(clubs).filter(c => c.division === 1 && !cup1List.includes(c.id) && !cup2List.includes(c.id)).sort((a, b) => b.strength - a.strength);
    for (const c of remaining) { if (cup1List.length >= 16) break; cup1List.push(c.id); }
  }
  if (cup2List.length < 16) {
    const remaining = Object.values(clubs).filter(c => c.division === 1 && !cup1List.includes(c.id) && !cup2List.includes(c.id)).sort((a, b) => b.strength - a.strength);
    for (const c of remaining) { if (cup2List.length >= 16) break; cup2List.push(c.id); }
  }
  return { cup1: cup1List.slice(0, 16), cup2: cup2List.slice(0, 16) };
}
function buildContinentalQualifiers(clubs, worldStandings, otherDomesticWinners, userCountryId, userDomesticWinnerId, lastCup2ChampionId) {
  const usedCup1 = {}; const cup1ByCountry = {};
  LEAGUES.forEach(l => { const table = worldStandings[l.id][1]; cup1ByCountry[l.id] = table.slice(0, 3).map(s => s.id); usedCup1[l.id] = new Set([1, 2, 3]); });

  if (lastCup2ChampionId) {
    const champ = clubs[lastCup2ChampionId];
    if (champ) {
      const champCountry = champ.league;
      const table = worldStandings[champCountry][1];
      const champPos = table.findIndex(s => s.id === lastCup2ChampionId) + 1;
      if (champPos >= 1 && champPos <= 3) {
        if (table.length >= 4) { cup1ByCountry[champCountry].push(table[3].id); usedCup1[champCountry].add(4); }
      } else {
        cup1ByCountry[champCountry].push(lastCup2ChampionId);
        if (champPos >= 1) usedCup1[champCountry].add(champPos);
      }
    }
  }

  let cup1List = LEAGUES.flatMap(l => cup1ByCountry[l.id]);
  if (cup1List.length < 16) {
    const remaining = LEAGUES.flatMap(l => worldStandings[l.id][1]).map(s => s.id).filter(id => !cup1List.includes(id)).sort((a, b) => clubs[b].strength - clubs[a].strength);
    for (const id of remaining) { if (cup1List.length >= 16) break; cup1List.push(id); }
  }
  cup1List = cup1List.slice(0, 16);
  const cup1Set = new Set(cup1List);

  const cup2ByCountry = {}; const usedCup2 = {};
  LEAGUES.forEach(l => {
    const table = worldStandings[l.id][1];
    const picks = []; let idx = 3;
    while (picks.length < 2 && idx < table.length) {
      const pos = idx + 1;
      if (!usedCup1[l.id].has(pos) && !cup1Set.has(table[idx].id)) picks.push(table[idx].id);
      idx++;
    }
    cup2ByCountry[l.id] = picks; usedCup2[l.id] = new Set(picks);
  });
  LEAGUES.forEach(l => {
    const winnerId = l.id === userCountryId ? userDomesticWinnerId : otherDomesticWinners[l.id];
    if (!winnerId) return;
    if (cup1Set.has(winnerId)) return;
    if (usedCup2[l.id].has(winnerId)) return;
    cup2ByCountry[l.id].push(winnerId); usedCup2[l.id].add(winnerId);
  });

  let cup2List = Array.from(new Set(LEAGUES.flatMap(l => cup2ByCountry[l.id])));
  if (cup2List.length < 16) {
    const remaining = LEAGUES.flatMap(l => worldStandings[l.id][1]).map(s => s.id).filter(id => !cup1Set.has(id) && !cup2List.includes(id)).sort((a, b) => clubs[b].strength - clubs[a].strength);
    for (const id of remaining) { if (cup2List.length >= 16) break; cup2List.push(id); }
  }
  cup2List = cup2List.slice(0, 16);

  return { cup1: shuffle(cup1List), cup2: shuffle(cup2List) };
}
function nextPostSeasonStage(summary, userClub) {
  if (summary.domesticCupResult === null) return "domestic";
  if (userClub.division === 1 && summary.pos <= 3 && summary.cup1Result === null) return "cup1";
  const cup2Eligible = (userClub.division === 1 && summary.pos >= 5 && summary.pos <= 6) || summary.domesticCupWon;
  if (cup2Eligible && summary.cup2Result === null) return "cup2";
  return "done";
}
function recentForm(schedule, round, userClubId) {
  if (!Array.isArray(schedule)) return [];
  const results = [];
  for (let r = 0; r < round; r++) {
    const roundFixtures = schedule[r];
    if (!roundFixtures) continue;
    const f = roundFixtures.find(x => x.home === userClubId || x.away === userClubId);
    if (!f || f.homeGoals === null) continue;
    const userIsHome = f.home === userClubId;
    const ug = userIsHome ? f.homeGoals : f.awayGoals, og = userIsHome ? f.awayGoals : f.homeGoals;
    results.push(ug > og ? "win" : ug < og ? "loss" : "draw");
  }
  return results.slice(-5);
}

// ---------- Root component ----------
class TranarbankenErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { hasError: false, error: null, componentStack: null }; }
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  componentDidCatch(error, info) { console.error("Tränarbänken crash:", error, info); this.setState({ componentStack: info?.componentStack }); }
  render() {
    if (this.state.hasError) {
      const componentName = (this.state.componentStack || "").trim().split("\n")[0]?.replace(/^in /, "").split(" ")[0];
      return (
        <div style={{ minHeight: "100vh", background: "#13221D", color: "#EEEAE0", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "sans-serif" }}>
          <div style={{ maxWidth: 480, textAlign: "center" }}>
            <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Något gick fel</div>
            <div style={{ fontSize: 13, color: "#8FA096", marginBottom: 16, lineHeight: 1.5 }}>
              Tränarbänken stötte på ett oväntat fel och kunde inte fortsätta rendera. Ditt senast sparade läge finns kvar — ladda om sidan för att fortsätta därifrån.
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#E08A82", background: "rgba(180,68,59,0.15)", padding: "10px 14px", borderRadius: 8, marginBottom: 10, textAlign: "left" }}>
              {componentName && <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, color: "#C99A3E", marginBottom: 4 }}>Kraschade i: {componentName}</div>}
              {String(this.state.error?.message || this.state.error)}
            </div>
            <details style={{ textAlign: "left", marginBottom: 16 }}>
              <summary style={{ fontSize: 10, color: "#8FA096", cursor: "pointer" }}>Teknisk detalj</summary>
              <div style={{ fontSize: 9, fontFamily: "monospace", color: "#8FA096", background: "rgba(0,0,0,0.35)", padding: 10, borderRadius: 8, marginTop: 6, overflow: "auto", maxHeight: 120, whiteSpace: "pre-wrap" }}>
                {String(this.state.error?.stack || "")}
              </div>
            </details>
            <button onClick={() => window.location.reload()} style={{ background: "#D9A94B", color: "#13221D", border: "none", padding: "10px 22px", borderRadius: 10, fontWeight: 700, cursor: "pointer", fontSize: 13 }}>Ladda om spelet</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
export default function TranarbankenAppRoot() {
  return (
    <TranarbankenErrorBoundary>
      <TranarbankenApp />
    </TranarbankenErrorBoundary>
  );
}
function TranarbankenApp() {
  const [previewWorld, setPreviewWorld] = useState(() => generateWorld());
  const [previewWorldPool, setPreviewWorldPool] = useState(null);
  const [activeDbLabel, setActiveDbLabel] = useState("Standarddatabas");
  const season1Qualifiers = useMemo(() => buildSeason1Qualifiers(previewWorld), [previewWorld]);
  const [g, setG] = useState({ setupDone: false });
  const [screen, setScreen] = useState("loading");
  const [saveIndex, setSaveIndex] = useState([]);
  const [activeSaveId, setActiveSaveId] = useState(null);
  const [editingName, setEditingName] = useState(false);
  const [editingColor, setEditingColor] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [confirmSell, setConfirmSell] = useState(null);
  const [toast, setToast] = useState(null);
  const mainScrollRef = useRef(null);
  const [subViewOpen, setSubViewOpen] = useState(false);
  useEffect(() => {
    if (mainScrollRef.current) mainScrollRef.current.scrollTop = 0;
  }, [g.activeTab, g.view, subViewOpen]);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const loadedRef = useRef(false);

  useEffect(() => {
    function handleChange() { setIsFullscreen(!!(document.fullscreenElement || document.webkitFullscreenElement)); }
    document.addEventListener("fullscreenchange", handleChange);
    document.addEventListener("webkitfullscreenchange", handleChange);
    return () => { document.removeEventListener("fullscreenchange", handleChange); document.removeEventListener("webkitfullscreenchange", handleChange); };
  }, []);
  function toggleFullscreen() {
    const el = document.documentElement;
    const request = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen || el.msRequestFullscreen;
    const exit = document.exitFullscreen || document.webkitExitFullscreen || document.mozCancelFullScreen || document.msExitFullscreen;
    const current = document.fullscreenElement || document.webkitFullscreenElement;
    if (!request) { showToast("Helskärm stöds inte i den här webbläsaren — vanligt på iPhone/Safari. Lägg till appen på hemskärmen istället för fullskärmsläge."); return; }
    try {
      if (!current) { const r = request.call(el); if (r && r.catch) r.catch(() => showToast("Helskärm blockerades av den här vyn.")); }
      else exit?.call(document);
    } catch (e) { showToast("Helskärm blockerades av den här vyn."); }
  }

  function normalizeSave(parsed) {
    if (!parsed.setupDone) return parsed;
    const fixedClubs = {};
    Object.values(parsed.clubs).forEach(c => { fixedClubs[c.id] = c.manager ? c : { ...c, manager: generateManager(c.league) }; });
    if (!Object.values(fixedClubs).some(c => c.rivalId)) assignRivals(fixedClubs);
    const fixPlayer = p => ({
      nationality: p.nationality || parsed.leagueId, age: p.age || rndInt(20, 30),
      contractYears: p.contractYears === undefined ? rndInt(1, 4) : p.contractYears, injuryWeeks: p.injuryWeeks || 0,
      yellowCards: p.yellowCards || 0, suspendedMatches: p.suspendedMatches || 0, morale: p.morale === undefined ? 70 : p.morale,
      specificPosition: p.specificPosition || randomSpecificPosition(p.pos),
      wage: p.wage || computeWage(p.value, p.attack, p.defense),
      ...p,
    });
    const fixedSquad = parsed.squad.map(fixPlayer);
    if (fixedSquad.some(p => !p.number)) {
      const used = new Set(fixedSquad.map(p => p.number).filter(Boolean));
      fixedSquad.forEach(p => {
        if (!p.number) { let n = 1; while (used.has(n)) n++; p.number = n; used.add(n); }
      });
    }
    return {
      ...parsed,
      clubs: fixedClubs,
      squad: fixedSquad,
      youthSquad: (parsed.youthSquad || []).map(y => ({ nationality: y.nationality || parsed.leagueId, age: y.age || 16, specificPosition: y.specificPosition || randomSpecificPosition(y.pos), ...y })),
      arenaStands: parsed.arenaStands || { north: 1, south: 1, east: 1, west: 1 },
      arenaFacilities: parsed.arenaFacilities || { restaurant: 1, shop: 1 },
      akademiParts: parsed.akademiParts || { tranare: 1, intag: 1 },
      scoutingParts: parsed.scoutingParts || { analys: 1, kontakter: 1 },
      sponsors: parsed.sponsors || { main: null, stadium: null, local: null },
      staff: { assistant: null, physio: null, scout: null, gkCoach: null, analyst: null, fitnessCoach: null, ...(parsed.staff || {}) },
      boardConfidence: parsed.boardConfidence === undefined ? 60 : parsed.boardConfidence,
      boardCrisisWarned: parsed.boardCrisisWarned || false,
      lastCrisisWasFinancial: parsed.lastCrisisWasFinancial || false,
      customArenaName: parsed.customArenaName || null,
      pendingSelectedPlayerId: null,
      pendingScoutReveal: parsed.pendingScoutReveal || null,
      pendingShootout: parsed.pendingShootout || null,
      transferHistory: parsed.transferHistory || [],
      squadViewPrefs: parsed.squadViewPrefs || { rowMode: "detaljerad", showAllBench: false },
      jobOffers: parsed.jobOffers || null,
      jobMarketMandatory: parsed.jobMarketMandatory || false,
      partnerClubId: parsed.partnerClubId || null,
      loanRequests: parsed.loanRequests || [],
      plannedSub: parsed.plannedSub || null,
      incomingOffers: parsed.incomingOffers || [],
      loans: parsed.loans || [],
      formationCode: parsed.formationCode || "4-4-2",
      tacticalSettings: parsed.tacticalSettings || { ...DEFAULT_TACTICAL_SETTINGS },
      lineupCells: parsed.lineupCells || null,
      owner: parsed.owner || generateOwner(parsed.reputation),
      takeoverBid: parsed.takeoverBid || null,
      tourOffers: parsed.tourOffers || null,
      tourPrepBonus: parsed.tourPrepBonus || 0,
      transferInstallments: parsed.transferInstallments || [],
      installmentMonthKey: parsed.installmentMonthKey ?? monthKeyFor(parsed.season, parsed.round),
      lastTourResult: parsed.lastTourResult || null,
      tourCompletedThisOffseason: parsed.tourCompletedThisOffseason || false,
      formationFamiliarity: parsed.formationFamiliarity || 0,
      teamTalk: parsed.teamTalk || "neutral",
      pendingLateGame: null,
      pendingMidGame: null,
      cupQueue: parsed.cupQueue || [],
      scoutMission: parsed.scoutMission || null,
      ticketPrice: parsed.ticketPrice || "t3",
      arenaConstruction: parsed.arenaConstruction || null,
      outgoingLoans: parsed.outgoingLoans || [],
      loanOffers: parsed.loanOffers || [],
      seasonIncomeTotal: parsed.seasonIncomeTotal || 0, seasonWageTotal: parsed.seasonWageTotal || 0,
      difficulty: parsed.difficulty || "normal",
      savedScoutProfiles: parsed.savedScoutProfiles || [],
      clubRecords: parsed.clubRecords || {},
      setPieceTakers: parsed.setPieceTakers || { penalties: [], freeKick: null, cornerLeft: null, cornerRight: null },
      chemistryPairs: parsed.chemistryPairs || {},
      newsFeed: parsed.newsFeed || [],
      captainId: parsed.captainId || null,
      clubGoodwill: parsed.clubGoodwill || {},
      blacklistedPlayers: parsed.blacklistedPlayers || {},
      staffCandidates: parsed.staffCandidates || {},
      recentMatchFinances: parsed.recentMatchFinances || [],
      allSchedules: parsed.allSchedules || generateAllSchedules(parsed.clubs),
      merchandisePricing: parsed.merchandisePricing || "standard",
      seasonStaffImpact: parsed.seasonStaffImpact || { physio: 0, assistant: 0, analyst: 0, gkCoach: 0, fitnessCoach: 0 },
      sillySeasonWeeksLeft: parsed.sillySeasonWeeksLeft || 0,
      season1Qualifiers: parsed.season1Qualifiers || null,
      repHistory: parsed.repHistory && parsed.repHistory.length ? parsed.repHistory : [parsed.reputation],
      fanHistory: parsed.fanHistory && parsed.fanHistory.length ? parsed.fanHistory : [parsed.fanbase],
      manager: parsed.manager || initialManager("Din tränare", parsed.leagueId, parsed.clubs[parsed.userClubId]?.division || 2),
      assistantManager: parsed.assistantManager || null,
      startingXI: parsed.startingXI || pickBestXI(parsed.squad).map(p => p.id),
      worldPool: parsed.worldPool || generateWorldPool(),
      market: { europa: [], sydamerika: [], afrika: [], asien: [], nordamerika: [], ...(parsed.market || {}) },
    };
  }

  function saveSummary(state) {
    const club = state.clubs[state.userClubId];
    return { clubName: club.name, clubColor: club.color, countryName: LEAGUES.find(l => l.id === state.leagueId)?.name || "", leagueId: state.leagueId, division: club.division, season: state.season, lastPlayed: new Date().toISOString() };
  }
  async function persistIndex(idx) { try { await window.storage?.set("tranarbanken-saves-index", JSON.stringify(idx)); } catch (e) {} }
  async function loadSaveById(id) {
    try { const res = await window.storage?.get(`tranarbanken-save-${id}`); if (res && res.value) return normalizeSave(JSON.parse(res.value)); } catch (e) {}
    return null;
  }

  useEffect(() => {
    (async () => {
      let idx = [];
      try { const res = await window.storage?.get("tranarbanken-saves-index"); if (res && res.value) idx = JSON.parse(res.value); } catch (e) {}
      if (idx.length === 0) {
        // one-time migration from the old single-save format
        try {
          const legacy = await window.storage?.get("tranarbanken-save-v4");
          if (legacy && legacy.value) {
            const parsed = normalizeSave(JSON.parse(legacy.value));
            if (parsed.setupDone) {
              const id = uid();
              idx = [{ id, ...saveSummary(parsed) }];
              await window.storage?.set(`tranarbanken-save-${id}`, JSON.stringify(parsed));
              await persistIndex(idx);
            }
          }
        } catch (e) {}
      }
      setSaveIndex(idx);
      setScreen("select");
      loadedRef.current = true;
    })();
  }, []);

  useEffect(() => {
    if (!loadedRef.current || screen !== "game" || !activeSaveId || !g.setupDone) return;
    (async () => { try { await window.storage?.set(`tranarbanken-save-${activeSaveId}`, JSON.stringify(g)); } catch (e) { console.error("Autosave misslyckades:", e); showToast("⚠️ Kunde inte spara — lagringsutrymmet kan vara fullt."); } })();
    setSaveIndex(prev => {
      if (!prev.some(s => s.id === activeSaveId)) return prev;
      const updated = prev.map(s => s.id === activeSaveId ? { ...s, ...saveSummary(g) } : s);
      persistIndex(updated);
      return updated;
    });
  }, [g]);
  useEffect(() => {
    if (g._toast) { showToast(g._toast); setG(prev => ({ ...prev, _toast: null })); }
  }, [g._toast]);

  useEffect(() => { setSubViewOpen(false); }, [g.activeTab]);
  const standings = useMemo(() => {
    if (!g.setupDone) return [];
    const club = g.clubs[g.userClubId];
    return computeStandings(g.schedule, clubsInPool(g.leagueId, club.division, g.clubs).map(c => c.id));
  }, [g.schedule, g.clubs, g.setupDone, g.leagueId, g.userClubId]);

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(null), 7000);
  }
  function pushNews(text, category, detail = null) {
    if (!text) return;
    setG(prev => ({ ...prev, newsFeed: [{ id: uid(), text, category, season: prev.season, round: prev.round, read: false, detail }, ...(prev.newsFeed || [])].slice(0, 80) }));
  }
  function handleNewsAction(action) {
    if (!action) return;
    if (action.type === "contractRenewal" || action.type === "playerProfile") {
      setG(prev => ({ ...prev, activeTab: "squad", view: "tab", pendingSelectedPlayerId: action.playerId }));
    } else if (action.type === "incomingOffer") {
      setG(prev => ({ ...prev, activeTab: "transfers", view: "tab" }));
    } else if (action.type === "scoutedPlayer") {
      setG(prev => ({ ...prev, activeTab: "transfers", view: "tab", pendingScoutReveal: { playerId: action.playerId, clubId: action.clubId, region: action.region } }));
    }
  }
  function markNewsRead() {
    setG(prev => ({ ...prev, newsFeed: (prev.newsFeed || []).map(n => ({ ...n, read: true })) }));
  }

  function switchToSave(id) {
    (async () => {
      const loaded = await loadSaveById(id);
      if (loaded) { setG(loaded); setActiveSaveId(id); setNameDraft(loaded.clubs[loaded.userClubId].name); setScreen("game"); }
    })();
  }
  function deleteSave(id) {
    (async () => { try { await window.storage?.delete(`tranarbanken-save-${id}`); } catch (e) {} })();
    setSaveIndex(prev => {
      const updated = prev.filter(s => s.id !== id);
      persistIndex(updated);
      if (id === activeSaveId) {
        setActiveSaveId(null);
        setG({ setupDone: false });
        setScreen("select");
      }
      return updated;
    });
  }
  function goToSaveSelect() { setScreen("select"); }
  function goToNewCareer() { setScreen("onboarding"); }
  function exportSave(id) {
    (async () => {
      try {
        const res = await window.storage?.get(`tranarbanken-save-${id}`);
        if (!res || !res.value) { showToast("Kunde inte hitta sparfilen."); return; }
        const entry = saveIndex.find(s => s.id === id);
        const blob = new Blob([res.value], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        const safeName = (entry?.clubName || "karriar").normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").toLowerCase();
        a.href = url;
        a.download = `tranarbanken-${safeName || "karriar"}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast("Sparfilen laddades ner.");
      } catch (e) { showToast("Kunde inte exportera sparfilen."); }
    })();
  }
  function importSaveFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      (async () => {
        try {
          const parsed = JSON.parse(reader.result);
          if (!parsed || !parsed.setupDone || !parsed.clubs || !parsed.userClubId || !parsed.squad) { showToast("Filen verkar inte vara en giltig Tränarbänken-sparfil."); return; }
          const normalized = normalizeSave(parsed);
          const id = uid();
          const entry = { id, ...saveSummary(normalized) };
          await window.storage?.set(`tranarbanken-save-${id}`, JSON.stringify(normalized));
          setSaveIndex(prev => { const updated = [...prev, entry]; persistIndex(updated); return updated; });
          showToast(`${entry.clubName} importerades!`);
        } catch (e) { showToast("Kunde inte läsa filen — är det en giltig sparfil?"); }
      })();
    };
    reader.onerror = () => showToast("Kunde inte läsa filen.");
    reader.readAsText(file);
  }

  function handleConfirmSetup(countryId, division, clubId, managerName, pressChoice, selectedWorld) {
    const clubs = selectedWorld || previewWorld;
    const club = clubs[clubId];
    const activeSeason1Qualifiers = selectedWorld ? buildSeason1Qualifiers(selectedWorld) : season1Qualifiers;
    const initialCupQueue = ["domestic"];
    if (activeSeason1Qualifiers.cup1.includes(clubId)) initialCupQueue.push("cup1");
    else if (activeSeason1Qualifiers.cup2.includes(clubId)) initialCupQueue.push("cup2");
    const arche = ARCHETYPES[club.archetype];
    const divMult = { 1: 1, 2: 0.5, 3: 0.28 }[division];
    const devReduce = division - 1;
    const dev = {
      arena: Math.max(1, arche.startDev.arena - devReduce), akademi: Math.max(1, arche.startDev.akademi - devReduce),
      scouting: Math.max(1, arche.startDev.scouting - devReduce), sponsring: Math.max(1, arche.startDev.sponsring - devReduce),
    };
    const reputation = clamp({ 1: 55, 2: 35, 3: 18 }[division] + arche.repAdj, 5, 92);
    const fanbase = clamp({ 1: 50, 2: 30, 3: 15 }[division] + arche.fanAdj, 5, 90);
    const rating = effectiveScoutRating(dev, reputation);
    const worldPool = previewWorldPool || generateWorldPool();
    const drawEuropa = drawFromWorldPool(worldPool.europa, rating, 4);
    const drawSyd = drawFromWorldPool(worldPool.sydamerika, rating, 2);
    const drawAfrika = drawFromWorldPool(worldPool.afrika, rating, 2);
    const drawAsien = drawFromWorldPool(worldPool.asien, rating, 2);
    const drawNordamerika = drawFromWorldPool(worldPool.nordamerika, rating, 2);
    const market = { europa: drawEuropa.picks, sydamerika: drawSyd.picks, afrika: drawAfrika.picks, asien: drawAsien.picks, nordamerika: drawNordamerika.picks };
    worldPool.europa = drawEuropa.remaining; worldPool.sydamerika = drawSyd.remaining; worldPool.afrika = drawAfrika.remaining; worldPool.asien = drawAsien.remaining; worldPool.nordamerika = drawNordamerika.remaining;
    const userPoolIds = clubsInPool(countryId, division, clubs).map(c => c.id);
    const startSquad = club.squad ? club.squad.map(p => ({ ...p })) : makeSquad(countryId, club.archetype, division, ARCHETYPES[club.archetype].startDev.akademi);
    const manager = initialManager(managerName, countryId, division, clubId, club.name, 1);
    const pressOpt = presentationPressOptions(boardTargetLabel(club.archetype, division).label).find(o => o.key === pressChoice);
    const startFanbase = clamp(fanbase + (pressOpt?.fanbaseDelta || 0), 5, 95);
    const startBoardConfidence = clamp(60 + (pressOpt?.boardConfidenceDelta || 0), 10, 90);
    manager.reputation = clamp(manager.reputation + (pressOpt?.managerRepDelta || 0), 5, 99);
    const prestigeScore = (arche.tierMin + arche.tierMax) / 2 - (division - 1) * 8;
    const startPartLevel = (max) => clamp(prestigeScore >= 82 ? 3 : prestigeScore >= 70 ? 2 : 1, 1, max);
    const initial = {
      setupDone: true, leagueId: countryId, userClubId: clubId, season: 1, round: 0, tactic: "balanserad", spelide: "balanserad",
      budget: Math.round(CLUB_BUDGET_OVERRIDES[clubId] ?? (arche.startBudget * divMult)), lastDelta: 0, dev, reputation, fanbase: startFanbase, lastCup2ChampionId: null,
      clubs, schedule: generateSchedule(userPoolIds), allSchedules: generateAllSchedules(clubs), squad: startSquad, startingXI: pickBestXI(startSquad).map(p => p.id), market, worldPool,
      arenaStands: startArenaStands(club, division), arenaFacilities: { restaurant: startPartLevel(3), shop: startPartLevel(3) },
      akademiParts: { tranare: startPartLevel(3), intag: startPartLevel(3) }, scoutingParts: { analys: startPartLevel(3), kontakter: startPartLevel(3) },
      sponsors: { main: null, stadium: null, local: null },
      staff: { assistant: null, physio: null, scout: null, gkCoach: null, analyst: null, fitnessCoach: null }, boardConfidence: startBoardConfidence, boardCrisisWarned: false, jobOffers: null, plannedSub: null, incomingOffers: [], loans: [], loanOffers: [], transferHistory: [], squadViewPrefs: { rowMode: "detaljerad", showAllBench: false },
      seasonIncomeTotal: 0, seasonWageTotal: 0, difficulty: "normal", savedScoutProfiles: [], clubRecords: {}, seasonStaffImpact: { physio: 0, assistant: 0, analyst: 0, gkCoach: 0, fitnessCoach: 0 },
      setPieceTakers: { penalties: [], freeKick: null, cornerLeft: null, cornerRight: null }, chemistryPairs: {}, newsFeed: [], captainId: null, clubGoodwill: {}, blacklistedPlayers: {}, staffCandidates: {}, recentMatchFinances: [],
      formationCode: "4-4-2", tacticalSettings: { ...DEFAULT_TACTICAL_SETTINGS }, lineupCells: null,
      owner: generateOwner(reputation), takeoverBid: null, tourOffers: null, tourCompletedThisOffseason: false, tourPrepBonus: 0, lastTourResult: null,
      transferInstallments: [], installmentMonthKey: monthKeyFor(1, 0), partnerClubId: null, loanRequests: [], customArenaName: null,
      formationFamiliarity: 0, teamTalk: "neutral", pendingLateGame: null, pendingMidGame: null, restedForMatch: false,
      repHistory: [reputation], fanHistory: [startFanbase],
      manager, assistantManager: null,
      youthSquad: (club.youthSquad && club.youthSquad.length ? club.youthSquad : Array.from({ length: academyProspectCountForLevel(dev.akademi) }, () => generateYouthProspect(dev.akademi, 1, countryId))).map(y => ({ ...y })),
      youthMarket: Array.from({ length: 6 }, () => generateYouthProspect(clamp(dev.scouting, 1, 5), 1)),
      lastMatchReport: null, view: "home", activeTab: "home", pendingAfterResult: "home",
      cups: { domestic: null, cup1: null, cup2: null }, activeCupType: null, qualifiedCupTypes: initialCupQueue, season1Qualifiers: activeSeason1Qualifiers, lastSeasonSummary: null, seasonEndSnapshot: null, history: [], scoutMission: null, ticketPrice: "t3", merchandisePricing: "standard", arenaConstruction: null, outgoingLoans: [], sillySeasonWeeksLeft: 4,
      scoutedPlayerIds: [], pendingPlayerScouts: [],
    };
    const id = uid();
    const entry = { id, ...saveSummary(initial) };
    setSaveIndex(prev => { const updated = [...prev, entry]; persistIndex(updated); return updated; });
    (async () => { try { await window.storage?.set(`tranarbanken-save-${id}`, JSON.stringify(initial)); } catch (e) { console.error("Kunde inte spara ny karriär:", e); showToast("⚠️ Kunde inte spara — lagringsutrymmet kan vara fullt."); } })();
    setActiveSaveId(id);
    setG(initial);
    setNameDraft(club.name);
    setScreen("game");
  }

  if (screen === "loading") return <div style={{ background: C.turfDeep, minHeight: "100vh" }} />;
  if (screen === "select") return <SaveSelectView saves={saveIndex} onSelect={switchToSave} onNew={goToNewCareer} onDelete={deleteSave} onExport={exportSave} onImport={importSaveFile} onOpenDatabase={() => setScreen("database")} />;
  if (screen === "database") return <DatabaseManagerView standardWorld={previewWorld} onUseDatabase={(id, name, clubs, worldPool) => { setPreviewWorld(clubs); setPreviewWorldPool(worldPool || null); setActiveDbLabel(name); setScreen("onboarding"); }} onBack={() => setScreen("select")} />;
  if (screen === "onboarding") return <Onboarding world={previewWorld} onConfirm={handleConfirmSetup} onCancel={() => setScreen("select")} />;

  const userClub = g.clubs[g.userClubId];
  const totalRounds = g.schedule.length;
  const seasonOver = g.round >= totalRounds;
  const nextFixture = !seasonOver ? g.schedule[g.round].find(f => f.home === g.userClubId || f.away === g.userClubId) : null;
  const oppId = nextFixture ? (nextFixture.home === g.userClubId ? nextFixture.away : nextFixture.home) : null;
  const oppClub = oppId ? g.clubs[oppId] : null;
  const userPos = standings.findIndex(s => s.id === g.userClubId) + 1;
  const userRow = standings.find(s => s.id === g.userClubId);
  const countryName = LEAGUES.find(l => l.id === g.leagueId).name;
  const NAV_NOTIFS = {
    transfers: g.incomingOffers.length,
    squad: g.squad.filter(p => p.contractYears <= 1).length,
    club: g.takeoverBid ? 1 : 0,
    personal: Object.values(g.staff).filter(m => m?.needsRaise).length,
    news: (g.newsFeed || []).filter(n => !n.read).length,
  };
function setupCup(type, base) {
    if (type === "domestic") {
      const field = domesticCupField(base.leagueId, base.clubs);
      const dueRounds = cupDueSchedule("domestic", field.length);
      return { type: "domestic", label: LEAGUES.find(l => l.id === base.leagueId).cupName, phase: "knockoutSimple", teams: field, roundName: field.length <= 4 ? bracketName(field.length) : `Omgång 1`, roundIndex: 1, userReport: null, pendingWinners: null, eliminated: false, champion: null, dueRounds, dueIndex: 0, resultLog: [] };
    }
    const { cup1, cup2 } = base.season1Qualifiers || buildContinentalQualifiers(base.clubs, base.seasonEndSnapshot.worldStandings, base.seasonEndSnapshot.otherCupWinners, base.leagueId, base.lastSeasonSummary.domesticCupWinnerId, base.lastCup2ChampionId);
    if (type === "cup1") {
      const groups = drawCup1Groups(cup1, base.clubs);
      const userGroupIndex = groups.findIndex(gr => gr.includes(base.userClubId));
      const otherGroupsQualifiers = groups.filter((_, i) => i !== userGroupIndex).flatMap(gr => topTwoByStrengthNoise(gr, base.clubs));
      const groupSchedule = generateGroupSchedule(groups[userGroupIndex]);
      const groupDueRounds = spreadRounds(3, 24, groupSchedule.length);
      const knockoutDueRounds = cupDueSchedule("cup1knockout", 8);
      return { type: "cup1", label: "Kimby Mästerskapet", finalArena: pick(CUP1_ARENAS), phase: "groups", groups, userGroupIndex, groupSchedule, groupRound: 0, otherGroupsQualifiers, roundName: "Gruppspelet", pendingReport: null, eliminated: false, champion: null, dueRounds: groupDueRounds, knockoutDueRounds, dueIndex: 0, resultLog: [] };
    }
    const { pendingOtherWinners, tie } = setupKnockoutRound(cup2, base.clubs, base.userClubId);
    const dueRounds = cupDueSchedule("cup2", cup2.length);
    return { type: "cup2", label: "Kimby Cupen", finalArena: pick(CUP2_ARENAS), phase: "knockout", teams: cup2, roundName: bracketName(16), pendingOtherWinners, tie, pendingReport: null, eliminated: false, champion: null, dueRounds, dueIndex: 0, resultLog: [] };
}

  function beginRound() {
    if (seasonOver) return;
    const issues = lineupIssues(g.squad, g.startingXI, "league");
    if (issues.length) { showToast(`⚠️ Ni har ingen matchklar startelva — byt ut spelare i Trupp-fliken: ${issues[0]}`); return; }
    const newClubs = { ...g.clubs };
    const xi = getXI(g.squad, g.startingXI);

    const newSchedule = g.schedule.map((round, ri) => {
      if (ri !== g.round) return round;
      return round.map(f => {
        const isUser = f.home === g.userClubId || f.away === g.userClubId;
        if (isUser) return f; // resolved later in resolveSecondHalf
        const home = newClubs[f.home], away = newClubs[f.away];
        const hg = poisson(expectedGoals(home.strength, away.strength, true)), ag = poisson(expectedGoals(away.strength, home.strength, false));
        const drift = (id, res) => {
          const c = newClubs[id];
          const strength = clamp(c.strength + (res === "win" ? rnd(0.1, 0.35) : res === "loss" ? -rnd(0.1, 0.3) : rnd(-0.06, 0.06)) + rnd(-0.08, 0.08), 20, 97);
          const goalsFor = id === f.home ? hg : ag;
          newClubs[id] = { ...c, strength, squad: distributeMatchStats(c.squad, goalsFor) };
        };
        if (hg > ag) { drift(f.home, "win"); drift(f.away, "loss"); }
        else if (hg < ag) { drift(f.away, "win"); drift(f.home, "loss"); }
        else { drift(f.home, "draw"); drift(f.away, "draw"); }
        return { ...f, homeGoals: hg, awayGoals: ag };
      });
    });

    const fixture = g.schedule[g.round].find(f => f.home === g.userClubId || f.away === g.userClubId);
    const userIsHome = fixture.home === g.userClubId;
    const oppId = userIsHome ? fixture.away : fixture.home;
    const opp = newClubs[oppId];
    const { attack, defense } = userStrength(xi, g.tactic, g.spelide, g.tacticalSettings, teamPositionFit(g.lineupCells, g.squad), g.staff, g.manager?.attributes);
    const { attack: attackNoStaff, defense: defenseNoStaff } = userStrength(xi, g.tactic, g.spelide, g.tacticalSettings, teamPositionFit(g.lineupCells, g.squad), null);
    const analystImpactDelta = Math.max(0, attack - attackNoStaff);
    const gkCoachImpactDelta = Math.max(0, defense - defenseNoStaff);
    const fitnessImpactDelta = (g.staff.fitnessCoach ? g.staff.fitnessCoach.level : 0) * 1.2;
    const famBonus = 1 + familiarityBonus(g.formationFamiliarity);
    const weather = weatherForMatch(`weather${g.round}${g.userClubId}`);

    setG(prev => ({
      ...prev, clubs: newClubs, view: "livematch",
      pendingRound: { newSchedule, oppId, oppName: opp.name, oppStrength: opp.strength, userIsHome, weather, xiIds: xi.map(p => p.id), analystImpactDelta, gkCoachImpactDelta, fitnessImpactDelta },
    }));
  }

  function finalizeMatch(p, secondHalfXiIds, subText, userGoals, oppGoals, lateGameNote, scoredByIds) {
    const newClubs = g.clubs;
    const staff = g.staff;
    const analystImpactDelta = p.analystImpactDelta || 0;
    const gkCoachImpactDelta = p.gkCoachImpactDelta || 0;
    const fitnessImpactDelta = p.fitnessImpactDelta || 0;
    const result = userGoals > oppGoals ? "win" : userGoals < oppGoals ? "loss" : "draw";
    const unionIds = Array.from(new Set([...p.xiIds, ...secondHalfXiIds]));
    const unionXi = g.squad.filter(pl => unionIds.includes(pl.id));
    const newChemistryPairs = { ...(g.chemistryPairs || {}) };
    for (let i = 0; i < unionXi.length; i++) {
      for (let j = i + 1; j < unionXi.length; j++) {
        const key = [unionXi[i].id, unionXi[j].id].sort().join("|");
        newChemistryPairs[key] = (newChemistryPairs[key] || 0) + 1;
      }
    }
    function chemistryBonusFor(playerId) {
      const games = unionXi.filter(t => t.id !== playerId).map(t => newChemistryPairs[[playerId, t.id].sort().join("|")] || 0);
      if (!games.length) return 0;
      const avg = games.reduce((s, n) => s + n, 0) / games.length;
      return clamp(avg / 60, 0, 0.25);
    }
    const cellFitByPlayer = {};
    Object.entries(g.lineupCells || {}).forEach(([key, playerId]) => {
      if (!playerId) return;
      const player = g.squad.find(p => p.id === playerId);
      if (!player) return;
      const [col, row] = key.split("-").map(Number);
      cellFitByPlayer[playerId] = positionFit(player.specificPosition, col, row);
    });
    const scorerDetails = (scoredByIds && scoredByIds.length === userGoals)
      ? scoredByIds.map(id => ({ player: unionXi.find(p => p.id === id) || pick(unionXi), method: "openplay" }))
      : pickScorerDetailed(unionXi, userGoals, g.setPieceTakers);
    const scorers = scorerDetails.map(d => d.player);
    const assistProviders = scorers.map(s => pickAssist(unionXi, s, g.setPieceTakers));

    // in-match injury roll (fysioterapeut lowers chance and shortens duration)
    const physioLevel = staff.physio ? staff.physio.level : 0;
    const difficultySettings = DIFFICULTY_SETTINGS[g.difficulty] || DIFFICULTY_SETTINGS.normal;
    let injuredPlayer = null;
    let physioImpactDelta = 0;
    unionXi.forEach(pl => {
      const attrs = getAttrs(pl);
      const staminaRisk = clamp((70 - (pl.stamina ?? 100)) / 700, 0, 0.07);
      const chance = clamp((0.045 - attrs.physical / 2200 - physioLevel * 0.003 + staminaRisk) * difficultySettings.injuryMult * injuryProneMult(pl), 0.005, 0.12);
      const baselineChance = clamp((0.045 - attrs.physical / 2200 + staminaRisk) * difficultySettings.injuryMult * injuryProneMult(pl), 0.005, 0.12);
      physioImpactDelta += Math.max(0, baselineChance - chance);
      if (!injuredPlayer && Math.random() < chance) injuredPlayer = pl;
    });
    // card rolls (assisterande tränare lowers chance, taktiska val kan höja/sänka)
    const assistantLevel = staff.assistant ? staff.assistant.level : 0;
    const talkCardMult = (TEAM_TALK_OPTIONS[g.teamTalk] || TEAM_TALK_OPTIONS.neutral).cardMult;
    const refereeStrictness = rnd(0.75, 1.3);
    const tacticCardMult = combinedTacticalMods(g.tacticalSettings).cardMult * talkCardMult * refereeStrictness;
    const cardEvents = {};
    let assistantImpactDelta = 0;
    unionXi.forEach(pl => {
      const personalityCardMult = pl.personality === "Problemspelare" ? 1.6 : 1;
      const positionCardMult = pl.pos === "MV" ? 0.15 : pl.pos === "FÖ" ? 1.4 : pl.pos === "MF" ? 1.1 : 0.7;
      const yellowChance = clamp((0.09 - assistantLevel * 0.008) * tacticCardMult * personalityCardMult * positionCardMult, 0.005, 0.24);
      const redChance = clamp((0.012 - assistantLevel * 0.001) * tacticCardMult * personalityCardMult * positionCardMult, 0.0005, 0.035);
      const baselineYellow = clamp(0.09 * tacticCardMult * personalityCardMult * positionCardMult, 0.005, 0.24);
      const baselineRed = clamp(0.012 * tacticCardMult * personalityCardMult * positionCardMult, 0.0005, 0.035);
      assistantImpactDelta += Math.max(0, (baselineYellow - yellowChance) + (baselineRed - redChance));
      if (Math.random() < redChance) cardEvents[pl.id] = "red";
      else if (Math.random() < yellowChance) cardEvents[pl.id] = "yellow";
    });


    const isDerby = g.clubs[g.userClubId].rivalId === p.oppId;
    const xiForStats = getXI(g.squad, g.startingXI);
    const { attack: userAttackForStats } = userStrength(xiForStats, g.tactic, g.spelide, g.tacticalSettings, teamPositionFit(g.lineupCells, g.squad));
    const matchStats = generateMatchStats(userAttackForStats, g.clubs[p.oppId]?.strength || 50, userGoals, oppGoals);
    const matchReport = { oppId: p.oppId, oppName: p.oppName, oppColor: g.clubs[p.oppId]?.color, userColor: userClub.color, userIsHome: p.userIsHome, userGoals, oppGoals, result, scorers: scorers.map(pl => pl.name), ratings: [], weather: p.weather, keyMoments: [], timeline: [], isDerby, stats: matchStats };
    const km = generateKeyMoments(userGoals, oppGoals, scorerDetails, assistProviders, p.oppName, injuredPlayer?.name || null, isDerby, unionXi, g.chemistryPairs);
    matchReport.keyMoments = km.lines;
    matchReport.timeline = km.timeline;
    if (lateGameNote) { matchReport.keyMoments.unshift(lateGameNote); matchReport.timeline.push({ minute: 88, type: "note", text: lateGameNote }); }
    if (isDerby) { const derbyText = `Lokal rivalmatch mot ${p.oppName}!`; matchReport.keyMoments.unshift(derbyText); matchReport.timeline.unshift({ minute: 0, type: "note", text: derbyText }); }
    if (refereeStrictness >= 1.18) { const refText = "Domaren viftar med kortet vid minsta förseelse ikväll."; matchReport.keyMoments.unshift(refText); matchReport.timeline.unshift({ minute: 1, type: "note", text: refText }); }
    else if (refereeStrictness <= 0.85) { const refText = "Domaren låter mycket passera ostraffat ikväll."; matchReport.keyMoments.unshift(refText); matchReport.timeline.unshift({ minute: 1, type: "note", text: refText }); }
    if (subText) { matchReport.keyMoments.unshift(subText); matchReport.timeline.push({ minute: 46, type: "note", text: subText }); }
    matchReport.timeline.sort((a, b) => a.minute - b.minute);

    const oppRes = result === "win" ? "loss" : result === "loss" ? "win" : "draw";
    const updatedClubs = { ...newClubs, [p.oppId]: { ...newClubs[p.oppId], strength: clamp(newClubs[p.oppId].strength + (oppRes === "win" ? rnd(0.1, 0.35) : oppRes === "loss" ? -rnd(0.1, 0.3) : 0) + rnd(-0.08, 0.08), 20, 97) } };

    let incomeSponsring = g.dev.sponsring * 35;
    let incomeSponsorDeals = (g.sponsors.main?.income || 0) + (g.sponsors.stadium?.income || 0) + (g.sponsors.local?.income || 0);
    let incomeTv = tvDealIncome(g.reputation, userClub.division);
    let incomeShop = merchandiseIncome(g.fanbase, g.arenaFacilities.shop, g.merchandisePricing);
    let incomeTickets = 0, incomeRestaurant = 0;
    let attendance = 0;
    if (p.userIsHome) {
      const userArchetype = ARCHETYPES[g.clubs[g.userClubId].archetype];
      const ticketTier = TICKET_TIERS[g.ticketPrice] || TICKET_TIERS.t3;
      const derbyDraw = isDerby ? 0.3 : 0;
      const oppDraw = clamp((p.oppStrength - 50) / 200, 0, 0.25);
      const form5 = recentForm(g.schedule, g.round, g.userClubId);
      const formDraw = clamp(form5.filter(r => r === "win").length * 0.035, 0, 0.18);
      const leaguePoolIds = clubsInPool(g.leagueId, userClub.division, g.clubs).map(c => c.id);
      const posNow = computeStandings(g.schedule, leaguePoolIds).findIndex(r => r.id === g.userClubId) + 1;
      const positionDraw = posNow >= 1 && posNow <= 3 ? 0.15 : posNow >= 4 && posNow <= 6 ? 0.07 : 0;
      const crowdDraw = Math.min(derbyDraw + oppDraw + formDraw + positionDraw, 0.45);
      attendance = Math.min(arenaCapacityOf(g.dev, g.arenaStands), Math.round((3000 + g.fanbase * 180) * ticketTier.fillMult * (1 + crowdDraw)));
      incomeTickets = Math.round(attendance * 0.009 * userArchetype.incomeMult * ticketTier.incomeMult) + Object.values(g.arenaStands).reduce((s, l) => s + l, 0) * 8;
      incomeRestaurant = g.arenaFacilities.restaurant * 18;
      incomeShop += g.arenaFacilities.shop * 18;
      matchReport.attendance = attendance;
      matchReport.arenaCapacity = arenaCapacityOf(g.dev, g.arenaStands);
    }
    let income = incomeSponsring + incomeSponsorDeals + incomeTv + incomeShop + incomeTickets + incomeRestaurant;

    const counts = {}; matchReport.scorers.forEach(n => { counts[n] = (counts[n] || 0) + 1; });
    const assistCounts = {}; assistProviders.forEach(p => { if (p) assistCounts[p.name] = (assistCounts[p.name] || 0) + 1; });
    const trainingInjuryNames = [];
    let physioTrainingImpactDelta = 0;
    const newSquad = g.squad.map(pl => {
      if (!unionIds.includes(pl.id)) {
        let updated = pl.injuryWeeks > 0 ? { ...pl, injuryWeeks: Math.max(0, pl.injuryWeeks - 1) } : pl;
        updated = updated.suspendedMatches > 0 ? { ...updated, suspendedMatches: Math.max(0, updated.suspendedMatches - 1) } : updated;
        if (updated.internationalDuty) updated = { ...updated, internationalDuty: false, fatigued: true };
        const fitnessCoachLevel = staff.fitnessCoach ? staff.fitnessCoach.level : 0;
        updated = { ...updated, stamina: clamp((updated.stamina ?? 100) + rndInt(28, 36) + fitnessCoachLevel * 2, 0, 100) };
        if (!updated.injuryWeeks && !updated.suspendedMatches) {
          const physioLevel = staff.physio ? staff.physio.level : 0;
          const trainingRisk = clamp((0.006 - physioLevel * 0.0008 + ((70 - (updated.stamina ?? 100)) / 9000)) * difficultySettings.injuryMult * injuryProneMult(updated), 0.0003, 0.025);
          const baselineTrainingRisk = clamp((0.006 + ((70 - (updated.stamina ?? 100)) / 9000)) * difficultySettings.injuryMult * injuryProneMult(updated), 0.0003, 0.025);
          physioTrainingImpactDelta += Math.max(0, baselineTrainingRisk - trainingRisk);
          if (Math.random() < trainingRisk) {
            const weeks = pick([1, 1, 2]);
            updated = { ...updated, injuryWeeks: weeks };
            trainingInjuryNames.push(`${updated.name} (${weeks} omg)`);
            pushNews(`${updated.name} skadades på träning — borta i ca ${weeks} omgångar.`, "Skada");
          }
        }
        return updated;
      }
      const goals = counts[pl.name] || 0;
      const assists = assistCounts[pl.name] || 0;
      const hasLeaderOnPitch = unionXi.some(x => x.personality === "Ledare" && x.id !== pl.id);
      const personalityMoraleMult = (pl.personality === "Ledare" ? 0.5 : pl.personality === "Problemspelare" ? 1.5 : 1) * (hasLeaderOnPitch ? 0.85 : 1);
      const moraleBonus = (pl.morale >= 75 ? 0.15 : pl.morale <= 35 ? -0.25 : 0) * personalityMoraleMult;
      const fatigueBonus = pl.fatigued ? -0.3 : 0;
      const staminaNow = pl.stamina ?? 100;
      const staminaBonus = staminaNow < 30 ? -0.25 : staminaNow < 50 ? -0.1 : 0;
      const clutchBonus = isDerby ? clutchFactor(pl) * 0.3 : 0;
      const captainBonus = g.captainId === pl.id ? 0.15 : 0;
      const chemBonus = chemistryBonusFor(pl.id);
      const rating = clamp(6.0 + rnd(-0.6, 0.6) + (result === "win" ? 0.35 : result === "loss" ? -0.25 : 0) + goals * 1.1 + moraleBonus + fatigueBonus + staminaBonus + clutchBonus + captainBonus + chemBonus, 3.5, 9.8);
      const { attackDelta, defenseDelta } = developmentDeltas(pl, rating);
      matchReport.ratings.push({ id: pl.id, name: pl.name, pos: pl.pos, rating: Math.round(rating * 10) / 10, goals });
      const gotInjured = injuredPlayer && injuredPlayer.id === pl.id;
      const baseInjuryWeeks = gotInjured ? pick([1, 1, 2, 2, 3, 5, 8]) : pl.injuryWeeks;
      const injuryWeeks = gotInjured ? Math.max(1, Math.round(baseInjuryWeeks * (1 - physioLevel * 0.06))) : baseInjuryWeeks;
      if (gotInjured) pushNews(`${pl.name} skadades i matchen — borta i ca ${injuryWeeks} omgångar.`, "Skada");
      const card = cardEvents[pl.id];
      let yellowCards = pl.yellowCards, suspendedMatches = pl.suspendedMatches;
      if (card === "red") { suspendedMatches += rndInt(1, 2); }
      else if (card === "yellow") { yellowCards += 1; if (yellowCards >= 5) { suspendedMatches += 1; yellowCards -= 5; } }
      const fitnessCoachLevel = staff.fitnessCoach ? staff.fitnessCoach.level : 0;
      const newStamina = clamp(staminaNow - Math.max(1, (rndInt(4, 8) - fitnessCoachLevel * 0.4) * enduranceMult(pl)), 0, 100);
      const outOfPos = (pl.personality === "Ambitiös" && (cellFitByPlayer[pl.id] ?? 1) < 0.6) ? 1 : 0;
      return { ...pl, apps: pl.apps + 1, goals: pl.goals + goals, assists: (pl.assists || 0) + assists, ratingSum: pl.ratingSum + rating, recentRatings: [...(pl.recentRatings || []), rating].slice(-5), attack: clamp(pl.attack + attackDelta, 15, 99), defense: clamp(pl.defense + defenseDelta, 15, 99), injuryWeeks, yellowCards, suspendedMatches, seasonYellowCards: (pl.seasonYellowCards || 0) + (card === "yellow" ? 1 : 0), seasonRedCards: (pl.seasonRedCards || 0) + (card === "red" ? 1 : 0), goals_league: (pl.goals_league || 0) + goals, assists_league: (pl.assists_league || 0) + assists, seasonYellowCards_league: (pl.seasonYellowCards_league || 0) + (card === "yellow" ? 1 : 0), seasonRedCards_league: (pl.seasonRedCards_league || 0) + (card === "red" ? 1 : 0), fatigued: false, stamina: newStamina, outOfPositionApps: (pl.outOfPositionApps || 0) + outOfPos };
    });
    matchReport.ratings.sort((a, b) => b.rating - a.rating);
    matchReport.motm = matchReport.ratings[0] || null;

    const loanReturnHomeNames = [];
    const squadAfterLoans = newSquad.map(pl => {
      if (!pl.loanWeeksLeft) return pl;
      const weeksLeft = pl.loanWeeksLeft - 1;
      if (weeksLeft <= 0) { loanReturnHomeNames.push(pl.name); return null; }
      return { ...pl, loanWeeksLeft: weeksLeft };
    }).filter(Boolean);
    const loanReturnHomeMsg = loanReturnHomeNames.length ? `${loanReturnHomeNames.join(", ")} återvände till sin ordinarie klubb — lånet är slut.` : null;

    const finalSchedule = p.newSchedule.map((round, ri) => {
      if (ri !== g.round) return round;
      return round.map(f => {
        if (f.home !== g.userClubId && f.away !== g.userClubId) return f;
        const uh = f.home === g.userClubId;
        return { ...f, homeGoals: uh ? userGoals : oppGoals, awayGoals: uh ? oppGoals : userGoals };
      });
    });

    const staffWages = (staff.assistant?.wage || 0) + (staff.physio?.wage || 0) + (staff.scout?.wage || 0) + (g.manager?.wage || 0) + (g.assistantManager?.wage || 0);
    const wageBill = totalWageBill(g.squad) + staffWages;
    const delta = income - wageBill;
    matchReport.incomeBreakdown = {
      userIsHome: p.userIsHome, tickets: incomeTickets, restaurant: incomeRestaurant, shop: incomeShop,
      sponsorsAndTv: incomeSponsring + incomeSponsorDeals + incomeTv, income, wageBill, total: delta,
    };
    const matchFinanceRecord = {
      round: g.round, oppName: p.oppName, userIsHome: p.userIsHome, ticketPrice: g.ticketPrice,
      attendance, arenaCapacity: arenaCapacityOf(g.dev, g.arenaStands), income: Math.round(incomeTickets + incomeRestaurant + incomeShop + incomeSponsring + incomeSponsorDeals + incomeTv),
    };
    const newRound = g.round + 1;
    const newMonthKey = monthKeyFor(g.season, newRound);
    const monthsElapsed = clamp(newMonthKey - (g.installmentMonthKey ?? newMonthKey), 0, 6);
    let installmentsAfter = g.transferInstallments || [];
    let installmentBudgetDelta = 0;
    let installmentMsg = null;
    if (monthsElapsed > 0 && installmentsAfter.length) {
      for (let i = 0; i < monthsElapsed; i++) {
        installmentsAfter = installmentsAfter.map(inst => { installmentBudgetDelta -= inst.monthlyPayment; return { ...inst, monthsLeft: inst.monthsLeft - 1 }; });
      }
      const finished = installmentsAfter.filter(inst => inst.monthsLeft <= 0);
      installmentsAfter = installmentsAfter.filter(inst => inst.monthsLeft > 0);
      const parts = [];
      if (installmentBudgetDelta < 0) parts.push(`Delbetalning dragen: ${formatMoney(installmentBudgetDelta)}.`);
      finished.forEach(inst => parts.push(`Delbetalningen för ${inst.playerName} är nu klar.`));
      installmentMsg = parts.join(" ") || null;
    }
    const isSeasonEnd = newRound >= g.schedule.length;
    const halfwayRound = Math.floor(g.schedule.length / 2);
    if (newRound === halfwayRound) {
      g.squad.filter(pl => pl.contractYears === 1).forEach(pl => pushNews(`${pl.name}s kontrakt går ut efter den här säsongen — dags att förhandla förlängning eller planera vidare.`, "Kontrakt"));
    }
    const windowJustOpened = TRANSFER_WINDOWS.some(([a]) => a === newRound);
    const freshlyListedClubs = windowJustOpened ? refreshWorldListings(updatedClubs, g.userClubId) : updatedClubs;
    const aiTransferResult = windowJustOpened ? simulateAITransfers(freshlyListedClubs, g.userClubId, g.season, newRound) : null;
    const listingClubs = aiTransferResult ? aiTransferResult.clubs : freshlyListedClubs;
    const newIncomingOffers = windowJustOpened ? generateIncomingOffers(newSquad, listingClubs, g.userClubId, g.reputation, newRound) : g.incomingOffers;
    const newLoanOffers = windowJustOpened ? generatePlayerLoanOffers(listingClubs, g.userClubId, userClub.division) : (g.loanOffers || []);
    const newLoanRequests = windowJustOpened ? generateIncomingLoanRequests(newSquad, listingClubs, g.userClubId) : (g.loanRequests || []);

    let squadAfterBreak = squadAfterLoans;
    let breakToast = null;
    let repFromBreak = 0;
    if (INTERNATIONAL_BREAK_ROUNDS.includes(newRound)) {
      const breakResult = processInternationalBreak(squadAfterLoans);
      squadAfterBreak = breakResult.newSquad;
      repFromBreak = breakResult.repBonus;
      if (breakResult.messages.length) breakToast = breakResult.messages.slice(0, 2).join(" ");
    }

    const derbyRep = isDerby ? (result === "win" ? 4 : result === "loss" ? -3 : 0.5) : 0;
    const derbyFan = isDerby ? (result === "win" ? 5 : result === "loss" ? -3 : 0.5) : 0;
    const strengthGap = (p.oppStrength || 50) - squadOverallRating(g.squad);
    const upset = result === "win" ? giantKillerBonus(strengthGap) : null;
    if (upset && upset.tier !== "notable") {
      const headline = upset.tier === "mega" ? "MEGASKRÄLL" : "SKRÄLL";
      pushNews(`🔥 ${headline}! ${userClub.name} slår ${p.oppName} (${userGoals}-${oppGoals}) trots en stor styrkeskillnad — fansen är på moln och ${g.manager?.name || "tränaren"}s rykte stärks.`, "Klubben", {
        competition: "Ligan",
        homeName: p.userIsHome ? userClub.name : p.oppName,
        awayName: p.userIsHome ? p.oppName : userClub.name,
        homeScore: p.userIsHome ? userGoals : oppGoals,
        awayScore: p.userIsHome ? oppGoals : userGoals,
        rows: [
          { label: "Styrkeskillnad", value: `${Math.round(strengthGap)} poäng` },
          { label: "Klubbens rykte", value: `+${upset.rep.toFixed(1)}` },
          { label: "Fanbase", value: `+${upset.fan.toFixed(1)}` },
          { label: "Managerns rykte", value: `+${upset.mgrRep.toFixed(1)}` },
        ],
        note: `${p.oppName} var betydligt starkare på pappret — den här segern var en genuin skräll.`,
      });
    }

    const newFamiliarity = clamp((g.formationFamiliarity || 0) + 8, 0, 100);

    const eventResult = processRandomEvents(squadAfterBreak, g.youthSquad, g.sponsors, newIncomingOffers, updatedClubs, g.userClubId, g.reputation, transferWindowOpen(newRound));
    let finalSquad = eventResult.newSquad;
    const finalYouthSquad = eventResult.newYouth;
    const finalSponsors = eventResult.newSponsors;
    const finalIncomingOffers = eventResult.newOffers;
    const eventToast = eventResult.messages.length ? eventResult.messages.slice(0, 2).join(" ") : null;
    const eventBudgetDelta = eventResult.budgetDelta || 0;
    (eventResult.importantEvents || []).forEach(ev => pushNews(ev.text, ev.category, ev.detail || null));
    if (aiTransferResult) aiTransferResult.newsItems.forEach(text => pushNews(text, "Ligan"));
    // Agent-initiated contract talks — the manager shouldn't have to remember to check every player's
    // contract manually; their agent proactively reaches out via a clickable news item instead.
    const agentCandidates = finalSquad.filter(pl => pl.contractYears <= 2 && pl.contractYears >= 1 && !pl.agentContactedThisSeason);
    if (agentCandidates.length && Math.random() < 0.35) {
      const pl = pick(agentCandidates);
      pushNews(`${pl.name}s agent hör av sig — vill diskutera ett nytt kontrakt.`, "Kontrakt", {
        action: { type: "contractRenewal", playerId: pl.id, label: "Förhandla nu" },
        note: `${pl.name}s nuvarande kontrakt har ${pl.contractYears} ${pl.contractYears === 1 ? "år" : "år"} kvar. Agenten vill se en lösning innan säsongen är slut.`,
      });
      finalSquad = finalSquad.map(x => x.id === pl.id ? { ...x, agentContactedThisSeason: true } : x);
    }
    // Playing-time dissatisfaction: a decent player who's been benched round after round (fit, available,
    // but not selected) can start to sour on the situation — mirrors a real squad-management pressure that
    // pure attribute numbers don't capture.
    finalSquad = finalSquad.map(pl => {
      const played = unionIds.includes(pl.id);
      const wasAvailable = !(pl.injuryWeeks > 0) && !(pl.suspendedMatches > 0) && !pl.internationalDuty;
      if (played) return { ...pl, benchStreak: 0 };
      if (wasAvailable) return { ...pl, benchStreak: (pl.benchStreak || 0) + 1 };
      return pl;
    });
    finalSquad = finalSquad.map(pl => tickPositionTraining(pl));
    const frustratedCandidates = finalSquad.filter(pl => (pl.benchStreak || 0) >= 6 && overallOf(pl) >= 58 && !pl.recentlyComplained);
    if (frustratedCandidates.length && Math.random() < 0.3) {
      const pl = pick(frustratedCandidates);
      const wantsTransfer = (pl.benchStreak || 0) >= 10 && Math.random() < 0.4;
      if (wantsTransfer) {
        pushNews(`${pl.name} har bett om en överflyttning — trött på att sitta på bänken (${pl.benchStreak} omgångar utan speltid).`, "Trupp", {
          action: { type: "contractRenewal", playerId: pl.id, label: "Prata med spelaren" },
          note: `${pl.name} tycker sig förtjäna mer speltid och har öppet ifrågasatt sin framtid i klubben.`,
        });
      } else {
        pushNews(`${pl.name} har uttryckt missnöje över bristande speltid (${pl.benchStreak} omgångar på bänken).`, "Trupp");
      }
      finalSquad = finalSquad.map(x => x.id === pl.id ? { ...x, recentlyComplained: true, morale: clamp((x.morale ?? 70) - rndInt(6, 14), 0, 100) } : x);
    } else {
      finalSquad = finalSquad.map(x => (x.recentlyComplained && (x.benchStreak || 0) === 0) ? { ...x, recentlyComplained: false } : x);
    }
    // A player who was talked into joining despite real reluctance doesn't automatically resent it forever —
    // but for their first season or so there's a real, ongoing risk of the relationship souring, separate
    // from the immediate morale hit taken at signing. It fades out once they've settled in.
    const reluctantAtRisk = finalSquad.filter(pl => pl.reluctantSign && (pl.reluctantRoundsElapsed || 0) < 20);
    if (reluctantAtRisk.length) {
      finalSquad = finalSquad.map(pl => {
        if (!pl.reluctantSign) return pl;
        const roundsElapsed = (pl.reluctantRoundsElapsed || 0) + 1;
        if (roundsElapsed >= 20) return { ...pl, reluctantRoundsElapsed: roundsElapsed, reluctantSign: false };
        if (Math.random() < 0.06) {
          pushNews(`${pl.name} verkar fortfarande inte helt hemma i klubben — inget dramatiskt, men stämningen är svalare än önskat.`, "Trupp");
          return { ...pl, reluctantRoundsElapsed: roundsElapsed, morale: clamp((pl.morale ?? 70) - rndInt(4, 10), 0, 100) };
        }
        return { ...pl, reluctantRoundsElapsed: roundsElapsed };
      });
    }
    if (windowJustOpened && newIncomingOffers.length > (g.incomingOffers || []).length) {
      newIncomingOffers.slice((g.incomingOffers || []).length).forEach(o => pushNews(`${o.buyerName} har lagt ett bud på ${o.playerName}: ${formatMoney(o.offer)}.`, "Övergångar", { action: { type: "incomingOffer", label: "Hantera bud" }, note: `${o.buyerName} vill köpa ${o.playerName} för ${formatMoney(o.offer)}.` }));
    }
    if (userGoals - oppGoals >= 3 || (isDerby && result === "win")) {
      pushNews(`Stor seger mot ${p.oppName}, ${userGoals}-${oppGoals}! Fansen jublar.`, "Klubben");
    }
    if (Math.random() < 0.45) {
      const worldItem = generateWorldNews(g.clubs, g.userClubId, g.leagueId, g.cups);
      if (worldItem) pushNews(worldItem.text, worldItem.category);
    }

    let cups = { ...g.cups };
    const qualifiedCupTypes = g.qualifiedCupTypes || [];
    let lastSeasonSummary = g.lastSeasonSummary, seasonEndSnapshot = g.seasonEndSnapshot, leaguePrizeThisRound = 0;
    if (isSeasonEnd) {
      const worldStandings = {};
      LEAGUES.forEach(country => {
        worldStandings[country.id] = {};
        [1, 2, 3].forEach(div => {
          const ids = clubsInPool(country.id, div, updatedClubs).map(c => c.id);
          worldStandings[country.id][div] = (country.id === g.leagueId && div === userClub.division) ? computeStandings(finalSchedule, ids) : instantSeasonTable(ids, updatedClubs);
        });
      });
      const otherCupWinners = {};
      LEAGUES.filter(l => l.id !== g.leagueId).forEach(country => {
        const allIds = [1, 2, 3].flatMap(d => clubsInPool(country.id, d, updatedClubs).map(c => c.id));
        otherCupWinners[country.id] = instantResolveKnockout(allIds, updatedClubs);
      });
      const finalPos = worldStandings[g.leagueId][userClub.division].findIndex(s => s.id === g.userClubId) + 1;
      const target = boardTargetLabel(userClub.archetype, userClub.division);

      // Season awards — scoped to the user's own division/country, since that's the only place with
      // real per-player match stats (other divisions use a fast season-end estimate, not full simulation).
      const divisionClubs = clubsInPool(g.leagueId, userClub.division, updatedClubs);
      const divisionStanding = worldStandings[g.leagueId][userClub.division];
      let topScorer = null, topScorerGoals = 0, pointsKing = null, pointsKingTotal = 0;
      divisionClubs.forEach(c => {
        (c.squad || []).forEach(pl => {
          const goalsN = pl.goals || 0, assistsN = pl.assists || 0, pts = goalsN + assistsN;
          if (goalsN > topScorerGoals) { topScorerGoals = goalsN; topScorer = { id: pl.id, name: pl.name, clubName: c.name, clubId: c.id }; }
          if (pts > pointsKingTotal) { pointsKingTotal = pts; pointsKing = { id: pl.id, name: pl.name, clubName: c.name, clubId: c.id, goals: goalsN, assists: assistsN }; }
        });
      });
      const byStrength = [...divisionClubs].sort((a, b) => b.strength - a.strength);
      let managerOfYear = null, managerOfYearDelta = -999;
      divisionStanding.forEach((s, finalIdx) => {
        const strengthIdx = byStrength.findIndex(c => c.id === s.id);
        const delta = strengthIdx - finalIdx;
        if (delta > managerOfYearDelta) { managerOfYearDelta = delta; managerOfYear = { clubId: s.id, clubName: updatedClubs[s.id].name, managerName: updatedClubs[s.id].manager?.name || g.manager?.name, positionDelta: delta }; }
      });
      const seasonAwards = { topScorer: topScorer ? { ...topScorer, goals: topScorerGoals } : null, pointsKing, managerOfYear };

      // Winning an award has a real, lasting effect — not just a trophy line in a summary screen.
      if (topScorer && topScorer.clubId === g.userClubId) {
        finalSquad = finalSquad.map(pl => pl.id === topScorer.id ? { ...pl, value: Math.round(pl.value * 1.15), morale: clamp(pl.morale + 10, 0, 100) } : pl);
      } else if (topScorer) {
        updatedClubs[topScorer.clubId] = { ...updatedClubs[topScorer.clubId], squad: updatedClubs[topScorer.clubId].squad.map(pl => pl.id === topScorer.id ? { ...pl, value: Math.round(pl.value * 1.08) } : pl) };
      }
      if (pointsKing && pointsKing.id !== topScorer?.id) {
        if (pointsKing.clubId === g.userClubId) {
          finalSquad = finalSquad.map(pl => pl.id === pointsKing.id ? { ...pl, value: Math.round(pl.value * 1.15), morale: clamp(pl.morale + 10, 0, 100) } : pl);
        } else {
          updatedClubs[pointsKing.clubId] = { ...updatedClubs[pointsKing.clubId], squad: updatedClubs[pointsKing.clubId].squad.map(pl => pl.id === pointsKing.id ? { ...pl, value: Math.round(pl.value * 1.08) } : pl) };
        }
      }
      let awardManagerRepBonus = 0;
      if (managerOfYear) {
        if (managerOfYear.clubId === g.userClubId) awardManagerRepBonus = 10;
        else updatedClubs[managerOfYear.clubId] = { ...updatedClubs[managerOfYear.clubId], strength: clamp(updatedClubs[managerOfYear.clubId].strength + 1.5, 20, 97) };
      }

      const leaguePrize = leaguePositionPrize(finalPos, userClub.division, worldStandings[g.leagueId][userClub.division].length);
      leaguePrizeThisRound = leaguePrize;
      lastSeasonSummary = { season: g.season, pos: finalPos, division: userClub.division, leagueName: countryName, domesticCupResult: null, domesticCupWon: false, domesticCupWinnerId: null, cup1Result: null, cup2Result: null, prizeTotal: leaguePrize, leaguePositionPrize: leaguePrize, boardTargetLabel: target.label, boardTargetMet: target.check(finalPos), seasonAwards, awardManagerRepBonus };
      seasonEndSnapshot = { worldStandings, otherCupWinners };
    } else {
      // Every qualified cup competition activates independently once its own launch round arrives —
      // they now run in parallel, interleaved with the league, instead of one finishing before the next begins.
      qualifiedCupTypes.forEach(type => {
        if (!cups[type] && newRound >= (CUP_LAUNCH_ROUND[type] ?? 0)) {
          const base = { ...g, clubs: updatedClubs, lastSeasonSummary, seasonEndSnapshot, season1Qualifiers: g.season === 1 ? g.season1Qualifiers : null };
          cups[type] = setupCup(type, base);
        }
      });
    }
    const pendingCupTypes = qualifiedCupTypes.filter(type => cups[type] && !cups[type].champion && !cups[type].eliminated);
    const dueCupTypes = pendingCupTypes.filter(type => newRound >= cupDueRoundNow(cups[type]));
    const hasCupBusiness = dueCupTypes.length > 0;
    const nextActiveCupType = hasCupBusiness ? dueCupTypes.sort((a, b) => cupDueRoundNow(cups[a]) - cupDueRoundNow(cups[b]))[0] : null;

    let scoutMission = g.scoutMission;
    let scoutToast = null;
    if (scoutMission && scoutMission.cancelling) {
      scoutMission = null;
      scoutToast = "Scouten är hemma igen.";
    } else if (scoutMission && !scoutMission.complete) {
      const roundsElapsed = scoutMission.roundsElapsed + 1;
      if (roundsElapsed >= scoutMission.roundsTotal) {
        const candidates = generateScoutCandidates(scoutMission, g.staff.scout?.level || 0, updatedClubs, userClub.division, g.userClubId, g.reputation, null, g.worldPool);
        scoutMission = { ...scoutMission, roundsElapsed, complete: true, results: candidates };
        scoutToast = candidates.length ? `Scoutuppdraget är klart — ${candidates.length > 1 ? candidates.length + " spelare hittades" : candidates[0].name + " har hittats"}.` : "Scoutuppdraget är klart, men ingen spelare matchade kriterierna. Försök med bredare filter.";
      } else {
        scoutMission = { ...scoutMission, roundsElapsed };
      }
    }

    let arenaConstruction = g.arenaConstruction;
    let arenaStands = g.arenaStands, devArena = g.dev.arena;
    let constructionToast = null;
    if (arenaConstruction) {
      const roundsElapsed = arenaConstruction.roundsElapsed + 1;
      if (roundsElapsed >= arenaConstruction.roundsTotal) {
        if (arenaConstruction.stand === "arena") devArena = arenaConstruction.toLevel;
        else arenaStands = { ...arenaStands, [arenaConstruction.stand]: arenaConstruction.toLevel };
        constructionToast = arenaConstruction.stand === "arena" ? "Arenans allmänna standard är nu uppgraderad!" : `${STAND_NAMES[arenaConstruction.stand]} är klar och öppen för publik!`;
        arenaConstruction = null;
      } else {
        arenaConstruction = { ...arenaConstruction, roundsElapsed };
      }
    }

    setG(prev => {
      const newRep = clamp(prev.reputation + repFromBreak + derbyRep + (upset?.rep || 0), 0, 100);
      const ticketFanAdj = p.userIsHome ? (TICKET_TIERS[prev.ticketPrice] || TICKET_TIERS.t3).fanAdj : 0;
      const newFan = clamp(prev.fanbase + derbyFan + ticketFanAdj + (upset?.fan || 0), 0, 100);
      const newManagerRep = upset ? clamp((prev.manager?.reputation || 0) + upset.mgrRep, 5, 99) : prev.manager?.reputation;
      // Rotate the "Övriga världen" scout market every round — a fresh random slice of whoever's still
      // out there, rather than the same fixed list sitting untouched until you happen to buy someone.
      const scoutRating = effectiveScoutRating(prev.dev, prev.reputation, prev.scoutingParts?.analys + (prev.staff?.scout?.level || 0) * 0.5);
      const pool = prev.worldPool || generateWorldPool();
      const dueScouts = (prev.pendingPlayerScouts || []).filter(s => s.dueRound <= newRound);
      const stillPendingScouts = (prev.pendingPlayerScouts || []).filter(s => s.dueRound > newRound);
      const newScoutedIds = dueScouts.length ? [...(prev.scoutedPlayerIds || []), ...dueScouts.map(s => s.playerId)] : (prev.scoutedPlayerIds || []);
      const rotatedMarket = {
        europa: sampleFromWorldPool(pool.europa, scoutRating, 4),
        sydamerika: sampleFromWorldPool(pool.sydamerika, scoutRating, 2),
        afrika: sampleFromWorldPool(pool.afrika, scoutRating, 2),
        asien: sampleFromWorldPool(pool.asien, scoutRating, 2),
        nordamerika: sampleFromWorldPool(pool.nordamerika, scoutRating, 2),
      };
      const releaseClauseRecords = (eventResult.importantEvents || [])
        .filter(ev => ev.releaseClauseSale)
        .map(ev => {
          const sale = ev.releaseClauseSale;
          const soldPlayer = squadAfterBreak.find(p => p.id === sale.playerId);
          const buyerClub = updatedClubs[sale.buyerId];
          return { id: uid(), season: g.season, round: newRound, playerId: sale.playerId, playerName: soldPlayer?.name, playerPos: soldPlayer?.specificPosition, fromClubId: g.userClubId, fromClubName: userClub.name, fromColor: userClub.color, toClubId: sale.buyerId, toClubName: buyerClub?.name, toColor: buyerClub?.color, fee: sale.fee, leagueId: g.leagueId };
        });
      return {
        ...prev, clubs: { ...listingClubs, [g.userClubId]: { ...listingClubs[g.userClubId], squad: finalSquad, youthSquad: finalYouthSquad } }, schedule: finalSchedule, squad: finalSquad,
        startingXI: prev.startingXI.filter(id => finalSquad.some(p => p.id === id)),
        youthSquad: finalYouthSquad, sponsors: finalSponsors, market: rotatedMarket,
        pendingPlayerScouts: stillPendingScouts, scoutedPlayerIds: newScoutedIds,
        budget: prev.budget + delta + eventBudgetDelta + installmentBudgetDelta + leaguePrizeThisRound, lastDelta: delta, round: newRound,
        transferHistory: (aiTransferResult?.records?.length || releaseClauseRecords.length) ? [...releaseClauseRecords, ...(aiTransferResult?.records || []), ...(prev.transferHistory || [])].slice(0, 1000) : prev.transferHistory,
        transferInstallments: installmentsAfter, installmentMonthKey: newMonthKey,
        staffCandidates: refreshStaffCandidates(prev.staffCandidates, newRound, prev.clubs[prev.userClubId].league),
        recentMatchFinances: [matchFinanceRecord, ...(prev.recentMatchFinances || [])].slice(0, 10),
        allSchedules: simulateOtherDivisionsRound(prev.allSchedules, updatedClubs, g.round, `${g.leagueId}_d${userClub.division}`),
        seasonStaffImpact: {
          ...prev.seasonStaffImpact,
          physio: (prev.seasonStaffImpact?.physio || 0) + physioImpactDelta + physioTrainingImpactDelta,
          assistant: (prev.seasonStaffImpact?.assistant || 0) + assistantImpactDelta,
          analyst: (prev.seasonStaffImpact?.analyst || 0) + analystImpactDelta,
          gkCoach: (prev.seasonStaffImpact?.gkCoach || 0) + gkCoachImpactDelta,
          fitnessCoach: (prev.seasonStaffImpact?.fitnessCoach || 0) + fitnessImpactDelta,
        },
        seasonIncomeTotal: (prev.seasonIncomeTotal || 0) + income, seasonWageTotal: (prev.seasonWageTotal || 0) + wageBill,
        reputation: newRep, fanbase: newFan, manager: newManagerRep !== undefined ? { ...prev.manager, reputation: newManagerRep } : prev.manager,
        repHistory: [...(prev.repHistory || []), newRep].slice(-12),
        fanHistory: [...(prev.fanHistory || []), newFan].slice(-12),
        formationFamiliarity: newFamiliarity, restedForMatch: false,
        lastMatchReport: matchReport, view: "result", pendingRound: null, pendingLateGame: null, pendingMidGame: null,
        pendingAfterResult: hasCupBusiness ? "cup" : "home",
        cups, activeCupType: nextActiveCupType, qualifiedCupTypes, lastSeasonSummary, seasonEndSnapshot, incomingOffers: finalIncomingOffers, scoutMission, loanOffers: newLoanOffers, loanRequests: newLoanRequests, chemistryPairs: newChemistryPairs,
        arenaConstruction, arenaStands, dev: { ...prev.dev, arena: devArena },
        _toast: [breakToast, eventToast, scoutToast, constructionToast, trainingInjuryNames.length ? `Skada på träning: ${trainingInjuryNames.join(", ")}.` : null, loanReturnHomeMsg, installmentMsg].filter(Boolean).join(" ") || null,
      };
    });
    (g.pendingPlayerScouts || []).filter(s => s.dueRound <= newRound).forEach(s => {
      const scoutedPlayer = s.clubId ? g.clubs[s.clubId]?.squad?.find(pl => pl.id === s.playerId)
        : Object.values(g.worldPool || {}).flat().find(pl => pl.id === s.playerId);
      const name = scoutedPlayer?.name || "Spelaren";
      pushNews(`Scoutingen av ${name} är klar — full rapport tillgänglig.`, "Scouting", { action: { type: "scoutedPlayer", playerId: s.playerId, clubId: s.clubId, region: s.region } });
    });
  }

  // --- domestic cup handlers ---
  function playDomesticCupRound() {
    const cup = g.cups.domestic;
    const issues = lineupIssues(g.squad, g.startingXI, "domestic");
    if (issues.length) { showToast(`⚠️ Ni har ingen matchklar startelva — byt ut spelare i Trupp-fliken: ${issues[0]}`); return; }
    const seed = `domesticpair${cup.roundIndex || 1}${cup.teams.join(",")}`;
    const { pairs, byeTeam } = resolveDomesticPairing(cup.teams, seed);
    const winners = [];
    if (byeTeam) winners.push(byeTeam);
    let userOppId = null;
    for (const [a, b] of pairs) {
      if (a === g.userClubId || b === g.userClubId) { userOppId = a === g.userClubId ? b : a; continue; }
      const A = g.clubs[a], B = g.clubs[b];
      const ag = poisson(expectedGoals(A.strength, B.strength, false)), bg = poisson(expectedGoals(B.strength, A.strength, false));
      winners.push(ag === bg ? pick([a, b]) : (ag > bg ? a : b));
    }
    const opp = g.clubs[userOppId];
    const xi = getXI(g.squad, g.startingXI);
    const { attack, defense } = userStrength(xi, g.tactic, g.spelide, g.tacticalSettings, teamPositionFit(g.lineupCells, g.squad), g.staff, g.manager?.attributes);
    const weather = weatherForMatch(`cupweather${g.round}${g.userClubId}domestic${cup.roundIndex || 1}`);
    const pending = { oppId: userOppId, oppName: opp.name, oppStrength: opp.strength, userIsHome: Math.random() < 0.5, weather, xiIds: xi.map(p => p.id), analystImpactDelta: 0, gkCoachImpactDelta: 0, fitnessImpactDelta: 0 };
    setG(prev => ({ ...prev, view: "livematch", pendingRound: pending, pendingCupContext: { type: "domesticRound", winners } }));
  }
  function finalizeDomesticCupRound(secondHalfXiIds, subText, userGoals, oppGoals, scoredByIds) {
    const p = g.pendingRound, ctx = g.pendingCupContext;
    const xi = g.squad.filter(pl => secondHalfXiIds.includes(pl.id));
    let penalties = null, userWon, shootout = null;
    if (userGoals === oppGoals) {
      const { attack } = userStrength(xi, g.tactic, g.spelide, g.tacticalSettings);
      shootout = simulatePenaltyShootout(xi, g.clubs[p.oppId]?.squad || [], attack, p.oppStrength, g.setPieceTakers);
      userWon = shootout.userWon;
      penalties = shootout.label;
    } else userWon = userGoals > oppGoals;
    const scorerObjects = (scoredByIds && scoredByIds.length === userGoals)
      ? scoredByIds.map(id => xi.find(pl => pl.id === id) || pick(xi))
      : pickScorer(xi, userGoals);
    const assistProviders = scorerObjects.map(s => pickAssist(xi, s, g.setPieceTakers));
    const scorers = scorerObjects.map(pl => pl.name);
    const { newSquad, injuredPlayer } = simulateCupMatchPlayerUpdates(xi, g.squad, g.staff, g.tacticalSettings, g.difficulty, g.teamTalk, "domestic", scorerObjects, assistProviders);
    if (injuredPlayer) pushNews(`${injuredPlayer.name} skadades i cupmatchen — borta i ca ${newSquad.find(pl => pl.id === injuredPlayer.id)?.injuryWeeks} omgångar.`, "Skada");
    const ratings = ratingsForResult(xi, scorers, userWon ? "win" : "loss", assistProviders.map(a => a?.name), oppGoals);
    const winnerId = userWon ? g.userClubId : p.oppId;
    const winners = [...ctx.winners, winnerId];
    if (userWon) {
      const gap = (p.oppStrength || 50) - squadOverallRating(g.squad);
      const upset = giantKillerBonus(gap);
      if (upset && upset.tier !== "notable") {
        const headline = upset.tier === "mega" ? "MEGASKRÄLL" : "SKRÄLL";
        pushNews(`🔥 ${headline} i cupen! ${userClub.name} slår ${p.oppName} (${userGoals}${penalties ? ` [str. ${penalties}]` : ""}-${oppGoals}) trots en stor styrkeskillnad.`, "Cup", {
          competition: LEAGUES.find(l => l.id === g.leagueId)?.cupName || "Cupen",
          homeName: userClub.name, awayName: p.oppName, homeScore: userGoals, awayScore: oppGoals,
          rows: [{ label: "Styrkeskillnad", value: `${Math.round(gap)} poäng` }, ...(penalties ? [{ label: "Straffar", value: penalties }] : [])],
          note: `${p.oppName} var betydligt starkare på pappret — en genuin cupskräll.`,
        });
      }
    }
    const finances = simulateCupMatchFinances(g, p.userIsHome, p.oppStrength, false);
    const cupFinanceRecord = { round: g.round, oppName: p.oppName, userIsHome: p.userIsHome, ticketPrice: g.ticketPrice, attendance: finances.attendance, arenaCapacity: finances.arenaCapacity, income: finances.income, competition: COMPETITION_LABEL_SHORT.domestic };
    const userReport = { oppName: p.oppName, oppColor: g.clubs[p.oppId]?.color, userColor: g.clubs[g.userClubId]?.color, userIsHome: p.userIsHome, userGoals, oppGoals, penalties, result: userWon ? "win" : "loss", ratings, attendance: finances.attendance, arenaCapacity: finances.arenaCapacity };
    setG(prev => ({ ...prev, budget: prev.budget + finances.income, view: shootout ? "penaltyshootout" : "cup", activeCupType: "domestic", squad: newSquad, clubs: { ...prev.clubs, [prev.userClubId]: { ...prev.clubs[prev.userClubId], squad: newSquad } }, pendingRound: null, pendingCupContext: null, pendingShootout: shootout ? { ...shootout, oppId: p.oppId, targetView: "cup" } : null, cups: { ...prev.cups, domestic: { ...prev.cups.domestic, pendingWinners: winners, userReport, resultLog: [...(prev.cups.domestic.resultLog || []), { round: prev.cups.domestic.teams.length, oppId: p.oppId, oppName: p.oppName, won: userWon }] } }, recentMatchFinances: [cupFinanceRecord, ...(prev.recentMatchFinances || [])].slice(0, 10) }));
  }
  function continueDomesticCupRound() {
    const cup = g.cups.domestic;
    if (!cup.userReport) return;
    if (cup.userReport.result !== "win") { setG(prev => ({ ...prev, cups: { ...prev.cups, domestic: { ...prev.cups.domestic, eliminated: true, userReport: null } } })); return; }
    const nextTeams = cup.pendingWinners;
    if (nextTeams.length === 1) { setG(prev => ({ ...prev, cups: { ...prev.cups, domestic: { ...prev.cups.domestic, champion: nextTeams[0], userReport: null } } })); return; }
    const newRoundIndex = (cup.roundIndex || 1) + 1;
    setG(prev => ({ ...prev, cups: { ...prev.cups, domestic: { ...prev.cups.domestic, teams: nextTeams, roundIndex: newRoundIndex, roundName: nextTeams.length <= 4 ? bracketName(nextTeams.length) : `Omgång ${newRoundIndex}`, userReport: null, pendingWinners: null, dueIndex: (prev.cups.domestic.dueIndex ?? 0) + 1 } } }));
  }

  // --- cup1 group stage handlers ---
  function playGroupMatch() {
    const cup = g.cups.cup1;
    const issues = lineupIssues(g.squad, g.startingXI, "cup1");
    if (issues.length) { showToast(`⚠️ Ni har ingen matchklar startelva — byt ut spelare i Trupp-fliken: ${issues[0]}`); return; }
    const round = cup.groupSchedule[cup.groupRound];
    let userIsHome = null, oppId2 = null;
    const resolvedOthers = round.map(f => {
      const isUser = f.home === g.userClubId || f.away === g.userClubId;
      if (isUser) { userIsHome = f.home === g.userClubId; oppId2 = userIsHome ? f.away : f.home; return f; }
      const home = g.clubs[f.home], away = g.clubs[f.away];
      return { ...f, homeGoals: poisson(expectedGoals(home.strength, away.strength, true)), awayGoals: poisson(expectedGoals(away.strength, home.strength, false)) };
    });
    const opp = g.clubs[oppId2];
    const xi = getXI(g.squad, g.startingXI);
    const weather = weatherForMatch(`cupweather${g.round}${g.userClubId}cup1group${cup.groupRound}`);
    const pending = { oppId: oppId2, oppName: opp.name, oppStrength: opp.strength, userIsHome, weather, xiIds: xi.map(p => p.id), analystImpactDelta: 0, gkCoachImpactDelta: 0, fitnessImpactDelta: 0 };
    setG(prev => ({ ...prev, view: "livematch", pendingRound: pending, pendingCupContext: { type: "groupMatch", resolvedOthers } }));
  }
  function finalizeGroupMatch(secondHalfXiIds, subText, userGoals, oppGoals, scoredByIds) {
    const p = g.pendingRound, ctx = g.pendingCupContext;
    const xi = g.squad.filter(pl => secondHalfXiIds.includes(pl.id));
    const result = userGoals > oppGoals ? "win" : userGoals < oppGoals ? "loss" : "draw";
    if (result === "win") {
      const gap = (p.oppStrength || 50) - squadOverallRating(g.squad);
      const upset = giantKillerBonus(gap);
      if (upset && upset.tier !== "notable") {
        const headline = upset.tier === "mega" ? "MEGASKRÄLL" : "SKRÄLL";
        pushNews(`🔥 ${headline} i Kimby Mästerskapet! ${userClub.name} slår ${p.oppName} (${p.userIsHome ? userGoals : oppGoals}-${p.userIsHome ? oppGoals : userGoals}) trots en stor styrkeskillnad.`, "Cup", {
          competition: "Kimby Mästerskapet — Gruppspel",
          homeName: p.userIsHome ? userClub.name : p.oppName, awayName: p.userIsHome ? p.oppName : userClub.name,
          homeScore: p.userIsHome ? userGoals : oppGoals, awayScore: p.userIsHome ? oppGoals : userGoals,
          rows: [{ label: "Styrkeskillnad", value: `${Math.round(gap)} poäng` }],
          note: `${p.oppName} var betydligt starkare på pappret — en genuin cupskräll.`,
        });
      }
    }
    const scorerObjects = (scoredByIds && scoredByIds.length === userGoals)
      ? scoredByIds.map(id => xi.find(pl => pl.id === id) || pick(xi))
      : pickScorer(xi, userGoals);
    const assistProviders = scorerObjects.map(s => pickAssist(xi, s, g.setPieceTakers));
    const scorers = scorerObjects.map(pl => pl.name);
    const { newSquad, injuredPlayer } = simulateCupMatchPlayerUpdates(xi, g.squad, g.staff, g.tacticalSettings, g.difficulty, g.teamTalk, "cup1", scorerObjects, assistProviders);
    if (injuredPlayer) pushNews(`${injuredPlayer.name} skadades i cupmatchen — borta i ca ${newSquad.find(pl => pl.id === injuredPlayer.id)?.injuryWeeks} omgångar.`, "Skada");
    const ratings = ratingsForResult(xi, scorers, result, assistProviders.map(a => a?.name), oppGoals);
    const finances = simulateCupMatchFinances(g, p.userIsHome, p.oppStrength, false);
    const capturedReport = { oppName: p.oppName, oppColor: g.clubs[p.oppId]?.color, userColor: g.clubs[g.userClubId]?.color, userIsHome: p.userIsHome, userGoals, oppGoals, result, ratings, attendance: finances.attendance, arenaCapacity: finances.arenaCapacity };
    const cupFinanceRecord = { round: g.round, oppName: p.oppName, userIsHome: p.userIsHome, ticketPrice: g.ticketPrice, attendance: finances.attendance, arenaCapacity: finances.arenaCapacity, income: finances.income, competition: COMPETITION_LABEL_SHORT.cup1 };
    setG(prev => {
      const cup = prev.cups.cup1;
      const newGroupSchedule = cup.groupSchedule.map((r, ri) => {
        if (ri !== cup.groupRound) return r;
        return ctx.resolvedOthers.map(f => {
          const isUser = f.home === prev.userClubId || f.away === prev.userClubId;
          if (!isUser) return f;
          return { ...f, homeGoals: p.userIsHome ? userGoals : oppGoals, awayGoals: p.userIsHome ? oppGoals : userGoals };
        });
      });
      return { ...prev, budget: prev.budget + finances.income, view: "cup", activeCupType: "cup1", squad: newSquad, clubs: { ...prev.clubs, [prev.userClubId]: { ...prev.clubs[prev.userClubId], squad: newSquad } }, pendingRound: null, pendingCupContext: null, cups: { ...prev.cups, cup1: { ...cup, groupSchedule: newGroupSchedule, pendingReport: capturedReport } }, recentMatchFinances: [cupFinanceRecord, ...(prev.recentMatchFinances || [])].slice(0, 10) };
    });
  }
  function continueGroupRound() {
    const cup = g.cups.cup1;
    const newGroupRound = cup.groupRound + 1;
    if (newGroupRound < cup.groupSchedule.length) { setG(prev => ({ ...prev, cups: { ...prev.cups, cup1: { ...prev.cups.cup1, groupRound: newGroupRound, pendingReport: null } } })); return; }
    const standings = computeStandings(cup.groupSchedule, cup.groups[cup.userGroupIndex]);
    const userGroupPos = standings.findIndex(s => s.id === g.userClubId) + 1;
    if (userGroupPos > 2) { setG(prev => ({ ...prev, cups: { ...prev.cups, cup1: { ...prev.cups.cup1, groupRound: newGroupRound, pendingReport: null, eliminated: true, roundName: "Gruppspelet" } } })); return; }
    const advancing = standings.slice(0, 2).map(s => s.id);
    const eight = shuffle([...cup.otherGroupsQualifiers, ...advancing]);
    const { pendingOtherWinners, tie } = setupKnockoutRound(eight, g.clubs, g.userClubId);
    setG(prev => ({ ...prev, cups: { ...prev.cups, cup1: { ...prev.cups.cup1, phase: "knockout", roundName: "Kvartsfinal", teams: eight, pendingOtherWinners, tie, pendingReport: null, groupRound: newGroupRound, dueIndex: 0 } } }));
  }

  // --- two-legged knockout handlers (cup1 QF/SF, cup2 R16/QF/SF) — target whichever cup is currently active ---
  function playCupLeg() {
    const cupType = g.activeCupType;
    const issues = lineupIssues(g.squad, g.startingXI, g.activeCupType);
    if (issues.length) { showToast(`⚠️ Ni har ingen matchklar startelva — byt ut spelare i Trupp-fliken: ${issues[0]}`); return; }
    const cup = g.cups[cupType];
    const opp = g.clubs[cup.tie.oppId];
    const userIsHomeThisLeg = cup.tie.leg === 1 ? cup.tie.userHomeLeg1 : !cup.tie.userHomeLeg1;
    const xi = getXI(g.squad, g.startingXI);
    const weather = weatherForMatch(`cupweather${g.round}${g.userClubId}${cupType}leg${cup.tie.leg}`);
    const pending = { oppId: cup.tie.oppId, oppName: opp.name, oppStrength: opp.strength, userIsHome: userIsHomeThisLeg, weather, xiIds: xi.map(p => p.id), analystImpactDelta: 0, gkCoachImpactDelta: 0, fitnessImpactDelta: 0 };
    setG(prev => ({ ...prev, view: "livematch", pendingRound: pending, pendingCupContext: { type: "leg", cupType, legNum: cup.tie.leg } }));
  }
  function finalizeCupLeg(secondHalfXiIds, subText, userGoals, oppGoals, scoredByIds) {
    const p = g.pendingRound, ctx = g.pendingCupContext;
    const xi = g.squad.filter(pl => secondHalfXiIds.includes(pl.id));
    const result = userGoals > oppGoals ? "win" : userGoals < oppGoals ? "loss" : "draw";
    const scorerObjects = (scoredByIds && scoredByIds.length === userGoals)
      ? scoredByIds.map(id => xi.find(pl => pl.id === id) || pick(xi))
      : pickScorer(xi, userGoals);
    const assistProviders = scorerObjects.map(s => pickAssist(xi, s, g.setPieceTakers));
    const scorers = scorerObjects.map(pl => pl.name);
    const { newSquad, injuredPlayer } = simulateCupMatchPlayerUpdates(xi, g.squad, g.staff, g.tacticalSettings, g.difficulty, g.teamTalk, ctx.cupType, scorerObjects, assistProviders);
    if (injuredPlayer) pushNews(`${injuredPlayer.name} skadades i cupmatchen — borta i ca ${newSquad.find(pl => pl.id === injuredPlayer.id)?.injuryWeeks} omgångar.`, "Skada");
    const ratings = ratingsForResult(xi, scorers, result, assistProviders.map(a => a?.name), oppGoals);
    const legResult = { userGoals, oppGoals, userWon: userGoals > oppGoals, ratings };
    const finances = simulateCupMatchFinances(g, p.userIsHome, p.oppStrength, false);
    const cupFinanceRecord = { round: g.round, oppName: p.oppName, userIsHome: p.userIsHome, ticketPrice: g.ticketPrice, attendance: finances.attendance, arenaCapacity: finances.arenaCapacity, income: finances.income, competition: COMPETITION_LABEL_SHORT[ctx.cupType] || "Cupen" };
    const report = { oppName: p.oppName, oppColor: g.clubs[p.oppId]?.color, userColor: g.clubs[g.userClubId]?.color, userIsHome: p.userIsHome, userGoals, oppGoals, penalties: null, result, ratings, attendance: finances.attendance, arenaCapacity: finances.arenaCapacity };
    const legKey = ctx.legNum === 1 ? "leg1" : "leg2";
    setG(prev => ({ ...prev, budget: prev.budget + finances.income, view: "cup", activeCupType: ctx.cupType, squad: newSquad, clubs: { ...prev.clubs, [prev.userClubId]: { ...prev.clubs[prev.userClubId], squad: newSquad } }, pendingRound: null, pendingCupContext: null, cups: { ...prev.cups, [ctx.cupType]: { ...prev.cups[ctx.cupType], tie: { ...prev.cups[ctx.cupType].tie, [legKey]: legResult }, pendingReport: report } }, recentMatchFinances: [cupFinanceRecord, ...(prev.recentMatchFinances || [])].slice(0, 10) }));
  }
  function continueCupLeg(precomputedShootout = null) {
    const cupType = g.activeCupType;
    const cup = g.cups[cupType];
    if (cup.tie.leg === 1) { setG(prev => ({ ...prev, cups: { ...prev.cups, [cupType]: { ...prev.cups[cupType], tie: { ...prev.cups[cupType].tie, leg: 2 }, pendingReport: null, dueIndex: (prev.cups[cupType].dueIndex ?? 0) + 1 } } })); return; }
    const { leg1, leg2 } = cup.tie;
    const userGoalsAgg = leg1.userGoals + leg2.userGoals, oppGoalsAgg = leg1.oppGoals + leg2.oppGoals;
    const userLegWins = (leg1.userWon ? 1 : 0) + (leg2.userWon ? 1 : 0);
    let advanced, shootoutNote = null;
    if (userLegWins === 2) advanced = true;
    else if (userLegWins === 0) advanced = false;
    else if (userGoalsAgg > oppGoalsAgg) advanced = true;
    else if (oppGoalsAgg > userGoalsAgg) advanced = false;
    else {
      // Aggregate tied — no away-goals rule here, straight to extra time. The ET result is computed once
      // and persisted on the tie so it stays consistent if we need to resume after a penalty shootout.
      let et = cup.tie.extraTime;
      if (!et) {
        const xi = getXI(g.squad, g.startingXI);
        const strength2 = userStrength(xi, g.tactic, g.spelide, g.tacticalSettings);
        const oppStrength = g.clubs[cup.tie.oppId].strength;
        const diff = (strength2.attack - oppStrength) / 100;
        const etUser = Math.random() < clamp(0.22 + diff, 0.08, 0.42) ? (Math.random() < 0.15 ? 2 : 1) : 0;
        const etOpp = Math.random() < clamp(0.22 - diff, 0.08, 0.42) ? (Math.random() < 0.15 ? 2 : 1) : 0;
        et = { userGoals: etUser, oppGoals: etOpp };
        setG(prev => ({ ...prev, cups: { ...prev.cups, [cupType]: { ...prev.cups[cupType], tie: { ...prev.cups[cupType].tie, extraTime: et } } } }));
      }
      const etUserAgg = userGoalsAgg + et.userGoals, etOppAgg = oppGoalsAgg + et.oppGoals;
      if (etUserAgg > etOppAgg) { advanced = true; showToast(`Efter förlängning (${et.userGoals}-${et.oppGoals}): ${etUserAgg}-${etOppAgg} sammanlagt — ni går vidare!`); }
      else if (etOppAgg > etUserAgg) { advanced = false; showToast(`Efter förlängning (${et.userGoals}-${et.oppGoals}): ${etUserAgg}-${etOppAgg} sammanlagt — ni är utslagna.`); }
      else if (precomputedShootout) {
        advanced = precomputedShootout.userWon;
        shootoutNote = `Lika även efter förlängning (${etUserAgg}-${etOppAgg} sammanlagt) — straffar avgjorde: ${precomputedShootout.label}.`;
      } else {
        const xi = getXI(g.squad, g.startingXI);
        const strength2 = userStrength(xi, g.tactic, g.spelide, g.tacticalSettings);
        const oppStrength = g.clubs[cup.tie.oppId].strength;
        const shootout = simulatePenaltyShootout(xi, g.clubs[cup.tie.oppId]?.squad || [], strength2.attack, oppStrength, g.setPieceTakers);
        setG(prev => ({ ...prev, view: "penaltyshootout", pendingShootout: { ...shootout, oppId: cup.tie.oppId, targetView: "cup", resumeCupLeg: true } }));
        return;
      }
    }
    if (advanced) {
      const gap = (g.clubs[cup.tie.oppId]?.strength || 50) - squadOverallRating(g.squad);
      const upset = giantKillerBonus(gap);
      if (upset && upset.tier !== "notable") {
        const headline = upset.tier === "mega" ? "MEGASKRÄLL" : "SKRÄLL";
        const cupLabel = cupType === "cup1" ? "Kimby Mästerskapet" : "Kimby Cupen";
        pushNews(`🔥 ${headline} i ${cupLabel}! ${userClub.name} går vidare mot ${g.clubs[cup.tie.oppId]?.name} (${userGoalsAgg}-${oppGoalsAgg} sammanlagt) trots en stor styrkeskillnad.`, "Cup", {
          competition: `${cupLabel} — ${bracketName(cup.teams.length)}`,
          homeName: userClub.name, awayName: g.clubs[cup.tie.oppId]?.name, homeScore: userGoalsAgg, awayScore: oppGoalsAgg,
          rows: [
            { label: "Match 1", value: `${leg1.userGoals}-${leg1.oppGoals}` }, { label: "Match 2", value: `${leg2.userGoals}-${leg2.oppGoals}` },
            { label: "Styrkeskillnad", value: `${Math.round(gap)} poäng` },
          ],
          note: shootoutNote || `${g.clubs[cup.tie.oppId]?.name} var betydligt starkare på pappret — en genuin cupskräll.`,
        });
      }
    }
    const tieLogEntry = { round: cup.teams.length, oppId: cup.tie.oppId, oppName: g.clubs[cup.tie.oppId]?.name, won: advanced };
    if (!advanced) { setG(prev => ({ ...prev, view: "cup", pendingShootout: null, cups: { ...prev.cups, [cupType]: { ...prev.cups[cupType], eliminated: true, pendingReport: null, resultLog: [...(prev.cups[cupType].resultLog || []), tieLogEntry] } } })); return; }
    const nextTeams = [...cup.pendingOtherWinners, g.userClubId];
    if (nextTeams.length === 2) {
      const finalOpponentId = nextTeams.find(id => id !== g.userClubId);
      setG(prev => ({ ...prev, view: "cup", pendingShootout: null, cups: { ...prev.cups, [cupType]: { ...prev.cups[cupType], phase: "final", finalOpponentId, tie: null, pendingReport: null, roundName: "Final", dueIndex: (prev.cups[cupType].dueIndex ?? 0) + 1, resultLog: [...(prev.cups[cupType].resultLog || []), tieLogEntry] } } }));
      return;
    }
    const { pendingOtherWinners, tie } = setupKnockoutRound(nextTeams, g.clubs, g.userClubId);
    setG(prev => ({ ...prev, view: "cup", pendingShootout: null, cups: { ...prev.cups, [cupType]: { ...prev.cups[cupType], teams: nextTeams, pendingOtherWinners, tie, pendingReport: null, roundName: bracketName(nextTeams.length), dueIndex: (prev.cups[cupType].dueIndex ?? 0) + 1, resultLog: [...(prev.cups[cupType].resultLog || []), tieLogEntry] } } }));
  }
  function playCupFinal() {
    const cupType = g.activeCupType;
    const issues = lineupIssues(g.squad, g.startingXI, g.activeCupType);
    if (issues.length) { showToast(`⚠️ Ni har ingen matchklar startelva — byt ut spelare i Trupp-fliken: ${issues[0]}`); return; }
    const cup = g.cups[cupType];
    const opp = g.clubs[cup.finalOpponentId];
    const xi = getXI(g.squad, g.startingXI);
    const weather = weatherForMatch(`cupweather${g.round}${g.userClubId}${cupType}final`);
    const pending = { oppId: cup.finalOpponentId, oppName: opp.name, oppStrength: opp.strength, userIsHome: Math.random() < 0.5, weather, xiIds: xi.map(p => p.id), analystImpactDelta: 0, gkCoachImpactDelta: 0, fitnessImpactDelta: 0 };
    setG(prev => ({ ...prev, view: "livematch", pendingRound: pending, pendingCupContext: { type: "final", cupType } }));
  }
  function finalizeCupFinal(secondHalfXiIds, subText, userGoals, oppGoals, scoredByIds) {
    const p = g.pendingRound, ctx = g.pendingCupContext;
    const xi = g.squad.filter(pl => secondHalfXiIds.includes(pl.id));
    let penalties = null, userWon, shootout = null;
    if (userGoals === oppGoals) {
      const { attack } = userStrength(xi, g.tactic, g.spelide, g.tacticalSettings);
      shootout = simulatePenaltyShootout(xi, g.clubs[p.oppId]?.squad || [], attack, p.oppStrength, g.setPieceTakers);
      userWon = shootout.userWon;
      penalties = shootout.label;
    } else userWon = userGoals > oppGoals;
    const result = userWon ? "win" : "loss";
    if (userWon) {
      const gap = (p.oppStrength || 50) - squadOverallRating(g.squad);
      const upset = giantKillerBonus(gap);
      if (upset && upset.tier !== "notable") {
        const cupLabel = ctx.cupType === "cup1" ? "Kimby Mästerskapet" : "Kimby Cupen";
        pushNews(`🔥 SENSATIONELL CUPTRIUMF! ${userClub.name} vinner ${cupLabel} genom att slå ${p.oppName} (${userGoals}${penalties ? ` [str. ${penalties}]` : ""}-${oppGoals}) i finalen trots en stor styrkeskillnad — historisk kväll!`, "Cup", {
          competition: `${cupLabel} — Final`,
          homeName: userClub.name, awayName: p.oppName, homeScore: userGoals, awayScore: oppGoals,
          rows: [{ label: "Styrkeskillnad", value: `${Math.round(gap)} poäng` }, ...(penalties ? [{ label: "Straffar", value: penalties }] : [])],
          note: `${p.oppName} var betydligt starkare på pappret — men er klubb tog hem titeln ändå.`,
        });
      }
    }
    const scorerObjects = (scoredByIds && scoredByIds.length === userGoals)
      ? scoredByIds.map(id => xi.find(pl => pl.id === id) || pick(xi))
      : pickScorer(xi, userGoals);
    const assistProviders = scorerObjects.map(s => pickAssist(xi, s, g.setPieceTakers));
    const scorers = scorerObjects.map(pl => pl.name);
    const { newSquad, injuredPlayer } = simulateCupMatchPlayerUpdates(xi, g.squad, g.staff, g.tacticalSettings, g.difficulty, g.teamTalk, ctx.cupType, scorerObjects, assistProviders);
    if (injuredPlayer) pushNews(`${injuredPlayer.name} skadades i finalen — borta i ca ${newSquad.find(pl => pl.id === injuredPlayer.id)?.injuryWeeks} omgångar.`, "Skada");
    const ratings = ratingsForResult(xi, scorers, result, assistProviders.map(a => a?.name), oppGoals);
    const finances = simulateCupMatchFinances(g, p.userIsHome, p.oppStrength, false);
    const cupFinanceRecord = { round: g.round, oppName: p.oppName, userIsHome: p.userIsHome, ticketPrice: g.ticketPrice, attendance: finances.attendance, arenaCapacity: finances.arenaCapacity, income: finances.income, competition: `${COMPETITION_LABEL_SHORT[ctx.cupType] || "Cupen"} (final)` };
    const report = { oppName: p.oppName, oppColor: g.clubs[p.oppId]?.color, userColor: g.clubs[g.userClubId]?.color, userIsHome: p.userIsHome, userGoals, oppGoals, penalties, result, ratings, attendance: finances.attendance, arenaCapacity: finances.arenaCapacity };
    setG(prev => ({ ...prev, budget: prev.budget + finances.income, view: shootout ? "penaltyshootout" : "cup", activeCupType: ctx.cupType, squad: newSquad, clubs: { ...prev.clubs, [prev.userClubId]: { ...prev.clubs[prev.userClubId], squad: newSquad } }, pendingRound: null, pendingCupContext: null, pendingShootout: shootout ? { ...shootout, oppId: p.oppId, targetView: "cup" } : null, cups: { ...prev.cups, [ctx.cupType]: { ...prev.cups[ctx.cupType], pendingReport: report, finalWon: userWon, resultLog: [...(prev.cups[ctx.cupType].resultLog || []), { round: 2, oppId: p.oppId, oppName: p.oppName, won: userWon }] } }, recentMatchFinances: [cupFinanceRecord, ...(prev.recentMatchFinances || [])].slice(0, 10) }));
  }
  function continueCupFinal() {
    const cupType = g.activeCupType;
    const cup = g.cups[cupType];
    if (cup.finalWon) setG(prev => ({ ...prev, cups: { ...prev.cups, [cupType]: { ...prev.cups[cupType], champion: prev.userClubId, pendingReport: null } } }));
    else setG(prev => ({ ...prev, cups: { ...prev.cups, [cupType]: { ...prev.cups[cupType], eliminated: true, pendingReport: null } } }));
  }

  function finishCup() {
    const cupType = g.activeCupType;
    const cup = g.cups[cupType];
    const milestone = cup.champion ? "winner" : milestoneFromRoundName(cup.roundName);
    const prizeTable = cup.type === "cup1" ? CUP1_PRIZES : cup.type === "cup2" ? CUP2_PRIZES : DOMESTIC_PRIZES;
    const prize = prizeTable[milestone] || 0;
    const text = cup.champion ? `Mästare i ${cup.label}!` : eliminationText(cup);
    setG(prev => {
      const summary = { ...prev.lastSeasonSummary };
      let lastCup2ChampionId = prev.lastCup2ChampionId;
      if (cup.type === "domestic") { summary.domesticCupResult = text; summary.domesticCupWon = !!cup.champion; summary.domesticCupWinnerId = prev.userClubId; }
      else if (cup.type === "cup1") { summary.cup1Result = text; }
      else { summary.cup2Result = text; if (cup.champion) lastCup2ChampionId = prev.userClubId; }
      summary.prizeTotal = (summary.prizeTotal || 0) + prize;

      let newQualified = prev.qualifiedCupTypes || [];
      if (cup.type === "domestic" && summary.domesticCupWon && summary.cup2Result == null && !newQualified.includes("cup2")) {
        newQualified = [...newQualified, "cup2"];
      }

      return { ...prev, budget: prev.budget + prize, view: "home", activeTab: "home", pendingAfterResult: "home", lastSeasonSummary: summary, activeCupType: null, qualifiedCupTypes: newQualified, lastCup2ChampionId };
    });
  }

  function finalizeTransfer(region, player, agreedPrice, agreedWage, details = {}) {
    if (!transferWindowOpen(g.round)) { showToast("Transferfönstret är stängt just nu."); return; }
    const sellOnPct = details.sellOnOffer || 0;
    const discount = 1 - (g.scoutingParts.kontakter - 1) * 0.04;
    const price = Math.round(agreedPrice * discount);
    const scale = agreedPrice ? price / agreedPrice : 1;
    const plan = details.paymentPlan || { upfrontAmount: price, financedAmount: 0, months: 0 };
    const upfrontAmount = Math.round((plan.upfrontAmount ?? price) * scale);
    const financedAmount = Math.round((plan.financedAmount ?? 0) * scale);
    const signOnBonus = details.signOnBonus || 0;
    const houseCarCost = details.houseCar ? 350 : 0;
    const totalCashNow = upfrontAmount + signOnBonus + houseCarCost;
    if (g.budget < totalCashNow) { showToast("Inte tillräcklig budget för direktkostnaden."); return; }
    if (g.boardConfidence < 40 && totalCashNow > g.budget * 0.4) { showToast("Styrelsen blockerar värvningen — för dyr given det svaga förtroendet just nu."); return; }
    const wage = agreedWage || player.wage;
    const cap = wageBudgetCap(g.reputation, g.clubs[g.userClubId].division, g.dev.sponsring);
    if (totalWageBill(g.squad) + wage > cap * 1.15) { showToast("Löneutrymmet räcker inte — Financial Fair Play stoppar värvningen."); return; }
    const fromClubName = player.clubId ? (g.clubs[player.clubId]?.name || "en annan klubb") : "fri agent";
    const isDerby = player.clubId && g.clubs[player.clubId]?.rivalId === g.userClubId;
    const fanDelta = fanSigningReaction(player, price, isDerby, g.squad, userClub);
    const installmentNote = financedAmount > 0 ? ` Resten (${formatMoney(financedAmount)}) delbetalas över ${plan.months} månader.` : "";
    const reluctant = (details.clubInterest ?? 100) < 55;
    const signedPlayer = { ...player, clubId: null, contractYears: rndInt(3, 5), wage, number: assignSquadNumber(g.squad), sellOnPct, sellOnClubName: sellOnPct > 0 ? fromClubName : null, releaseClause: details.releaseClauseOffer > 0 ? details.releaseClauseOffer : null, morale: reluctant ? clamp((player.morale ?? 70) - 15, 20, 100) : (player.morale ?? 70), reluctantSign: reluctant, joinedInfo: { text: reluctant ? `Värvades från ${fromClubName} för ${formatMoney(price)} i säsong ${g.season} — övertalades trots tveksamhet inför flytten.${installmentNote}` : `Värvades från ${fromClubName} för ${formatMoney(price)} i säsong ${g.season}.${installmentNote}` } };
    const recalcPlan = financedAmount > 0 ? installmentPlan(financedAmount, plan.months) : null;
    const newInstallment = recalcPlan ? { id: uid(), playerName: player.name, monthsLeft: recalcPlan.months, monthlyPayment: recalcPlan.monthlyPayment, totalRemaining: recalcPlan.totalWithInterest } : null;
    setG(prev => {
      const rating = effectiveScoutRating(prev.dev, prev.reputation, prev.scoutingParts.analys + (prev.staff.scout?.level || 0) * 0.5);
      const poolForRegion = prev.worldPool?.[region] || [];
      const draw = drawFromWorldPool(poolForRegion, rating, 1);
      const replacement = draw.picks[0] || makeScoutPlayer(pick(POS_ORDER), region, rating, prev.clubs);
      return {
        ...prev, budget: prev.budget - totalCashNow, squad: [...prev.squad, signedPlayer], fanbase: clamp(prev.fanbase + fanDelta, 0, 100),
        transferInstallments: newInstallment ? [...(prev.transferInstallments || []), newInstallment] : (prev.transferInstallments || []),
        market: { ...prev.market, [region]: prev.market[region].filter(p => p.id !== player.id).concat([replacement]) },
        worldPool: prev.worldPool ? { ...prev.worldPool, [region]: draw.remaining } : prev.worldPool,
        clubGoodwill: player.clubId ? { ...prev.clubGoodwill, [player.clubId]: clamp((prev.clubGoodwill[player.clubId] ?? 50) + 5, 0, 100) } : prev.clubGoodwill,
        transferHistory: [{ id: uid(), season: prev.season, round: prev.round, playerId: player.id, playerName: player.name, playerPos: player.specificPosition, fromClubId: player.clubId || null, fromClubName, fromColor: player.clubId ? prev.clubs[player.clubId]?.color : null, toClubId: prev.userClubId, toClubName: userClub.name, toColor: userClub.color, fee: price, leagueId: (player.clubId ? prev.clubs[player.clubId]?.league : null) || prev.leagueId }, ...(prev.transferHistory || [])].slice(0, 1000),
      };
    });
    if (isDerby) pushNews(`Historisk värvning — ${player.name} lämnar ärkerivalen ${fromClubName} för er! Fansen ${fanDelta >= 6 ? "jublar vilt" : "är kluvna men nyfikna"}.`, "Klubben");
    else if (fanDelta >= 3) pushNews(`Fansen är mycket nöjda med värvningen av ${player.name}.`, "Klubben");
    else if (fanDelta < 0) pushNews(`Fansen är skeptiska till värvningen av ${player.name} — dyrt för vad som levererades.`, "Klubben");
    showToast(sellOnPct > 0 ? `${player.name} skrev på för ${formatMoney(price)} — ${fromClubName} får ${sellOnPct}% vid en framtida vidareförsäljning.${installmentNote}` : `${player.name} skrev på för ${formatMoney(price)} (${formatMoney(wage)}/omg i lön)!${installmentNote}`);
  }
  function startScoutMission(filters) {
    if (g.scoutMission && !g.scoutMission.complete) { showToast("Scouten är redan ute på uppdrag."); return; }
    const level = g.staff.scout?.level || 0;
    const roundsTotal = Math.round(scoutMissionDuration(level));
    setG(prev => ({ ...prev, scoutMission: { ...filters, roundsTotal, roundsElapsed: 0, complete: false, result: null } }));
    showToast(`Scouten skickas ut — klart om ca ${roundsTotal} omgångar.`);
  }
  function cancelScoutMission() {
    setG(prev => ({ ...prev, scoutMission: prev.scoutMission ? { ...prev.scoutMission, cancelling: true } : null }));
    showToast("Scouten kallas hem — tillbaka om en omgång.");
  }
  function dismissScoutMission() {
    setG(prev => ({ ...prev, scoutMission: null }));
  }
  function finalizeClubBrowseTransfer(player, agreedPrice, agreedWage, details = {}) {
    if (!transferWindowOpen(g.round)) { showToast("Transferfönstret är stängt just nu."); return; }
    const plan = details.paymentPlan || { upfrontAmount: agreedPrice, financedAmount: 0, months: 0 };
    const upfrontAmount = plan.upfrontAmount ?? agreedPrice;
    const financedAmount = plan.financedAmount ?? 0;
    const signOnBonus = details.signOnBonus || 0;
    const houseCarCost = details.houseCar ? 350 : 0;
    const totalCashNow = upfrontAmount + signOnBonus + houseCarCost;
    if (g.budget < totalCashNow) { showToast("Inte tillräcklig budget för direktkostnaden."); return; }
    if (g.boardConfidence < 40 && totalCashNow > g.budget * 0.4) { showToast("Styrelsen blockerar värvningen — för dyr given det svaga förtroendet just nu."); return; }
    const fromClubName = player.clubId ? (g.clubs[player.clubId]?.name || "en annan klubb") : "fri agent";
    const isDerby = player.clubId && g.clubs[player.clubId]?.rivalId === g.userClubId;
    const installmentNote = financedAmount > 0 ? ` Resten (${formatMoney(financedAmount)}) delbetalas över ${plan.months} månader.` : "";
    const recalcPlan = financedAmount > 0 ? installmentPlan(financedAmount, plan.months) : null;
    const newInstallment = recalcPlan ? { id: uid(), playerName: player.name, monthsLeft: recalcPlan.months, monthlyPayment: recalcPlan.monthlyPayment, totalRemaining: recalcPlan.totalWithInterest } : null;
    if (player.isAcademy) {
      // A bought academy prospect joins YOUR academy, not your first team — they go through the exact
      // same development clock as a homegrown talent (minimum 2 years, overall 58+) before they're
      // eligible for promotion. Buying potential doesn't buy a shortcut past actually developing it.
      const acquiredProspect = { ...player, clubId: undefined, isAcademy: undefined, yearsInAcademy: 0, joinedInfo: { text: `Köptes från ${fromClubName}s akademi för ${formatMoney(agreedPrice)} i säsong ${g.season}.${installmentNote}` } };
      setG(prev => ({
        ...prev, budget: prev.budget - totalCashNow, youthSquad: [...(prev.youthSquad || []), acquiredProspect],
        transferInstallments: newInstallment ? [...(prev.transferInstallments || []), newInstallment] : (prev.transferInstallments || []),
        clubs: player.clubId && prev.clubs[player.clubId] ? { ...prev.clubs, [player.clubId]: { ...prev.clubs[player.clubId], youthSquad: (prev.clubs[player.clubId].youthSquad || []).filter(p => p.id !== player.id) } } : prev.clubs,
        clubGoodwill: player.clubId ? { ...prev.clubGoodwill, [player.clubId]: clamp((prev.clubGoodwill[player.clubId] ?? 50) + 5, 0, 100) } : prev.clubGoodwill,
        transferHistory: [{ id: uid(), season: prev.season, round: prev.round, playerId: player.id, playerName: player.name, playerPos: player.specificPosition, fromClubId: player.clubId || null, fromClubName, fromColor: player.clubId ? prev.clubs[player.clubId]?.color : null, toClubId: prev.userClubId, toClubName: userClub.name, toColor: userClub.color, fee: agreedPrice, leagueId: (player.clubId ? prev.clubs[player.clubId]?.league : null) || prev.leagueId }, ...(prev.transferHistory || [])].slice(0, 1000),
      }));
      showToast(`${player.name} ansluter till er akademi för ${formatMoney(agreedPrice)}. Minst 2 år i akademin krävs innan uppflyttning.${installmentNote}`);
      return;
    }
    const wage = agreedWage || player.wage;
    const cap = wageBudgetCap(g.reputation, g.clubs[g.userClubId].division, g.dev.sponsring);
    if (totalWageBill(g.squad) + wage > cap * 1.15) { showToast("Löneutrymmet räcker inte — Financial Fair Play stoppar värvningen."); return; }
    const fanDelta = fanSigningReaction(player, agreedPrice, isDerby, g.squad, userClub);
    const sellOnPct = details.sellOnOffer || 0;
    const reluctant = (details.clubInterest ?? 100) < 55;
    const signedPlayer = { ...player, clubId: null, contractYears: rndInt(3, 5), wage, number: assignSquadNumber(g.squad), sellOnPct, sellOnClubName: sellOnPct > 0 ? fromClubName : null, releaseClause: details.releaseClauseOffer > 0 ? details.releaseClauseOffer : null, morale: reluctant ? clamp((player.morale ?? 70) - 15, 20, 100) : (player.morale ?? 70), reluctantSign: reluctant, joinedInfo: { text: reluctant ? `Värvades från ${fromClubName} för ${formatMoney(agreedPrice)} i säsong ${g.season} — övertalades trots tveksamhet inför flytten.${installmentNote}` : `Värvades från ${fromClubName} för ${formatMoney(agreedPrice)} i säsong ${g.season}.${installmentNote}` } };
    setG(prev => ({
      ...prev, budget: prev.budget - totalCashNow, squad: [...prev.squad, signedPlayer], fanbase: clamp(prev.fanbase + fanDelta, 0, 100),
      transferInstallments: newInstallment ? [...(prev.transferInstallments || []), newInstallment] : (prev.transferInstallments || []),
      clubs: player.clubId && prev.clubs[player.clubId] ? { ...prev.clubs, [player.clubId]: { ...prev.clubs[player.clubId], squad: (prev.clubs[player.clubId].squad || []).filter(p => p.id !== player.id), youthSquad: (prev.clubs[player.clubId].youthSquad || []).filter(p => p.id !== player.id) } } : prev.clubs,
      clubGoodwill: player.clubId ? { ...prev.clubGoodwill, [player.clubId]: clamp((prev.clubGoodwill[player.clubId] ?? 50) + 5, 0, 100) } : prev.clubGoodwill,
      transferHistory: [{ id: uid(), season: prev.season, round: prev.round, playerId: player.id, playerName: player.name, playerPos: player.specificPosition, fromClubId: player.clubId || null, fromClubName, fromColor: player.clubId ? prev.clubs[player.clubId]?.color : null, toClubId: prev.userClubId, toClubName: userClub.name, toColor: userClub.color, fee: agreedPrice, leagueId: (player.clubId ? prev.clubs[player.clubId]?.league : null) || prev.leagueId }, ...(prev.transferHistory || [])].slice(0, 1000),
    }));
    if (isDerby) pushNews(`Historisk värvning — ${player.name} lämnar ärkerivalen ${fromClubName} för er! Fansen ${fanDelta >= 6 ? "jublar vilt" : "är kluvna men nyfikna"}.`, "Klubben");
    else if (fanDelta >= 3) pushNews(`Fansen är mycket nöjda med värvningen av ${player.name}.`, "Klubben");
    else if (fanDelta < 0) pushNews(`Fansen är skeptiska till värvningen av ${player.name} — dyrt för vad som levererades.`, "Klubben");
    showToast(`${player.name} skrev på för ${formatMoney(agreedPrice)} (${formatMoney(wage)}/omg i lön)!${installmentNote}`);
  }
  function finalizeScoutSignee(player, agreedPrice, agreedWage, details = {}) {
    if (!player) return;
    if (!transferWindowOpen(g.round)) { showToast("Transferfönstret är stängt just nu."); return; }
    const plan = details.paymentPlan || { upfrontAmount: agreedPrice, financedAmount: 0, months: 0 };
    const upfrontAmount = plan.upfrontAmount ?? agreedPrice;
    const financedAmount = plan.financedAmount ?? 0;
    const signOnBonus = details.signOnBonus || 0;
    const houseCarCost = details.houseCar ? 350 : 0;
    const totalCashNow = upfrontAmount + signOnBonus + houseCarCost;
    if (g.budget < totalCashNow) { showToast("Inte tillräcklig budget för direktkostnaden."); return; }
    if (g.boardConfidence < 40 && totalCashNow > g.budget * 0.4) { showToast("Styrelsen blockerar värvningen — för dyr given det svaga förtroendet just nu."); return; }
    const wage = agreedWage || player.wage;
    const cap = wageBudgetCap(g.reputation, g.clubs[g.userClubId].division, g.dev.sponsring);
    if (totalWageBill(g.squad) + wage > cap * 1.15) { showToast("Löneutrymmet räcker inte — Financial Fair Play stoppar värvningen."); return; }
    const fromClubName = player.clubId ? (g.clubs[player.clubId]?.name || "en annan klubb") : "fri agent";
    const isDerby = player.clubId && g.clubs[player.clubId]?.rivalId === g.userClubId;
    const fanDelta = fanSigningReaction(player, agreedPrice, isDerby, g.squad, userClub);
    const installmentNote = financedAmount > 0 ? ` Resten (${formatMoney(financedAmount)}) delbetalas över ${plan.months} månader.` : "";
    const sellOnPct = details.sellOnOffer || 0;
    const recalcPlan = financedAmount > 0 ? installmentPlan(financedAmount, plan.months) : null;
    const newInstallment = recalcPlan ? { id: uid(), playerName: player.name, monthsLeft: recalcPlan.months, monthlyPayment: recalcPlan.monthlyPayment, totalRemaining: recalcPlan.totalWithInterest } : null;
    const reluctant = (details.clubInterest ?? 100) < 55;
    const signedPlayer = { ...player, clubId: null, contractYears: rndInt(3, 5), wage, number: assignSquadNumber(g.squad), sellOnPct, sellOnClubName: sellOnPct > 0 ? fromClubName : null, releaseClause: details.releaseClauseOffer > 0 ? details.releaseClauseOffer : null, morale: reluctant ? clamp((player.morale ?? 70) - 15, 20, 100) : (player.morale ?? 70), reluctantSign: reluctant, joinedInfo: { text: reluctant ? `Värvades från ${fromClubName} för ${formatMoney(agreedPrice)} i säsong ${g.season}, efter att ha upptäckts av scouten — övertalades trots tveksamhet inför flytten.${installmentNote}` : `Värvades från ${fromClubName} för ${formatMoney(agreedPrice)} i säsong ${g.season}, efter att ha upptäckts av scouten.${installmentNote}` }, scoutReports: [{ season: g.season, comment: scoutComment(player), source: "scout" }] };
    setG(prev => ({
      ...prev, budget: prev.budget - totalCashNow, squad: [...prev.squad, signedPlayer], scoutMission: null, fanbase: clamp(prev.fanbase + fanDelta, 0, 100),
      transferInstallments: newInstallment ? [...(prev.transferInstallments || []), newInstallment] : (prev.transferInstallments || []),
      clubs: player.clubId && prev.clubs[player.clubId] ? { ...prev.clubs, [player.clubId]: { ...prev.clubs[player.clubId], squad: (prev.clubs[player.clubId].squad || []).filter(p => p.id !== player.id), youthSquad: (prev.clubs[player.clubId].youthSquad || []).filter(p => p.id !== player.id) } } : prev.clubs,
      worldPool: (player.region && prev.worldPool?.[player.region]) ? { ...prev.worldPool, [player.region]: prev.worldPool[player.region].filter(p => p.id !== player.id) } : prev.worldPool,
      market: (player.region && prev.market?.[player.region]) ? { ...prev.market, [player.region]: prev.market[player.region].filter(p => p.id !== player.id) } : prev.market,
      transferHistory: [{ id: uid(), season: prev.season, round: prev.round, playerId: player.id, playerName: player.name, playerPos: player.specificPosition, fromClubId: player.clubId || null, fromClubName, fromColor: player.clubId ? prev.clubs[player.clubId]?.color : null, toClubId: prev.userClubId, toClubName: userClub.name, toColor: userClub.color, fee: agreedPrice, leagueId: (player.clubId ? prev.clubs[player.clubId]?.league : null) || prev.leagueId }, ...(prev.transferHistory || [])].slice(0, 1000),
    }));
    if (isDerby) pushNews(`Historisk värvning — ${player.name} lämnar ärkerivalen ${fromClubName} för er! Fansen ${fanDelta >= 6 ? "jublar vilt" : "är kluvna men nyfikna"}.`, "Klubben");
    else if (fanDelta >= 3) pushNews(`Fansen är mycket nöjda med värvningen av ${player.name}.`, "Klubben");
    else if (fanDelta < 0) pushNews(`Fansen är skeptiska till värvningen av ${player.name} — dyrt för vad som levererades.`, "Klubben");
    showToast(`${player.name} skrev på för ${formatMoney(agreedPrice)} (${formatMoney(wage)}/omg i lön)!${installmentNote}`);
  }
  function respondIncomingOffer(offerId, action) {
    const offer = g.incomingOffers.find(o => o.id === offerId);
    if (!offer) return;
    if (action === "reject") {
      setG(prev => ({ ...prev, incomingOffers: prev.incomingOffers.filter(o => o.id !== offerId) }));
      showToast(`Budet från ${offer.buyerName} avvisades.`);
      return;
    }
    if (g.squad.length <= 11) { showToast("Du måste ha minst 11 spelare i truppen — kan inte sälja nu."); return; }
    if (action === "accept") {
      const soldPlayer = g.squad.find(p => p.id === offer.playerId);
      const sellOnCut = soldPlayer?.sellOnPct ? Math.round(offer.offer * soldPlayer.sellOnPct / 100) : 0;
      const net = offer.offer - sellOnCut;
      const fanDelta = soldPlayer ? fanSaleReaction(soldPlayer, offer.offer, g.squad, userClub) : 0;
      setG(prev => { const nextSquad = prev.squad.filter(p => p.id !== offer.playerId); return { ...prev, budget: prev.budget + net, squad: nextSquad, startingXI: prev.startingXI.filter(id => id !== offer.playerId), incomingOffers: prev.incomingOffers.filter(o => o.id !== offerId), fanbase: clamp(prev.fanbase + fanDelta, 0, 100), clubs: { ...prev.clubs, [prev.userClubId]: { ...prev.clubs[prev.userClubId], squad: nextSquad } }, transferHistory: [{ id: uid(), season: prev.season, round: prev.round, playerId: offer.playerId, playerName: offer.playerName, playerPos: soldPlayer?.specificPosition, fromClubId: prev.userClubId, fromClubName: userClub.name, fromColor: userClub.color, toClubId: offer.buyerId, toClubName: offer.buyerName, toColor: prev.clubs[offer.buyerId]?.color, fee: net, leagueId: prev.leagueId }, ...(prev.transferHistory || [])].slice(0, 1000) }; });
      if (fanDelta <= -3) pushNews(`Fansen är upprörda över försäljningen av ${offer.playerName} — en nyckelspelare lämnar klubben.`, "Klubben");
      else if (fanDelta >= 2) pushNews(`Fansen tycker affären med ${offer.buyerName} för ${offer.playerName} kändes rimlig.`, "Klubben");
      showToast(sellOnCut ? `${offer.playerName} såldes till ${offer.buyerName} för ${formatMoney(net)} (efter klausul till ${soldPlayer.sellOnClubName})!` : `${offer.playerName} såldes till ${offer.buyerName} för ${formatMoney(offer.offer)}!`);
      return;
    }
    // counter
    const higher = Math.round(offer.offer * 1.3);
    const accepted = Math.random() < clamp(0.35 + g.reputation / 300, 0.2, 0.6);
    if (accepted) {
      const soldPlayer2 = g.squad.find(p => p.id === offer.playerId);
      const fanDelta2 = soldPlayer2 ? fanSaleReaction(soldPlayer2, higher, g.squad, userClub) : 0;
      setG(prev => { const nextSquad = prev.squad.filter(p => p.id !== offer.playerId); return { ...prev, budget: prev.budget + higher, squad: nextSquad, startingXI: prev.startingXI.filter(id => id !== offer.playerId), incomingOffers: prev.incomingOffers.filter(o => o.id !== offerId), fanbase: clamp(prev.fanbase + fanDelta2, 0, 100), clubs: { ...prev.clubs, [prev.userClubId]: { ...prev.clubs[prev.userClubId], squad: nextSquad } }, transferHistory: [{ id: uid(), season: prev.season, round: prev.round, playerId: offer.playerId, playerName: offer.playerName, playerPos: soldPlayer2?.specificPosition, fromClubId: prev.userClubId, fromClubName: userClub.name, fromColor: userClub.color, toClubId: offer.buyerId, toClubName: offer.buyerName, toColor: prev.clubs[offer.buyerId]?.color, fee: higher, leagueId: prev.leagueId }, ...(prev.transferHistory || [])].slice(0, 1000) }; });
      if (fanDelta2 <= -3) pushNews(`Fansen är upprörda över försäljningen av ${offer.playerName} — en nyckelspelare lämnar klubben.`, "Klubben");
      else if (fanDelta2 >= 2) pushNews(`Fansen tycker affären med ${offer.buyerName} för ${offer.playerName} kändes rimlig.`, "Klubben");
      showToast(`${offer.buyerName} accepterade ${formatMoney(higher)} för ${offer.playerName}!`);
    } else {
      setG(prev => ({ ...prev, incomingOffers: prev.incomingOffers.filter(o => o.id !== offerId) }));
      showToast(`${offer.buyerName} drog sig ur förhandlingen.`);
    }
  }
  function sellPlayer(player) {
    if (player.loanWeeksLeft) { showToast(`${player.name} är bara på lån hos er — kan inte säljas.`); setConfirmSell(null); return; }
    if (!transferWindowOpen(g.round)) { showToast("Transferfönstret är stängt just nu."); setConfirmSell(null); return; }
    if (g.squad.length <= 11) { showToast("Du måste ha minst 11 spelare i truppen."); setConfirmSell(null); return; }
    const gross = Math.round(player.value * 0.7);
    const sellOnCut = player.sellOnPct ? Math.round(gross * player.sellOnPct / 100) : 0;
    const refund = gross - sellOnCut;
    const fanDelta = fanSaleReaction(player, gross, g.squad, userClub);
    setG(prev => { const nextSquad = prev.squad.filter(p => p.id !== player.id); return { ...prev, budget: prev.budget + refund, squad: nextSquad, startingXI: prev.startingXI.filter(id => id !== player.id), fanbase: clamp(prev.fanbase + fanDelta, 0, 100), clubs: { ...prev.clubs, [prev.userClubId]: { ...prev.clubs[prev.userClubId], squad: nextSquad } }, transferHistory: [{ id: uid(), season: prev.season, round: prev.round, playerId: player.id, playerName: player.name, playerPos: player.specificPosition, fromClubId: prev.userClubId, fromClubName: userClub.name, fromColor: userClub.color, toClubId: null, toClubName: "Okänd köpare", toColor: null, fee: refund, leagueId: prev.leagueId }, ...(prev.transferHistory || [])].slice(0, 1000) }; });
    setConfirmSell(null);
    if (fanDelta <= -3) pushNews(`Fansen är upprörda över försäljningen av ${player.name} — en nyckelspelare lämnar klubben.`, "Klubben");
    else if (fanDelta >= 2) pushNews(`Fansen tycker försäljningen av ${player.name} kändes rimlig.`, "Klubben");
    showToast(sellOnCut ? `${player.name} lämnade klubben (+${formatMoney(refund)}, efter att ${formatMoney(sellOnCut)} gått till ${player.sellOnClubName} enligt klausul).` : `${player.name} lämnade klubben (+${formatMoney(refund)}).`);
  }
  function hintForSale(playerId) {
    setG(prev => ({ ...prev, squad: prev.squad.map(p => p.id === playerId ? { ...p, hintedSaleRound: prev.round } : p) }));
    const player = g.squad.find(p => p.id === playerId);
    showToast(`Ni har diskret antytt att ${player?.name || "spelaren"} kan vara till salu. Det ökar chansen för bud den närmaste tiden — men garanterar ingenting.`);
  }
  function startPositionTraining(playerId, position) {
    setG(prev => ({ ...prev, squad: prev.squad.map(p => p.id === playerId ? { ...p, trainingTarget: { position, startedRound: prev.round } } : p) }));
    const player = g.squad.find(p => p.id === playerId);
    showToast(`${player?.name || "Spelaren"} tränar nu mot ${position} — passform och egenskaper förbättras gradvis, omgång för omgång.`);
  }
  function cancelPositionTraining(playerId) {
    setG(prev => ({ ...prev, squad: prev.squad.map(p => p.id === playerId ? { ...p, trainingTarget: null } : p) }));
  }
  function createNewVision(yearSpan, goalSpecs) {
    const vision = createClubVision(yearSpan, goalSpecs, g.season, g.division);
    setG(prev => ({ ...prev, manager: { ...prev.manager, visions: [...(prev.manager.visions || []), vision] } }));
    showToast(`Ny framtidsvision satt — mål till säsong ${vision.targetSeason}.`);
  }
  function pitchVisionToPlayer(playerId, visionId) {
    const player = g.squad.find(p => p.id === playerId);
    const vision = (g.manager.visions || []).find(v => v.id === visionId);
    if (!player || !vision) return;
    const chance = pitchVisionSuccessChance(player, g.manager, vision, g.reputation);
    const success = Math.random() < chance;
    setG(prev => {
      const newVisions = prev.manager.visions.map(v => v.id === visionId ? { ...v, pitches: { ...v.pitches, [playerId]: { believedSeason: prev.season, trust: success ? 65 : 0 } } } : v);
      const newSquad = success ? prev.squad.map(p => p.id === playerId ? { ...p, visionTrust: 65, morale: clamp(p.morale + 8, 0, 100) } : p) : prev.squad;
      return { ...prev, manager: { ...prev.manager, visions: newVisions }, squad: newSquad };
    });
    showToast(success
      ? `${player.name} tror på visionen — ni har byggt ett äkta förtroende. Men nu förväntar sig ${player.name.split(" ")[0]} att ni faktiskt levererar.`
      : `${player.name} köper inte visionen just nu. Ord räcker inte — ${player.name.split(" ")[0]} vill se bevis först.`);
    return success;
  }
  function toggleTransferListed(playerId) {
    const player = g.squad.find(p => p.id === playerId);
    if (!player) return;
    if (player.loanWeeksLeft) { showToast(`${player.name} är bara på lån hos er — kan inte transferlistas.`); return; }
    const nowListed = !player.transferListed;
    setG(prev => ({ ...prev, squad: prev.squad.map(p => p.id === playerId ? { ...p, transferListed: nowListed } : p) }));
    showToast(nowListed ? `${player.name} är nu transferlistad — andra klubbar kan höra av sig med bud.` : `${player.name} är borttagen från transferlistan.`);
  }
  function toggleLoanListed(playerId) {
    const player = g.squad.find(p => p.id === playerId);
    if (!player) return;
    if (player.loanWeeksLeft) { showToast(`${player.name} är bara på lån hos er — kan inte lånlistas.`); return; }
    const nowListed = !player.loanListed;
    setG(prev => ({ ...prev, squad: prev.squad.map(p => p.id === playerId ? { ...p, loanListed: nowListed } : p) }));
    showToast(nowListed ? `${player.name} är nu lånlistad — andra klubbar kan höra av sig om ett lån.` : `${player.name} är borttagen från lånlistan.`);
  }
  function respondLoanRequest(requestId, action) {
    const req = (g.loanRequests || []).find(r => r.id === requestId);
    if (!req) return;
    if (action === "decline") {
      setG(prev => ({ ...prev, loanRequests: (prev.loanRequests || []).filter(r => r.id !== requestId) }));
      showToast(`Tackade nej till lånförfrågan från ${req.borrowerName}.`);
      return;
    }
    const player = g.squad.find(p => p.id === req.playerId);
    if (!player) return;
    if (g.squad.length <= 11) { showToast("Du måste ha minst 11 spelare i truppen — kan inte låna ut nu."); return; }
    setG(prev => ({
      ...prev, squad: prev.squad.filter(p => p.id !== req.playerId), startingXI: prev.startingXI.filter(id => id !== req.playerId),
      outgoingLoans: [...(prev.outgoingLoans || []), { player, toClubName: req.borrowerName, seasonsLeft: 1 }],
      loanRequests: (prev.loanRequests || []).filter(r => r.id !== requestId),
    }));
    showToast(`${req.playerName} lånas ut till ${req.borrowerName} för säsongen.`);
  }
  function signPartnerClub(clubId) {
    const club = g.clubs[clubId];
    if (!club) return;
    setG(prev => ({ ...prev, partnerClubId: clubId }));
    pushNews(`${club.name} blir er nya samarbetsklubb — lån mellan er går nu snabbt och enkelt.`, "Klubben");
    showToast(`${club.name} är nu er samarbetsklubb!`);
  }
  function endPartnerClub() {
    const club = g.clubs[g.partnerClubId];
    setG(prev => ({ ...prev, partnerClubId: null }));
    showToast(`Samarbetet med ${club?.name || "klubben"} avslutades.`);
  }
  function instantLoanFromPartner(playerId, wageSharePct = 0) {
    const partner = g.clubs[g.partnerClubId];
    if (!partner) return;
    const player = partner.squad.find(p => p.id === playerId);
    if (!player) return;
    const loanedPlayer = { ...player, number: assignSquadNumber(g.squad), loanWeeksLeft: rndInt(14, 24), loanFromClubName: partner.name, loanWageSharePct: wageSharePct };
    setG(prev => ({
      ...prev, squad: [...prev.squad, loanedPlayer],
      clubs: { ...prev.clubs, [partner.id]: { ...partner, squad: partner.squad.filter(p => p.id !== playerId) } },
    }));
    showToast(wageSharePct === 0 ? `${player.name} ansluter direkt på lån från samarbetsklubben ${partner.name} — dom betalar hela lönen!` : `${player.name} ansluter direkt på lån från samarbetsklubben ${partner.name} — ni tar ${wageSharePct}% av lönen.`);
  }
  function instantLoanToPartner(playerId) {
    const partner = g.clubs[g.partnerClubId];
    if (!partner) return;
    const player = g.squad.find(p => p.id === playerId);
    if (!player) return;
    if (player.loanWeeksLeft) { showToast(`${player.name} är bara på lån hos er — kan inte skickas vidare.`); return; }
    if (g.squad.length <= 11) { showToast("Du måste ha minst 11 spelare i truppen."); return; }
    setG(prev => ({
      ...prev, squad: prev.squad.filter(p => p.id !== playerId), startingXI: prev.startingXI.filter(id => id !== playerId),
      outgoingLoans: [...(prev.outgoingLoans || []), { player, toClubName: partner.name, seasonsLeft: 1 }],
    }));
    showToast(`${player.name} skickas direkt på lån till samarbetsklubben ${partner.name} — ingen förhandling behövdes!`);
  }
  function sendPlayerOnLoan(playerId, toClubName) {
    const player = g.squad.find(p => p.id === playerId);
    if (!player) return;
    if (player.loanWeeksLeft) { showToast(`${player.name} är bara på lån hos er — kan inte lånas ut vidare.`); return; }
    if (!transferWindowOpen(g.round)) { showToast("Transferfönstret är stängt just nu."); return; }
    if (g.squad.length <= 11) { showToast("Du måste ha minst 11 spelare i truppen."); return; }
    setG(prev => ({
      ...prev, squad: prev.squad.filter(p => p.id !== playerId), startingXI: prev.startingXI.filter(id => id !== playerId),
      outgoingLoans: [...(prev.outgoingLoans || []), { player, toClubName, seasonsLeft: 1 }],
    }));
    showToast(`${player.name} skickas på lån till ${toClubName} för säsongen.`);
  }
  function acceptLoanOffer(offerId, wageSharePct = 100) {
    const offer = (g.loanOffers || []).find(o => o.id === offerId);
    if (!offer) return;
    if (!transferWindowOpen(g.round)) { showToast("Transferfönstret är stängt just nu."); return; }
    const loanedPlayer = { ...offer.player, number: assignSquadNumber(g.squad), loanWeeksLeft: offer.weeksLeft, loanFromClubName: offer.fromClubName, loanWageSharePct: wageSharePct };
    setG(prev => ({ ...prev, squad: [...prev.squad, loanedPlayer], loanOffers: (prev.loanOffers || []).filter(o => o.id !== offerId) }));
    showToast(wageSharePct >= 100 ? `${offer.player.name} ansluter på lån från ${offer.fromClubName} — ni betalar hela lönen.` : wageSharePct === 0 ? `${offer.player.name} ansluter på lån från ${offer.fromClubName} — ${offer.fromClubName} betalar hela lönen.` : `${offer.player.name} ansluter på lån från ${offer.fromClubName} — ni delar lönen (${wageSharePct}% på er).`);
  }
  function declineLoanOffer(offerId) {
    setG(prev => ({ ...prev, loanOffers: (prev.loanOffers || []).filter(o => o.id !== offerId) }));
  }
  function toggleStarter(id) {
    const has = g.startingXI.includes(id);
    const player = g.squad.find(p => p.id === id);
    if (!has && player?.injuryWeeks > 0) { showToast("Spelaren är skadad och kan inte spela."); return; }
    if (!has && g.startingXI.length >= 11) { showToast("Startelvan är redan full (11 spelare). Ta bort någon annan spelare först."); return; }
    setG(prev => ({ ...prev, startingXI: has ? prev.startingXI.filter(x => x !== id) : [...prev.startingXI, id] }));
  }
  function saveFormation(code, ids, cells) {
    setG(prev => ({ ...prev, formationCode: code, startingXI: ids, lineupCells: cells || null, formationFamiliarity: code === prev.formationCode ? prev.formationFamiliarity : Math.round((prev.formationFamiliarity || 0) * 0.3) }));
    showToast(`Startelva sparad (${code}).`);
  }
  function setSquadViewPrefs(prefs) {
    setG(prev => ({ ...prev, squadViewPrefs: prefs }));
  }
  function chatWithPlayer(playerId, approach) {
    const player = g.squad.find(p => p.id === playerId);
    if (!player) return 0;
    const delta = chatOutcome(approach, player.morale);
    setG(prev => ({ ...prev, squad: prev.squad.map(p => p.id === playerId ? { ...p, morale: clamp(p.morale + delta, 0, 100) } : p) }));
    return delta;
  }
  function respondPress(optionKey) {
    const report = g.lastMatchReport;
    if (!report) return;
    const options = pressConferenceOptions(report.result);
    const opt = options.find(o => o.key === optionKey);
    if (!opt) return;
    setG(prev => {
      let newSquad = prev.squad;
      // A more motivational manager gets more out of the same words: bigger morale lifts, smaller hits.
      const motivation = prev.manager?.attributes?.motivation ?? 50;
      const motivMult = 1 + clamp(motivation - 50, -30, 40) * 0.006;
      const effectiveMoraleDelta = opt.moraleDelta * (opt.moraleDelta > 0 ? motivMult : (2 - motivMult));
      if (opt.moraleTarget && report.ratings.length) {
        if (opt.moraleTarget === "all") {
          newSquad = prev.squad.map(p => p.apps > 0 ? { ...p, morale: clamp(p.morale + effectiveMoraleDelta, 0, 100) } : p);
        } else {
          const sorted = [...report.ratings].sort((a, b) => opt.moraleTarget === "best" ? b.rating - a.rating : a.rating - b.rating);
          const targetId = sorted[0]?.id;
          newSquad = prev.squad.map(p => p.id === targetId ? { ...p, morale: clamp(p.morale + effectiveMoraleDelta, 0, 100) } : p);
        }
      }
      return {
        ...prev, squad: newSquad,
        fanbase: clamp(prev.fanbase + opt.fanbaseDelta, 0, 100),
        reputation: clamp(prev.reputation + opt.reputationDelta, 0, 100),
        view: prev.pendingAfterResult === "cup" ? "cup" : "home", activeTab: "home",
      };
    });
  }
  function setTeamTalk(key) { setG(prev => ({ ...prev, teamTalk: key })); }
  function setTicketPrice(tier) { setG(prev => ({ ...prev, ticketPrice: tier })); }
  function setMerchandisePricing(tier) { setG(prev => ({ ...prev, merchandisePricing: tier })); }
  function restStars() {
    if (g.restedForMatch) return;
    const xi = getXI(g.squad, g.startingXI);
    const bench = g.squad.filter(p => !xi.some(x => x.id === p.id) && !p.injuryWeeks && !p.suspendedMatches && !p.internationalDuty);
    const restCount = Math.min(3, bench.length);
    if (restCount === 0) { showToast("Ingen ledig bänkspelare att rotera in."); return; }
    const toRest = [...xi].sort((a, b) => overallOf(b) - overallOf(a)).slice(0, restCount);
    const replacements = [...bench].sort((a, b) => {
      const aMatch = toRest.some(t => t.pos === a.pos) ? 0 : 1, bMatch = toRest.some(t => t.pos === b.pos) ? 0 : 1;
      return aMatch - bMatch || overallOf(b) - overallOf(a);
    }).slice(0, restCount);
    let newXi = g.startingXI.filter(id => !toRest.some(t => t.id === id));
    newXi = [...newXi, ...replacements.map(p => p.id)];
    setG(prev => ({ ...prev, startingXI: newXi, restedForMatch: true }));
    showToast(`${toRest.length} spelare vilas: ${toRest.map(p => p.name.split(" ")[0]).join(", ")}.`);
  }
  function setTacticalOption(dial, value) {
    setG(prev => ({ ...prev, tacticalSettings: { ...prev.tacticalSettings, [dial]: value } }));
  }
  function buyYouth(prospect) {
    if (!transferWindowOpen(g.round)) { showToast("Transferfönstret är stängt just nu."); return; }
    const discount = 1 - (g.scoutingParts.kontakter - 1) * 0.04;
    const price = Math.round(prospect.value * discount);
    if (g.budget < price) { showToast("Inte tillräcklig budget."); return; }
    if (g.youthSquad.length >= 8) { showToast("Akademin är full (max 8 spelare)."); return; }
    setG(prev => ({
      ...prev, budget: prev.budget - price, youthSquad: [...prev.youthSquad, prospect],
      youthMarket: prev.youthMarket.filter(p => p.id !== prospect.id).concat([generateYouthProspect(clamp(prev.dev.scouting + (prev.staff.scout?.level || 0) * 0.4, 1, 5), prev.akademiParts.intag)]),
    }));
    showToast(`${prospect.name} skrev på för akademin!`);
  }
  function sellYouth(prospect) {
    if (!transferWindowOpen(g.round)) { showToast("Transferfönstret är stängt just nu."); return; }
    const refund = Math.round(((prospect.attack + prospect.defense) / 2) * 4 + prospect.potential * 3);
    setG(prev => ({ ...prev, budget: prev.budget + refund, youthSquad: prev.youthSquad.filter(p => p.id !== prospect.id) }));
    showToast(`${prospect.name} såldes för ${formatMoney(refund)}.`);
  }
  function promoteYouth(prospect) {
    const overall = (prospect.attack + prospect.defense) / 2;
    if (overall < 58 || prospect.yearsInAcademy < 2) { showToast("Spelaren är inte redo för A-laget än."); return; }
    setG(prev => ({
      ...prev, youthSquad: prev.youthSquad.filter(p => p.id !== prospect.id),
      squad: [...prev.squad, { id: prospect.id, name: prospect.name, nationality: prospect.nationality, age: prospect.age, pos: prospect.pos, specificPosition: prospect.specificPosition || randomSpecificPosition(prospect.pos), attack: prospect.attack, defense: prospect.defense, endurance: prospect.endurance, determination: prospect.determination, value: Math.round(prospect.value * 1.3), wage: computeWage(Math.round(prospect.value * 1.3), prospect.attack, prospect.defense) * 0.6, contractYears: 3, injuryWeeks: 0, yellowCards: 0, suspendedMatches: 0, morale: 75, personality: pick(PERSONALITIES), apps: 0, goals: 0, assists: 0, seasonLog: [], ratingSum: 0, number: assignSquadNumber(prev.squad), academyProduct: true, promotedSeason: prev.season, joinedInfo: { text: `Fostrad i klubbens akademi, flyttades upp till A-laget säsong ${prev.season}.` } }],
    }));
    showToast(`${prospect.name} flyttas upp till A-laget!`);
  }
  function renewContract(playerId, negotiatedWage, includeClause) {
    setG(prev => {
      const player = prev.squad.find(p => p.id === playerId);
      if (!player) return prev;
      const demand = contractDemand(player);
      const newWage = negotiatedWage || wageDemand(player, prev.reputation, prev.budget);
      const releaseClause = includeClause ? Math.round(demand.newValue * 1.6) : null;
      return { ...prev, squad: prev.squad.map(p => p.id === playerId ? { ...p, contractYears: demand.years, value: demand.newValue, wage: newWage, releaseClause } : p) };
    });
    showToast(includeClause ? "Nytt kontrakt med utköpsklausul signerat!" : "Nytt kontrakt signerat!");
  }
  function requestFromOwner(type) {
    const owner = g.owner;
    const cooldownRoundsLeft = (g.ownerRequestCooldownRound || 0) - g.round;
    if (cooldownRoundsLeft > 0) { showToast(`${owner.name} vill inte bli tillfrågad igen så snart — vänta ${cooldownRoundsLeft} omgångar till.`); return; }
    const chance = ownerRequestChance(owner, type);
    const granted = Math.random() < chance;
    setG(prev => {
      const next = { ...prev, ownerRequestCooldownRound: prev.round + 6 };
      if (!granted) { next.owner = { ...prev.owner, patience: clamp(prev.owner.patience - rnd(4, 10), 0, 100) }; }
      if (granted && type === "budget") { const amount = Math.round(800 + owner.patience * 12); next.budget = prev.budget + amount; next._toast = `${owner.name} går med på er förfrågan: +${formatMoney(amount)} extra i transferbudget.`; }
      else if (granted && type === "patience") { next.boardConfidence = clamp(prev.boardConfidence + rnd(12, 22), 0, 100); next._toast = `${owner.name} pratar med styrelsen å era vägnar — förtroendet stiger.`; }
      else if (granted && type === "contract") { next.manager = { ...prev.manager, contractYears: prev.manager.contractYears + 1 }; next._toast = `${owner.name} går med på att förlänga ert avtal med ett år — nu ${next.manager.contractYears} år kvar.`; }
      else { next._toast = `${owner.name} avvisar förfrågan: "${pick(["Inte just nu.", "Vi behöver se mer först.", "Det är inte läge för det."])}"`; }
      return next;
    });
  }

  function respondTakeoverBid(action) {
    const bid = g.takeoverBid;
    if (!bid) return;
    if (action === "accept") {
      setG(prev => ({ ...prev, budget: prev.budget + bid.capitalBoost, owner: { name: bid.name, nationality: bid.nationality, type: bid.type === "storsatsare" ? "kravande" : "sparsam", patience: 65 }, takeoverBid: null }));
      showToast(`${bid.name} tog över klubben! +${formatMoney(bid.capitalBoost)} i kapital.`);
    } else {
      setG(prev => ({ ...prev, takeoverBid: null }));
      showToast(`Budet från ${bid.name} avvisades.`);
    }
  }
  function setDifficulty(key) {
    setG(prev => ({ ...prev, difficulty: key }));
    showToast(`Svårighetsgrad satt till ${(DIFFICULTY_SETTINGS[key] || DIFFICULTY_SETTINGS.normal).label}.`);
  }
  function setSetPieceTakers(next) {
    setG(prev => ({ ...prev, setPieceTakers: next }));
  }
  function scoutSpecificPlayer(playerId, region, clubId) {
    setG(prev => {
      if ((prev.pendingPlayerScouts || []).some(s => s.playerId === playerId)) return prev;
      const scoutLevel = prev.staff?.scout?.level || 0;
      const duration = Math.round(playerScoutDuration(scoutLevel));
      const dueRound = prev.round + duration;
      return { ...prev, pendingPlayerScouts: [...(prev.pendingPlayerScouts || []), { playerId, dueRound, region: region || null, clubId: clubId || null }] };
    });
    showToast(`Scouting av spelaren påbörjad — klart om ${Math.round(playerScoutDuration(g.staff?.scout?.level || 0))} omgångar.`);
  }
  function assessPlayer(playerId) {
    const player = g.squad.find(p => p.id === playerId);
    if (!player) return;
    const report = { season: g.season, comment: scoutComment(player), source: "assistant" };
    setG(prev => ({ ...prev, squad: prev.squad.map(p => p.id === playerId ? { ...p, scoutReports: [...(p.scoutReports || []), report] } : p) }));
    showToast(`Assisterande tränaren har lämnat ett nytt omdöme om ${player.name}.`);
  }
  function saveScoutProfile(profile) {
    setG(prev => ({ ...prev, savedScoutProfiles: [...(prev.savedScoutProfiles || []), { id: uid(), ...profile }] }));
    showToast(`Sökningen "${profile.name}" sparad.`);
  }
  function deleteScoutProfile(id) {
    setG(prev => ({ ...prev, savedScoutProfiles: (prev.savedScoutProfiles || []).filter(p => p.id !== id) }));
  }
  function respondManagerInterest(action) {
    const interest = g.manager?.interestedClub;
    if (!interest) return;
    if (action === "leverage") {
      const newWage = useInterestAsLeverage(g.manager.wage, g.manager.reputation);
      setG(prev => ({ ...prev, manager: { ...prev.manager, wage: newWage, interestedClub: null } }));
      showToast(`Styrelsen matchar intresset — ny lön: ${formatMoney(newWage)}/omg.`);
    } else {
      setG(prev => ({ ...prev, manager: { ...prev.manager, reputation: clamp(prev.manager.reputation + 2, 0, 100), interestedClub: null } }));
      showToast(`Du tackade artigt nej till ${interest.clubName}.`);
    }
  }
  function openJobMarket() {
    setG(prev => ({ ...prev, jobOffers: generateJobOffers(prev.manager.reputation, prev.clubs, prev.userClubId), jobMarketMandatory: false, view: "jobmarket" }));
  }
  function declineJobMarket() {
    setG(prev => ({ ...prev, jobOffers: null, view: prev.manager.contractYears <= 0 ? "managercontract" : "home" }));
  }
  function renewManagerContract(negotiatedWage) {
    setG(prev => ({ ...prev, manager: { ...prev.manager, wage: negotiatedWage, contractYears: rndInt(2, 4), interestedClub: null }, jobOffers: null, view: "home", activeTab: "home" }));
    pushNews(`Nytt tränarkontrakt skrivet på för ${formatMoney(negotiatedWage)}/omg.`, "Manager");
    showToast("Nytt kontrakt skrivet på — säsongen fortsätter.");
  }
  function takeOverClub(clubId, negotiatedWage) {
    setG(prev => {
      const targetClub = prev.clubs[clubId];
      const oldClubId = prev.userClubId;
      const arche = ARCHETYPES[targetClub.archetype];
      const division = targetClub.division;
      const divMult = { 1: 1, 2: 0.5, 3: 0.28 }[division];
      const devReduce = division - 1;
      const dev = {
        arena: Math.max(1, arche.startDev.arena - devReduce), akademi: Math.max(1, arche.startDev.akademi - devReduce),
        scouting: Math.max(1, arche.startDev.scouting - devReduce), sponsring: Math.max(1, arche.startDev.sponsring - devReduce),
      };
      const reputationForClub = clamp({ 1: 55, 2: 35, 3: 18 }[division] + arche.repAdj, 5, 92);
      const fanbase = clamp({ 1: 50, 2: 30, 3: 15 }[division] + arche.fanAdj, 5, 90);
      const budget = Math.round(CLUB_BUDGET_OVERRIDES[clubId] ?? (arche.startBudget * divMult));
      const userPoolIds = clubsInPool(targetClub.league, division, prev.clubs).map(c => c.id);
      const startSquad = (targetClub.squad || []).map(p => ({ ...p }));
      const closedStints = (prev.manager.stints || []).map((st, i, arr) => i === arr.length - 1 && st.endSeason == null ? { ...st, endSeason: prev.season } : st);
      const newStints = [...closedStints, { clubId, clubName: targetClub.name, startSeason: prev.season, endSeason: null, trophies: [] }];
      const newManager = { ...prev.manager, wage: negotiatedWage, contractYears: rndInt(2, 4), interestedClub: null, stints: newStints };
      const prestigeScore = (arche.tierMin + arche.tierMax) / 2 - (division - 1) * 8;
      const startPartLevel = (max) => clamp(prestigeScore >= 82 ? 3 : prestigeScore >= 70 ? 2 : 1, 1, max);
      // The old club carries on under a freshly appointed AI manager once you leave.
      const newClubs = { ...prev.clubs, [oldClubId]: { ...prev.clubs[oldClubId], manager: generateManager(prev.clubs[oldClubId].league) } };
      const rating = effectiveScoutRating(dev, reputationForClub);
      const existingPool = prev.worldPool || generateWorldPool();
      const dE = drawFromWorldPool(existingPool.europa, rating, 4);
      const dS = drawFromWorldPool(existingPool.sydamerika, rating, 2);
      const dA = drawFromWorldPool(existingPool.afrika, rating, 2);
      const dAs = drawFromWorldPool(existingPool.asien, rating, 2);
      const dN = drawFromWorldPool(existingPool.nordamerika, rating, 2);
      const market = { europa: dE.picks, sydamerika: dS.picks, afrika: dA.picks, asien: dAs.picks, nordamerika: dN.picks };
      const newWorldPool = { europa: dE.remaining, sydamerika: dS.remaining, afrika: dA.remaining, asien: dAs.remaining, nordamerika: dN.remaining };
      return {
        ...prev, userClubId: clubId, leagueId: targetClub.league, clubs: newClubs,
        squad: startSquad, startingXI: pickBestXI(startSquad).map(p => p.id), market, worldPool: newWorldPool,
        budget, dev, fanbase, reputation: reputationForClub,
        schedule: generateSchedule(userPoolIds), allSchedules: generateAllSchedules(newClubs),
        arenaStands: startArenaStands(targetClub, division), arenaFacilities: { restaurant: startPartLevel(3), shop: startPartLevel(3) },
        akademiParts: { tranare: startPartLevel(3), intag: startPartLevel(3) }, scoutingParts: { analys: startPartLevel(3), kontakter: startPartLevel(3) },
        sponsors: { main: null, stadium: null, local: null },
        staff: { assistant: null, physio: null, scout: null, gkCoach: null, analyst: null, fitnessCoach: null },
        boardConfidence: 60, boardCrisisWarned: false,
        owner: generateOwner(reputationForClub), takeoverBid: null, tourOffers: null, assistantManager: null,
        manager: newManager, jobOffers: null,
        youthSquad: (targetClub.youthSquad && targetClub.youthSquad.length ? targetClub.youthSquad : Array.from({ length: academyProspectCountForLevel(dev.akademi) }, () => generateYouthProspect(dev.akademi, 1, targetClub.league))).map(y => ({ ...y })),
        youthMarket: Array.from({ length: 6 }, () => generateYouthProspect(clamp(dev.scouting, 1, 5), 1)),
        formationCode: "4-4-2", tacticalSettings: { ...DEFAULT_TACTICAL_SETTINGS }, lineupCells: null,
        cups: { domestic: null, cup1: null, cup2: null }, activeCupType: null, qualifiedCupTypes: ["domestic"], season1Qualifiers: null,
        lastMatchReport: null, view: "home", activeTab: "home", pendingAfterResult: "home",
        loans: [], transferInstallments: [], installmentMonthKey: monthKeyFor(prev.season, prev.round),
        repHistory: [reputationForClub], fanHistory: [fanbase], incomingOffers: [], loanOffers: [],
        formationFamiliarity: 0, teamTalk: "neutral", captainId: null, clubGoodwill: {}, blacklistedPlayers: {},
        _toast: `Välkommen till ${targetClub.name}! Nytt uppdrag i ${LEAGUES.find(l => l.id === targetClub.league)?.name} Division ${division}.`,
      };
    });
    pushNews(`Ny start: du skriver på för ${g.clubs[clubId]?.name || "en ny klubb"}.`, "Manager");
  }
  function hireAssistantManager(offer) {
    setG(prev => ({ ...prev, assistantManager: { name: offer.name, nationality: offer.nationality, level: offer.level, wage: offer.wage } }));
    showToast(`${offer.name} är nu er assisterande manager!`);
  }
  function startTour(offer) {
    if (g.tourCompletedThisOffseason) { showToast("Ni har redan åkt på en försäsongsturné — bara en per försäsong är tillåten."); return; }
    if (g.budget < offer.cost) { showToast("Inte tillräcklig budget."); return; }
    const income = rndInt(offer.incomeMin, offer.incomeMax);
    const matches = simulateTourMatches(offer);
    const wins = matches.filter(m => m.us > m.them).length;
    let injuredName = null;
    let newSquad = g.squad;
    if (Math.random() < (offer.injuryRisk || 0)) {
      const candidates = g.squad.filter(p => !p.injuryWeeks);
      if (candidates.length) {
        const hurt = pick(candidates);
        const weeks = pick([1, 1, 2]);
        newSquad = g.squad.map(p => p.id === hurt.id ? { ...p, injuryWeeks: weeks } : p);
        injuredName = `${hurt.name} (${weeks} omg)`;
      }
    }
    setG(prev => ({ ...prev, squad: newSquad, budget: prev.budget - offer.cost + income, reputation: clamp(prev.reputation + offer.repBonus, 0, 100), tourOffers: null, tourCompletedThisOffseason: true, tourPrepBonus: offer.prepBonus || 0, lastTourResult: { name: offer.name, matches, income, cost: offer.cost, injuredName } }));
    pushNews(`${offer.name} avslutad: ${wins}/4 vinster på turnén, nettoresultat ${formatMoney(income - offer.cost)}.${injuredName ? ` ${injuredName.split(" (")[0]} ådrog sig en skada under resan.` : ""}`, "Klubben");
  }
  function openTourOffers() {
    if (g.tourCompletedThisOffseason) { showToast("Ni har redan åkt på en försäsongsturné denna försäsong."); return; }
    setG(prev => ({ ...prev, tourOffers: generateTourOffers(prev.reputation) }));
  }
  function upgradeDev(key) {
    const level = g.dev[key];
    if (level >= 5) return;
    const exponent = key === "scouting" ? 1.85 : 1.6;
    const base = { arena: 900, akademi: 600, scouting: 820, sponsring: 450 }[key];
    const cost = Math.round(base * Math.pow(level, exponent));
    if (g.budget < cost) { showToast("Inte tillräcklig budget."); return; }
    setG(prev => ({ ...prev, budget: prev.budget - cost, dev: { ...prev.dev, [key]: prev.dev[key] + 1 } }));
    const names = { arena: "Arenan", akademi: "Akademin", scouting: "Scoutnätverket", sponsring: "Sponsringen" };
    showToast(`${names[key]} uppgraderad!`);
  }
  function upgradePart(category, key) {
    const level = g[category][key];
    if (level >= PART_MAX[category]) return;
    const cost = partUpgradeCost(category, level);
    if (g.budget < cost) { showToast("Inte tillräcklig budget."); return; }
    setG(prev => ({ ...prev, budget: prev.budget - cost, [category]: { ...prev[category], [key]: prev[category][key] + 1 } }));
    showToast("Uppgraderat!");
  }
  function startArenaConstruction(stand) {
    if (g.arenaConstruction) { showToast("Det pågår redan en ombyggnad — vänta tills den är klar."); return; }
    const isArenaLevel = stand === "arena";
    const fromLevel = isArenaLevel ? g.dev.arena : g.arenaStands[stand];
    const max = isArenaLevel ? 5 : 5;
    if (fromLevel >= max) return;
    const toLevel = fromLevel + 1;
    const cost = isArenaLevel ? Math.round(900 * Math.pow(fromLevel, 1.6)) : partUpgradeCost("arenaStands", fromLevel);
    if (g.budget < cost) { showToast("Inte tillräcklig budget."); return; }
    const roundsTotal = arenaConstructionDuration(toLevel);
    setG(prev => ({ ...prev, budget: prev.budget - cost, arenaConstruction: { stand, fromLevel, toLevel, roundsTotal, roundsElapsed: 0, cost } }));
    const durationLabel = roundsTotal > 38 ? "över en säsong" : `ca ${roundsTotal} omgångar`;
    showToast(`Ombyggnad påbörjad — klar om ${durationLabel}.`);
  }
  function signSponsor(slot, offer) {
    setG(prev => {
      const current = prev.sponsors[slot];
      if (current && current.roundsRemaining > 0) { showToast(`${current.name} har fortfarande ${current.roundsRemaining} omgångar kvar på avtalet — det går inte att byta sponsor förrän det löper ut, eller genom att säga upp det i förtid.`); return prev; }
      return { ...prev, budget: prev.budget + offer.bonus, sponsors: { ...prev.sponsors, [slot]: { name: offer.name, income: offer.income, roundsRemaining: offer.contractLength, totalLength: offer.contractLength } }, customArenaName: slot === "stadium" ? null : prev.customArenaName };
    });
    showToast(`${offer.name} är nu er sponsor i ${offer.contractLength} omgångar! (+${formatMoney(offer.bonus)} signeringsbonus)`);
  }
  function terminateSponsor(slot) {
    setG(prev => {
      const current = prev.sponsors[slot];
      if (!current) return prev;
      // Breaking a live contract early costs real money — otherwise there'd be no reason contracts exist
      // at all. The penalty scales with how much of the deal is left, so bailing right after signing hurts
      // the most, while riding out a near-finished contract costs very little.
      const remainingRatio = current.roundsRemaining / (current.totalLength || current.roundsRemaining || 1);
      const penalty = Math.round(current.income * (current.totalLength || 20) * 0.35 * remainingRatio);
      if (prev.budget < penalty) { showToast(`Otillräcklig budget — det kostar ${formatMoney(penalty)} att säga upp avtalet med ${current.name} i förtid.`); return prev; }
      showToast(`Avtalet med ${current.name} sades upp i förtid för ${formatMoney(penalty)}.`);
      return { ...prev, budget: prev.budget - penalty, sponsors: { ...prev.sponsors, [slot]: null } };
    });
  }
  function nameOwnArena(name) {
    const trimmed = (name || "").trim();
    if (!trimmed) return;
    if (g.budget < 5000) { showToast("Otillräcklig budget — det kostar £5,0M att döpa arenan själva."); return; }
    if (g.sponsors.stadium && g.sponsors.stadium.roundsRemaining > 0) { showToast(`${g.sponsors.stadium.name} har fortfarande ${g.sponsors.stadium.roundsRemaining} omgångar kvar på avtalet — säg upp det i förtid (mot en avgift) innan ni döper arenan själva.`); return; }
    setG(prev => ({ ...prev, budget: prev.budget - 5000, customArenaName: trimmed, sponsors: { ...prev.sponsors, stadium: null } }));
    showToast(`Arenan heter nu ${trimmed}! Ni betalade £5,0M själva — ingen stadionsponsor längre.`);
  }
  function refreshStaffCandidates(current, newRound, homeCountry) {
    if (!current) return current;
    const next = { ...current };
    Object.keys(next).forEach(role => {
      if (next[role] && newRound >= next[role].nextRefreshRound) {
        next[role] = { list: generateStaffOffers(role, homeCountry), nextRefreshRound: newRound + rndInt(2, 4) };
      }
    });
    return next;
  }
  function openStaffCandidates(role) {
    setG(prev => {
      if (prev.staffCandidates?.[role]) return prev;
      const homeCountry = prev.clubs[prev.userClubId].league;
      return { ...prev, staffCandidates: { ...prev.staffCandidates, [role]: { list: generateStaffOffers(role, homeCountry), nextRefreshRound: prev.round + rndInt(2, 4) } } };
    });
  }
  function hireStaff(role, candidate) {
    let severanceMsg = "";
    setG(prev => {
      const current = prev.staff[role];
      const severance = current && (current.contractYears || 0) > 0 ? Math.round(current.wage * 15 * current.contractYears) : 0;
      if (severance > 0) severanceMsg = ` ${current.name} friställdes mot ${formatMoney(severance)} i avgångsvederlag.`;
      return {
        ...prev, budget: prev.budget - severance,
        staff: { ...prev.staff, [role]: { name: candidate.name, nationality: candidate.nationality, level: candidate.level, wage: candidate.wage, contractYears: rndInt(2, 4), satisfaction: 70 } },
        staffCandidates: { ...prev.staffCandidates, [role]: undefined },
      };
    });
    showToast(`${candidate.name} är nu er ${STAFF_ROLE_LABEL[role].toLowerCase()}!${severanceMsg}`);
  }
  function renegotiateStaffWage(role, accept) {
    const member = g.staff[role];
    if (!member) return;
    const fair = staffFairWage(member.level);
    setG(prev => ({ ...prev, staff: { ...prev.staff, [role]: { ...prev.staff[role], wage: accept ? fair : prev.staff[role].wage, needsRaise: false, satisfaction: accept ? clamp((prev.staff[role].satisfaction ?? 70) + 20, 0, 100) : prev.staff[role].satisfaction } } }));
    showToast(accept ? `${member.name} fick sin nya lön: ${formatMoney(fair)}/omg.` : `${member.name} accepterar att vänta, men trivseln kan påverkas över tid.`);
  }
  function takeLoan(offer) {
    if (g.loans.length >= 2) { showToast("Ni har redan max antal aktiva lån (2)."); return; }
    const installment = loanInstallment(offer);
    setG(prev => ({ ...prev, budget: prev.budget + offer.amount, loans: [...prev.loans, { id: offer.id, amount: offer.amount, installment, seasonsLeft: offer.years, totalSeasons: offer.years, rate: offer.rate }] }));
    showToast(`Lån på ${formatMoney(offer.amount)} beviljat! ${formatMoney(installment)} dras varje säsong i ${offer.years} år.`);
  }
  function setPlannedSub(outId, inId) {
    setG(prev => ({ ...prev, plannedSub: (outId && inId) ? { outId, inId } : null }));
  }
  function acknowledgeBoardCrisis() {
    setG(prev => ({ ...prev, view: "home", boardConfidence: 25 }));
  }
  function setSpelide(key) { setG(prev => ({ ...prev, spelide: key })); }
  function setCaptain(id) { setG(prev => ({ ...prev, captainId: prev.captainId === id ? null : id })); }
  function failNegotiation(player, club, severity) {
    setG(prev => {
      const goodwillDelta = severity === "rival" ? -6 : severity === "wage" ? -8 : -14;
      const cooldown = rndInt(8, 18);
      const turnNow = prev.season * 38 + prev.round;
      return {
        ...prev,
        clubGoodwill: club ? { ...prev.clubGoodwill, [club.id]: clamp((prev.clubGoodwill[club.id] ?? 50) + goodwillDelta, 0, 100) } : prev.clubGoodwill,
        blacklistedPlayers: { ...prev.blacklistedPlayers, [player.id]: turnNow + cooldown },
      };
    });
  }
  function saveClubName() {
    const name = nameDraft.trim() || userClub.name;
    setG(prev => ({ ...prev, clubs: { ...prev.clubs, [prev.userClubId]: { ...prev.clubs[prev.userClubId], name } } }));
    setEditingName(false);
  }
  function saveClubColor(hex) {
    setG(prev => ({ ...prev, clubs: { ...prev.clubs, [prev.userClubId]: { ...prev.clubs[prev.userClubId], color: hex } } }));
  }
  function saveClubSecondaryColor(hex) {
    setG(prev => ({ ...prev, clubs: { ...prev.clubs, [prev.userClubId]: { ...prev.clubs[prev.userClubId], secondaryColor: hex } } }));
  }
  function saveClubJerseyPattern(pattern) {
    setG(prev => ({ ...prev, clubs: { ...prev.clubs, [prev.userClubId]: { ...prev.clubs[prev.userClubId], jerseyPattern: pattern } } }));
  }

  function newSeason() {
    setG(prev => {
      const snapshot = prev.seasonEndSnapshot;
      const newClubs = { ...prev.clubs };
      const seasonAwards = computeSeasonAwards(prev.clubs, prev.userClubId, prev.squad, snapshot.worldStandings);
      let managerAwardRepBonus = 0;
      const userAwardWins = [];
      const applyPlayerAward = (award, isGlobal) => {
        if (!award || award.clubId !== prev.userClubId) return;
        userAwardWins.push({ ...award, isGlobal });
      };
      [seasonAwards.global.topScorer, seasonAwards.global.topPoints, seasonAwards.global.playerOfYear].forEach(a => applyPlayerAward(a, true));
      Object.values(seasonAwards.byDivision).forEach(d => [d.topScorer, d.topPoints, d.playerOfYear].forEach(a => applyPlayerAward(a, false)));
      if (seasonAwards.global.managerOfYear?.clubId === prev.userClubId) managerAwardRepBonus += 10;
      Object.values(seasonAwards.byDivision).forEach(d => { if (d.managerOfYear?.clubId === prev.userClubId) managerAwardRepBonus += 4; });
      let awardedSquad = prev.squad;
      if (userAwardWins.length) {
        const boostedIds = {};
        userAwardWins.forEach(w => { boostedIds[w.player.id] = (boostedIds[w.player.id] || 0) + (w.isGlobal ? 2 : 1); });
        awardedSquad = prev.squad.map(p => boostedIds[p.id] ? {
          ...p,
          value: Math.round(p.value * (1 + boostedIds[p.id] * 0.06)),
          morale: clamp((p.morale ?? 70) + boostedIds[p.id] * 8, 0, 100),
          careerAwards: [...(p.careerAwards || []), ...userAwardWins.filter(w => w.player.id === p.id).map(w => `${w.isGlobal ? "Global" : ""} S${prev.season}`)],
        } : p);
        userAwardWins.forEach(w => pushNews(`🏅 ${w.player.name} tilldelas en utmärkelse för säsong ${prev.season}!`, "Utmärkelse"));
      }
      if (managerAwardRepBonus > 0) pushNews(`🏅 Ni utses till Årets Manager för säsong ${prev.season}!`, "Utmärkelse");
      newClubs[prev.userClubId] = { ...newClubs[prev.userClubId], squad: awardedSquad };
      LEAGUES.forEach(country => {
        [1, 2, 3].forEach(div => {
          const standingsArr = snapshot.worldStandings[country.id][div];
          const n = standingsArr.length;
          standingsArr.forEach((s, idx) => {
            const c = newClubs[s.id];
            const arche = ARCHETYPES[c.archetype];
            const posFactor = ((n - (idx + 1)) / (n - 1) - 0.5) * 2.2;
            const delta = posFactor + arche.growth * rnd(-0.3, 0.9) + rnd(-0.25, 0.25);
            const resetSquad = c.squad.map(p => ({ ...p, goals: 0, assists: 0, apps: 0, seasonYellowCards: 0, seasonRedCards: 0 }));
            newClubs[s.id] = { ...c, strength: clamp(c.strength + delta, 20, 97), squad: resetSquad };
          });
        });
        const div1 = snapshot.worldStandings[country.id][1], div2 = snapshot.worldStandings[country.id][2], div3 = snapshot.worldStandings[country.id][3];
        div1.slice(-3).forEach(s => { newClubs[s.id] = { ...newClubs[s.id], division: 2 }; });
        div2.slice(0, 3).forEach(s => { newClubs[s.id] = { ...newClubs[s.id], division: 1 }; });
        div2.slice(-3).forEach(s => { newClubs[s.id] = { ...newClubs[s.id], division: 3 }; });
        div3.slice(0, 3).forEach(s => { newClubs[s.id] = { ...newClubs[s.id], division: 2 }; });
      });

      const s = prev.lastSeasonSummary;
      const oldDivision = s.division;
      const newDivision = newClubs[prev.userClubId].division;
      let promoMsg = null;
      let promotionBonus = 0;
      if (newDivision < oldDivision) {
        promotionBonus = newDivision === 1 ? 600 : newDivision === 2 ? 250 : 0;
        promoMsg = `${newClubs[prev.userClubId].name} flyttas upp till Division ${newDivision}! Avancemangsbonus: ${formatMoney(promotionBonus)}.`;
      }
      else if (newDivision > oldDivision) promoMsg = `${newClubs[prev.userClubId].name} flyttas ned till Division ${newDivision}.`;

      const seasonTrophies = [];
      if (s.pos === 1) seasonTrophies.push(`${divisionLabel(prev.leagueId, oldDivision)}-mästare — Säsong ${prev.season}`);
      if (s.domesticCupResult?.startsWith("Mästare")) seasonTrophies.push(`Inhemska cupen — Säsong ${prev.season}`);
      if (s.cup1Result?.startsWith("Mästare")) seasonTrophies.push(`Kimby Mästerskapet — Säsong ${prev.season}`);
      if (s.cup2Result?.startsWith("Mästare")) seasonTrophies.push(`Kimby Cupen — Säsong ${prev.season}`);
      const stintsWithTrophies = seasonTrophies.length
        ? (prev.manager.stints || []).map((st, i, arr) => i === arr.length - 1 && st.endSeason == null ? { ...st, trophies: [...st.trophies, ...seasonTrophies] } : st)
        : (prev.manager.stints || []);

      const oldDivisionSize = snapshot.worldStandings[prev.leagueId][oldDivision].length;
      const posRatio = 1 - (s.pos - 1) / (oldDivisionSize - 1);
      const cupBoost = (s.cup1Result?.startsWith("Mästare") ? 25 : s.cup1Result ? 8 : 0) + (s.cup2Result?.startsWith("Mästare") ? 12 : s.cup2Result ? 4 : 0) + (s.domesticCupResult?.startsWith("Mästare") ? 10 : 0);
      const divisionBase = { 1: 70, 2: 45, 3: 20 }[oldDivision];
      const repTarget = clamp(divisionBase * 0.4 + posRatio * 40 + cupBoost, 0, 100);
      const newReputation = prev.reputation + (repTarget - prev.reputation) * 0.15;
      const fanTarget = clamp(divisionBase * 0.5 + posRatio * 35 + cupBoost * 0.6, 0, 100);
      const newFanbase = prev.fanbase + (fanTarget - prev.fanbase) * 0.1;

      const boardDiffSettings = DIFFICULTY_SETTINGS[prev.difficulty] || DIFFICULTY_SETTINGS.normal;
      const financialCrisis = prev.budget < -3000;
      const financialPenalty = financialCrisis ? -rnd(8, 15) : 0;
      const boardDelta = (s.boardTargetMet ? rnd(8, 16) : -rnd(10, 20) * boardDiffSettings.boardMult) + cupBoost * 0.3 + financialPenalty;
      const newBoardConfidence = clamp((prev.boardConfidence ?? 60) + boardDelta, 0, 100);
      const boardMsg = s.boardTargetMet ? "Styrelsen är nöjd med säsongen." : `Styrelsen är missnöjd — målet var "${s.boardTargetLabel}".`;
      const boardCrisis = newBoardConfidence <= 15;
      if (promoMsg) pushNews(promoMsg, "Klubben");
      pushNews(`${boardMsg} Styrelsens förtroende: ${Math.round(prev.boardConfidence ?? 60)} → ${Math.round(newBoardConfidence)}.`, "Styrelse");
      if (financialCrisis) pushNews(`Styrelsen oroar sig allvarligt för klubbens ekonomi — budgeten ligger på ${formatMoney(prev.budget)}. Fortsätter det här kan det kosta er jobbet, oavsett sportsliga resultat.`, "Styrelse");
      const seasonRepDelta = newReputation - prev.reputation;
      const seasonFanDelta = newFanbase - prev.fanbase;
      if (Math.abs(seasonRepDelta) >= 2) pushNews(seasonRepDelta > 0 ? `Klubbens rykte stärks efter säsongen (${Math.round(prev.reputation)} → ${Math.round(newReputation)}).` : `Klubbens rykte dalar efter säsongen (${Math.round(prev.reputation)} → ${Math.round(newReputation)}).`, "Styrelse");
      if (Math.abs(seasonFanDelta) >= 2) pushNews(seasonFanDelta > 0 ? `Fanbasen växer efter säsongen (${Math.round(prev.fanbase)} → ${Math.round(newFanbase)}).` : `Fanbasen krymper efter säsongen (${Math.round(prev.fanbase)} → ${Math.round(newFanbase)}).`, "Klubben");
      const gotSacked = boardCrisis && prev.boardCrisisWarned;
      if (gotSacked) pushNews(`Styrelsen sparkade er som tränare efter upprepade missade mål.`, "Styrelse");
      const newBoardCrisisWarned = boardCrisis ? true : (newBoardConfidence > 40 ? false : prev.boardCrisisWarned);

      let newYouth = prev.youthSquad.map(y => growYouth(y, prev.dev.akademi, prev.spelide, prev.akademiParts.tranare));
      let academyMsg = null;
      const spawnChance = 0.12 + prev.dev.akademi * 0.05 + prev.akademiParts.intag * 0.02;
      if (Math.random() < spawnChance && newYouth.length < 8) {
        const prospect = generateYouthProspect(prev.dev.akademi, prev.akademiParts.intag, prev.leagueId);
        newYouth = [...newYouth, prospect];
        academyMsg = `Akademin har skrivit kontrakt med ${prospect.name}.`;
      }
      const aged = [];
      const departures = [];
      const totalRoundsLastSeason = prev.schedule.length;
      let clubRecords = { ...(prev.clubRecords || {}) };
      function checkClubRecords(p, thisSeasonRecord) {
        const seasonLog = [...(p.seasonLog || []), thisSeasonRecord];
        const careerGoals = seasonLog.reduce((s, r) => s + r.goals, 0);
        const careerAssists = seasonLog.reduce((s, r) => s + (r.assists || 0), 0);
        const careerApps = seasonLog.reduce((s, r) => s + r.apps, 0);
        if (!clubRecords.topScorer || careerGoals > clubRecords.topScorer.goals) clubRecords.topScorer = { name: p.name, goals: careerGoals };
        if (!clubRecords.topAssister || careerAssists > clubRecords.topAssister.assists) clubRecords.topAssister = { name: p.name, assists: careerAssists };
        if (!clubRecords.mostApps || careerApps > clubRecords.mostApps.apps) clubRecords.mostApps = { name: p.name, apps: careerApps };
        if (thisSeasonRecord.avgRating && (!clubRecords.bestSeason || thisSeasonRecord.avgRating > clubRecords.bestSeason.avgRating)) clubRecords.bestSeason = { name: p.name, season: thisSeasonRecord.season, avgRating: thisSeasonRecord.avgRating };
      }
      awardedSquad.forEach(p => {
        const age = p.age + 1;
        const seasonRecordForRecords = { season: prev.season, apps: p.apps, goals: p.goals, assists: p.assists || 0, avgRating: p.apps ? Math.round((p.ratingSum / p.apps) * 10) / 10 : null };
        checkClubRecords(p, seasonRecordForRecords);
        if (age >= 36) {
          const careerAppsTotal = (p.seasonLog || []).reduce((s, r) => s + (r.apps || 0), 0) + (p.apps || 0);
          const careerGoalsTotal = (p.seasonLog || []).reduce((s, r) => s + (r.goals || 0), 0) + (p.goals || 0);
          const isNotable = careerAppsTotal >= 60 || careerGoalsTotal >= 25 || overallOf(p) >= 72;
          if (isNotable) departures.push(`🏆 ${p.name} lägger av efter en lång karriär — ${careerAppsTotal} matcher och ${careerGoalsTotal} mål för klubben. Fansen hyllar en klubblegend på sin sista dag.`);
          else departures.push(`${p.name} har avslutat sin karriär.`);
          return;
        }
        const contractYears = p.contractYears - 1;
        if (contractYears <= 0) { departures.push(`${p.name} lämnade klubben som free agent.`); return; }
        let attack = p.attack, defense = p.defense;
        const utveckling = prev.manager?.attributes?.utveckling ?? 50;
        const devMult = 1 + clamp(utveckling - 50, -30, 40) * 0.008;
        if (age < 24) { const detMult = determinationMult(p); attack = clamp(attack + rnd(0.3, 1.2) * devMult * detMult, 15, 99); defense = clamp(defense + rnd(0.3, 1.2) * devMult * detMult, 15, 99); }
        else if (age >= 30) { const decline = (age - 29) * rnd(0.5, 1.1); attack = clamp(attack - decline, 15, 99); defense = clamp(defense - decline, 15, 99); }
        const playTimeRatio = p.apps / totalRoundsLastSeason;
        const outOfPosRatio = p.apps ? (p.outOfPositionApps || 0) / p.apps : 0;
        const outOfPosPenalty = p.personality === "Ambitiös" ? outOfPosRatio * 12 : 0;
        const moraleTarget = clamp(45 + playTimeRatio * 45 + (contractYears <= 1 ? -15 : 0) + (s.boardTargetMet ? 5 : -3) - outOfPosPenalty, 5, 95);
        const morale = clamp((p.morale ?? 70) + (moraleTarget - (p.morale ?? 70)) * 0.35, 5, 95);
        const seasonRecord = { season: prev.season, apps: p.apps, goals: p.goals, assists: p.assists || 0, avgRating: p.apps ? Math.round((p.ratingSum / p.apps) * 10) / 10 : null, attack: Math.round(p.attack), defense: Math.round(p.defense), wage: p.wage, value: p.value };
        const seasonLog = [...(p.seasonLog || []), seasonRecord];
        aged.push({ ...p, age, attack, defense, contractYears, morale, yellowCards: 0, apps: 0, goals: 0, assists: 0, seasonYellowCards: 0, seasonRedCards: 0, agentContactedThisSeason: false, outOfPositionApps: 0, ratingSum: 0, seasonLog });
      });
      let newSquad = aged;
      const returningLoanees = [];
      (prev.outgoingLoans || []).forEach(loan => {
        const p = loan.player;
        const growth = rnd(1, 4);
        const returned = { ...p, attack: clamp(p.attack + growth, 15, 99), defense: clamp(p.defense + growth * 0.7, 15, 99), age: p.age + 1, number: assignSquadNumber(newSquad) };
        returningLoanees.push(returned);
        newSquad = [...newSquad, returned];
      });
      const loanReturnMsg = returningLoanees.length ? `${returningLoanees.map(p => p.name).join(", ")} är tillbaka från lån och har utvecklats.` : null;
      const departedIds = new Set(prev.squad.filter(p => !newSquad.some(q => q.id === p.id)).map(p => p.id));
      const offSeasonFamiliarity = clamp((prev.formationFamiliarity || 0) * 0.25, 0, 100);

      newYouth = newYouth.map(y => ({ ...y, age: y.age + 1 }));
      const history = [...(prev.history || []), { season: prev.season, division: oldDivision, leagueName: s.leagueName, pos: s.pos, domesticCupResult: s.domesticCupResult, cup1Result: s.cup1Result, cup2Result: s.cup2Result, prizeTotal: s.prizeTotal, incomeTotal: prev.seasonIncomeTotal || 0, wageTotal: prev.seasonWageTotal || 0 }];
      const userPoolIds = clubsInPool(prev.leagueId, newDivision, newClubs).map(c => c.id);

      const loanPayment = prev.loans.reduce((sum, l) => sum + l.installment, 0);
      const newLoans = prev.loans.map(l => ({ ...l, seasonsLeft: l.seasonsLeft - 1 })).filter(l => l.seasonsLeft > 0);
      const loanMsg = loanPayment > 0 ? `Lånebetalning: -${formatMoney(loanPayment)}.` : null;

      const ownerEvent = ownerSeasonEvent(prev.owner, s.boardTargetMet, prev.budget);
      const newOwner = { ...prev.owner, patience: ownerEvent.newPatience };
      const ownerMsg = ownerEvent.message;
      if (ownerMsg) pushNews(ownerMsg, "Ägare");
      const newTakeoverBid = (!prev.takeoverBid && newOwner.patience >= 60 && Math.random() < 0.12) ? generateTakeoverBid(newReputation) : prev.takeoverBid;

      const trophyCount = (s.domesticCupResult?.startsWith("Mästare") ? 1 : 0) + (s.cup1Result?.startsWith("Mästare") ? 1 : 0) + (s.cup2Result?.startsWith("Mästare") ? 1 : 0);
      const mgGrowth = managerSeasonGrowth(prev.manager, s.boardTargetMet, trophyCount);
      let newManager = { ...prev.manager, reputation: mgGrowth.newReputation, attributes: mgGrowth.newAttributes, yearsAsManager: prev.manager.yearsAsManager + 1, contractYears: Math.max(0, prev.manager.contractYears - 1), stints: stintsWithTrophies };
      if (gotSacked) {
        newManager = { ...newManager, reputation: clamp(newManager.reputation - rnd(3, 8), 5, 99), stints: newManager.stints.map((st, i, arr) => i === arr.length - 1 && st.endSeason == null ? { ...st, endSeason: prev.season } : st) };
      }
      const mgrRepDelta = newManager.reputation - prev.manager.reputation;
      if (Math.abs(mgrRepDelta) >= 2) pushNews(mgrRepDelta > 0 ? `Ert rykte som tränare stärks (${Math.round(prev.manager.reputation)} → ${Math.round(newManager.reputation)}).` : `Ert rykte som tränare dalar (${Math.round(prev.manager.reputation)} → ${Math.round(newManager.reputation)}).`, "Manager");

      // --- Vision system: yearly judgment day. Every active vision gets checked against reality; player
      // faith drifts with the club's actual trajectory, and expired visions are resolved for good — with
      // real consequences for the manager's reputation, not just flavour text.
      const visionContext = { history, transferHistory: prev.transferHistory, squad: newSquad, season: prev.season, userClubId: prev.userClubId };
      let visionRepDelta = 0;
      const updatedVisions = (newManager.visions || []).map(vision => {
        if (vision.resolved) return vision;
        const progress = visionProgressSummary(vision, visionContext);
        const expired = prev.season >= vision.targetSeason;
        Object.keys(vision.pitches || {}).forEach(playerId => {
          const idx = newSquad.findIndex(p => p.id === playerId);
          if (idx === -1) return;
          const trustDelta = expired ? 0 : (progress.onTrack ? rnd(3, 8) : -rnd(5, 12));
          if (trustDelta !== 0) newSquad[idx] = { ...newSquad[idx], visionTrust: clamp((newSquad[idx].visionTrust || 0) + trustDelta, 0, 100) };
        });
        if (!expired) return { ...vision, goals: progress.goals };
        const success = progress.total > 0 && progress.achievedCount >= Math.ceil(progress.total * 0.6);
        visionRepDelta += success ? rnd(5, 9) : -rnd(6, 12);
        Object.keys(vision.pitches || {}).forEach(playerId => {
          const idx = newSquad.findIndex(p => p.id === playerId);
          if (idx === -1) return;
          newSquad[idx] = { ...newSquad[idx], visionTrust: success ? 90 : 5, morale: clamp((newSquad[idx].morale ?? 70) + (success ? 15 : -22), 0, 100) };
          if (!success) newSquad[idx].recentlyComplained = true;
        });
        pushNews(success
          ? `🎯 Framtidsvisionen från säsong ${vision.createdSeason} infriades! Förtroendet för er som tränare växer hos spelare, styrelse och supportrar.`
          : `💔 Framtidsvisionen från säsong ${vision.createdSeason} brast. Löftena höll inte — förtroendet tar stryk, både hos truppen och styrelsen.`, "Manager");
        return { ...vision, goals: progress.goals, resolved: true, success };
      });
      newManager = { ...newManager, visions: updatedVisions, reputation: clamp(newManager.reputation + visionRepDelta, 5, 99) };
      const visionFanbaseDelta = visionRepDelta > 0 ? 4 : visionRepDelta < 0 ? -6 : 0;
      let managerMsg = null;
      if (!newManager.interestedClub && newManager.reputation >= 45 && Math.random() < 0.18) {
        const interested = generateInterestedClub(newManager.reputation, newClubs, prev.userClubId);
        if (interested) { newManager = { ...newManager, interestedClub: interested }; managerMsg = `${interested.clubName} har visat intresse för dig som tränare — antyder en lön på ${formatMoney(interested.offeredWage)}/omg.`; }
      }
      if (managerMsg) pushNews(managerMsg, "Manager");

      // Staff can grow in ability over time; if their wage falls behind their new level, they'll ask for a raise.
      // Very unhappy, long-ignored staff can also quit outright.
      const newStaff = { ...prev.staff };
      const raiseRequests = [];
      const staffDepartures = [];
      Object.keys(newStaff).forEach(role => {
        const member = newStaff[role];
        if (!member) return;
        let updated = { ...member };
        if (updated.level < 5 && Math.random() < 0.16) updated.level += 1;
        const fair = staffFairWage(updated.level);
        const wasUnfair = updated.wage < fair * 0.85;
        updated.satisfaction = clamp((updated.satisfaction ?? 70) + (wasUnfair ? -16 : 4), 0, 100);
        updated.contractYears = Math.max(0, (updated.contractYears ?? 2) - 1);
        if (wasUnfair) { updated.needsRaise = true; raiseRequests.push(STAFF_ROLE_LABEL[role] || role); }
        if (updated.satisfaction <= 15 && Math.random() < 0.3) {
          staffDepartures.push(`${updated.name} (${STAFF_ROLE_LABEL[role] || role})`);
          newStaff[role] = null;
          return;
        }
        newStaff[role] = updated;
      });
      const staffMsg = [
        raiseRequests.length ? `${raiseRequests.join(", ")} vill omförhandla sin lön.` : null,
        staffDepartures.length ? `${staffDepartures.join(", ")} sa upp sig efter långvarigt missnöje.` : null,
      ].filter(Boolean).join(" ") || null;

      // Queue this season's cup competitions to be played interleaved with the new season's rounds,
      // instead of all at once in the gap between seasons.
      let newCup2ChampionId = prev.lastCup2ChampionId;
      const cupQueue = ["domestic"];
      if (s.division === 1 && s.pos <= 3) cupQueue.push("cup1");
      if (s.division === 1 && s.pos >= 5 && s.pos <= 6) cupQueue.push("cup2");
      if (!cupQueue.includes("cup2") && s.cup2Result == null && prev.seasonEndSnapshot) {
        // User's club won't play cup2 this cycle — resolve it instantly among the world's other clubs
        // so future qualifier seeding (who was cup2 champion last time) stays consistent.
        try {
          const { cup2 } = buildContinentalQualifiers(newClubs, prev.seasonEndSnapshot.worldStandings, prev.seasonEndSnapshot.otherCupWinners, prev.leagueId, s.domesticCupWinnerId, prev.lastCup2ChampionId);
          newCup2ChampionId = instantResolveKnockout(cup2, newClubs);
        } catch (e) { /* leave unchanged if data incomplete */ }
      }
      const cupMsg = cupQueue.length > 1 ? "Ni är kvalificerade för cupspel under säsongen — matcherna dyker upp löpande." : null;

      const departureMsg = departures.length ? `${departures.length} spelare lämnade truppen: ${departures.slice(0, 2).map(d => d.split(" ")[0]).join(", ")}${departures.length > 2 ? " m.fl." : ""}.` : null;
      const combinedToast = [promoMsg, academyMsg, departureMsg, boardMsg, loanMsg, loanReturnMsg, ownerMsg, managerMsg, cupMsg, staffMsg].filter(Boolean).join(" ");

      return {
        ...prev, season: prev.season + 1, round: 0, clubs: newClubs,
        schedule: generateSchedule(userPoolIds), allSchedules: generateAllSchedules(newClubs), squad: newSquad, youthSquad: newYouth,
        startingXI: prev.startingXI.filter(id => !departedIds.has(id)),
        reputation: newReputation, fanbase: clamp(newFanbase + visionFanbaseDelta, 0, 100), boardConfidence: newBoardConfidence, plannedSub: null,
        budget: prev.budget - loanPayment + ownerEvent.cashDelta + promotionBonus, loans: newLoans,
        owner: newOwner, takeoverBid: newTakeoverBid, tourOffers: null, manager: { ...newManager, reputation: clamp((newManager.reputation || 0) + managerAwardRepBonus, 0, 100) }, staff: newStaff, boardCrisisWarned: newBoardCrisisWarned,
        lastSeasonAwards: seasonAwards, userAwardWins, userManagerAwardBonus: managerAwardRepBonus, lastCrisisWasFinancial: financialCrisis,
        lastMatchReport: null, view: gotSacked ? "sacked" : boardCrisis ? "boardcrisis" : newManager.contractYears <= 0 ? "managercontract" : "seasonawards", activeTab: "home", pendingAfterResult: "home",
        jobOffers: gotSacked ? generateJobOffers(newManager.reputation, newClubs, prev.userClubId) : null,
        jobMarketMandatory: gotSacked,
        cups: { domestic: null, cup1: null, cup2: null }, activeCupType: null, qualifiedCupTypes: cupQueue, lastCup2ChampionId: newCup2ChampionId, outgoingLoans: [], formationFamiliarity: offSeasonFamiliarity, sillySeasonWeeksLeft: 4,
        seasonIncomeTotal: 0, seasonWageTotal: 0, clubRecords,
        seasonStaffImpact: { physio: 0, assistant: 0, analyst: 0, gkCoach: 0, fitnessCoach: 0 }, lastSeasonStaffImpact: prev.seasonStaffImpact,
        lastSeasonSummary: s, seasonEndSnapshot: prev.seasonEndSnapshot, history,
        _toast: (boardCrisis || gotSacked) ? null : (combinedToast || null),
      };
    });
  }
  function advanceSillySeasonWeek() {
    setG(prev => {
      let scoutMission = prev.scoutMission;
      let scoutToast = null;
      if (scoutMission && scoutMission.cancelling) {
        scoutMission = null;
        scoutToast = "Scouten är hemma igen.";
      } else if (scoutMission && !scoutMission.complete) {
        const roundsElapsed = scoutMission.roundsElapsed + 1;
        if (roundsElapsed >= scoutMission.roundsTotal) {
          const candidates = generateScoutCandidates(scoutMission, prev.staff.scout?.level || 0, prev.clubs, prev.clubs[prev.userClubId].division, prev.userClubId, prev.reputation, null, prev.worldPool);
          scoutMission = { ...scoutMission, roundsElapsed, complete: true, results: candidates };
          scoutToast = candidates.length ? `Scoutuppdraget är klart — ${candidates.length > 1 ? candidates.length + " spelare hittades" : candidates[0].name + " har hittats"}.` : "Scoutuppdraget är klart, men ingen spelare matchade kriterierna.";
        } else {
          scoutMission = { ...scoutMission, roundsElapsed };
        }
      }
      let arenaConstruction = prev.arenaConstruction;
      let arenaStands = prev.arenaStands, devArena = prev.dev.arena;
      let constructionToast = null;
      if (arenaConstruction) {
        const roundsElapsed = arenaConstruction.roundsElapsed + 1;
        if (roundsElapsed >= arenaConstruction.roundsTotal) {
          if (arenaConstruction.stand === "arena") devArena = arenaConstruction.toLevel;
          else arenaStands = { ...arenaStands, [arenaConstruction.stand]: arenaConstruction.toLevel };
          constructionToast = arenaConstruction.stand === "arena" ? "Arenans allmänna standard är nu uppgraderad!" : `${STAND_NAMES[arenaConstruction.stand]} är klar och öppen för publik!`;
          arenaConstruction = null;
        } else {
          arenaConstruction = { ...arenaConstruction, roundsElapsed };
        }
      }
      const weeksLeft = prev.sillySeasonWeeksLeft - 1;
      return {
        ...prev, sillySeasonWeeksLeft: weeksLeft, scoutMission, arenaConstruction, arenaStands, dev: { ...prev.dev, arena: devArena },
        _toast: [scoutToast, constructionToast].filter(Boolean).join(" ") || null,
      };
    });
  }
  function finishSillySeason() {
    setG(prev => {
      let newSquad = prev.squad;
      const friendlyXI = new Set(prev.startingXI.filter(id => newSquad.some(p => p.id === id)));
      const tourBoost = prev.tourCompletedThisOffseason ? 1 + (prev.tourPrepBonus || 3) / 10 : 1;
      const developedNames = [];
      if (friendlyXI.size >= 7) {
        newSquad = newSquad.map(p => {
          if (!friendlyXI.has(p.id)) return p;
          const moraleFactor = p.morale >= 70 ? 1 : p.morale >= 50 ? 0.55 : 0;
          if (moraleFactor === 0) return p;
          const boost = rnd(0.3, 1.0) * moraleFactor * tourBoost;
          developedNames.push(p.name.split(" ")[0]);
          return { ...p, attack: clamp(p.attack + boost, 15, 99), defense: clamp(p.defense + boost * 0.7, 15, 99) };
        });
      }
      const preSeasonFamiliarity = clamp((prev.formationFamiliarity || 0) + 4 * (9 + (prev.tourCompletedThisOffseason ? (prev.tourPrepBonus || 3) : 0)), 0, 100);
      const preSeasonMsg = friendlyXI.size >= 7 ? `Försäsongen (4 träningsmatcher) är avklarad — laget går in i säsongen med ${Math.round(preSeasonFamiliarity)}% taktisk vana${developedNames.length ? `, och ${developedNames.slice(0, 3).join(", ")}${developedNames.length > 3 ? " m.fl." : ""} utvecklades av speltiden ihop` : ""}.` : null;
      return { ...prev, squad: newSquad, formationFamiliarity: preSeasonFamiliarity, sillySeasonWeeksLeft: 0, tourCompletedThisOffseason: false, tourPrepBonus: 0, _toast: preSeasonMsg };
    });
  }

  const NAV_TABS = [
    { key: "news", label: "Nyheter", emoji: "🔔" }, { key: "home", label: "Hem", emoji: "🏠" }, { key: "squad", label: "Trupp", emoji: "👥" },
    { key: "table", label: "Tabell", emoji: "🏆" }, { key: "fixtures", label: "Matcher", emoji: "📅", groupEnd: true },
    { key: "transfers", label: "Övergångar", emoji: "🔁" }, { key: "club", label: "Klubb", emoji: "🏢" },
    { key: "ekonomi", label: "Ekonomi", emoji: "🏛️" }, { key: "personal", label: "Personal", emoji: "🧑‍💼" },
  ];

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500;600&display=swap');
        html, body, #root { height: 100%; margin: 0; }
        .font-display { font-family: 'Fraunces', 'Inter', serif; font-weight: 700; letter-spacing: -0.005em; }
        .font-mono { font-family: 'IBM Plex Mono', monospace; }
        .pitch-lines { background-image: repeating-linear-gradient(90deg, rgba(255,255,255,0.035) 0px, rgba(255,255,255,0.035) 1px, transparent 1px, transparent 46px); }
        .ticket { position: relative; }
        .ticket::before, .ticket::after { content: ""; position: absolute; width: 22px; height: 22px; border-radius: 999px; background: ${C.turfDeep}; top: 50%; transform: translateY(-50%); }
        .ticket::before { left: -11px; } .ticket::after { right: -11px; }
        .tabbtn { transition: color .15s ease, background .15s ease, transform .1s ease; }
        .tabbtn:active { transform: scale(0.94); }
        @keyframes riseIn { from { opacity:0; transform: translateY(14px); } to { opacity:1; transform: translateY(0); } }
        @keyframes selectPulse { 0%, 100% { box-shadow: 0 0 0 0 rgba(217,169,75,0.55); } 50% { box-shadow: 0 0 0 6px rgba(217,169,75,0); } }
        @keyframes targetPulse { 0%, 100% { opacity: 0.55; } 50% { opacity: 1; } }
        .rise-in { animation: riseIn .35s ease; }
        @keyframes confettiFall { 0% { transform: translateY(0) rotate(0deg); opacity: 1; } 100% { transform: translateY(240px) rotate(340deg); opacity: 0; } }
        @keyframes pulseCta { 0%, 100% { box-shadow: 0 0 0 0 rgba(201,154,62,0.45); } 50% { box-shadow: 0 0 0 8px rgba(201,154,62,0); } }
        @keyframes constructionScroll { from { background-position: 0 0; } to { background-position: 32px 0; } }
        @keyframes craneSway { 0%, 100% { transform: rotate(-4deg); } 50% { transform: rotate(4deg); } }
        @keyframes craneBlink { 0%, 100% { opacity: 1; } 50% { opacity: 0.25; } }
        .pulse-cta { animation: pulseCta 2.2s ease-in-out infinite; }
        .notif-dot { position: absolute; top: 4px; right: 14px; width: 8px; height: 8px; border-radius: 999px; background: #D9534F; border: 1.5px solid ${C.turfDeep}; }
        .badge-count { position: absolute; top: 1px; right: 10px; min-width: 14px; height: 14px; padding: 0 3px; border-radius: 999px; background: #D9534F; border: 1.5px solid ${C.turfDeep}; font-size: 8px; font-weight: 700; display: flex; align-items: center; justify-content: center; color: #fff; line-height: 1; }
        .text-9 { font-size: 9px; line-height: 1.3; }
        .text-10 { font-size: 10px; line-height: 1.35; }
        .text-11 { font-size: 11px; line-height: 1.4; }
        .tracking-15 { letter-spacing: 0.15em; }
        .tracking-20 { letter-spacing: 0.2em; }
        .max-h-70 { max-height: 70vh; }
        .player-row:active { opacity: 0.7; }
        ::-webkit-scrollbar { display: none; }
        .app-shell { display: flex; }
        .portrait-blocker { display: none; }
        @media (orientation: portrait) {
          .app-shell { display: none !important; }
          .portrait-blocker { display: flex !important; }
        }
      `}</style>

      <div className="portrait-blocker" style={{ position: "fixed", inset: 0, background: C.turfDeep, color: C.paper, flexDirection: "column", alignItems: "center", justifyContent: "center", zIndex: 9999, textAlign: "center", padding: 24 }}>
        <RotateCw size={40} color={C.gold} style={{ marginBottom: 16 }} />
        <div className="font-display text-xl" style={{ color: C.goldSoft }}>ROTERA TELEFONEN</div>
        <div className="text-sm mt-2" style={{ color: C.paperDim, maxWidth: 260 }}>Tränarbänken är gjort för liggande läge — vrid din telefon för bästa upplevelse.</div>
      </div>

      <div className="app-shell" style={{ height: "100vh", width: "100vw", background: C.turfDeep, fontFamily: "'Inter', system-ui, sans-serif", color: C.paper, overflow: "hidden" }}>
        <div style={{ width: 92, flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 0, paddingBottom: 10, borderRight: `1px solid ${C.turfLine}`, background: C.turfDeep, overflowY: "auto" }}>
          <div style={{ position: "sticky", top: 0, zIndex: 6, background: C.turfDeep, width: "100%", display: "flex", justifyContent: "center", paddingTop: 14, paddingBottom: 10 }}>
            <button onClick={() => setEditingColor(v => !v)} className="w-10 h-10 shrink-0" style={{ position: "relative" }} title="Byt klubbfärg">
              <ClubJersey club={userClub} size={40} />
              <span style={{ position: "absolute", bottom: -2, right: -2, width: 14, height: 14, borderRadius: "50%", background: C.turfDeep, border: `1px solid ${C.gold}`, display: "flex", alignItems: "center", justifyContent: "center" }}><Pencil size={7} color={C.goldSoft} /></span>
            </button>
          </div>
          {NAV_TABS.map(({ key, label, emoji, groupEnd }) => {
            const active = g.activeTab === key && !["result", "cup", "press", "trophies", "manager", "matchprep", "livematch", "boardcrisis"].includes(g.view);
            const notifCount = NAV_NOTIFS[key] || 0;
            return (
              <React.Fragment key={key}>
                <button onClick={() => { setG(prev => ({ ...prev, activeTab: key, view: "tab" })); if (key === "news") markNewsRead(); }} className="tabbtn flex flex-col items-center gap-1 py-2.5 w-full"
                  style={{ background: active ? "rgba(201,154,62,0.14)" : "transparent", position: "relative", borderLeft: active ? `3px solid ${C.gold}` : "3px solid transparent" }}>
                  {notifCount > 0 && (notifCount > 1 ? <div className="badge-count">{notifCount > 9 ? "9+" : notifCount}</div> : <div className="notif-dot" />)}
                  <span style={{ fontSize: 18, lineHeight: 1, filter: active ? "none" : "grayscale(35%) opacity(0.85)" }}>{emoji}</span>
                  <span className="text-9" style={{ color: active ? C.goldSoft : C.paperDim, fontWeight: active ? 600 : 400 }}>{label}</span>
                </button>
                {groupEnd && <div style={{ width: "60%", height: 1, background: "rgba(255,255,255,0.08)", margin: "4px 0" }} />}
              </React.Fragment>
            );
          })}
          <div style={{ flex: 1 }} />
          <button onClick={() => setG(prev => ({ ...prev, view: "manager" }))} className="tabbtn flex flex-col items-center gap-1 py-2.5 w-full" style={{ position: "relative" }}>
            {g.manager?.interestedClub && <div className="notif-dot" />}
            <PlayerAvatar player={{ id: g.manager?.name, age: 40 + (g.manager?.yearsAsManager || 0) }} size={19} />
            <span className="text-9" style={{ color: C.paperDim }}>Manager</span>
          </button>
          <button onClick={() => setG(prev => ({ ...prev, view: "trophies" }))} className="tabbtn flex flex-col items-center gap-1 py-2.5 w-full">
            <span style={{ fontSize: 17, lineHeight: 1, filter: "grayscale(35%) opacity(0.85)" }}>🎖️</span>
            <span className="text-9" style={{ color: C.paperDim }}>Meriter</span>
          </button>
          <button onClick={goToSaveSelect} className="tabbtn flex flex-col items-center gap-1 py-2.5 w-full">
            <span style={{ fontSize: 17, lineHeight: 1, filter: "grayscale(35%) opacity(0.85)" }}>🗂️</span>
            <span className="text-9" style={{ color: C.paperDim }}>Karriärer</span>
          </button>
        </div>

        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, overflow: "hidden" }}>
          <div className="pitch-lines" style={{ background: `linear-gradient(180deg, ${C.turf}, ${C.turfDeep})`, borderBottom: `2px solid ${C.gold}`, flexShrink: 0 }}>
            <div style={{ padding: "10px 20px" }} className="flex items-center gap-3">
              <div className="flex-1 min-w-0">
                {editingName ? (
                  <div className="flex items-center gap-1.5">
                    <input value={nameDraft} onChange={e => setNameDraft(e.target.value)} className="bg-transparent border-b text-base font-semibold outline-none" style={{ borderColor: C.gold, color: C.paper, maxWidth: 220 }} maxLength={24} />
                    <button onClick={saveClubName} className="p-1"><Check size={15} color={C.goldSoft} /></button>
                    <button onClick={() => { setEditingName(false); setNameDraft(userClub.name); }} className="p-1"><X size={15} color={C.paperDim} /></button>
                  </div>
                ) : (
                  <button onClick={() => setEditingName(true)} className="flex items-center gap-1.5 text-left">
                    <span className="text-base font-semibold truncate">{userClub.name}</span>
                    <Pencil size={12} color={C.paperDim} />
                  </button>
                )}
                <div className="font-mono text-10 mt-0.5" style={{ color: C.paperDim }}>
                  {countryName} · D{userClub.division} · {seasonLabel(g.season)} · {seasonOver ? "Säsongen avslutad" : `Omg ${g.round + 1}/${totalRounds} · ${formatGameDateShort(roundDate(g.season, g.round))}`} · Plats {userPos || "–"}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="font-mono text-sm font-semibold" style={{ color: g.budget < 0 ? "#E88B85" : C.goldSoft }}><AnimatedNumber value={g.budget} format={formatMoney} /></div>
                <div className="text-9 uppercase tracking-wide" style={{ color: C.paperDim }}>Budget</div>
              </div>
              <button onClick={toggleFullscreen} className="shrink-0 p-1.5 rounded-lg ml-1" style={{ background: "rgba(255,255,255,0.08)" }} title="Helskärm">
                {isFullscreen ? <Minimize size={15} color={C.paperDim} /> : <Maximize size={15} color={C.paperDim} />}
              </button>
            </div>
            {editingColor && (
              <div style={{ padding: "0 20px 12px" }}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="text-9 uppercase tracking-wide" style={{ color: C.paperDim }}>Välj klubbfärg (primär)</div>
                  <button onClick={() => setEditingColor(false)} className="text-9 font-semibold px-2 py-0.5 rounded-lg" style={{ background: "rgba(255,255,255,0.1)", color: C.paper }}>Klar</button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {COLOR_POOL.map(hex => (
                    <button key={hex} onClick={() => saveClubColor(hex)} style={{ width: 24, height: 24, borderRadius: "50%", background: hex, border: hex === userClub.color ? `2px solid ${C.gold}` : "2px solid transparent" }} />
                  ))}
                  <label style={{ width: 24, height: 24, borderRadius: "50%", border: `1px dashed ${C.paperDim}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", position: "relative", overflow: "hidden" }}>
                    <Pencil size={10} color={C.paperDim} />
                    <input type="color" value={userClub.color} onChange={e => saveClubColor(e.target.value)} style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer" }} />
                  </label>
                </div>
                <div className="text-9 uppercase tracking-wide mb-1.5 mt-3" style={{ color: C.paperDim }}>Sekundärfärg</div>
                <div className="flex flex-wrap gap-2">
                  {COLOR_POOL.map(hex => (
                    <button key={hex} onClick={() => saveClubSecondaryColor(hex)} style={{ width: 24, height: 24, borderRadius: "50%", background: hex, border: hex === userClub.secondaryColor ? `2px solid ${C.gold}` : "2px solid transparent" }} />
                  ))}
                  <label style={{ width: 24, height: 24, borderRadius: "50%", border: `1px dashed ${C.paperDim}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", position: "relative", overflow: "hidden" }}>
                    <Pencil size={10} color={C.paperDim} />
                    <input type="color" value={userClub.secondaryColor || "#ffffff"} onChange={e => saveClubSecondaryColor(e.target.value)} style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer" }} />
                  </label>
                </div>
                <div className="text-9 uppercase tracking-wide mb-1.5 mt-3" style={{ color: C.paperDim }}>Tröjmönster</div>
                <div className="flex flex-wrap gap-1.5">
                  {[["solid", "Enfärgad"], ["stripes", "Ränder"], ["hoops", "Ringar"], ["halves", "Delad"]].map(([key, label]) => (
                    <button key={key} onClick={() => saveClubJerseyPattern(key)} className="px-2.5 py-1 rounded-lg text-9 font-semibold" style={key === (userClub.jerseyPattern || "solid") ? { background: C.gold, color: C.turfDeep } : { background: "rgba(255,255,255,0.1)", color: C.paper }}>{label}</button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div ref={mainScrollRef} style={{ flex: 1, overflowY: "auto", overflowX: "hidden", padding: "14px 20px 24px" }}>
            <div style={{ maxWidth: "min(94vw, 1040px)", margin: "0 auto" }}>
              {toast && <div className="rise-in mb-3 text-sm px-3 py-2 rounded-lg" style={{ background: "rgba(201,154,62,0.18)", border: `1px solid ${C.gold}`, color: C.goldSoft }}>{toast}</div>}

              {g.view === "boardcrisis" ? (
                <BoardCrisisView clubName={userClub.name} financialCrisis={g.lastCrisisWasFinancial} onAcknowledge={acknowledgeBoardCrisis} />
              ) : g.view === "penaltyshootout" ? (
                <PenaltyShootoutView shootout={g.pendingShootout} userClub={userClub} oppClub={g.clubs[g.pendingShootout?.oppId]} onComplete={() => {
                  if (g.pendingShootout?.resumeCupLeg) continueCupLeg(g.pendingShootout);
                  else setG(prev => ({ ...prev, view: prev.pendingShootout?.targetView || "home", pendingShootout: null }));
                }} />
              ) : g.view === "seasonawards" ? (
                <SeasonAwardsView awards={g.lastSeasonAwards} userClubId={g.userClubId} userAwardWins={g.userAwardWins} userManagerAwardBonus={g.userManagerAwardBonus} onContinue={() => setG(prev => ({ ...prev, view: "home" }))} />
              ) : g.view === "sacked" ? (
                <SackedView clubName={userClub.name} financialCrisis={g.lastCrisisWasFinancial} onSeeJobs={() => setG(prev => ({ ...prev, view: "jobmarket" }))} />
              ) : g.view === "managercontract" ? (
                <ManagerContractDecisionView g={g} userClub={userClub} onRenew={renewManagerContract} onSeeJobs={openJobMarket} />
              ) : g.view === "jobmarket" ? (
                <JobMarketView g={g} onTakeJob={takeOverClub} onBack={g.jobMarketMandatory ? null : declineJobMarket} />
              ) : g.view === "livematch" && g.pendingRound ? (
                <LiveMatchView pending={g.pendingRound} userClub={userClub} oppClub={g.clubs[g.pendingRound.oppId]} squad={g.squad}
                  tactic={g.tactic} spelide={g.spelide} tacticalSettings={g.tacticalSettings} lineupCells={g.lineupCells} staff={g.staff}
                  formationFamiliarity={g.formationFamiliarity} teamTalk={g.teamTalk}
                  onFinalize={(secondHalfXiIds, subText, userGoals, oppGoals, note, scoredByIds) => {
                    const ctxType = g.pendingCupContext?.type;
                    if (ctxType === "domesticRound") finalizeDomesticCupRound(secondHalfXiIds, subText, userGoals, oppGoals, scoredByIds);
                    else if (ctxType === "groupMatch") finalizeGroupMatch(secondHalfXiIds, subText, userGoals, oppGoals, scoredByIds);
                    else if (ctxType === "leg") finalizeCupLeg(secondHalfXiIds, subText, userGoals, oppGoals, scoredByIds);
                    else if (ctxType === "final") finalizeCupFinal(secondHalfXiIds, subText, userGoals, oppGoals, scoredByIds);
                    else finalizeMatch(g.pendingRound, secondHalfXiIds, subText, userGoals, oppGoals, note, scoredByIds);
                  }} />
              ) : g.view === "result" && g.lastMatchReport ? (
                <MatchResultView report={g.lastMatchReport} userTeamName={userClub.name} competitionLabel="Ligamatch"
                  onContinue={() => setG(prev => ({ ...prev, view: "press" }))} />
              ) : g.view === "press" && g.lastMatchReport ? (
                <PressConferenceView report={g.lastMatchReport} onRespond={respondPress} />
              ) : g.view === "press" && !g.lastMatchReport ? (
                <div className="rise-in space-y-2.5">
                  <PaperCard><div className="text-sm text-center py-3" style={{ color: C.inkSoft }}>Presskonferensen kunde inte laddas — matchrapporten saknas. Ingen fara, ni kan fortsätta därifrån.</div></PaperCard>
                  <button onClick={() => setG(prev => ({ ...prev, view: "home" }))} className="w-full py-2.5 rounded-xl font-display text-sm tracking-wide" style={{ background: C.gold, color: C.turfDeep }}>TILLBAKA TILL HEM</button>
                </div>
              ) : g.view === "trophies" ? (
                <TrophyCabinetView history={g.history} club={userClub} season={g.season} clubRecords={g.clubRecords} onBack={() => setG(prev => ({ ...prev, view: prev.activeTab === "home" ? "home" : "tab" }))} />
              ) : g.view === "manager" ? (
                <ManagerProfileView manager={g.manager} assistantManager={g.assistantManager} staff={g.staff} g={g} userClub={userClub}
                  onRespondInterest={respondManagerInterest} onHireAssistant={hireAssistantManager} onSetDifficulty={setDifficulty}
                  onOpenJobMarket={openJobMarket} onOpenCV={() => setG(prev => ({ ...prev, view: "managercv" }))} onOpenVision={() => setG(prev => ({ ...prev, view: "visionboard" }))} onOpenMatchGuide={() => setG(prev => ({ ...prev, view: "matchguide" }))}
                  onBack={() => setG(prev => ({ ...prev, view: prev.activeTab === "home" ? "home" : "tab" }))} />
              ) : g.view === "managercv" ? (
                <ManagerCVView manager={g.manager} onBack={() => setG(prev => ({ ...prev, view: "manager" }))} />
              ) : g.view === "visionboard" ? (
                <VisionBoardView manager={g.manager} season={g.season} division={g.division} history={g.history} transferHistory={g.transferHistory} squad={g.squad} userClubId={g.userClubId} onCreateVision={createNewVision} onBack={() => setG(prev => ({ ...prev, view: "manager" }))} />
              ) : g.view === "matchguide" ? (
                <MatchInsightsGuideView onBack={() => setG(prev => ({ ...prev, view: "manager" }))} />
              ) : g.view === "matchprep" ? (
                <MatchPrepView g={g} userClub={userClub} oppClub={oppClub} countryName={countryName} isHome={nextFixture ? nextFixture.home === g.userClubId : true}
                  onBack={() => setG(prev => ({ ...prev, view: "home" }))}
                  onSetPlannedSub={setPlannedSub}
                  onSetTeamTalk={setTeamTalk} onRestStars={restStars} onSetTicketPrice={setTicketPrice}
                  onGotoSquad={() => setG(prev => ({ ...prev, activeTab: "squad", view: "tab" }))} onPlay={beginRound} />
              ) : g.view === "tourplanner" ? (
                <TourPlannerView g={g} onBack={() => setG(prev => ({ ...prev, view: "home" }))} onOpenTours={openTourOffers} onStartTour={startTour} />
              ) : g.view === "cup" && g.activeCupType && g.cups[g.activeCupType] ? (
                <CupView cup={g.cups[g.activeCupType]} clubs={g.clubs} userClubId={g.userClubId} userTeamName={userClub.name} currentRound={g.round}
                  onPlayDomestic={playDomesticCupRound} onContinueDomestic={continueDomesticCupRound}
                  onPlayGroup={playGroupMatch} onContinueGroup={continueGroupRound}
                  onPlayLeg={playCupLeg} onContinueLeg={continueCupLeg}
                  onPlayFinal={playCupFinal} onContinueFinal={continueCupFinal}
                  onFinish={finishCup} onBackToHome={() => setG(prev => ({ ...prev, view: "home" }))} />
              ) : g.activeTab === "news" ? (
                <NewsTab newsFeed={g.newsFeed} onNewsAction={handleNewsAction} />
              ) : g.activeTab === "home" ? (
                <HomeTab g={g} userClub={userClub} oppClub={oppClub} countryName={countryName} standings={standings} userPos={userPos} userRow={userRow}
                  nextFixture={nextFixture} seasonOver={seasonOver}
                  onPlay={beginRound} onNewSeason={newSeason}
                  onGotoCup={() => setG(prev => ({ ...prev, view: "cup" }))} onSetPlannedSub={setPlannedSub}
                  onSetTeamTalk={setTeamTalk} onRestStars={restStars} onGotoPrep={() => setG(prev => ({ ...prev, view: "matchprep" }))}
                  onAdvanceSillySeason={advanceSillySeasonWeek} onFinishSillySeason={finishSillySeason} onOpenTours={openTourOffers} onStartTour={startTour}
                  onGotoTourPlanner={() => setG(prev => ({ ...prev, view: "tourplanner" }))}
                  onGotoTable={() => setG(prev => ({ ...prev, activeTab: "table", view: "tab" }))}
                  onGotoEconomy={() => setG(prev => ({ ...prev, activeTab: "ekonomi", view: "tab" }))} />
              ) : g.activeTab === "table" ? (
                <TableTab standings={standings} clubs={g.clubs} userClubId={g.userClubId} division={userClub.division} cup={g.activeCupType ? g.cups[g.activeCupType] : null} nextFixture={nextFixture} allSchedules={g.allSchedules} leagueId={g.leagueId} season={g.season} currentRound={g.round} onSubViewChange={setSubViewOpen} season1Qualifiers={g.season1Qualifiers} schedule={g.schedule} cup1Live={g.cups.cup1} domesticLive={g.cups.domestic} cup2Live={g.cups.cup2} />
              ) : g.activeTab === "fixtures" ? (
                <FixturesTab schedule={g.schedule} clubs={g.clubs} currentRound={g.round} userClubId={g.userClubId} cup={g.activeCupType ? g.cups[g.activeCupType] : null} season={g.season}
                  budget={g.budget} tourOffers={g.tourOffers} lastTourResult={g.lastTourResult} tourCompletedThisOffseason={g.tourCompletedThisOffseason} onOpenTours={openTourOffers} onStartTour={startTour}
                  allSchedules={g.allSchedules} leagueId={g.leagueId} onSubViewChange={setSubViewOpen} season1Qualifiers={g.season1Qualifiers} cup1Live={g.cups.cup1} domesticLive={g.cups.domestic} cup2Live={g.cups.cup2} />
              ) : g.activeTab === "squad" ? (
                <SquadTab squad={g.squad} startingXI={g.startingXI} onToggleStarter={toggleStarter} confirmSell={confirmSell} setConfirmSell={setConfirmSell} onSell={sellPlayer} onToggleListed={toggleTransferListed} onToggleLoanListed={toggleLoanListed} onRenew={renewContract}
                  formationCode={g.formationCode} lineupCells={g.lineupCells} onSaveFormation={saveFormation} onChat={chatWithPlayer}
                  clubs={g.clubs} round={g.round} onSendLoan={sendPlayerOnLoan} outgoingLoans={g.outgoingLoans}
                  setPieceTakers={g.setPieceTakers} onSetSetPieceTakers={setSetPieceTakers} chemistryPairs={g.chemistryPairs} onAssessPlayer={assessPlayer}
                  tactic={g.tactic} onTactic={t => setG(prev => ({ ...prev, tactic: t }))} tacticalSettings={g.tacticalSettings} onSetTactical={setTacticalOption}
                  spelide={g.spelide} onSetSpelide={setSpelide} captainId={g.captainId} onSetCaptain={setCaptain}
                  dev={g.dev} budget={g.budget} akademiParts={g.akademiParts} youthSquad={g.youthSquad} onUpgrade={upgradeDev} onUpgradePart={upgradePart} onSellYouth={sellYouth} onPromoteYouth={promoteYouth} onSubViewChange={setSubViewOpen} pendingSelectedPlayerId={g.pendingSelectedPlayerId} onClearPendingSelection={() => setG(prev => ({ ...prev, pendingSelectedPlayerId: null }))} reputation={g.reputation} squadViewPrefs={g.squadViewPrefs} onSetSquadViewPrefs={setSquadViewPrefs} transferHistory={g.transferHistory} userClubId={g.userClubId} onHintForSale={hintForSale} onStartTraining={startPositionTraining} onCancelTraining={cancelPositionTraining} manager={g.manager} onPitchVision={pitchVisionToPlayer} />
              ) : g.activeTab === "club" ? (
                <ClubTab club={userClub} dev={g.dev} budget={g.budget} history={g.history} reputation={g.reputation} fanbase={g.fanbase}
                  sponsors={g.sponsors} staff={g.staff} boardConfidence={g.boardConfidence} boardTarget={boardTargetLabel(userClub.archetype, userClub.division).label}
                  squad={g.squad} owner={g.owner} takeoverBid={g.takeoverBid} tourOffers={g.tourOffers} shopLevel={g.arenaFacilities.shop} division={userClub.division}
                  onRespondTakeover={respondTakeoverBid} onOpenTours={openTourOffers} onStartTour={startTour} onRequestOwner={requestFromOwner}
                  merchandisePricing={g.merchandisePricing} onSetMerchandisePricing={setMerchandisePricing}
                  repHistory={g.repHistory} fanHistory={g.fanHistory} onSubViewChange={setSubViewOpen}
                  clubs={g.clubs} partnerClubId={g.partnerClubId} onSignPartnerClub={signPartnerClub} onEndPartnerClub={endPartnerClub} manager={g.manager} />
              ) : g.activeTab === "ekonomi" ? (
                <EconomyTab budget={g.budget} reputation={g.reputation} division={userClub.division} sponsringLevel={g.dev.sponsring} squad={g.squad} history={g.history}
                  season={g.season} round={g.round} totalRounds={g.schedule.length} seasonIncomeTotal={g.seasonIncomeTotal || 0} seasonWageTotal={g.seasonWageTotal || 0}
                  ticketPrice={g.ticketPrice} onSetTicketPrice={setTicketPrice}
                  loans={g.loans} onTakeLoan={takeLoan} sponsors={g.sponsors} dev={g.dev} onUpgrade={upgradeDev} onUpgradePart={upgradePart} onSignSponsor={signSponsor} onTerminateSponsor={terminateSponsor}
                  club={userClub} arenaStands={g.arenaStands} arenaFacilities={g.arenaFacilities} arenaConstruction={g.arenaConstruction} onStartConstruction={startArenaConstruction} recentMatchFinances={g.recentMatchFinances} transferInstallments={g.transferInstallments} onSubViewChange={setSubViewOpen} customArenaName={g.customArenaName} onNameArena={nameOwnArena} staff={g.staff} transferHistory={g.transferHistory} userClubId={g.userClubId} />
              ) : g.activeTab === "personal" ? (
                <PersonalTab budget={g.budget} staff={g.staff} reputation={g.reputation} homeCountry={userClub.league} staffCandidates={g.staffCandidates}
                  onOpenStaffCandidates={openStaffCandidates} onHireStaff={hireStaff} onRenegotiateStaff={renegotiateStaffWage}
                  dev={g.dev} scoutingParts={g.scoutingParts} onUpgrade={upgradeDev} onUpgradePart={upgradePart} seasonStaffImpact={g.seasonStaffImpact} onSubViewChange={setSubViewOpen} />
              ) : (
                <TransfersTab market={g.market} budget={g.budget} scoutingLevel={g.dev.scouting} kontakterLevel={g.scoutingParts.kontakter} youthSquad={g.youthSquad} youthMarket={g.youthMarket} round={g.round} season={g.season}
                  clubs={g.clubs} reputation={g.reputation} incomingOffers={g.incomingOffers} clubGoodwill={g.clubGoodwill} blacklistedPlayers={g.blacklistedPlayers} onNegotiationFailed={failNegotiation}
                  onFinalizeTransfer={finalizeTransfer} onBuyYouth={buyYouth} onRespondOffer={respondIncomingOffer}
                  scoutMission={g.scoutMission} scoutLevel={g.staff.scout?.level || 0}
                  onStartScoutMission={startScoutMission} onDismissScoutMission={dismissScoutMission} onCancelScoutMission={cancelScoutMission} onFinalizeScoutSignee={finalizeScoutSignee}
                  loanOffers={g.loanOffers} onAcceptLoan={acceptLoanOffer} onDeclineLoan={declineLoanOffer} difficulty={g.difficulty}
                  squad={g.squad} savedScoutProfiles={g.savedScoutProfiles} onSaveScoutProfile={saveScoutProfile} onDeleteScoutProfile={deleteScoutProfile}
                  userClubId={g.userClubId} leagueId={g.leagueId} onFinalizeClubBrowseTransfer={finalizeClubBrowseTransfer} onSubViewChange={setSubViewOpen}
                  partnerClubId={g.partnerClubId} onInstantLoanFromPartner={instantLoanFromPartner} loanRequests={g.loanRequests} onRespondLoanRequest={respondLoanRequest} transferHistory={g.transferHistory}
                  scoutedPlayerIds={g.scoutedPlayerIds} pendingPlayerScouts={g.pendingPlayerScouts} onScoutPlayer={scoutSpecificPlayer} pendingScoutReveal={g.pendingScoutReveal} onClearScoutReveal={() => setG(prev => ({ ...prev, pendingScoutReveal: null }))} worldPool={g.worldPool} />
              )}
            </div>
          </div>
        </div>
        {(g.view === "tab" && g.activeTab !== "home" && !subViewOpen) && (
          <button onClick={() => setG(prev => ({ ...prev, activeTab: "home", view: "home" }))}
            style={{ position: "fixed", bottom: 14, right: 14, display: "inline-block", color: "rgba(255,255,255,0.85)", background: "rgba(19,34,29,0.88)", padding: "6px 13px", borderRadius: 999, fontSize: 11, fontWeight: 600, zIndex: 50, backdropFilter: "blur(4px)", boxShadow: "0 2px 10px rgba(0,0,0,0.35)" }}>
            ← Bakåt
          </button>
        )}
      </div>
    </>
  );
}

function PaperCard({ children, style, onClick }) { return <div onClick={onClick} className="rounded-2xl p-3" style={{ background: C.paper, color: C.ink, border: `1px solid rgba(30,42,34,0.1)`, cursor: onClick ? "pointer" : "default", ...style }}>{children}</div>; }
function ResultChip({ result }) {
  const map = { win: { l: "V", c: C.win }, draw: { l: "O", c: C.draw }, loss: { l: "F", c: C.loss } };
  const m = map[result];
  return <span className="w-6 h-6 rounded-full inline-flex items-center justify-center text-11 font-bold text-white" style={{ background: m.c }}>{m.l}</span>;
}
function StatBar({ label, value, color, displayText }) {
  return (
    <div className="flex-1">
      <div className="flex justify-between text-10 mb-0.5" style={{ color: C.inkSoft }}><span>{label}</span><span className="font-mono">{displayText ?? <AnimatedNumber value={value} />}</span></div>
      <div className="h-1.5 rounded-full" style={{ background: "rgba(0,0,0,0.08)" }}><div className="h-full rounded-full" style={{ width: `${clamp(value, 0, 100)}%`, background: color, transition: "width .5s ease" }} /></div>
    </div>
  );
}
const ATTR_ICONS = { shooting: "🎯", passing: "🔀", dribbling: "⚡", pace: "🏃", defending: "🛡️", physical: "💪" };
function attrQualityColor(value) { return value >= 65 ? C.win : value >= 40 ? C.gold : C.loss; }
function AttributeBar({ attrKey, label, value, avg }) {
  const color = attrQualityColor(value);
  return (
    <div className="flex items-center gap-2 py-1">
      <div className="w-6 h-6 rounded-full flex items-center justify-center text-11 shrink-0" style={{ background: `${color}22` }}>{ATTR_ICONS[attrKey] || "•"}</div>
      <div className="w-20 text-10 font-semibold shrink-0" style={{ color: C.ink }}>{label}</div>
      <div className="flex-1 h-2 rounded-full relative overflow-hidden" style={{ background: "rgba(0,0,0,0.08)" }}>
        <div className="h-full rounded-full" style={{ width: `${clamp(value, 0, 100)}%`, background: color, transition: "width .5s ease" }} />
        {avg !== null && avg !== undefined && <div style={{ position: "absolute", top: -1, bottom: -1, left: `${clamp(avg, 0, 100)}%`, width: 2, background: C.turfDeep, opacity: 0.4 }} />}
      </div>
      <div className="w-6 text-right font-mono text-11 font-bold shrink-0" style={{ color: C.ink }}>{Math.round(value)}</div>
    </div>
  );
}
function AttributeGridCard({ attrKey, label, value, icon }) {
  const color = attrQualityColor(value);
  return (
    <div className="rounded-lg p-1.5" style={{ background: "#fff", border: "1px solid rgba(30,42,34,0.08)" }}>
      <div className="flex items-center justify-between">
        <span className="w-4 h-4 rounded-full flex items-center justify-center text-9 shrink-0" style={{ background: `${color}22` }}>{icon || ATTR_ICONS[attrKey] || "•"}</span>
        <span className="font-mono text-11 font-bold" style={{ color: C.ink }}>{Math.round(value)}</span>
      </div>
      <div className="text-9 font-semibold truncate mt-0.5 mb-1" style={{ color: C.ink }}>{label}</div>
      <div className="h-1.5 rounded-full" style={{ background: "rgba(0,0,0,0.08)" }}>
        <div className="h-full rounded-full" style={{ width: `${clamp(value, 0, 100)}%`, background: color, transition: "width .5s ease" }} />
      </div>
    </div>
  );
}

function SaveSelectView({ saves, onSelect, onNew, onDelete, onExport, onImport, onOpenDatabase }) {
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [showCodePrompt, setShowCodePrompt] = useState(false);
  const [codeInput, setCodeInput] = useState("");
  const [codeError, setCodeError] = useState(false);
  const fileInputRef = useRef(null);
  const fontStyle = `@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700&family=Inter:wght@400;500;600;700&display=swap'); .font-display{font-family:'Fraunces','Inter',serif;font-weight:700;letter-spacing:-0.005em;} ::-webkit-scrollbar{display:none;}`;
  const sorted = [...saves].sort((a, b) => new Date(b.lastPlayed) - new Date(a.lastPlayed));
  return (
    <div style={{ background: C.turfDeep, minHeight: "100vh", color: C.paper }} className="flex flex-col items-center px-5 pt-10 pb-10">
      <style>{fontStyle}</style>
      <div className="font-display text-3xl" style={{ color: C.goldSoft }}>TRÄNARBÄNKEN</div>
      <div className="text-sm mt-1 mb-6 text-center" style={{ color: C.paperDim }}>Välj en karriär att fortsätta, eller starta en ny.</div>
      {sorted.length === 0 && (
        <div style={{ width: "100%", maxWidth: 480, color: C.paperDim }} className="text-center text-sm mb-2">Inga sparade karriärer ännu.</div>
      )}
      <div style={{ width: "100%", maxWidth: 480 }} className="space-y-2.5">
        {sorted.map(s => (
          <div key={s.id} className="rounded-2xl p-4 flex items-center gap-2" style={{ background: C.paper, color: C.ink }}>
            <button onClick={() => onSelect(s.id)} className="flex-1 text-left min-w-0 flex items-center gap-2.5">
              <span style={{ width: 34, height: 34, borderRadius: "50%", background: s.clubColor || C.paperDim, border: `2px solid ${C.paperDim}`, flexShrink: 0 }} />
              <div className="min-w-0">
                <div className="font-semibold text-sm truncate">{s.clubName}</div>
                <div className="text-11 mt-0.5" style={{ color: C.inkSoft }}>{s.countryName} · {divisionLabel(s.leagueId, s.division)} · Säsong {s.season}</div>
              </div>
            </button>
            {confirmDeleteId === s.id ? (
              <div className="flex items-center gap-1.5 shrink-0">
                <button onClick={() => { onDelete(s.id); setConfirmDeleteId(null); }} className="px-2.5 py-1.5 rounded-lg text-11 font-semibold" style={{ background: C.loss, color: "#fff" }}>Radera</button>
                <button onClick={() => setConfirmDeleteId(null)} className="px-2.5 py-1.5 rounded-lg text-11 font-semibold" style={{ background: C.paperDim }}>Avbryt</button>
              </div>
            ) : (
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => onExport(s.id)} className="p-2" title="Spara till fil"><Download size={16} color={C.inkSoft} /></button>
                <button onClick={() => setConfirmDeleteId(s.id)} className="p-2"><Trash2 size={16} color={C.loss} /></button>
              </div>
            )}
          </div>
        ))}
      </div>
      <button onClick={onNew} style={{ width: "100%", maxWidth: 480, background: C.gold, color: C.turfDeep }} className="mt-4 py-2.5 rounded-xl font-display text-sm tracking-wide">+ NY KARRIÄR</button>
      <button onClick={() => fileInputRef.current?.click()} style={{ width: "100%", maxWidth: 480, background: "transparent", border: `1px solid ${C.paperDim}`, color: C.paperDim }} className="mt-2.5 py-3 rounded-2xl text-sm font-semibold flex items-center justify-center gap-2">
        <Upload size={15} /> LADDA UPP SPARAT SPEL
      </button>
      <input ref={fileInputRef} type="file" accept="application/json,.json" style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0]; if (f) onImport(f); e.target.value = ""; }} />
      <div className="text-10 mt-2 text-center" style={{ color: C.paperDim, maxWidth: 480 }}>Sparfiler laddas ner som en JSON-fil till din enhet och kan laddas upp igen här — även på en annan enhet eller i den fristående webbversionen.</div>
      <button onClick={() => { setShowCodePrompt(true); setCodeInput(""); setCodeError(false); }} className="text-9 mt-6" style={{ color: "rgba(238,234,224,0.25)" }}>Databas</button>
      {showCodePrompt && (
        <>
          <div onClick={() => setShowCodePrompt(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 40 }} />
          <div style={{ position: "fixed", top: "35%", left: 20, right: 20, maxWidth: 400, margin: "0 auto", background: C.paper, color: C.ink, borderRadius: 16, padding: 20, zIndex: 41, boxShadow: "0 16px 40px rgba(0,0,0,0.5)" }}>
            <div className="font-display text-lg mb-1">Ange kod</div>
            <div className="text-11 mb-3" style={{ color: C.inkSoft }}>Skriv den förbestämda koden för att komma åt databasen.</div>
            <input autoFocus value={codeInput} onChange={e => { setCodeInput(e.target.value); setCodeError(false); }}
              onKeyDown={e => { if (e.key === "Enter") { if (codeInput === "KnarrbackenFC") { setShowCodePrompt(false); onOpenDatabase(); } else setCodeError(true); } }}
              className="w-full px-3 py-2 rounded-lg text-sm font-mono mb-2" style={{ background: C.paperDim, border: `1px solid ${codeError ? C.loss : C.paperDim}`, color: C.ink }} placeholder="Kod" />
            {codeError && <div className="text-11 mb-2" style={{ color: C.loss }}>Fel kod.</div>}
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setShowCodePrompt(false)} className="py-2 rounded-xl text-sm font-semibold" style={{ background: "transparent", border: `1px solid ${C.paperDim}`, color: C.inkSoft }}>Avbryt</button>
              <button onClick={() => { if (codeInput === "KnarrbackenFC") { setShowCodePrompt(false); onOpenDatabase(); } else setCodeError(true); }} className="py-2 rounded-xl text-sm font-semibold" style={{ background: C.gold, color: C.turfDeep }}>Lås upp</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

const ONBOARDING_FONT_STYLE = `@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700&family=Inter:wght@400;500;600;700&display=swap'); .font-display{font-family:'Fraunces','Inter',serif;font-weight:700;letter-spacing:-0.005em;} ::-webkit-scrollbar{display:none;}`;
// Validates an imported/user-created database JSON against the same structure the standard database
// (generateWorld()) produces: an object keyed by club id, each club holding a squad array of players.
// Checks required fields, duplicate IDs (both clubs and players), and relational validity (league/division).
function validateDatabaseJSON(data) {
  const errors = [];
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { valid: false, errors: ["Filen måste vara ett JSON-objekt med klubb-ID:n som nycklar (samma struktur som standarddatabasen)."] };
  }
  const clubKeys = Object.keys(data);
  if (!clubKeys.length) return { valid: false, errors: ["Databasen innehåller inga klubbar."] };
  const validLeagueIds = new Set(LEAGUES.map(l => l.id));
  const requiredClubFields = ["id", "name", "league", "division", "color", "strength", "archetype", "squad"];
  const requiredPlayerFields = ["id", "name", "age", "attack", "defense", "pos", "specificPosition", "value", "wage"];
  const seenClubIds = new Set();
  const seenPlayerIds = new Set();
  clubKeys.forEach(key => {
    const c = data[key];
    if (!c || typeof c !== "object") { errors.push(`Klubben "${key}" är inte ett giltigt objekt.`); return; }
    requiredClubFields.forEach(f => { if (c[f] === undefined) errors.push(`Klubben "${key}" saknar obligatoriskt fält: "${f}".`); });
    if (c.id && c.id !== key) errors.push(`Klubben "${key}" har ett id ("${c.id}") som inte matchar dess nyckel — ogiltig relation.`);
    if (c.id) { if (seenClubIds.has(c.id)) errors.push(`Dubblerat klubb-ID: "${c.id}".`); seenClubIds.add(c.id); }
    if (c.league !== undefined && !validLeagueIds.has(c.league)) errors.push(`Klubben "${key}" har ett okänt land: "${c.league}" (måste vara ett av: ${[...validLeagueIds].join(", ")}).`);
    if (c.division !== undefined && ![1, 2, 3].includes(c.division)) errors.push(`Klubben "${key}" har en ogiltig division: "${c.division}" (måste vara 1, 2 eller 3).`);
    if (c.squad !== undefined && !Array.isArray(c.squad)) errors.push(`Klubben "${key}" har en ogiltig trupp — "squad" måste vara en lista.`);
    else if (Array.isArray(c.squad)) {
      c.squad.forEach((p, i) => {
        if (!p || typeof p !== "object") { errors.push(`Spelare #${i + 1} i "${key}" är inte ett giltigt objekt.`); return; }
        requiredPlayerFields.forEach(f => { if (p[f] === undefined) errors.push(`Spelaren "${p.name || "#" + (i + 1)}" i "${key}" saknar obligatoriskt fält: "${f}".`); });
        if (p.id) { if (seenPlayerIds.has(p.id)) errors.push(`Dubblerat spelar-ID: "${p.id}".`); seenPlayerIds.add(p.id); }
      });
    }
  });
  return { valid: errors.length === 0, errors: errors.slice(0, 60) };
}
function downloadJSONFile(data, filename) {
  try {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (e) {}
}
// ---------- Excel import/export for user databases ----------
// Converts the nested world object (clubs keyed by id, each with a squad array) into two flat row-sets
// matching a spreadsheet's shape: one row per club, one row per player. Kept as pure functions (no SheetJS
// calls inside) so the actual data reshaping can be tested independently of the spreadsheet library.
function worldToExcelRows(world) {
  const clubRows = [];
  const playerRows = [];
  const youthRows = [];
  Object.values(world).forEach(c => {
    clubRows.push({
      Land: c.league, Division: c.division, KlubbID: c.id, Klubbnamn: c.name, Kortnamn: c.short || shortCodeFrom(c.name),
      Färg: c.color || "", Sekundärfärg: c.secondaryColor || "", Tröjmönster: c.jerseyPattern || "",
      Arketyp: c.archetype, Styrka: Math.round(c.strength), Startbudget: c.startBudget ?? "", Arenakapacitet: c.baseArenaCapacity ?? "",
    });
    (c.squad || []).forEach(p => {
      const attrs = getAttrs(p);
      playerRows.push({
        Land: c.league, Division: c.division, KlubbID: c.id, Klubbnamn: c.name,
        SpelarID: p.id, Namn: p.name, Nummer: p.number ?? "", Ålder: p.age, Position: p.pos, SpecifikPosition: p.specificPosition,
        Overall: overallOf(p), Anfall: Math.round(p.attack), Försvar: Math.round(p.defense), Potential: Math.round(p.potential ?? p.attack),
        Värde: p.value, "Lön": p.wage, Nationalitet: p.nationality || "",
        Kontraktsår: p.contractYears ?? 3, Moral: p.morale ?? 70, Personlighet: p.personality || "Balanserad",
        Skadeveckor: p.injuryWeeks || 0, Avstängd: p.suspendedMatches || 0, "Gula kort": p.yellowCards || 0,
        Avslut: attrs.shooting, Passning: attrs.passing, Dribbling: attrs.dribbling, Fart: attrs.pace, Försvarsspel: attrs.defending, Fysik: attrs.physical,
        "Svag fot": weakFoot(p), Huvudspel: headingAbility(p), Skaderisk: injuryProneness(p), Storform: clutchFactor(p),
        Uthållighet: endurance(p), Beslutsamhet: determination(p),
      });
    });
    (c.youthSquad || []).forEach(y => {
      youthRows.push({
        Land: c.league, Division: c.division, KlubbID: c.id, Klubbnamn: c.name,
        SpelarID: y.id, Namn: y.name, Ålder: y.age, Position: y.pos, SpecifikPosition: y.specificPosition,
        Overall: overallOf(y), Anfall: Math.round(y.attack), Försvar: Math.round(y.defense), Potential: Math.round(y.potential ?? y.attack),
        Värde: y.value, "Lön": y.wage ?? 0, Nationalitet: y.nationality || "",
        Uthållighet: endurance(y), Beslutsamhet: determination(y),
      });
    });
  });
  return { clubRows, playerRows, youthRows };
}
// The inverse: rebuild the nested world object from the flat row-sets (as read back from a spreadsheet).
// Coerces numeric-looking spreadsheet cells back to numbers, since Excel/CSV round-trips often stringify them.
function excelRowsToWorld(clubRows, playerRows, youthRows) {
  const num = v => (v === "" || v === undefined || v === null) ? undefined : Number(v);
  const world = {};
  (clubRows || []).forEach(row => {
    const id = String(row.KlubbID || "").trim();
    if (!id) return;
    world[id] = {
      id, name: String(row.Klubbnamn || "").trim(), league: String(row.Land || "").trim(), division: num(row.Division),
      short: (row.Kortnamn && String(row.Kortnamn).trim()) || shortCodeFrom(String(row.Klubbnamn || "").trim()),
      color: row.Färg || undefined, secondaryColor: row.Sekundärfärg || undefined, jerseyPattern: row.Tröjmönster || undefined,
      archetype: String(row.Arketyp || "").trim(), strength: num(row.Styrka),
      startBudget: row.Startbudget === "" || row.Startbudget === undefined ? undefined : num(row.Startbudget),
      baseArenaCapacity: row.Arenakapacitet === "" || row.Arenakapacitet === undefined ? undefined : num(row.Arenakapacitet),
      squad: [], youthSquad: [],
    };
  });
  (playerRows || []).forEach(row => {
    const clubId = String(row.KlubbID || "").trim();
    if (!world[clubId]) return;
    world[clubId].squad.push({
      id: String(row.SpelarID || "").trim(), name: String(row.Namn || "").trim(), number: num(row.Nummer),
      age: num(row.Ålder), pos: String(row.Position || "").trim(), specificPosition: String(row.SpecifikPosition || "").trim(),
      attack: num(row.Anfall), defense: num(row.Försvar), potential: num(row.Potential),
      value: num(row.Värde), wage: num(row["Lön"]), nationality: String(row.Nationalitet || "").trim(),
      contractYears: row.Kontraktsår === "" || row.Kontraktsår === undefined ? 3 : num(row.Kontraktsår),
      morale: row.Moral === "" || row.Moral === undefined ? 70 : num(row.Moral),
      personality: row.Personlighet || "Balanserad",
      injuryWeeks: num(row.Skadeveckor) || 0, suspendedMatches: num(row.Avstängd) || 0, yellowCards: num(row["Gula kort"]) || 0,
      // Season-progress stats always start fresh regardless of what's in the sheet — these track a season
      // in progress, not a starting condition to import.
      apps: 0, goals: 0, assists: 0, seasonLog: [], ratingSum: 0,
      shooting: num(row.Avslut), passing: num(row.Passning), dribbling: num(row.Dribbling), pace: num(row.Fart), defending: num(row.Försvarsspel), physical: num(row.Fysik),
      weakFoot: num(row["Svag fot"]), headingAbility: num(row.Huvudspel),
      injuryProneness: row.Skaderisk && ["Skör", "Normal", "Robust"].includes(row.Skaderisk) ? row.Skaderisk : undefined,
      clutchFactor: num(row.Storform), endurance: num(row.Uthållighet), determination: num(row.Beslutsamhet),
    });
  });
  (youthRows || []).forEach(row => {
    const clubId = String(row.KlubbID || "").trim();
    if (!world[clubId]) return;
    world[clubId].youthSquad.push({
      id: String(row.SpelarID || "").trim() || uid(), name: String(row.Namn || "").trim(),
      age: num(row.Ålder) || 16, pos: String(row.Position || "").trim(), specificPosition: String(row.SpecifikPosition || "").trim(),
      attack: num(row.Anfall), defense: num(row.Försvar), potential: num(row.Potential),
      value: num(row.Värde), wage: num(row["Lön"]), nationality: String(row.Nationalitet || "").trim(),
      endurance: num(row.Uthållighet), determination: num(row.Beslutsamhet),
    });
  });
  return world;
}
// "Övriga världen" — the scoutable pool of players from regions/countries outside the simulated leagues,
// kept as a separate companion structure (not part of the club-keyed world object) since it's global,
// not per-club. Same row shape philosophy as the squad sheet, plus a Region column.
function worldPoolToExcelRows(worldPool) {
  const rows = [];
  Object.entries(worldPool || {}).forEach(([region, players]) => {
    (players || []).forEach(p => {
      rows.push({
        Region: region, SpelarID: p.id, Namn: p.name, Ålder: p.age, Position: p.pos, SpecifikPosition: p.specificPosition,
        Overall: overallOf(p), Anfall: Math.round(p.attack), Försvar: Math.round(p.defense), Potential: Math.round(p.potential ?? p.attack),
        Värde: p.value, "Lön": p.wage, Nationalitet: p.nationality || "", Kontraktsår: p.contractYears ?? 2,
        Uthållighet: endurance(p), Beslutsamhet: determination(p),
      });
    });
  });
  return rows;
}
function excelRowsToWorldPool(rows) {
  const num = v => (v === "" || v === undefined || v === null) ? undefined : Number(v);
  const pool = { europa: [], sydamerika: [], afrika: [], asien: [], nordamerika: [] };
  (rows || []).forEach(row => {
    const region = String(row.Region || "").trim();
    if (!pool[region]) return;
    pool[region].push({
      id: String(row.SpelarID || "").trim() || uid(), name: String(row.Namn || "").trim(),
      age: num(row.Ålder), pos: String(row.Position || "").trim(), specificPosition: String(row.SpecifikPosition || "").trim(),
      attack: num(row.Anfall), defense: num(row.Försvar), potential: num(row.Potential),
      value: num(row.Värde), wage: num(row["Lön"]), nationality: String(row.Nationalitet || "").trim(),
      contractYears: row.Kontraktsår === "" || row.Kontraktsår === undefined ? 2 : num(row.Kontraktsår),
      endurance: num(row.Uthållighet), determination: num(row.Beslutsamhet),
      region, injuryWeeks: 0, yellowCards: 0, suspendedMatches: 0, morale: 70, apps: 0, goals: 0, assists: 0, ratingSum: 0,
    });
  });
  return pool;
}
let xlsxLibPromise = null;
function loadXLSXLib() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  if (xlsxLibPromise) return xlsxLibPromise;
  xlsxLibPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
    script.onload = () => resolve(window.XLSX);
    script.onerror = () => reject(new Error("Kunde inte ladda Excel-biblioteket. Kontrollera internetuppkopplingen."));
    document.head.appendChild(script);
  });
  return xlsxLibPromise;
}
// Exports the world as a two-sheet workbook (Klubbar, Spelare) with AutoFilter enabled on both header rows,
// so Land/Division/Klubbnamn etc. can be filtered natively in Excel — this doubles as the fill-in-yourself
// template, since it's already in the exact shape excelRowsToWorld expects back.
async function exportDatabaseToExcel(world, filename, worldPool) {
  const XLSX = await loadXLSXLib();
  const { clubRows, playerRows, youthRows } = worldToExcelRows(world);
  const wb = XLSX.utils.book_new();
  const wsClubs = XLSX.utils.json_to_sheet(clubRows);
  wsClubs["!autofilter"] = { ref: wsClubs["!ref"] };
  const wsPlayers = XLSX.utils.json_to_sheet(playerRows);
  wsPlayers["!autofilter"] = { ref: wsPlayers["!ref"] };
  const wsYouth = XLSX.utils.json_to_sheet(youthRows);
  if (wsYouth["!ref"]) wsYouth["!autofilter"] = { ref: wsYouth["!ref"] };
  const worldPoolRows = worldPoolToExcelRows(worldPool || generateWorldPool());
  const wsWorldPool = XLSX.utils.json_to_sheet(worldPoolRows);
  if (wsWorldPool["!ref"]) wsWorldPool["!autofilter"] = { ref: wsWorldPool["!ref"] };
  XLSX.utils.book_append_sheet(wb, wsClubs, "Klubbar");
  XLSX.utils.book_append_sheet(wb, wsPlayers, "Spelare");
  XLSX.utils.book_append_sheet(wb, wsYouth, "Akademispelare");
  XLSX.utils.book_append_sheet(wb, wsWorldPool, "Övriga världen");
  XLSX.writeFile(wb, filename || "databas.xlsx");
}
// Reads an uploaded .xlsx file and reconstructs {world, worldPool} from its sheets. Both the
// Akademispelare and Övriga världen sheets are optional on import, so older exported files still work
// (falling back to a freshly generated world pool when the sheet is missing).
function importExcelFile(file) {
  return new Promise((resolve, reject) => {
    loadXLSXLib().then(XLSX => {
      const reader = new FileReader();
      reader.onload = e => {
        try {
          const wb = XLSX.read(e.target.result, { type: "array" });
          const clubSheet = wb.Sheets["Klubbar"];
          const playerSheet = wb.Sheets["Spelare"];
          const youthSheet = wb.Sheets["Akademispelare"];
          const worldPoolSheet = wb.Sheets["Övriga världen"];
          if (!clubSheet || !playerSheet) { reject(new Error('Filen saknar ett eller båda av flikarna "Klubbar" och "Spelare".')); return; }
          const clubRows = XLSX.utils.sheet_to_json(clubSheet, { defval: "" });
          const playerRows = XLSX.utils.sheet_to_json(playerSheet, { defval: "" });
          const youthRows = youthSheet ? XLSX.utils.sheet_to_json(youthSheet, { defval: "" }) : [];
          const worldPoolRows = worldPoolSheet ? XLSX.utils.sheet_to_json(worldPoolSheet, { defval: "" }) : [];
          const world = excelRowsToWorld(clubRows, playerRows, youthRows);
          const worldPool = worldPoolRows.length ? excelRowsToWorldPool(worldPoolRows) : generateWorldPool();
          resolve({ world, worldPool });
        } catch (err) { reject(err); }
      };
      reader.onerror = () => reject(new Error("Kunde inte läsa filen."));
      reader.readAsArrayBuffer(file);
    }).catch(reject);
  });
}
function DatabaseManagerView({ standardWorld, onUseDatabase, onBack }) {
  const [customDbs, setCustomDbs] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [editingDb, setEditingDb] = useState(null); // { id, name, isCustom, data }
  const [importErrors, setImportErrors] = useState(null);
  const [importBusy, setImportBusy] = useState(false);
  const [namePromptFor, setNamePromptFor] = useState(null); // "create" | "saveas" | { renameId }
  const [nameInput, setNameInput] = useState("");
  const [toast, setToast] = useState(null);
  const fileInputRef = useRef(null);

  useEffect(() => { (async () => {
    try { const res = await window.storage?.get("tranarbanken-db-index"); setCustomDbs(res ? JSON.parse(res.value) : []); } catch (e) { setCustomDbs([]); }
    setLoaded(true);
  })(); }, []);

  function flash(msg) { setToast(msg); setTimeout(() => setToast(null), 3500); }
  async function persistList(list) { setCustomDbs(list); try { await window.storage?.set("tranarbanken-db-index", JSON.stringify(list)); } catch (e) {} }
  async function loadDbData(id) { try { const res = await window.storage?.get(`tranarbanken-db-${id}`); return res ? JSON.parse(res.value) : null; } catch (e) { return null; } }
  async function saveDbData(id, data) { try { await window.storage?.set(`tranarbanken-db-${id}`, JSON.stringify(data)); return true; } catch (e) { return false; } }
  // "Övriga världen" (world pool) is stored as a companion entry alongside the club data, keyed by the
  // same database id — kept separate so the club-keyed world object itself never has to change shape.
  async function loadWorldPoolData(id) { try { const res = await window.storage?.get(`tranarbanken-db-${id}-worldpool`); return res ? JSON.parse(res.value) : null; } catch (e) { return null; } }
  async function saveWorldPoolData(id, pool) { try { await window.storage?.set(`tranarbanken-db-${id}-worldpool`, JSON.stringify(pool)); return true; } catch (e) { return false; } }

  async function confirmCreateOrSaveAs(sourceData, sourceWorldPool) {
    const name = nameInput.trim() || "Namnlös databas";
    const id = uid();
    const pool = sourceWorldPool || generateWorldPool();
    await saveDbData(id, sourceData);
    await saveWorldPoolData(id, pool);
    await persistList([...customDbs, { id, name, createdAt: new Date().toISOString() }]);
    setNamePromptFor(null); setNameInput("");
    setEditingDb({ id, name, isCustom: true, data: sourceData, worldPool: pool });
    flash(`"${name}" skapad.`);
  }
  async function deleteDb(id) {
    await persistList(customDbs.filter(d => d.id !== id));
    try { await window.storage?.delete(`tranarbanken-db-${id}`); } catch (e) {}
    try { await window.storage?.delete(`tranarbanken-db-${id}-worldpool`); } catch (e) {}
    flash("Databas borttagen.");
  }
  async function openCustomDb(entry) {
    const data = await loadDbData(entry.id);
    if (!data) { flash("Kunde inte läsa databasen."); return; }
    const worldPool = (await loadWorldPoolData(entry.id)) || generateWorldPool();
    setEditingDb({ id: entry.id, name: entry.name, isCustom: true, data, worldPool });
  }
  function handleImportFile(file) {
    setImportBusy(true);
    setImportErrors(null);
    importExcelFile(file).then(({ world, worldPool }) => {
      const { valid, errors } = validateDatabaseJSON(world);
      setImportBusy(false);
      if (!valid) { setImportErrors(errors); return; }
      const id = uid();
      const name = file.name.replace(/\.xlsx$/i, "") || `Importerad databas ${customDbs.length + 1}`;
      saveDbData(id, world).then(() => saveWorldPoolData(id, worldPool)).then(() => persistList([...customDbs, { id, name, createdAt: new Date().toISOString() }])).then(() => flash(`"${name}" importerad och validerad utan fel.`));
    }).catch(err => { setImportBusy(false); setImportErrors([err.message || "Kunde inte läsa Excel-filen."]); });
  }

  if (editingDb) {
    return <DatabaseView world={editingDb.data} dbName={editingDb.name} isCustom={editingDb.isCustom}
      onBack={() => setEditingDb(null)}
      onSave={async clubs => { const ok = await saveDbData(editingDb.id, clubs); flash(ok ? `"${editingDb.name}" sparad.` : `Kunde inte spara "${editingDb.name}" — lagringen på den här enheten verkar blockerad (t.ex. privat surfläge eller full lagring). Prova Exportera Excel som säkerhetskopia istället.`); }}
      onSaveAs={clubs => { setNamePromptFor({ type: "saveas", data: clubs, worldPool: editingDb.worldPool }); setNameInput(`${editingDb.name} (kopia)`); }}
      onExport={(clubs, name) => exportDatabaseToExcel(clubs, `${(name || "databas").replace(/\s+/g, "_")}.xlsx`, editingDb.worldPool)}
      onSaveAndPlay={clubs => onUseDatabase(editingDb.id, editingDb.name, clubs, editingDb.worldPool)} />;
  }

  return (
    <div style={{ background: C.turfDeep, minHeight: "100vh", color: C.paper }} className="p-5">
      <input ref={fileInputRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0]; if (f) handleImportFile(f); e.target.value = ""; }} />
      <button onClick={onBack} className="text-sm mb-3" style={{ color: C.goldSoft }}>← Avbryt</button>
      <div className="font-display text-2xl mb-1" style={{ color: C.goldSoft }}>Databashanterare</div>
      <div className="text-11 mb-4" style={{ color: C.paperDim, maxWidth: 520 }}>Skapa egna databaser baserade på standarddatabasen, importera egna Excel-filer, eller ladda ner en Excel-mall att fylla i — med länder, divisioner och klubbar uppdelade i filterbara kolumner. Standarddatabasen kan aldrig skrivas över.</div>

      {toast && <div className="text-11 mb-3 px-3 py-2 rounded-lg" style={{ background: "rgba(201,154,62,0.18)", border: `1px solid ${C.gold}`, color: C.goldSoft, maxWidth: 520 }}>{toast}</div>}
      {importBusy && <div className="text-11 mb-3 px-3 py-2 rounded-lg" style={{ background: "rgba(255,255,255,0.08)", color: C.paper, maxWidth: 520 }}>Läser och validerar Excel-filen…</div>}
      {importErrors && (
        <div className="mb-3 p-3 rounded-lg" style={{ background: "rgba(180,68,59,0.15)", border: `1px solid #B4443B`, maxWidth: 520 }}>
          <div className="text-11 font-bold mb-1" style={{ color: "#E08A82" }}>Importen misslyckades ({importErrors.length} fel):</div>
          <div className="text-9 space-y-0.5" style={{ color: "#E0B8B4", maxHeight: 160, overflowY: "auto" }}>
            {importErrors.map((e, i) => <div key={i}>• {e}</div>)}
          </div>
          <button onClick={() => setImportErrors(null)} className="text-9 font-semibold mt-2" style={{ color: C.goldSoft }}>Stäng</button>
        </div>
      )}

      <div style={{ maxWidth: 520 }} className="space-y-1.5 mb-4">
        <div className="text-9 uppercase tracking-wide font-semibold mb-1" style={{ color: C.paperDim }}>Standarddatabas</div>
        <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl" style={{ background: "rgba(255,255,255,0.08)", border: `1px solid ${C.gold}` }}>
          <span style={{ fontSize: 20 }}>🌍</span>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold">Standarddatabas</div>
            <div className="text-9" style={{ color: C.paperDim }}>Spelets ursprungliga, slumpmässigt genererade värld. Kan aldrig skrivas över.</div>
          </div>
          <button onClick={() => setEditingDb({ id: null, name: "Standarddatabas", isCustom: false, data: standardWorld, worldPool: generateWorldPool() })} className="text-9 font-semibold px-2.5 py-1.5 rounded-lg shrink-0" style={{ background: "rgba(255,255,255,0.12)", color: C.paper }}>Visa</button>
        </div>
      </div>

      <div style={{ maxWidth: 520 }} className="grid grid-cols-3 gap-2 mb-4">
        <button onClick={() => { setNamePromptFor({ type: "create", data: standardWorld }); setNameInput(`Min databas ${customDbs.length + 1}`); }} className="py-2.5 rounded-xl text-9 font-semibold" style={{ background: C.gold, color: C.turfDeep }}>➕ Ny databas</button>
        <button onClick={() => fileInputRef.current?.click()} className="py-2.5 rounded-xl text-9 font-semibold" style={{ background: "transparent", border: `1px solid ${C.paperDim}`, color: C.paper }}>⬆️ Importera Excel</button>
        <button onClick={() => exportDatabaseToExcel(standardWorld, "tranarbanken_databasmall.xlsx")} className="py-2.5 rounded-xl text-9 font-semibold" style={{ background: "transparent", border: `1px solid ${C.paperDim}`, color: C.paper }}>📄 Ladda ner mall</button>
      </div>

      <div style={{ maxWidth: 520 }}>
        <div className="text-9 uppercase tracking-wide font-semibold mb-1" style={{ color: C.paperDim }}>Dina databaser ({customDbs.length})</div>
        {!loaded ? null : customDbs.length === 0 ? (
          <div className="text-11 py-3" style={{ color: C.paperDim }}>Inga egna databaser ännu. Skapa en kopia eller importera en JSON-fil ovan.</div>
        ) : (
          <div className="space-y-1.5">
            {customDbs.map(d => (
              <div key={d.id} className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl" style={{ background: "rgba(255,255,255,0.06)" }}>
                <span style={{ fontSize: 20 }}>🗂️</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold truncate">{d.name}</div>
                  <div className="text-9" style={{ color: C.paperDim }}>Skapad {new Date(d.createdAt).toLocaleDateString("sv-SE")}</div>
                </div>
                <button onClick={() => openCustomDb(d)} className="text-9 font-semibold px-2.5 py-1.5 rounded-lg shrink-0" style={{ background: "rgba(255,255,255,0.12)", color: C.paper }}>Redigera</button>
                <button onClick={() => deleteDb(d.id)} className="text-9 font-semibold px-2.5 py-1.5 rounded-lg shrink-0" style={{ background: "rgba(180,68,59,0.2)", color: "#E08A82" }}>Ta bort</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {namePromptFor && (
        <>
          <div onClick={() => setNamePromptFor(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 40 }} />
          <div style={{ position: "fixed", top: "35%", left: 20, right: 20, maxWidth: 400, margin: "0 auto", background: C.paper, color: C.ink, borderRadius: 16, padding: 20, zIndex: 41 }}>
            <div className="font-display text-lg mb-1">{namePromptFor.type === "create" ? "Namnge din nya databas" : "Namnge kopian"}</div>
            <input autoFocus value={nameInput} onChange={e => setNameInput(e.target.value)} className="w-full px-3 py-2 rounded-lg text-sm mt-2 mb-3" style={{ background: C.paperDim, color: C.ink }} placeholder="Databasnamn" />
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setNamePromptFor(null)} className="py-2 rounded-xl text-sm font-semibold" style={{ background: "transparent", border: `1px solid ${C.paperDim}`, color: C.inkSoft }}>Avbryt</button>
              <button onClick={() => confirmCreateOrSaveAs(namePromptFor.data, namePromptFor.worldPool)} className="py-2 rounded-xl text-sm font-semibold" style={{ background: C.gold, color: C.turfDeep }}>Skapa</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
function DatabaseView({ world, dbName, isCustom, onSave, onSaveAs, onExport, onSaveAndPlay, onBack }) {
  const [clubs, setClubs] = useState(world);
  const [leagueId, setLeagueId] = useState(LEAGUES[0].id);
  const [division, setDivision] = useState(1);
  const [selectedClubId, setSelectedClubId] = useState(null);
  const [editingPlayerId, setEditingPlayerId] = useState(null);
  const [saving, setSaving] = useState(false);
  async function handleSaveClick() {
    setSaving(true);
    await onSave(clubs);
    setSaving(false);
  }

  function updateClub(clubId, patch) {
    setClubs(prev => ({ ...prev, [clubId]: { ...prev[clubId], ...patch } }));
  }
  function updatePlayer(clubId, playerId, patch) {
    setClubs(prev => ({ ...prev, [clubId]: { ...prev[clubId], squad: prev[clubId].squad.map(p => p.id === playerId ? { ...p, ...patch } : p) } }));
  }

  const clubList = Object.values(clubs).filter(c => c.league === leagueId && c.division === division).sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
  const selectedClub = selectedClubId ? clubs[selectedClubId] : null;
  const editingPlayer = editingPlayerId && selectedClub ? selectedClub.squad.find(p => p.id === editingPlayerId) : null;

  if (editingPlayer) {
    return (
      <div style={{ background: C.turfDeep, minHeight: "100vh", color: C.paper }} className="p-5">
        <button onClick={() => setEditingPlayerId(null)} className="text-sm mb-3" style={{ color: C.goldSoft }}>← Tillbaka till {selectedClub.name}</button>
        <div className="font-display text-xl mb-3" style={{ color: C.goldSoft }}>Redigera spelare</div>
        <div style={{ maxWidth: 480 }} className="space-y-3">
          <div>
            <div className="text-9 uppercase font-semibold mb-1" style={{ color: C.paperDim }}>Namn</div>
            <input value={editingPlayer.name} onChange={e => updatePlayer(selectedClub.id, editingPlayer.id, { name: e.target.value })} className="w-full px-3 py-2 rounded-lg text-sm" style={{ background: C.paper, color: C.ink }} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-9 uppercase font-semibold mb-1" style={{ color: C.paperDim }}>Ålder</div>
              <input type="number" value={editingPlayer.age} onChange={e => updatePlayer(selectedClub.id, editingPlayer.id, { age: clamp(Number(e.target.value) || 0, 15, 45) })} className="w-full px-3 py-2 rounded-lg text-sm" style={{ background: C.paper, color: C.ink }} />
            </div>
            <div>
              <div className="text-9 uppercase font-semibold mb-1" style={{ color: C.paperDim }}>Nummer</div>
              <input type="number" value={editingPlayer.number} onChange={e => updatePlayer(selectedClub.id, editingPlayer.id, { number: Number(e.target.value) || 0 })} className="w-full px-3 py-2 rounded-lg text-sm" style={{ background: C.paper, color: C.ink }} />
            </div>
            <div>
              <div className="text-9 uppercase font-semibold mb-1" style={{ color: C.paperDim }}>Anfall</div>
              <input type="number" value={Math.round(editingPlayer.attack)} onChange={e => updatePlayer(selectedClub.id, editingPlayer.id, { attack: clamp(Number(e.target.value) || 0, 1, 99) })} className="w-full px-3 py-2 rounded-lg text-sm" style={{ background: C.paper, color: C.ink }} />
            </div>
            <div>
              <div className="text-9 uppercase font-semibold mb-1" style={{ color: C.paperDim }}>Försvar</div>
              <input type="number" value={Math.round(editingPlayer.defense)} onChange={e => updatePlayer(selectedClub.id, editingPlayer.id, { defense: clamp(Number(e.target.value) || 0, 1, 99) })} className="w-full px-3 py-2 rounded-lg text-sm" style={{ background: C.paper, color: C.ink }} />
            </div>
            <div>
              <div className="text-9 uppercase font-semibold mb-1" style={{ color: C.paperDim }}>Potential</div>
              <input type="number" value={Math.round(editingPlayer.potential)} onChange={e => updatePlayer(selectedClub.id, editingPlayer.id, { potential: clamp(Number(e.target.value) || 0, 1, 99) })} className="w-full px-3 py-2 rounded-lg text-sm" style={{ background: C.paper, color: C.ink }} />
            </div>
            <div>
              <div className="text-9 uppercase font-semibold mb-1" style={{ color: C.paperDim }}>Värde (£k)</div>
              <input type="number" value={editingPlayer.value} onChange={e => updatePlayer(selectedClub.id, editingPlayer.id, { value: Math.max(0, Number(e.target.value) || 0) })} className="w-full px-3 py-2 rounded-lg text-sm" style={{ background: C.paper, color: C.ink }} />
            </div>
            <div>
              <div className="text-9 uppercase font-semibold mb-1" style={{ color: C.paperDim }}>Lön (£k/omg)</div>
              <input type="number" value={editingPlayer.wage} onChange={e => updatePlayer(selectedClub.id, editingPlayer.id, { wage: Math.max(0, Number(e.target.value) || 0) })} className="w-full px-3 py-2 rounded-lg text-sm" style={{ background: C.paper, color: C.ink }} />
            </div>
            <div>
              <div className="text-9 uppercase font-semibold mb-1" style={{ color: C.paperDim }}>Nationalitet</div>
              <select value={editingPlayer.nationality} onChange={e => updatePlayer(selectedClub.id, editingPlayer.id, { nationality: e.target.value })} className="w-full px-3 py-2 rounded-lg text-sm" style={{ background: C.paper, color: C.ink }}>
                {NATIONALITY_KEYS.map(n => <option key={n} value={n}>{nationalityLabel(n)}</option>)}
              </select>
            </div>
          </div>
          <div>
            <div className="text-9 uppercase font-semibold mb-1" style={{ color: C.paperDim }}>Specifik position</div>
            <select value={editingPlayer.specificPosition} onChange={e => {
              const code = e.target.value;
              const newPos = Object.keys(SPECIFIC_POSITIONS).find(pos => SPECIFIC_POSITIONS[pos].some(sp => sp.code === code));
              updatePlayer(selectedClub.id, editingPlayer.id, { specificPosition: code, pos: newPos || editingPlayer.pos });
            }} className="w-full px-3 py-2 rounded-lg text-sm" style={{ background: C.paper, color: C.ink }}>
              {Object.keys(SPECIFIC_POSITION_LOOKUP).map(code => <option key={code} value={code}>{code}</option>)}
            </select>
          </div>
          <div>
            <div className="text-9 uppercase font-semibold mb-2" style={{ color: C.paperDim }}>Egenskaper (tomt = beräknas automatiskt från Anfall/Försvar)</div>
            <div className="grid grid-cols-3 gap-2">
              {[["shooting", "Avslut"], ["passing", "Passning"], ["dribbling", "Dribbling"], ["pace", "Fart"], ["defending", "Försvarsspel"], ["physical", "Fysik"]].map(([key, label]) => (
                <div key={key}>
                  <div className="text-9 mb-1" style={{ color: C.paperDim }}>{label}</div>
                  <input type="number" value={editingPlayer[key] ?? ""} placeholder={String(getAttrs(editingPlayer)[key])} onChange={e => updatePlayer(selectedClub.id, editingPlayer.id, { [key]: e.target.value === "" ? undefined : clamp(Number(e.target.value) || 0, 1, 99) })} className="w-full px-2.5 py-1.5 rounded-lg text-sm" style={{ background: C.paper, color: C.ink }} />
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className="text-9 uppercase font-semibold mb-2" style={{ color: C.paperDim }}>Ytterligare egenskaper (tomt = beräknas automatiskt)</div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <div className="text-9 mb-1" style={{ color: C.paperDim }}>Svag fot (1–5)</div>
                <input type="number" min="1" max="5" value={editingPlayer.weakFoot ?? ""} placeholder={String(weakFoot(editingPlayer))} onChange={e => updatePlayer(selectedClub.id, editingPlayer.id, { weakFoot: e.target.value === "" ? undefined : clamp(Number(e.target.value) || 0, 1, 5) })} className="w-full px-2.5 py-1.5 rounded-lg text-sm" style={{ background: C.paper, color: C.ink }} />
              </div>
              <div>
                <div className="text-9 mb-1" style={{ color: C.paperDim }}>Huvudspel</div>
                <input type="number" value={editingPlayer.headingAbility ?? ""} placeholder={String(headingAbility(editingPlayer))} onChange={e => updatePlayer(selectedClub.id, editingPlayer.id, { headingAbility: e.target.value === "" ? undefined : clamp(Number(e.target.value) || 0, 1, 99) })} className="w-full px-2.5 py-1.5 rounded-lg text-sm" style={{ background: C.paper, color: C.ink }} />
              </div>
              <div>
                <div className="text-9 mb-1" style={{ color: C.paperDim }}>Skaderisk</div>
                <select value={editingPlayer.injuryProneness || ""} onChange={e => updatePlayer(selectedClub.id, editingPlayer.id, { injuryProneness: e.target.value || undefined })} className="w-full px-2.5 py-1.5 rounded-lg text-sm" style={{ background: C.paper, color: C.ink }}>
                  <option value="">Standard ({injuryProneness(editingPlayer)})</option>
                  <option value="Skör">Skör</option>
                  <option value="Normal">Normal</option>
                  <option value="Robust">Robust</option>
                </select>
              </div>
              <div>
                <div className="text-9 mb-1" style={{ color: C.paperDim }}>Storform (−1 till 1)</div>
                <input type="number" step="0.1" min="-1" max="1" value={editingPlayer.clutchFactor ?? ""} placeholder={String(clutchFactor(editingPlayer))} onChange={e => updatePlayer(selectedClub.id, editingPlayer.id, { clutchFactor: e.target.value === "" ? undefined : clamp(Number(e.target.value) || 0, -1, 1) })} className="w-full px-2.5 py-1.5 rounded-lg text-sm" style={{ background: C.paper, color: C.ink }} />
              </div>
              <div>
                <div className="text-9 mb-1" style={{ color: C.paperDim }}>Uthållighet</div>
                <input type="number" value={editingPlayer.endurance ?? ""} placeholder={String(endurance(editingPlayer))} onChange={e => updatePlayer(selectedClub.id, editingPlayer.id, { endurance: e.target.value === "" ? undefined : clamp(Number(e.target.value) || 0, 1, 99) })} className="w-full px-2.5 py-1.5 rounded-lg text-sm" style={{ background: C.paper, color: C.ink }} />
              </div>
              <div>
                <div className="text-9 mb-1" style={{ color: C.paperDim }}>Beslutsamhet</div>
                <input type="number" value={editingPlayer.determination ?? ""} placeholder={String(determination(editingPlayer))} onChange={e => updatePlayer(selectedClub.id, editingPlayer.id, { determination: e.target.value === "" ? undefined : clamp(Number(e.target.value) || 0, 1, 99) })} className="w-full px-2.5 py-1.5 rounded-lg text-sm" style={{ background: C.paper, color: C.ink }} />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (selectedClub) {
    return (
      <div style={{ background: C.turfDeep, minHeight: "100vh", color: C.paper }} className="p-5">
        <button onClick={() => setSelectedClubId(null)} className="text-sm mb-3" style={{ color: C.goldSoft }}>← Tillbaka till klubblistan</button>
        <div className="font-display text-xl mb-3" style={{ color: C.goldSoft }}>Redigera klubb</div>
        <div style={{ maxWidth: 480 }} className="space-y-3 mb-4">
          <div>
            <div className="text-9 uppercase font-semibold mb-1" style={{ color: C.paperDim }}>Klubbnamn</div>
            <input value={selectedClub.name} onChange={e => updateClub(selectedClub.id, { name: e.target.value })} className="w-full px-3 py-2 rounded-lg text-sm" style={{ background: C.paper, color: C.ink }} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-9 uppercase font-semibold mb-1" style={{ color: C.paperDim }}>Klubbfärg (primär)</div>
              <input type="color" value={selectedClub.color} onChange={e => updateClub(selectedClub.id, { color: e.target.value })} className="w-full h-9 rounded-lg" style={{ background: C.paper }} />
            </div>
            <div>
              <div className="text-9 uppercase font-semibold mb-1" style={{ color: C.paperDim }}>Klubbfärg (sekundär)</div>
              <input type="color" value={selectedClub.secondaryColor || "#ffffff"} onChange={e => updateClub(selectedClub.id, { secondaryColor: e.target.value })} className="w-full h-9 rounded-lg" style={{ background: C.paper }} />
            </div>
            <div>
              <div className="text-9 uppercase font-semibold mb-1" style={{ color: C.paperDim }}>Tröjmönster</div>
              <select value={selectedClub.jerseyPattern || ""} onChange={e => updateClub(selectedClub.id, { jerseyPattern: e.target.value || undefined })} className="w-full px-3 py-2 rounded-lg text-sm" style={{ background: C.paper, color: C.ink }}>
                <option value="">Standard (slumpad från klubb-ID)</option>
                <option value="solid">Enfärgad</option>
                <option value="stripes">Ränder</option>
                <option value="hoops">Ringar</option>
                <option value="halves">Delad i två</option>
              </select>
            </div>
            <div>
              <div className="text-9 uppercase font-semibold mb-1" style={{ color: C.paperDim }}>Arenakapacitet (åskådare)</div>
              <input type="number" value={selectedClub.baseArenaCapacity ?? ""} placeholder="Standard för arketyp/division" onChange={e => updateClub(selectedClub.id, { baseArenaCapacity: e.target.value === "" ? undefined : Math.max(500, Number(e.target.value) || 0) })} className="w-full px-3 py-2 rounded-lg text-sm" style={{ background: C.paper, color: C.ink }} />
            </div>
            <div>
              <div className="text-9 uppercase font-semibold mb-1" style={{ color: C.paperDim }}>Arketyp</div>
              <select value={selectedClub.archetype} onChange={e => updateClub(selectedClub.id, { archetype: e.target.value })} className="w-full px-3 py-2 rounded-lg text-sm" style={{ background: C.paper, color: C.ink }}>
                {Object.keys(ARCHETYPES).map(a => <option key={a} value={a}>{ARCHETYPE_LABEL[a] || a}</option>)}
              </select>
            </div>
            <div>
              <div className="text-9 uppercase font-semibold mb-1" style={{ color: C.paperDim }}>Startbudget (£k)</div>
              <input type="number" value={selectedClub.startBudget ?? ""} placeholder="Standard för arketyp" onChange={e => updateClub(selectedClub.id, { startBudget: e.target.value === "" ? undefined : Math.max(0, Number(e.target.value) || 0) })} className="w-full px-3 py-2 rounded-lg text-sm" style={{ background: C.paper, color: C.ink }} />
            </div>
            <div>
              <div className="text-9 uppercase font-semibold mb-1" style={{ color: C.paperDim }}>Styrka (20-97)</div>
              <input type="number" value={Math.round(selectedClub.strength)} onChange={e => updateClub(selectedClub.id, { strength: clamp(Number(e.target.value) || 0, 20, 97) })} className="w-full px-3 py-2 rounded-lg text-sm" style={{ background: C.paper, color: C.ink }} />
            </div>
          </div>
        </div>
        <div className="font-display text-lg mb-2" style={{ color: C.goldSoft }}>Trupp ({selectedClub.squad.length})</div>
        <div style={{ maxWidth: 480 }} className="space-y-1.5">
          {selectedClub.squad.map(p => (
            <button key={p.id} onClick={() => setEditingPlayerId(p.id)} className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left" style={{ background: C.paper, color: C.ink }}>
              <span className="font-mono text-9 shrink-0" style={{ color: C.inkSoft, width: 18 }}>{p.number}</span>
              <span className="flex-1 min-w-0 text-sm font-semibold truncate">{p.name}</span>
              <span className="font-mono text-9 shrink-0" style={{ color: C.inkSoft }}>{p.specificPosition} · {p.age} år</span>
              <span className="font-mono text-11 font-bold shrink-0">{overallOf(p)}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: C.turfDeep, minHeight: "100vh", color: C.paper }} className="p-5">
      <button onClick={onBack} className="text-sm mb-3" style={{ color: C.goldSoft }}>← Tillbaka till databaslistan</button>
      <div className="font-display text-2xl mb-1" style={{ color: C.goldSoft }}>{dbName || "Databas"}</div>
      <div className="text-11 mb-4" style={{ color: C.paperDim }}>Redigera lag och spelare. {isCustom ? "Spara databasen för att behålla ändringarna permanent, eller fortsätt direkt till klubbval." : "Standarddatabasen kan inte sparas över — spara som en ny databas istället."}</div>
      <div className="flex gap-1.5 overflow-x-auto pb-1 mb-2">
        {LEAGUES.map(l => (
          <button key={l.id} onClick={() => setLeagueId(l.id)} className="px-3 py-1.5 rounded-full text-11 font-semibold shrink-0" style={leagueId === l.id ? { background: C.gold, color: C.turfDeep } : { background: "rgba(255,255,255,0.1)", color: C.paperDim }}>{l.name}</button>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2 mb-3" style={{ maxWidth: 480 }}>
        {[1, 2, 3].map(d => (
          <button key={d} onClick={() => setDivision(d)} className="py-1.5 rounded-xl text-11 font-semibold" style={division === d ? { background: C.gold, color: C.turfDeep } : { background: "rgba(255,255,255,0.08)", color: C.paperDim }}>{divisionLabel(leagueId, d)}</button>
        ))}
      </div>
      <div style={{ maxWidth: 480 }} className="space-y-1.5">
        {clubList.map(c => (
          <button key={c.id} onClick={() => setSelectedClubId(c.id)} className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left" style={{ background: "rgba(255,255,255,0.06)" }}>
            <ClubJersey club={c} size={26} />
            <span className="flex-1 min-w-0 text-sm font-semibold truncate">{c.name}</span>
            <span className="text-9" style={{ color: C.paperDim }}>{c.squad.length} spelare</span>
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2 mt-5" style={{ maxWidth: 480 }}>
        {isCustom ? (
          <button onClick={handleSaveClick} disabled={saving} className="py-2.5 rounded-xl font-display text-sm tracking-wide" style={{ background: "rgba(255,255,255,0.1)", color: C.paper, opacity: saving ? 0.6 : 1 }}>{saving ? "⏳ Sparar..." : "💾 Spara databas"}</button>
        ) : (
          <button onClick={() => onSaveAs(clubs)} className="py-2.5 rounded-xl font-display text-sm tracking-wide" style={{ background: "rgba(255,255,255,0.1)", color: C.paper }}>💾 Spara som ny databas</button>
        )}
        <button onClick={() => onExport(clubs, dbName)} className="py-2.5 rounded-xl font-display text-sm tracking-wide" style={{ background: "rgba(255,255,255,0.1)", color: C.paper }}>⬇️ Exportera Excel</button>
      </div>
      <button onClick={() => onSaveAndPlay(clubs)} className="pulse-cta w-full py-2.5 rounded-xl font-display text-sm tracking-wide mt-2.5" style={{ background: C.gold, color: C.turfDeep, maxWidth: 480 }}>✅ ANVÄND DENNA DATABAS & FORTSÄTT TILL KLUBBVAL</button>
    </div>
  );
}
function OnboardingWrap({ children }) {
  return (
    <div style={{ background: C.turfDeep, minHeight: "100vh", color: C.paper }} className="flex flex-col">
      <style>{ONBOARDING_FONT_STYLE}</style>
      {children}
    </div>
  );
}
function ClubSquadPreviewView({ club, onBack }) {
  const grouped = POS_ORDER.map(pos => ({ pos, players: (club.squad || []).filter(p => p.pos === pos).sort((a, b) => overallOf(b) - overallOf(a)) }));
  return (
    <OnboardingWrap>
      <button onClick={onBack} style={{ position: "fixed", bottom: 14, right: 14, display: "inline-block", color: "rgba(255,255,255,0.85)", background: "rgba(19,34,29,0.88)", padding: "6px 13px", borderRadius: 999, fontSize: 11, fontWeight: 600, zIndex: 50, backdropFilter: "blur(4px)", boxShadow: "0 2px 10px rgba(0,0,0,0.35)" }}>← Bakåt</button>
      <div className="max-w-md mx-auto w-full px-5 pt-10 pb-24">
        <div className="flex items-center gap-2.5 mb-1">
          <ClubJersey club={club} size={36} />
          <div className="font-display text-xl" style={{ color: C.goldSoft }}>{club.name}</div>
        </div>
        <div className="text-xs mb-4" style={{ color: C.paperDim }}>Hela truppen — overall, marknadsvärde, lön och ålder.</div>
        {grouped.map(({ pos, players }) => (
          <div key={pos} className="mb-4">
            <div className="text-xs uppercase tracking-wide font-semibold mb-2" style={{ color: C.paperDim }}>{POS_LABEL[pos]}</div>
            <div className="space-y-1.5">
              {players.map(p => {
                const overall = overallOf(p);
                return (
                  <div key={p.id} className="rounded-xl p-2.5 flex items-center gap-2.5" style={{ background: C.paper }}>
                    <div style={{ position: "relative", width: 32, height: 32, flexShrink: 0 }}>
                      <PlayerAvatar player={p} size={32} />
                      <div style={{ position: "absolute", bottom: -4, right: -4 }}><OverallBadge overall={overall} size={16} /></div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold truncate" style={{ color: C.ink }}>{p.name}</div>
                      <div className="text-10" style={{ color: C.inkSoft }}>{p.specificPosition} · {p.age} år</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-mono text-11 font-semibold" style={{ color: C.ink }}>{formatMoney(p.value)}</div>
                      <div className="font-mono text-10" style={{ color: C.inkSoft }}>{formatMoney(p.wage)}/omg</div>
                    </div>
                  </div>
                );
              })}
              {!players.length && <div className="text-11" style={{ color: C.paperDim }}>Inga spelare på den här positionen.</div>}
            </div>
          </div>
        ))}
      </div>
    </OnboardingWrap>
  );
}
function Onboarding({ world, onConfirm, onCancel }) {
  const [leagueId, setLeagueId] = useState(null);
  const [division, setDivision] = useState(null);
  const [clubId, setClubId] = useState(null);
  const [viewingSquadId, setViewingSquadId] = useState(null);
  const [step, setStep] = useState(null); // null | "name" | "press"
  const [managerName, setManagerName] = useState("");
  const [customDbs, setCustomDbs] = useState([]);
  const [selectedDbId, setSelectedDbId] = useState(null); // null = standard database (the `world` prop)
  const [activeWorld, setActiveWorld] = useState(world);
  useEffect(() => { (async () => {
    try { const res = await window.storage?.get("tranarbanken-db-index"); setCustomDbs(res ? JSON.parse(res.value) : []); } catch (e) { setCustomDbs([]); }
  })(); }, []);
  async function selectDatabase(id) {
    setSelectedDbId(id);
    if (!id) { setActiveWorld(world); return; }
    try {
      const res = await window.storage?.get(`tranarbanken-db-${id}`);
      if (res) setActiveWorld(JSON.parse(res.value));
    } catch (e) {}
  }
  const season1Qualifiers = useMemo(() => buildSeason1Qualifiers(activeWorld), [activeWorld]);

  if (viewingSquadId) {
    return <ClubSquadPreviewView club={activeWorld[viewingSquadId]} onBack={() => setViewingSquadId(null)} />;
  }

  if (!leagueId) {
    return (
      <OnboardingWrap>
        <div className="max-w-md mx-auto w-full px-5 pt-10 pb-6">
          {onCancel && <button onClick={onCancel} style={{ position: "fixed", bottom: 14, right: 14, display: "inline-block", color: "rgba(255,255,255,0.85)", background: "rgba(19,34,29,0.88)", padding: "6px 13px", borderRadius: 999, fontSize: 11, fontWeight: 600, zIndex: 50, backdropFilter: "blur(4px)", boxShadow: "0 2px 10px rgba(0,0,0,0.35)" }}>← Bakåt</button>}
          <div className="font-display text-3xl" style={{ color: C.goldSoft }}>TRÄNARBÄNKEN</div>
          <div className="text-sm mt-1" style={{ color: C.paperDim }}>Välj land att starta din managerkarriär i.</div>
          <div className="mt-4">
            <div className="text-9 uppercase tracking-wide font-semibold mb-1" style={{ color: C.paperDim }}>Databas</div>
            <select value={selectedDbId || ""} onChange={e => selectDatabase(e.target.value || null)} className="w-full px-3 py-2.5 rounded-xl text-sm font-semibold" style={{ background: C.paper, color: C.ink }}>
              <option value="">🌍 Standarddatabas</option>
              {customDbs.map(d => <option key={d.id} value={d.id}>🗂️ {d.name}</option>)}
            </select>
          </div>
        </div>
        <div className="max-w-md mx-auto w-full px-5 space-y-3 pb-10">
          {LEAGUES.map(l => (
            <button key={l.id} onClick={() => setLeagueId(l.id)} className="w-full text-left rounded-2xl p-4 flex items-center gap-3" style={{ background: C.paper, color: C.ink }}>
              <CountryFlag country={l.id} size={26} />
              <div className="min-w-0">
                <div className="font-display text-xl">{l.name}</div>
                <div className="text-xs mt-1" style={{ color: C.inkSoft }}>{l.blurb}</div>
              </div>
            </button>
          ))}
        </div>
      </OnboardingWrap>
    );
  }

  if (!division) {
    return (
      <OnboardingWrap>
        <div className="max-w-md mx-auto w-full px-5 pt-10 pb-4 flex items-center justify-between">
          <div><div className="font-display text-2xl" style={{ color: C.goldSoft }}>VÄLJ DIVISION</div><div className="text-xs mt-0.5" style={{ color: C.paperDim }}>{LEAGUES.find(l => l.id === leagueId).name}</div></div>
          <button onClick={() => setLeagueId(null)} className="text-xs" style={{ color: C.paperDim }}>Byt land</button>
        </div>
        <div className="max-w-md mx-auto w-full px-5 space-y-3 pb-10">
          {[1, 2, 3].map(d => (
            <button key={d} onClick={() => setDivision(d)} className="w-full text-left rounded-2xl p-4" style={{ background: C.paper, color: C.ink }}>
              <div className="font-display text-xl">{divisionLabel(leagueId, d)}</div>
              <div className="text-xs mt-1" style={{ color: C.inkSoft }}>{DIVISION_BLURB[d]}</div>
            </button>
          ))}
        </div>
      </OnboardingWrap>
    );
  }

  const clubs = Object.values(activeWorld).filter(c => c.league === leagueId && c.division === division);
  const selectedClub = clubId ? activeWorld[clubId] : null;

  if (clubId && step === "name") {
    return (
      <OnboardingWrap>
        <div className="max-w-md mx-auto w-full px-5 pt-10 pb-4">
          <button onClick={() => setStep(null)} className="text-xs mb-3" style={{ color: C.paperDim }}>← Byt klubb</button>
          <div className="font-display text-2xl" style={{ color: C.goldSoft }}>PRESENTERA DIG SJÄLV</div>
          <div className="text-xs mt-0.5" style={{ color: C.paperDim }}>{selectedClub.name} väntar på sin nya tränare.</div>
        </div>
        <div className="max-w-md mx-auto w-full px-5 space-y-3 pb-10">
          <div className="rounded-2xl p-4" style={{ background: C.paper }}>
            <div className="text-xs uppercase tracking-wide font-semibold" style={{ color: C.inkSoft }}>Ditt namn</div>
            <input value={managerName} onChange={e => setManagerName(e.target.value)} maxLength={28} placeholder="T.ex. Alex Lindqvist"
              className="w-full mt-2 text-lg font-semibold outline-none border-b pb-1" style={{ color: C.ink, borderColor: C.paperDim, background: "transparent" }} />
          </div>
          <button onClick={() => managerName.trim() && setStep("press")} disabled={!managerName.trim()} className="w-full py-2.5 rounded-xl font-display text-sm tracking-wide" style={managerName.trim() ? { background: C.gold, color: C.turfDeep } : { background: "rgba(255,255,255,0.1)", color: C.paperDim, opacity: 0.6 }}>NÄSTA: PRESSKONFERENS</button>
        </div>
      </OnboardingWrap>
    );
  }

  if (clubId && step === "press") {
    const target = boardTargetLabel(selectedClub.archetype, division);
    const options = presentationPressOptions(target.label);
    return (
      <OnboardingWrap>
        <div className="max-w-md mx-auto w-full px-5 pt-10 pb-4">
          <div className="font-display text-2xl" style={{ color: C.goldSoft }}>PRESSKONFERENS</div>
          <div className="text-xs mt-0.5" style={{ color: C.paperDim }}>{selectedClub.name} presenterar {managerName} som ny tränare.</div>
        </div>
        <div className="max-w-md mx-auto w-full px-5 space-y-3 pb-10">
          <div className="rounded-2xl p-4" style={{ background: "rgba(201,154,62,0.15)" }}>
            <div className="text-10 uppercase tracking-wide font-semibold" style={{ color: C.goldSoft }}>Styrelsens förväntningar</div>
            <div className="text-sm mt-1" style={{ color: C.paper }}>{target.label}</div>
          </div>
          <div className="text-11 px-1" style={{ color: C.paperDim }}>Journalisterna vill veta hur du ser på uppdraget. Vad säger du?</div>
          {options.map(opt => (
            <button key={opt.key} onClick={() => onConfirm(leagueId, division, clubId, managerName.trim(), opt.key, activeWorld)} className="w-full text-left rounded-2xl p-4" style={{ background: C.paper, color: C.ink }}>
              <div className="font-semibold text-sm">{opt.label}</div>
              <div className="text-11 mt-0.5" style={{ color: C.inkSoft }}>{opt.desc}</div>
            </button>
          ))}
        </div>
      </OnboardingWrap>
    );
  }

  return (
    <OnboardingWrap>
      <div className="max-w-md mx-auto w-full px-5 pt-10 pb-4 flex items-center justify-between">
        <div><div className="font-display text-2xl" style={{ color: C.goldSoft }}>VÄLJ KLUBB</div><div className="text-xs mt-0.5" style={{ color: C.paperDim }}>{LEAGUES.find(l => l.id === leagueId).name} · {divisionLabel(leagueId, division)}</div></div>
        <button onClick={() => { setDivision(null); setClubId(null); }} className="text-xs" style={{ color: C.paperDim }}>Byt division</button>
      </div>
      <div className="max-w-md mx-auto w-full px-5 pb-2">
        <ul className="text-9 leading-snug space-y-0.5" style={{ color: C.paperDim, listStyle: "disc", paddingLeft: 14 }}>
          <li><span style={{ color: C.paperDim }}>Kimby Mästerskapet</span>: Spelas mellan de bästa lagen från varje land. Cupen innehåller 16 lag och spelas med gruppspel + slutspel.</li>
          <li><span style={{ color: C.paperDim }}>Kimby Cupen</span>: Spelas mellan topplag från varje land. Cupen innehåller 16 lag och spelas i ett rakt slutspel.</li>
        </ul>
      </div>
      <div className="max-w-md mx-auto w-full px-5 space-y-2.5 pb-28">
        {clubs.map(c => {
          const arche = ARCHETYPES[c.archetype];
          const squadOverall = squadOverallRating(c.squad);
          const divMult = { 1: 1, 2: 0.5, 3: 0.28 }[division];
          const selected = clubId === c.id;
          return (
            <div key={c.id} onClick={() => setClubId(c.id)} className="w-full text-left rounded-2xl p-4 cursor-pointer" style={{ background: C.paper, color: C.ink, boxShadow: selected ? `0 0 0 2px ${C.gold}` : "none" }}>
              <div className="flex items-center gap-2.5">
                <ClubJersey club={c} size={36} />
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-sm truncate">{c.name}</div>
                  <div className="text-11" style={{ color: C.inkSoft }}>{ARCHETYPE_DESC[c.archetype]}</div>
                </div>
              </div>
              {(season1Qualifiers.cup1.includes(c.id) || season1Qualifiers.cup2.includes(c.id)) && (
                <div className="mt-1.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-9 font-bold" style={{ background: season1Qualifiers.cup1.includes(c.id) ? C.gold : "rgba(0,0,0,0.08)", color: season1Qualifiers.cup1.includes(c.id) ? C.turfDeep : C.inkSoft, border: season1Qualifiers.cup1.includes(c.id) ? "none" : `1px solid ${C.inkSoft}` }}>
                  <Swords size={7} /> {season1Qualifiers.cup1.includes(c.id) ? "Kimby Mästerskapet" : "Kimby Cupen"}
                </div>
              )}
              <div className="flex items-center justify-between mt-2">
                <StarRating rating={overallToStars(squadOverall)} size={9} />
                <span className="font-mono text-11" style={{ color: C.inkSoft }}>Startbudget: {formatMoney(Math.round(CLUB_BUDGET_OVERRIDES[c.id] ?? (arche.startBudget * divMult)))}</span>
              </div>
              <div className="text-10 font-mono mt-1" style={{ color: C.inkSoft }}>Arenakapacitet: {arenaCapacityForClub(c, division).toLocaleString("sv-SE")} åskådare</div>
              {selected && (
                <>
                  <div className="mt-3 pt-3 grid grid-cols-2 gap-3" style={{ borderTop: `1px dashed ${C.paperDim}` }}>
                    <div>
                      <div className="text-9 uppercase tracking-wide font-semibold mb-1" style={{ color: C.win }}>Fördelar</div>
                      <ul className="space-y-1">
                        {ARCHETYPE_TRADEOFFS[c.archetype].pros.map((t, i) => <li key={i} className="text-10" style={{ color: C.inkSoft }}>+ {t}</li>)}
                      </ul>
                    </div>
                    <div>
                      <div className="text-9 uppercase tracking-wide font-semibold mb-1" style={{ color: C.loss }}>Nackdelar</div>
                      <ul className="space-y-1">
                        {ARCHETYPE_TRADEOFFS[c.archetype].cons.map((t, i) => <li key={i} className="text-10" style={{ color: C.inkSoft }}>− {t}</li>)}
                      </ul>
                    </div>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); setViewingSquadId(c.id); }} className="mt-3 w-full py-2 rounded-xl text-xs font-semibold" style={{ background: C.turf, color: C.paper }}>Visa trupp</button>
                </>
              )}
            </div>
          );
        })}
      </div>
      {clubId && (
        <div className="fixed bottom-0 left-0 right-0 p-4" style={{ background: C.turfDeep, borderTop: `1px solid ${C.turfLine}` }}>
          <button onClick={() => setStep("name")} className="max-w-md mx-auto w-full block py-2.5 rounded-xl font-display text-sm tracking-wide" style={{ background: C.gold, color: C.turfDeep }}>NÄSTA</button>
        </div>
      )}
    </OnboardingWrap>
  );
}

function cupStatusText(cup) {
  if (cup.phase === "groups") return `Gruppspel · Omgång ${cup.groupRound + 1}/${cup.groupSchedule.length}`;
  if (cup.phase === "final") return "Final";
  return cup.roundName;
}

function generateWorldNews(clubs, userClubId, userLeagueId, cups) {
  const rand = Math.random();
  if (rand < 0.55) {
    const candidates = Object.values(clubs).filter(c => c.id !== userClubId && c.league === userLeagueId);
    if (!candidates.length) return null;
    const club = pick(candidates);
    const templates = [
      () => ({ text: `Rykten: ${club.name} sägs vara intresserade av att förstärka truppen inför nästa transferfönster.`, category: "Ligan" }),
      () => ({ text: `${club.name} imponerade stort i senaste omgången — fansen firar en stark insats.`, category: "Ligan" }),
      () => ({ text: `Tunga tider för ${club.name} efter en svag period — supportrarna börjar ifrågasätta ledningen.`, category: "Ligan" }),
      () => ({ text: `${club.name} förhandlar enligt uppgift med en spelare från en rivaliserande klubb.`, category: "Övergångar" }),
      () => ({ text: `Spekulationer om att ${club.name}s tränare kan få lämna sin post om resultaten inte vänder.`, category: "Ligan" }),
      () => ({ text: `${club.name} meddelar en ny sponsoraffär som stärker klubbens ekonomi.`, category: "Ligan" }),
    ];
    return pick(templates)();
  }
  const activeCups = ["domestic", "cup1", "cup2"].map(t => cups?.[t]).filter(c => c && !c.champion && !c.eliminated);
  if (activeCups.length) {
    const cup = pick(activeCups);
    const fieldIds = (cup.teams || cup.groups?.flat() || []).filter(id => id !== userClubId);
    const twoClubs = fieldIds.length >= 2 ? shuffle(fieldIds).slice(0, 2).map(id => clubs[id]).filter(Boolean) : null;
    if (twoClubs && twoClubs.length === 2) {
      const [a, b] = twoClubs;
      const scoreA = Math.round(a.strength + rnd(-13, 13)), scoreB = Math.round(b.strength + rnd(-13, 13));
      const winner = scoreA >= scoreB ? a : b, loser = scoreA >= scoreB ? b : a;
      const winnerGoals = rndInt(1, 3) + (Math.abs(scoreA - scoreB) > 15 ? 1 : 0), loserGoals = rndInt(0, Math.min(2, winnerGoals));
      const templates = [
        () => ({ text: `${cup.label}: ${winner.name} tros ha slagit ut ${loser.name} i en jämn drabbning.`, category: "Cup" }),
        () => ({ text: `${cup.label} fortsätter att bjuda på dramatik — ${loser.name} ser ut att ha fått lämna turneringen.`, category: "Cup" }),
        () => ({ text: `Experterna pekar ut ${winner.name} som en av favoriterna att gå långt i ${cup.label}.`, category: "Cup" }),
      ];
      const chosen = pick(templates)();
      return {
        ...chosen,
        detail: {
          competition: cup.label,
          homeName: winner.name, awayName: loser.name, homeScore: winnerGoals, awayScore: loserGoals,
          rows: [{ label: "Styrka", value: `${Math.round(winner.strength)} vs ${Math.round(loser.strength)}` }],
          note: `Troligt resultat baserat på klubbarnas styrka — inte den officiella gången i turneringen.`,
        },
      };
    }
    const templates = [
      () => ({ text: `${cup.label}: flera överraskande resultat i den senaste omgången skakar om turneringen.`, category: "Cup" }),
      () => ({ text: `${cup.label} fortsätter att bjuda på dramatik — flera favoritlag har fått det tufft.`, category: "Cup" }),
      () => ({ text: `Experterna diskuterar vilka lag som är favoriter att gå långt i ${cup.label}.`, category: "Cup" }),
    ];
    return pick(templates)();
  }
  return null;
}
const NEWS_CATEGORY_COLOR = {
  Skada: C.loss, Övergångar: C.win, Styrelse: C.gold, Scouting: "#3F74A8", Kontrakt: C.gold, Arena: "#3F74A8", Klubben: C.inkSoft, Ligan: "#7A5FB0", Cup: C.gold, Manager: "#7A5FB0", Ägare: "#3F74A8",
};
function NewsTab({ newsFeed, onNewsAction }) {
  const items = newsFeed || [];
  const [expandedId, setExpandedId] = useState(null);
  return (
    <div className="rise-in space-y-2.5">
      <PaperCard>
        <div className="font-display text-xl">Nyheter</div>
        <div className="text-11 mt-0.5" style={{ color: C.inkSoft }}>Allt som hänt i klubben, senaste överst. Tryck på en nyhet med detaljer för mer info.</div>
      </PaperCard>
      {items.length === 0 && (
        <PaperCard><div className="text-sm text-center py-4" style={{ color: C.inkSoft }}>Inga nyheter ännu — de dyker upp här allteftersom säsongen rullar på.</div></PaperCard>
      )}
      {items.map(n => {
        const color = NEWS_CATEGORY_COLOR[n.category] || C.inkSoft;
        const isOpen = expandedId === n.id;
        const action = n.detail?.action;
        return (
          <PaperCard key={n.id} style={action ? { border: `1.5px solid ${C.gold}` } : undefined}>
            <div onClick={n.detail ? () => setExpandedId(isOpen ? null : n.id) : undefined} style={n.detail ? { cursor: "pointer" } : undefined}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-9 font-bold uppercase tracking-wide px-2 py-0.5 rounded-full" style={{ background: `${color}26`, color }}>{n.category}</span>
                <span className="text-10 font-mono" style={{ color: C.inkSoft }}>S{n.season} · Omg {n.round + 1}</span>
              </div>
              <div className="text-sm">{n.text}</div>
              {n.detail && !action && (
                <div className="text-9 font-semibold mt-1" style={{ color: C.gold }}>{isOpen ? "▲ Dölj detaljer" : "▼ Visa detaljer"}</div>
              )}
              {isOpen && n.detail && <NewsDetailPanel detail={n.detail} />}
            </div>
            {action && (
              <button onClick={() => onNewsAction?.(action)} className="mt-2 w-full py-2 rounded-xl text-xs font-bold" style={{ background: C.gold, color: C.turfDeep }}>{action.label} →</button>
            )}
          </PaperCard>
        );
      })}
    </div>
  );
}
function NewsDetailPanel({ detail }) {
  return (
    <div className="mt-2 pt-2" style={{ borderTop: `1px dashed ${C.paperDim}` }}>
      {detail.competition && (
        <div className="flex items-center justify-between text-11 mb-1"><span style={{ color: C.inkSoft }}>Tävling</span><span className="font-semibold">{detail.competition}</span></div>
      )}
      {(detail.homeName || detail.awayName) && (
        <div className="flex items-center justify-center gap-3 my-1.5">
          <span className="text-sm font-medium text-right flex-1">{detail.homeName}</span>
          <span className="font-display text-xl font-bold tabular-nums" style={{ color: C.gold }}>{detail.homeScore}–{detail.awayScore}</span>
          <span className="text-sm font-medium flex-1">{detail.awayName}</span>
        </div>
      )}
      {detail.rows && detail.rows.map((r, i) => (
        <div key={i} className="flex items-center justify-between text-11 py-0.5">
          <span style={{ color: C.inkSoft }}>{r.label}</span><span className="font-semibold font-mono">{r.value}</span>
        </div>
      ))}
      {detail.note && <div className="text-10 mt-1.5 italic" style={{ color: C.inkSoft }}>{detail.note}</div>}
    </div>
  );
}
function TourPlannerView({ g, onBack, onOpenTours, onStartTour }) {
  return (
    <div className="rise-in space-y-2.5">
      <button onClick={onBack} style={{ position: "fixed", bottom: 14, right: 14, display: "inline-block", color: "rgba(255,255,255,0.85)", background: "rgba(19,34,29,0.88)", padding: "6px 13px", borderRadius: 999, fontSize: 11, fontWeight: 600, zIndex: 50, backdropFilter: "blur(4px)", boxShadow: "0 2px 10px rgba(0,0,0,0.35)" }}>← Bakåt</button>
      <PaperCard>
        <div className="font-display text-lg">Försäsongsturné</div>
        <div className="text-11 mt-0.5" style={{ color: C.inkSoft }}>En turné innehåller 4 träningsmatcher mot lokala lag och skärper också effekten av försäsongen. Bara en turné är tillåten per försäsong.</div>
        <div className="text-11 px-2.5 py-2 rounded-lg mt-2 font-bold" style={{ background: C.gold, color: C.turfDeep }}>💡 Ta ut startelva innan planering av turné för bästa effekt på laget.</div>
      </PaperCard>
      {g.tourCompletedThisOffseason ? (
        <PaperCard>
          <div className="text-11 px-2.5 py-2 rounded-xl font-semibold text-center" style={{ background: "rgba(0,0,0,0.06)", color: C.inkSoft }}>Ni har redan genomfört en turné denna försäsong — bara en är tillåten.</div>
          {g.lastTourResult && (
            <div className="mt-2 p-2.5 rounded-xl" style={{ background: C.paperDim }}>
              <div className="text-11 font-semibold mb-1">Senaste turné: {g.lastTourResult.name}</div>
              {g.lastTourResult.matches.map((m, i) => (
                <div key={i} className="text-10 flex items-center justify-between" style={{ color: C.inkSoft }}>
                  <span>vs {m.opponent}</span><span className="font-mono font-semibold" style={{ color: m.us > m.them ? C.win : m.us < m.them ? C.loss : C.inkSoft }}>{m.us}–{m.them}</span>
                </div>
              ))}
              <div className="text-10 mt-1 font-semibold" style={{ color: g.lastTourResult.income - g.lastTourResult.cost >= 0 ? C.win : C.loss }}>Nettoresultat: {formatMoney(g.lastTourResult.income - g.lastTourResult.cost)}</div>
              {g.lastTourResult.injuredName && <div className="text-10 mt-1 font-semibold" style={{ color: C.loss }}>Skada under resan: {g.lastTourResult.injuredName}</div>}
            </div>
          )}
        </PaperCard>
      ) : !g.tourOffers ? (
        <button onClick={onOpenTours} className="w-full py-2.5 rounded-xl text-sm font-semibold" style={{ background: C.turf, color: C.paper }}>Planera turné</button>
      ) : (
        <div className="space-y-2">
          {g.tourOffers.map(o => {
            const affordable = g.budget >= o.cost;
            return (
              <PaperCard key={o.id}>
                <div className="text-sm font-semibold flex items-center gap-1.5">✈️ {o.name}</div>
                <div className="text-11 mt-0.5" style={{ color: C.inkSoft }}>Kostnad {formatMoney(o.cost)} · Möjlig intäkt {formatMoney(o.incomeMin)}–{formatMoney(o.incomeMax)} · +{o.repBonus} rykte · 4 matcher</div>
                <div className="mt-1.5 grid grid-cols-2 gap-2">
                  <div>
                    <div className="text-9 uppercase tracking-wide font-semibold" style={{ color: C.win }}>Fördelar</div>
                    <ul className="mt-0.5 space-y-0.5">{(o.pros || []).map((t, i) => <li key={i} className="text-9" style={{ color: C.inkSoft }}>+ {t}</li>)}</ul>
                  </div>
                  <div>
                    <div className="text-9 uppercase tracking-wide font-semibold" style={{ color: C.loss }}>Nackdelar</div>
                    <ul className="mt-0.5 space-y-0.5">{(o.cons || []).map((t, i) => <li key={i} className="text-9" style={{ color: C.inkSoft }}>− {t}</li>)}</ul>
                  </div>
                </div>
                <button onClick={() => onStartTour(o)} disabled={!affordable} className="mt-2 w-full py-2 rounded-xl text-xs font-semibold" style={affordable ? { background: C.gold, color: C.turfDeep } : { background: C.paperDim, color: C.inkSoft, opacity: 0.6 }}>{affordable ? "Genomför turné" : "Otillräcklig budget"}</button>
              </PaperCard>
            );
          })}
        </div>
      )}
    </div>
  );
}
function HomeTab({ g, userClub, oppClub, countryName, standings, userPos, userRow, nextFixture, seasonOver, onPlay, onNewSeason, onGotoCup, onSetPlannedSub, onSetTeamTalk, onRestStars, onGotoPrep, onAdvanceSillySeason, onFinishSillySeason, onOpenTours, onStartTour, onGotoTourPlanner, onGotoTable, onGotoEconomy }) {
  const form = recentForm(g.schedule, g.round, g.userClubId);
  const isHome = nextFixture ? nextFixture.home === g.userClubId : true;
  const n = standings.length;

  if (g.sillySeasonWeeksLeft > 0) {
    const totalWeeks = 4;
    const weeksElapsed = totalWeeks - g.sillySeasonWeeksLeft;
    return (
      <div className="rise-in space-y-2">
        <PaperCard style={{ padding: 12 }}>
          <div className="flex items-center gap-2.5">
            <ClubJersey club={userClub} size={34} />
            <div className="min-w-0 flex-1">
              <div className="font-display text-lg truncate">{userClub.name}</div>
              <div className="text-10" style={{ color: C.inkSoft }}>{countryName} · Försäsong {seasonLabel(g.season)}</div>
            </div>
          </div>
        </PaperCard>
        <button onClick={onGotoTourPlanner} className="w-full text-left">
          <PaperCard style={{ padding: 10 }}>
            <div className="flex items-center gap-2.5">
              <span className="w-9 h-9 rounded-full flex items-center justify-center text-base shrink-0" style={{ background: `${C.gold}22` }}>✈️</span>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm">Planera försäsongsturné</div>
                <div className="text-10" style={{ color: C.inkSoft }}>{g.tourCompletedThisOffseason ? "Genomförd ✓" : "4 träningsmatcher, skärper laget"}</div>
              </div>
              <ChevronRight size={16} color={C.inkSoft} className="shrink-0" />
            </div>
          </PaperCard>
        </button>
        <PaperCard style={{ padding: 10 }}>
          <div className="flex items-center gap-2">
            <Landmark size={16} color={C.gold} className="shrink-0" />
            <div className="font-display text-sm">SILLY SEASON</div>
            <div className="text-9 font-mono" style={{ color: C.gold }}>· {formatGameDate(preSeasonStartDate(g.season))}</div>
          </div>
          <div className="text-10 mt-1" style={{ color: C.inkSoft, lineHeight: 1.35 }}>Transferfönstret är öppet. Scouta, värva, förhandla kontrakt och bygg upp arena, akademi och organisation innan försäsongen drar igång.</div>
          <div className="flex items-center gap-3 mt-2.5 pt-2.5" style={{ borderTop: `1px dashed ${C.paperDim}` }}>
            <span className="text-10 flex items-center gap-1" style={{ color: C.inkSoft }}>🔄 Transfers öppna</span>
            <span className="text-10 flex items-center gap-1" style={{ color: C.inkSoft }}>🏟️ Arena</span>
            <span className="text-10 flex items-center gap-1" style={{ color: C.inkSoft }}>🎓 Akademi</span>
          </div>
        </PaperCard>
        <PaperCard style={{ padding: 10 }}>
          <div className="flex items-center justify-between gap-3 mb-1.5">
            <div>
              <div className="text-9 uppercase tracking-wide font-semibold" style={{ color: C.inkSoft }}>Tid kvar</div>
              <div className="font-display text-lg mt-0.5">{g.sillySeasonWeeksLeft} {g.sillySeasonWeeksLeft === 1 ? "vecka" : "veckor"}</div>
            </div>
            {g.sillySeasonWeeksLeft > 1 ? (
              <button onClick={onAdvanceSillySeason} className="py-1.5 px-3.5 rounded-xl font-display text-xs tracking-wide shrink-0" style={{ background: C.gold, color: C.turfDeep }}>NÄSTA VECKA</button>
            ) : (
              <button onClick={onFinishSillySeason} className="pulse-cta py-1.5 px-3.5 rounded-xl font-display text-xs tracking-wide shrink-0" style={{ background: C.gold, color: C.turfDeep }}>STARTA FÖRSÄSONGEN</button>
            )}
          </div>
          <div className="h-1.5 rounded-full" style={{ background: "rgba(0,0,0,0.08)" }}>
            <div className="h-full rounded-full" style={{ width: `${(weeksElapsed / totalWeeks) * 100}%`, background: C.gold, transition: "width .5s ease" }} />
          </div>
        </PaperCard>
      </div>
    );
  }

  const pendingCupCount = ["domestic", "cup1", "cup2"].filter(t => g.cups?.[t] && !g.cups[t].champion && !g.cups[t].eliminated && g.round >= cupDueRoundNow(g.cups[t])).length;
  const activeCup = g.activeCupType ? g.cups[g.activeCupType] : null;
  const activeCupIsDue = activeCup && g.round >= cupDueRoundNow(activeCup);
  if (activeCup && !activeCup.champion && !activeCup.eliminated && activeCupIsDue) {
    return (
      <div className="rise-in space-y-2.5">
        <PaperCard>
          <div className="text-center py-3">
            <Swords size={30} color={C.gold} className="mx-auto mb-2" />
            <div className="font-display text-xl">{activeCup.label.toUpperCase()} PÅGÅR</div>
            <div className="text-sm mt-1" style={{ color: C.inkSoft }}>{cupStatusText(activeCup)}</div>
            {pendingCupCount > 1 && <div className="text-11 mt-1.5" style={{ color: C.gold }}>+{pendingCupCount - 1} till cup{pendingCupCount > 2 ? "er" : ""} pågår parallellt</div>}
          </div>
        </PaperCard>
        <button onClick={onGotoCup} className="w-full py-2.5 rounded-xl font-display text-sm tracking-wide" style={{ background: C.gold, color: C.turfDeep }}>FORTSÄTT I CUPEN</button>
      </div>
    );
  }

  if (seasonOver) {
    const s = g.lastSeasonSummary;

    const wonTrophy = s?.domesticCupResult?.startsWith("Mästare") || s?.cup1Result?.startsWith("Mästare") || s?.cup2Result?.startsWith("Mästare");
    const wonLeagueTitle = s?.pos === 1 && s?.division === 1;
    const celebrate = wonTrophy || wonLeagueTitle || (s && s.pos <= 3 && s.division > 1);
    return (
      <div className="rise-in space-y-2.5">
        <PaperCard style={{ position: "relative", overflow: "hidden", ...(wonLeagueTitle ? { background: "linear-gradient(160deg, #2A4636, #13221D 70%)", border: `2px solid ${C.gold}`, boxShadow: "0 0 28px rgba(217,169,75,0.35)" } : {}) }}>
          {celebrate && <Confetti count={wonLeagueTitle ? 60 : 24} />}
          <div className="text-center py-3">
            {wonLeagueTitle ? (
              <>
                <div className="pulse-cta" style={{ display: "inline-block", borderRadius: "50%" }}><Trophy size={48} color={C.gold} className="mx-auto mb-2" /></div>
                <div className="font-display text-3xl" style={{ color: C.goldSoft, textShadow: "0 0 18px rgba(217,169,75,0.6)" }}>SERIEMÄSTARE! 🏆</div>
                <div className="text-sm mt-1.5 font-semibold" style={{ color: C.paper }}>{userClub?.name} vinner {countryName} — Division 1!</div>
              </>
            ) : (
              <>
                <Trophy size={34} color={C.gold} className="mx-auto mb-2" />
                <div className="font-display text-2xl">SÄSONGEN ÄR SLUT</div>
                <div className="text-sm mt-1" style={{ color: C.inkSoft }}>Slutplacering: <span className="font-semibold">{s?.pos}</span> i {divisionLabel(g.leagueId, s?.division)} · {countryName}</div>
              </>
            )}
          </div>
          <div className="space-y-1 mt-1 text-xs font-mono" style={{ color: wonLeagueTitle ? "#B9C4BC" : C.inkSoft }}>
            {s?.domesticCupResult && <div>Inhemsk cup: {s.domesticCupResult}</div>}
            {s?.cup1Result && <div>Kimby Mästerskapet: {s.cup1Result}</div>}
            {s?.cup2Result && <div>Kimby Cupen: {s.cup2Result}</div>}
            {s?.leaguePositionPrize > 0 && <div style={{ color: C.win }}>Placeringspengar (Plats {s.pos}): +{formatMoney(s.leaguePositionPrize)}</div>}
            {(s?.prizeTotal - (s?.leaguePositionPrize || 0)) > 0 && <div style={{ color: C.win }}>Cupintäkter: +{formatMoney(s.prizeTotal - (s.leaguePositionPrize || 0))}</div>}
          </div>
        </PaperCard>
        <button onClick={onNewSeason} className="pulse-cta w-full py-2.5 rounded-xl font-display text-sm tracking-wide" style={{ background: C.gold, color: C.turfDeep }}>STARTA NY SÄSONG</button>
      </div>
    );
  }

  const xiPreview = getXI(g.squad, g.startingXI);
  const strengthPreview = userStrength(xiPreview, g.tactic, g.spelide, g.tacticalSettings, teamPositionFit(g.lineupCells, g.squad), g.staff);
  const report = oppClub ? scoutingReport(strengthPreview.attack, strengthPreview.defense, oppClub) : null;
  const weatherPreview = weatherForMatch(`weather${g.round}${g.userClubId}`);
  const benchOptions = g.squad.filter(p => !xiPreview.some(x => x.id === p.id) && !p.injuryWeeks && !p.suspendedMatches && !p.internationalDuty);
  const isRivalMatch = oppClub && userClub.rivalId === oppClub.id;
  const foreignOpp = oppClub && oppClub.league !== userClub.league;
  const xiReady = g.startingXI.length === 11;

  return (
    <div className="rise-in space-y-2.5">
      <PaperCard style={isRivalMatch ? { boxShadow: `0 0 0 2px ${C.gold}` } : {}}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Swords size={12} color={C.gold} />
            <span className="text-9 uppercase tracking-wide font-bold" style={{ color: C.gold }}>Seriematch · {countryName} · {formatGameDateShort(roundDate(g.season, g.round))}</span>
          </div>
          {isRivalMatch && <div className="text-9 font-bold uppercase tracking-wide px-2 py-0.5 rounded-full" style={{ background: C.gold, color: C.turfDeep }}>Lokal rival!</div>}
        </div>
        <div className="flex items-center justify-between mt-3">
          <div className="flex items-center gap-2">
            <ClubJersey club={userClub} size={36} />
            <span className="text-sm font-medium">{isHome ? "Hemma" : "Borta"}</span>
          </div>
          <span className="font-display text-xl" style={{ color: C.inkSoft }}>VS</span>
          <div className="flex items-center gap-2">
            {foreignOpp && <CountryFlag country={oppClub.league} size={16} />}
            <span className="text-sm font-medium text-right">{oppClub?.name}</span>
            <ClubJersey club={oppClub} size={36} />
          </div>
        </div>
        {oppClub && <div className="text-11 mt-2 text-center" style={{ color: C.inkSoft }}>{report.strengthLine}</div>}
        <div className="flex items-center justify-between mt-2 text-10" style={{ color: C.inkSoft }}>
          <span>Startelva {xiReady ? "✓ redo" : `✗ ${g.startingXI.length}/11`}</span>
          <span>{weatherPreview.icon} {weatherPreview.name}</span>
        </div>
        <button onClick={onGotoPrep} className="pulse-cta mt-2 w-full py-2.5 rounded-xl font-display text-sm tracking-wide flex items-center justify-center gap-2" style={{ background: C.gold, color: C.turfDeep }}>
          INFÖR MATCH
        </button>
      </PaperCard>

      <div className="grid grid-cols-2 gap-2">
        <PaperCard style={{ minHeight: 92 }} onClick={onGotoTable}>
          <div className="text-xs uppercase tracking-wide font-semibold flex items-center gap-1" style={{ color: C.inkSoft }}>📊 Tabellplacering</div>
          <div className="font-display text-2xl mt-1">{userPos}<span className="text-sm align-top" style={{ color: C.inkSoft }}>/{n}</span></div>
          <div className="font-mono text-xs mt-1" style={{ color: C.inkSoft }}>
            {userPos <= 3 ? <span style={{ color: C.win }}>Uppflyttningszon</span> : userPos > n - 3 && userClub.division < 3 ? <span style={{ color: C.loss }}>Nedflyttningszon</span> : `${userRow?.pts ?? 0} poäng`}
          </div>
        </PaperCard>
        <PaperCard style={{ minHeight: 92 }} onClick={onGotoEconomy}>
          <div className="text-xs uppercase tracking-wide font-semibold" style={{ color: C.inkSoft }}>Senaste ekonomi</div>
          <div className="font-display text-xl mt-1 flex items-center gap-1" style={{ color: g.lastDelta >= 0 ? C.win : C.loss }}>
            {g.lastDelta >= 0 ? <TrendingUp size={16} /> : <TrendingDown size={16} />}<AnimatedNumber value={g.lastDelta} format={formatMoney} />
          </div>
          <div className="font-mono text-xs mt-1" style={{ color: C.inkSoft }}>senaste omgången</div>
        </PaperCard>
        <PaperCard style={{ minHeight: 92, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <div className="text-xs uppercase tracking-wide font-semibold mb-1 flex items-center gap-1" style={{ color: C.inkSoft }}>⭐ Rykte</div>
          <StatBar label="" value={g.reputation} color={C.gold} />
        </PaperCard>
        <PaperCard style={{ minHeight: 92, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <div className="text-xs uppercase tracking-wide font-semibold mb-1 flex items-center gap-1" style={{ color: C.inkSoft }}>❤️ Fanbase</div>
          <StatBar label="" value={g.fanbase} color={C.turf} />
        </PaperCard>
        <PaperCard style={{ gridColumn: "span 2" }}>
          <div className="text-xs uppercase tracking-wide font-semibold mb-1 flex items-center gap-1" style={{ color: C.inkSoft }}>🏛️ Styrelsens förtroende</div>
          <StatBar label="" value={g.boardConfidence} color={g.boardConfidence <= 30 ? C.loss : C.gold} />
        </PaperCard>
      </div>

      <PaperCard>
        <div className="text-xs uppercase tracking-wide font-semibold mb-2" style={{ color: C.inkSoft }}>Form (senaste 5)</div>
        <div className="flex gap-2">
          {form.length === 0 && <span className="text-sm" style={{ color: C.inkSoft }}>Inga matcher spelade än.</span>}
          {form.map((r, i) => <ResultChip key={i} result={r} />)}
        </div>
      </PaperCard>
    </div>
  );
}

function MatchPrepView({ g, userClub, oppClub, countryName, isHome, onBack, onSetPlannedSub, onSetTeamTalk, onRestStars, onSetTicketPrice, onGotoSquad, onPlay }) {
  const matchIssues = lineupIssues(g.squad, g.startingXI, "league");
  const xiPreview = getXI(g.squad, g.startingXI);
  const strengthPreview = userStrength(xiPreview, g.tactic, g.spelide, g.tacticalSettings, teamPositionFit(g.lineupCells, g.squad), g.staff);
  const report = oppClub ? scoutingReport(strengthPreview.attack, strengthPreview.defense, oppClub) : null;
  const weatherPreview = weatherForMatch(`weather${g.round}${g.userClubId}`);
  const benchOptions = g.squad.filter(p => !xiPreview.some(x => x.id === p.id) && !p.injuryWeeks && !p.suspendedMatches && !p.internationalDuty);
  const foreignOpp = oppClub && oppClub.league !== userClub.league;
  const xiReady = g.startingXI.length === 11;
  const currentTier = TICKET_TIERS[g.ticketPrice] || TICKET_TIERS.t3;
  const isDerbyPrep = oppClub && userClub.rivalId === oppClub.id;
  const form5Prep = recentForm(g.schedule, g.round, g.userClubId);
  const onForm = form5Prep.filter(r => r === "win").length >= 3;
  const bigDraw = isHome && (isDerbyPrep || (oppClub && oppClub.strength >= 75) || onForm);
  const unavailablePlayers = g.squad.filter(p => p.injuryWeeks > 0 || p.suspendedMatches > 0 || p.internationalDuty);
  const oppNewsNote = oppClub ? oppTeamNewsNote(oppClub, g.round) : "";

  return (
    <div className="rise-in space-y-2.5">
      <button onClick={onBack} style={{ position: "fixed", bottom: 14, right: 14, display: "inline-block", color: "rgba(255,255,255,0.85)", background: "rgba(19,34,29,0.88)", padding: "6px 13px", borderRadius: 999, fontSize: 11, fontWeight: 600, zIndex: 50, backdropFilter: "blur(4px)", boxShadow: "0 2px 10px rgba(0,0,0,0.35)" }}>← Bakåt</button>

      <PaperCard>
        <div className="flex items-center gap-1.5 mb-2">
          <Swords size={12} color={C.gold} />
          <span className="text-9 uppercase tracking-wide font-bold" style={{ color: C.gold }}>Seriematch · {countryName} · {formatGameDateShort(roundDate(g.season, g.round))}</span>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ClubJersey club={userClub} size={36} />
            <span className="text-sm font-medium">{isHome ? "Hemma" : "Borta"}</span>
          </div>
          <span className="font-display text-xl" style={{ color: C.inkSoft }}>VS</span>
          <div className="flex items-center gap-2">
            {foreignOpp && <CountryFlag country={oppClub.league} size={16} />}
            <span className="text-sm font-medium text-right">{oppClub?.name}</span>
            <ClubJersey club={oppClub} size={36} />
          </div>
        </div>
        {oppClub && (
          <div className="mt-3 p-2.5 rounded-xl" style={{ background: "rgba(0,0,0,0.04)" }}>
            <div className="text-10 uppercase tracking-wide font-semibold" style={{ color: C.inkSoft }}>Scoutrapport · {oppClub.manager?.name} ({nationalityLabel(oppClub.manager?.nationality)})</div>
            <div className="text-11 mt-1" style={{ color: C.ink }}>{report.strengthLine}</div>
            <div className="text-11" style={{ color: C.inkSoft }}>{report.archLine}</div>
            <div className="text-10 mt-1.5" style={{ color: C.inkSoft }}>{weatherPreview.icon} {weatherPreview.name} väntas.</div>
          </div>
        )}
      </PaperCard>

      {matchIssues.length > 0 && (
        <PaperCard style={{ background: "rgba(180,68,59,0.15)", border: `1px solid ${C.loss}` }}>
          <div className="text-sm font-bold text-center" style={{ color: C.loss }}>⚠️ Ni har ingen matchklar startelva</div>
          <div className="text-11 mt-1 space-y-0.5" style={{ color: C.paper }}>
            {matchIssues.map((issue, i) => <div key={i}>• {issue}</div>)}
          </div>
          <button onClick={onGotoSquad} className="mt-2 w-full py-2 rounded-xl text-xs font-semibold" style={{ background: C.loss, color: "#fff" }}>Byt ut i Trupp-fliken</button>
        </PaperCard>
      )}
      <button onClick={onPlay} disabled={matchIssues.length > 0} className="pulse-cta w-full py-2.5 rounded-xl font-display text-sm tracking-wide flex items-center justify-center gap-2" style={matchIssues.length > 0 ? { background: C.paperDim, color: C.inkSoft, opacity: 0.6 } : { background: C.gold, color: C.turfDeep }}>
        <Play size={16} fill={C.turfDeep} /> SPELA MATCH
      </button>

      <PaperCard>
        <div className="text-xs uppercase tracking-wide font-semibold mb-2" style={{ color: C.inkSoft }}>Lagnyheter</div>
        <div className="text-10 uppercase tracking-wide font-semibold mb-1" style={{ color: C.paperDim }}>{userClub.name}</div>
        {unavailablePlayers.length === 0 ? (
          <div className="text-11 mb-2" style={{ color: C.win }}>Ingen frånvaro att rapportera — hela truppen redo.</div>
        ) : (
          <div className="space-y-1 mb-2">
            {unavailablePlayers.map(p => (
              <div key={p.id} className="flex items-center justify-between text-11">
                <span>{p.name}</span>
                <span style={{ color: C.loss }}>{p.injuryWeeks > 0 ? `Skadad · ${p.injuryWeeks} omg` : p.suspendedMatches > 0 ? `Avstängd · ${p.suspendedMatches} omg` : "Landslagsuppdrag"}</span>
              </div>
            ))}
          </div>
        )}
        {oppClub && (
          <>
            <div className="text-10 uppercase tracking-wide font-semibold mb-1 mt-2" style={{ color: C.paperDim }}>{oppClub.name}</div>
            <div className="text-11" style={{ color: C.inkSoft }}>{oppNewsNote}</div>
          </>
        )}
      </PaperCard>

      <PaperCard>
        <div className="flex items-center justify-between">
          <span className="text-xs uppercase tracking-wide font-semibold" style={{ color: C.inkSoft }}>Startelva</span>
          <span className="font-mono text-sm font-semibold" style={{ color: xiReady ? C.win : C.loss }}>{g.startingXI.length}/11</span>
        </div>
        <div className="text-11 mt-1" style={{ color: C.inkSoft }}>Formation {g.formationCode} · Taktisk vana {g.formationFamiliarity || 0}%</div>
        <div className="h-1.5 rounded-full mt-1.5" style={{ background: "rgba(255,255,255,0.1)" }}><div className="h-full rounded-full" style={{ width: `${clamp(g.formationFamiliarity || 0, 0, 100)}%`, background: C.gold, transition: "width .5s ease" }} /></div>
        <button onClick={onGotoSquad} className="mt-2 w-full py-2 rounded-xl text-xs font-semibold" style={{ background: "transparent", border: `1px solid ${C.inkSoft}`, color: C.inkSoft }}>Ställ upp laget i Trupp</button>
        <div className="text-xs uppercase tracking-wide font-semibold mb-1.5 mt-3 pt-3" style={{ color: C.inkSoft, borderTop: `1px solid rgba(30,42,34,0.1)` }}>Lagtal</div>
        <div className="grid grid-cols-3 gap-2">
          {Object.entries(TEAM_TALK_OPTIONS).map(([key, opt]) => (
            <button key={key} onClick={() => onSetTeamTalk(key)} className="py-2 rounded-xl text-xs font-semibold border"
              style={g.teamTalk === key ? { background: C.turf, color: C.paper, borderColor: C.turf } : { background: "transparent", color: C.inkSoft, borderColor: C.paperDim }}>{opt.label}</button>
          ))}
        </div>
      </PaperCard>

      <div className="text-11 px-1 py-2 text-center" style={{ color: C.paperDim }}>Taktik, spelidé och kapten ställs in under <b>Trupp</b>, tillsammans med startelvan.</div>

      <PaperCard>
        <div className="text-xs uppercase tracking-wide font-semibold mb-1.5" style={{ color: C.inkSoft }}>Planerat byte vid paus (om ni ligger under)</div>
        <div className="grid grid-cols-2 gap-2">
          <select value={g.plannedSub?.outId || ""} onChange={e => onSetPlannedSub(e.target.value || null, g.plannedSub?.inId || null)} className="text-11 rounded-xl px-2 py-2 border" style={{ borderColor: C.paperDim, background: "transparent", color: C.paper }}>
            <option value="" style={{ color: "#000" }}>Spelare ut...</option>
            {xiPreview.map(p => <option key={p.id} value={p.id} style={{ color: "#000" }}>{p.name}</option>)}
          </select>
          <select value={g.plannedSub?.inId || ""} onChange={e => onSetPlannedSub(g.plannedSub?.outId || null, e.target.value || null)} className="text-11 rounded-xl px-2 py-2 border" style={{ borderColor: C.paperDim, background: "transparent", color: C.paper }}>
            <option value="" style={{ color: "#000" }}>Spelare in...</option>
            {benchOptions.map(p => <option key={p.id} value={p.id} style={{ color: "#000" }}>{p.name}</option>)}
          </select>
        </div>
        {g.plannedSub && <div className="text-10 mt-1" style={{ color: C.inkSoft }}>Bytet görs automatiskt i paus om ni ligger under.</div>}
        <button onClick={onRestStars} disabled={g.restedForMatch} className="mt-3 w-full py-2 rounded-xl text-xs font-semibold" style={g.restedForMatch ? { background: "rgba(0,0,0,0.06)", color: C.inkSoft, opacity: 0.6 } : { background: "transparent", border: `1px solid ${C.inkSoft}`, color: C.inkSoft }}>
          {g.restedForMatch ? "Stjärnorna vilas denna match" : "Vila stjärnorna inför denna match"}
        </button>
      </PaperCard>

      {isHome && bigDraw && (
        <div className="text-11 px-2.5 py-1.5 rounded-lg font-semibold" style={{ background: "rgba(201,154,62,0.15)", color: C.gold }}>
          🎟️ Storpublik väntas — {isDerbyPrep ? "lokal rivalmatch!" : oppClub && oppClub.strength >= 75 ? "starkt motstånd drar folk!" : "formstarkt lag lockar publik!"} (Biljettpris ställs in under Ekonomi.)
        </div>
      )}
    </div>
  );
}

function MatchResultView({ report, userTeamName, competitionLabel, onContinue }) {
  const { oppName, userIsHome, userGoals, oppGoals, result, ratings, penalties, weather, keyMoments, isDerby, stats, motm } = report;
  const showingFinal = true;

  const resultLabel = { win: "SEGER", draw: "OAVGJORT", loss: "FÖRLUST" }[result];
  const resultColor = { win: C.win, draw: C.draw, loss: C.loss }[result];
  const homeIsUser = userIsHome === undefined ? true : userIsHome;
  const homeScore = homeIsUser ? userGoals : oppGoals;
  const awayScore = homeIsUser ? oppGoals : userGoals;
  const homeName = homeIsUser ? userTeamName : oppName;
  const awayName = homeIsUser ? oppName : userTeamName;

  return (
    <div className="rise-in space-y-2.5">
      <div className="ticket rounded-2xl overflow-hidden" style={{ background: C.paper, color: C.ink }}>
        <div className="px-4 pt-4 pb-3 text-center">
          {isDerby && <div className="text-9 font-bold uppercase tracking-wide inline-block px-2 py-0.5 rounded-full mb-1.5" style={{ background: C.gold, color: C.turfDeep }}>Lokal derby</div>}
          <div className="text-10 tracking-20 uppercase font-semibold" style={{ color: C.inkSoft }}>
            {competitionLabel || "Matchbiljett"} · Slutresultat{weather ? ` · ${weather.icon} ${weather.name}` : ""}
          </div>
          <div className="font-display text-sm mt-2" style={{ color: resultColor }}>{resultLabel}</div>
          <div className="flex items-center justify-center gap-3 mt-2">
            <span className="flex items-center gap-1.5 w-28 justify-end"><span className="text-sm font-medium text-right truncate">{homeName}</span><span style={{ width: 18, height: 18, borderRadius: "50%", background: (report.userIsHome ? report.userColor : report.oppColor) || C.paperDim, border: "2px solid rgba(30,42,34,0.15)", flexShrink: 0 }} /></span>
            <span className="font-display text-4xl tabular-nums">{homeScore} – {awayScore}</span>
            <span className="flex items-center gap-1.5 w-28"><span style={{ width: 18, height: 18, borderRadius: "50%", background: (report.userIsHome ? report.oppColor : report.userColor) || C.paperDim, border: "2px solid rgba(30,42,34,0.15)", flexShrink: 0 }} /><span className="text-sm font-medium text-left truncate">{awayName}</span></span>
          </div>
          {penalties && <div className="text-xs mt-1.5 font-mono" style={{ color: C.inkSoft }}>Straffar: {penalties}</div>}
          {report.attendance != null && (
            <div className="text-10 mt-2 font-mono" style={{ color: C.inkSoft }}>
              🎟️ {report.attendance.toLocaleString("sv-SE")} åskådare
              {report.arenaCapacity ? ` · ${Math.round((report.attendance / report.arenaCapacity) * 100)}% beläggning` : ""}
            </div>
          )}
        </div>
      </div>
      <button onClick={onContinue} className="pulse-cta w-full py-2.5 rounded-xl font-display text-sm tracking-wide flex items-center justify-center gap-1" style={{ background: C.gold, color: C.turfDeep }}>
        FORTSÄTT <ChevronRight size={16} />
      </button>
      <div className="ticket rounded-2xl overflow-hidden" style={{ background: C.paper, color: C.ink }}>
        {showingFinal && keyMoments && keyMoments.length > 0 && (
          <>
            <div className="px-4 py-3">
              <div className="text-10 tracking-15 uppercase font-semibold mb-1.5" style={{ color: C.inkSoft }}>Matchreferat</div>
              <div className="space-y-1">
                {keyMoments.map((line, i) => <div key={i} className="text-11" style={{ color: C.inkSoft }}>{line}</div>)}
              </div>
            </div>
          </>
        )}
        {showingFinal && stats && (
          <>
            <div className="border-t border-dashed mx-4" style={{ borderColor: C.paperDim }} />
            <div className="px-4 py-3">
              <div className="text-10 tracking-15 uppercase font-semibold mb-2" style={{ color: C.inkSoft }}>Matchstatistik</div>
              <div className="space-y-2.5">
                {[
                  ["Bollinnehav", stats.possession, 100 - stats.possession, `${stats.possession}%`, `${100 - stats.possession}%`],
                  ["Skott", stats.userShots, stats.oppShots, stats.userShots, stats.oppShots],
                  ["Skott på mål", stats.userShotsOnTarget, stats.oppShotsOnTarget, stats.userShotsOnTarget, stats.oppShotsOnTarget],
                  ["Hörnor", stats.userCorners, stats.oppCorners, stats.userCorners, stats.oppCorners],
                  ["Foul", stats.userFouls, stats.oppFouls, stats.userFouls, stats.oppFouls],
                ].map(([label, a, b, aLabel, bLabel]) => {
                  const total = a + b || 1;
                  return (
                    <div key={label}>
                      <div className="flex items-center justify-between text-10 mb-0.5" style={{ color: C.inkSoft }}>
                        <span className="font-mono font-semibold" style={{ color: C.ink }}>{aLabel}</span><span>{label}</span><span className="font-mono font-semibold" style={{ color: C.ink }}>{bLabel}</span>
                      </div>
                      <div className="flex h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(0,0,0,0.08)" }}>
                        <div style={{ width: `${(a / total) * 100}%`, background: C.gold }} />
                        <div style={{ width: `${(b / total) * 100}%`, background: C.turf }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
        {showingFinal && motm && (
          <>
            <div className="border-t border-dashed mx-4" style={{ borderColor: C.paperDim }} />
            <div className="px-4 py-3 flex items-center justify-between">
              <div className="text-10 tracking-15 uppercase font-semibold" style={{ color: C.inkSoft }}>Bästa spelare</div>
              <div className="text-sm font-semibold flex items-center gap-1.5">{motm.name} <span className="font-mono text-11" style={{ color: C.gold }}>{motm.rating.toFixed(1)}</span></div>
            </div>
          </>
        )}
        {showingFinal && (
          <>
            <div className="border-t border-dashed mx-4" style={{ borderColor: C.paperDim }} />
            <div className="px-4 py-3">
              <div className="text-10 tracking-15 uppercase font-semibold mb-1.5" style={{ color: C.inkSoft }}>Spelarbetyg</div>
              <div className="space-y-1.5 max-h-52 overflow-y-auto">
                {ratings.slice(0, 8).map(p => (
                  <div key={p.id} className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-1.5 truncate">
                      {p.name} <span className="font-mono text-10" style={{ color: C.inkSoft }}>{p.pos}</span>
                      {p.goals > 0 && <span className="font-mono text-10" style={{ color: C.gold }}>⚽ x{p.goals}</span>}
                    </span>
                    <span className="font-mono font-semibold" style={{ color: p.rating >= 7 ? C.win : p.rating < 5.5 ? C.loss : C.inkSoft }}>{p.rating.toFixed(1)}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
        {showingFinal && report.incomeBreakdown && (
          <>
            <div className="border-t border-dashed mx-4" style={{ borderColor: C.paperDim }} />
            <div className="px-4 py-3">
              <div className="text-10 tracking-15 uppercase font-semibold mb-1.5" style={{ color: C.inkSoft }}>Matchekonomi</div>
              <div className="space-y-1">
                {report.incomeBreakdown.userIsHome && (
                  <>
                    <div className="flex items-center justify-between text-sm"><span style={{ color: C.inkSoft }}>Biljetter</span><span className="font-mono">{formatMoney(report.incomeBreakdown.tickets)}</span></div>
                    <div className="flex items-center justify-between text-sm"><span style={{ color: C.inkSoft }}>Restaurang</span><span className="font-mono">{formatMoney(report.incomeBreakdown.restaurant)}</span></div>
                  </>
                )}
                <div className="flex items-center justify-between text-sm"><span style={{ color: C.inkSoft }}>Klubbutik</span><span className="font-mono">{formatMoney(report.incomeBreakdown.shop)}</span></div>
                <div className="flex items-center justify-between text-sm"><span style={{ color: C.inkSoft }}>Sponsring & TV</span><span className="font-mono">{formatMoney(report.incomeBreakdown.sponsorsAndTv)}</span></div>
                <div className="flex items-center justify-between text-sm" style={{ borderTop: `1px dashed ${C.paperDim}`, paddingTop: 4, marginTop: 2 }}><span style={{ color: C.inkSoft }}>Bruttointäkt</span><span className="font-mono font-semibold">{formatMoney(report.incomeBreakdown.income)}</span></div>
                <div className="flex items-center justify-between text-sm"><span style={{ color: C.inkSoft }}>Löner</span><span className="font-mono" style={{ color: C.loss }}>−{formatMoney(report.incomeBreakdown.wageBill)}</span></div>
                <div className="flex items-center justify-between text-sm font-semibold" style={{ borderTop: `1px solid ${C.paperDim}`, paddingTop: 4, marginTop: 2 }}>
                  <span>Totalt denna omgång</span><span className="font-mono" style={{ color: report.incomeBreakdown.total >= 0 ? C.win : C.loss }}>{report.incomeBreakdown.total >= 0 ? "+" : ""}{formatMoney(report.incomeBreakdown.total)}</span>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function PressConferenceView({ report, onRespond }) {
  const options = pressConferenceOptions(report.result);
  const resultLabel = { win: "efter segern", draw: "efter oavgjort", loss: "efter förlusten" }[report.result];
  return (
    <div className="rise-in space-y-2.5">
      <PaperCard>
        <div className="text-xs uppercase tracking-wide font-semibold" style={{ color: C.inkSoft }}>Presskonferens</div>
        <div className="text-sm mt-1" style={{ color: C.inkSoft }}>Journalisterna vill ha en kommentar {resultLabel} mot {report.oppName}. Vad säger ni?</div>
      </PaperCard>
      <div className="space-y-2">
        {options.map(opt => (
          <button key={opt.key} onClick={() => onRespond(opt.key)} className="w-full text-left p-3.5 rounded-2xl" style={{ background: C.paper, color: C.ink }}>
            <div className="font-semibold text-sm">{opt.label}</div>
            <div className="text-11 mt-0.5" style={{ color: C.inkSoft }}>{opt.desc}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

function ManagerProfileView({ manager, assistantManager, staff, g, userClub, onRespondInterest, onHireAssistant, onSetDifficulty, onOpenJobMarket, onOpenCV, onOpenVision, onOpenMatchGuide, onBack }) {
  const [hiringOpen, setHiringOpen] = useState(false);
  const [assistOffers, setAssistOffers] = useState([]);
  const orgReady = assistantManagerUnlockedViaOrg(staff);
  const managerStars = overallToStars(manager.reputation);
  function openHiring() { setAssistOffers(generateAssistantManagerOffers(userClub.league, orgReady)); setHiringOpen(true); }
  const tips = assistantManager ? generateManagerTips(g, userClub) : [];
  const careerHistory = g.history || [];
  const careerTrophies = careerHistory.reduce((sum, s) => sum + (s.domesticCupResult?.startsWith("Mästare") ? 1 : 0) + (s.cup1Result?.startsWith("Mästare") ? 1 : 0) + (s.cup2Result?.startsWith("Mästare") ? 1 : 0), 0);
  const careerBestFinish = careerHistory.length ? Math.min(...careerHistory.map(s => s.pos)) : null;
  const careerPromotions = careerHistory.filter((s, i) => i > 0 && s.division < careerHistory[i - 1].division).length;

  return (
    <div className="rise-in space-y-2.5">
      <button onClick={onBack} style={{ position: "fixed", bottom: 14, right: 14, display: "inline-block", color: "rgba(255,255,255,0.85)", background: "rgba(19,34,29,0.88)", padding: "6px 13px", borderRadius: 999, fontSize: 11, fontWeight: 600, zIndex: 50, backdropFilter: "blur(4px)", boxShadow: "0 2px 10px rgba(0,0,0,0.35)" }}>← Bakåt</button>
      <PaperCard>
        <div className="flex items-center gap-3">
          <PlayerAvatar player={{ id: manager.name, age: 40 + (manager.yearsAsManager || 0) }} size={56} />
          <div className="flex-1 min-w-0">
            <div className="font-display text-xl truncate">{manager.name}</div>
            <div className="text-11" style={{ color: C.inkSoft }}>{nationalityLabel(manager.nationality)} · {manager.yearsAsManager} år som tränare</div>
            <div className="mt-1"><StarRating rating={managerStars} size={11} /></div>
          </div>
        </div>
        <button onClick={onOpenCV} className="w-full mt-3 py-2 rounded-xl text-11 font-semibold" style={{ background: "transparent", border: `1px solid ${C.gold}`, color: "#B8862E" }}>📋 Visa fullständigt CV & karriärhistorik</button>
        <button onClick={onOpenVision} className="w-full mt-2 py-2 rounded-xl text-11 font-semibold" style={{ background: "transparent", border: `1px solid ${C.gold}`, color: "#B8862E" }}>🔮 Framtidsvisionen</button>
        <div className="grid grid-cols-2 gap-3 mt-3">
          <div><div className="text-10 uppercase tracking-wide font-semibold" style={{ color: C.inkSoft }}>Kontraktslön</div><div className="font-mono text-sm font-semibold mt-0.5">{formatMoney(manager.wage)}/omg</div></div>
          <div><div className="text-10 uppercase tracking-wide font-semibold" style={{ color: C.inkSoft }}>Kontrakt</div><div className="font-mono text-sm font-semibold mt-0.5">{manager.contractYears} år kvar</div></div>
        </div>
        <button onClick={onOpenJobMarket} className="mt-3 w-full py-2 rounded-xl text-xs font-semibold" style={{ background: "transparent", border: `1px solid ${C.gold}`, color: C.goldSoft }}>Utforska jobbmarknaden</button>
        <div className="text-9 uppercase tracking-wide font-semibold mt-3 mb-1.5" style={{ color: C.inkSoft }}>Karriärstatistik</div>
        <div className="grid grid-cols-4 gap-1.5 text-center">
          <div><div className="font-display text-lg">{careerHistory.length}</div><div className="text-9 uppercase" style={{ color: C.inkSoft }}>Säsonger</div></div>
          <div><div className="font-display text-lg" style={{ color: careerTrophies ? C.gold : C.ink }}>{careerTrophies}</div><div className="text-9 uppercase" style={{ color: C.inkSoft }}>Titlar</div></div>
          <div><div className="font-display text-lg">{careerBestFinish || "–"}</div><div className="text-9 uppercase" style={{ color: C.inkSoft }}>Bäst placering</div></div>
          <div><div className="font-display text-lg" style={{ color: careerPromotions ? C.win : C.ink }}>{careerPromotions}</div><div className="text-9 uppercase" style={{ color: C.inkSoft }}>Uppflyttningar</div></div>
        </div>
      </PaperCard>

      <PaperCard>
        <div className="text-xs uppercase tracking-wide font-semibold mb-2" style={{ color: C.inkSoft }}>Egenskaper</div>
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(manager.attributes).map(([key, val]) => (
            <AttributeGridCard key={key} attrKey={key} label={MANAGER_ATTR_LABELS[key]} value={val} icon={MANAGER_ATTR_ICONS[key]} />
          ))}
        </div>
      </PaperCard>

      {manager.interestedClub && (
        <PaperCard style={{ background: "rgba(201,154,62,0.15)" }}>
          <div className="text-xs uppercase tracking-wide font-semibold" style={{ color: C.inkSoft }}>Intresserad klubb</div>
          <div className="text-sm font-semibold mt-1">{manager.interestedClub.clubName}</div>
          <div className="text-11 mt-1" style={{ color: C.inkSoft }}>De hör sig för om du är intresserad av ett byte, och antyder en lön på {formatMoney(manager.interestedClub.offeredWage)}/omg. Ni kan inte byta klubb rakt av, men intresset ger förhandlingsläge hos er nuvarande ägare.</div>
          <div className="flex gap-2 mt-2">
            <button onClick={() => onRespondInterest("leverage")} className="flex-1 py-2 rounded-xl text-xs font-semibold" style={{ background: C.turf, color: C.paper }}>Använd som förhandlingsmedel</button>
            <button onClick={() => onRespondInterest("decline")} className="flex-1 py-2 rounded-xl text-xs font-semibold" style={{ background: "transparent", border: `1px solid ${C.inkSoft}`, color: C.inkSoft }}>Avvisa artigt</button>
          </div>
        </PaperCard>
      )}

      <div className="text-xs uppercase tracking-wide font-semibold px-1" style={{ color: C.paperDim }}>Assisterande manager</div>
      {assistantManager ? (
        <PaperCard>
          <div className="flex items-center justify-between">
            <div>
              <div className="font-semibold text-sm">{assistantManager.name}</div>
              <div className="text-11" style={{ color: C.inkSoft }}>{nationalityLabel(assistantManager.nationality)} · {formatMoney(assistantManager.wage)}/omg</div>
            </div>
            <LevelDots level={assistantManager.level} />
          </div>
          <div className="mt-3 space-y-1.5">
            {tips.map((tip, i) => (
              <div key={i} className="flex items-start gap-1.5 text-11" style={{ color: C.ink }}>
                <MessageCircle size={13} color={C.gold} className="shrink-0 mt-0.5" />
                <span>{tip}</span>
              </div>
            ))}
          </div>
          <button onClick={onOpenMatchGuide} className="mt-3 w-full py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-1.5" style={{ background: "transparent", border: `1px solid ${C.gold}`, color: "#B8862E" }}>ⓘ Vad påverkar matchresultat?</button>
        </PaperCard>
      ) : (
        <PaperCard>
          <div className="text-sm" style={{ color: C.inkSoft }}>En assisterande manager ger dig kontinuerliga tips om truppen, ekonomin och taktiken. Svår att anlita — kräver antingen att hela klubbens personalstab (assisterande tränare, fysioterapeut, huvudscout) redan är på plats, eller en rejäl signeringsavgift.</div>
          <div className="text-11 mt-2" style={{ color: orgReady ? C.win : C.loss }}>{orgReady ? "✓ Organisationen är redo — normal kostnad." : "✗ Organisationen är inte redo — kräver premiumkostnad."}</div>
          <button onClick={openHiring} className="mt-2 w-full py-2.5 rounded-xl text-sm font-semibold" style={{ background: C.gold, color: C.turfDeep }}>Utforska kandidater</button>
          {hiringOpen && (
            <div className="mt-2 space-y-2">
              {assistOffers.map(o => (
                <button key={o.id} onClick={() => { onHireAssistant(o); setHiringOpen(false); }} className="w-full text-left p-2.5 rounded-xl" style={{ background: C.paperDim }}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold">{o.name} <span className="font-normal" style={{ color: C.inkSoft }}>({nationalityLabel(o.nationality)})</span></span>
                    <LevelDots level={o.level} />
                  </div>
                  <div className="text-10 mt-0.5" style={{ color: C.inkSoft }}>Lön: {formatMoney(o.wage)}/omg{!orgReady ? " (inkl. premium eftersom organisationen inte är komplett)" : ""}</div>
                </button>
              ))}
            </div>
          )}
        </PaperCard>
      )}

      <PaperCard>
        <div className="text-xs uppercase tracking-wide font-semibold mb-1.5" style={{ color: C.inkSoft }}>Svårighetsgrad</div>
        <div className="grid grid-cols-3 gap-2">
          {Object.entries(DIFFICULTY_SETTINGS).map(([key, opt]) => (
            <button key={key} onClick={() => onSetDifficulty(key)} className="py-2 rounded-xl text-xs font-semibold border"
              style={g.difficulty === key ? { background: C.turf, color: C.paper, borderColor: C.turf } : { background: "transparent", color: C.inkSoft, borderColor: C.paperDim }}>{opt.label}</button>
          ))}
        </div>
        <div className="text-11 mt-2" style={{ color: C.inkSoft }}>{(DIFFICULTY_SETTINGS[g.difficulty] || DIFFICULTY_SETTINGS.normal).desc}</div>
      </PaperCard>
    </div>
  );
}

function FinanceBarChart({ history }) {
  const seasons = history.filter(h => h.incomeTotal !== undefined);
  if (!seasons.length) return null;
  const nets = seasons.map(h => (h.incomeTotal || 0) - (h.wageTotal || 0));
  const maxAbs = Math.max(...nets.map(n => Math.abs(n)), 1);
  return (
    <PaperCard>
      <div className="text-xs uppercase tracking-wide font-semibold mb-2" style={{ color: C.inkSoft }}>Ekonomi per säsong (netto)</div>
      <div className="flex items-end gap-1.5" style={{ height: 70 }}>
        {seasons.map((h, i) => {
          const net = nets[i];
          const heightPct = Math.max(6, (Math.abs(net) / maxAbs) * 100);
          return (
            <div key={i} className="flex-1 flex flex-col items-center justify-end h-full" title={`Säsong ${h.season}: ${formatMoney(net)}`}>
              <div style={{ width: "100%", height: `${heightPct}%`, background: net >= 0 ? C.win : C.loss, borderRadius: 3, minHeight: 4 }} />
              <div className="text-9 mt-1" style={{ color: C.inkSoft }}>S{h.season}</div>
            </div>
          );
        })}
      </div>
      <div className="flex items-center justify-between mt-2 text-10" style={{ color: C.inkSoft }}>
        <span><span style={{ color: C.win }}>■</span> Vinst</span>
        <span><span style={{ color: C.loss }}>■</span> Förlust</span>
      </div>
    </PaperCard>
  );
}
function TrophyCabinetView({ history, club, season, clubRecords, onBack }) {
  const isTrophy = s => (s.domesticCupResult?.startsWith("Mästare") ? 1 : 0) + (s.cup1Result?.startsWith("Mästare") ? 1 : 0) + (s.cup2Result?.startsWith("Mästare") ? 1 : 0);
  const trophyCount = history.reduce((sum, s) => sum + isTrophy(s), 0);
  const bestFinish = history.length ? Math.min(...history.map(s => s.pos)) : null;
  const promotions = history.filter((s, i) => i > 0 && s.division < history[i - 1].division).length;
  const relegations = history.filter((s, i) => i > 0 && s.division > history[i - 1].division).length;
  const totalPrize = history.reduce((sum, s) => sum + (s.prizeTotal || 0), 0);
  return (
    <div className="rise-in space-y-2.5">
      <button onClick={onBack} style={{ position: "fixed", bottom: 14, right: 14, display: "inline-block", color: "rgba(255,255,255,0.85)", background: "rgba(19,34,29,0.88)", padding: "6px 13px", borderRadius: 999, fontSize: 11, fontWeight: 600, zIndex: 50, backdropFilter: "blur(4px)", boxShadow: "0 2px 10px rgba(0,0,0,0.35)" }}>← Bakåt</button>
      <PaperCard>
        <div className="flex items-center gap-3">
          <Medal size={30} color={C.gold} />
          <div>
            <div className="font-display text-xl">MERITLISTA</div>
            <div className="text-11" style={{ color: C.inkSoft }}>{club.name} · Säsong {season}</div>
          </div>
        </div>
      </PaperCard>
      <div className="grid grid-cols-2 gap-3">
        <PaperCard><div className="font-display text-2xl">{history.length}</div><div className="text-9 uppercase" style={{ color: C.inkSoft }}>Säsonger avslutade</div></PaperCard>
        <PaperCard><div className="font-display text-2xl" style={{ color: trophyCount ? C.gold : C.ink }}>{trophyCount}</div><div className="text-9 uppercase" style={{ color: C.inkSoft }}>Titlar vunna</div></PaperCard>
        <PaperCard><div className="font-display text-2xl">{bestFinish || "–"}</div><div className="text-9 uppercase" style={{ color: C.inkSoft }}>Bästa tabellplacering</div></PaperCard>
        <PaperCard><div className="font-display text-2xl">{promotions}<span className="text-sm" style={{ color: C.inkSoft }}> / {relegations}</span></div><div className="text-9 uppercase" style={{ color: C.inkSoft }}>Uppflyttningar / Nedflyttningar</div></PaperCard>
      </div>
      <PaperCard>
        <div className="text-xs uppercase tracking-wide font-semibold" style={{ color: C.inkSoft }}>Totala cupintäkter</div>
        <div className="font-display text-xl mt-1" style={{ color: C.win }}>{formatMoney(totalPrize)}</div>
      </PaperCard>
      <FinanceBarChart history={history} />
      {clubRecords && Object.keys(clubRecords).length > 0 && (
        <PaperCard>
          <div className="text-xs uppercase tracking-wide font-semibold mb-1.5" style={{ color: C.inkSoft }}>Klubbens historiska rekord</div>
          <div className="space-y-1.5">
            {clubRecords.topScorer && <div className="flex items-center justify-between text-11"><span style={{ color: C.inkSoft }}>Flest mål genom tiderna</span><span className="font-semibold">{clubRecords.topScorer.name} ({clubRecords.topScorer.goals})</span></div>}
            {clubRecords.topAssister && <div className="flex items-center justify-between text-11"><span style={{ color: C.inkSoft }}>Flest assist genom tiderna</span><span className="font-semibold">{clubRecords.topAssister.name} ({clubRecords.topAssister.assists})</span></div>}
            {clubRecords.mostApps && <div className="flex items-center justify-between text-11"><span style={{ color: C.inkSoft }}>Flest matcher genom tiderna</span><span className="font-semibold">{clubRecords.mostApps.name} ({clubRecords.mostApps.apps})</span></div>}
            {clubRecords.bestSeason && <div className="flex items-center justify-between text-11"><span style={{ color: C.inkSoft }}>Bästa säsongssnitt</span><span className="font-semibold">{clubRecords.bestSeason.name} ({clubRecords.bestSeason.avgRating}, S{clubRecords.bestSeason.season})</span></div>}
          </div>
        </PaperCard>
      )}
      <div className="text-xs uppercase tracking-wide font-semibold px-1" style={{ color: C.paperDim }}>Säsong för säsong</div>
      {history.length === 0 && <PaperCard><div className="text-sm text-center py-3" style={{ color: C.inkSoft }}>Ingen avslutad säsong ännu.</div></PaperCard>}
      <div className="space-y-2">
        {[...history].reverse().map((h, i) => {
          const trophies = isTrophy(h);
          const net = h.incomeTotal !== undefined ? h.incomeTotal - h.wageTotal : null;
          const prevSeason = history[history.length - 2 - i];
          const wentUp = prevSeason && h.division < prevSeason.division;
          const wentDown = prevSeason && h.division > prevSeason.division;
          return (
            <PaperCard key={i} style={trophies > 0 ? { background: "linear-gradient(135deg, rgba(217,169,75,0.12), transparent)", border: `1px solid ${C.gold}` } : undefined}>
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold flex items-center gap-1.5">
                  {trophies > 0 && "🏆"} Säsong {h.season} · {h.leagueName} · Div {h.division}
                  {wentUp && <span className="text-11" style={{ color: C.win }}>⬆️</span>}
                  {wentDown && <span className="text-11" style={{ color: C.loss }}>⬇️</span>}
                </div>
                <div className="font-mono text-sm font-semibold">Plats {h.pos}</div>
              </div>
              {(h.domesticCupResult || h.cup1Result || h.cup2Result) && (
                <div className="text-11 mt-1" style={{ color: C.inkSoft }}>{[h.domesticCupResult, h.cup1Result, h.cup2Result].filter(Boolean).join(" · ")}</div>
              )}
              {net !== null && <div className="font-mono text-11 mt-1" style={{ color: net >= 0 ? C.win : C.loss }}>Nettoresultat: {net >= 0 ? "+" : ""}{formatMoney(net)}</div>}
              {trophies > 0 && <div className="flex gap-1 mt-1.5">{Array.from({ length: trophies }, (_, n) => <Medal key={n} size={14} color={C.gold} />)}</div>}
            </PaperCard>
          );
        })}
      </div>
    </div>
  );
}

function PenaltyShootoutView({ shootout, userClub, oppClub, onComplete }) {
  const [revealed, setRevealed] = useState(1);
  const total = shootout.kicks.length;
  const allRevealed = revealed >= total;
  const visibleKicks = shootout.kicks.slice(0, revealed);
  const userVisible = visibleKicks.filter(k => k.team === "user");
  const oppVisible = visibleKicks.filter(k => k.team === "opp");
  const userScoreSoFar = userVisible.filter(k => k.scored).length;
  const oppScoreSoFar = oppVisible.filter(k => k.scored).length;
  const lastKick = visibleKicks[visibleKicks.length - 1];
  return (
    <div className="rise-in space-y-2.5">
      <PaperCard style={{ textAlign: "center", padding: 14 }}>
        <div className="text-xs uppercase tracking-wide font-semibold" style={{ color: C.inkSoft }}>Straffläggning</div>
        <div className="flex items-center justify-center gap-4 mt-2">
          <div className="flex flex-col items-center gap-1"><ClubJersey club={userClub} size={30} /><span className="font-display text-2xl">{userScoreSoFar}</span></div>
          <span className="font-display text-lg" style={{ color: C.inkSoft }}>—</span>
          <div className="flex flex-col items-center gap-1"><ClubJersey club={oppClub} size={30} /><span className="font-display text-2xl">{oppScoreSoFar}</span></div>
        </div>
        {lastKick && (
          <div className="mt-3 py-2 px-3 rounded-xl font-semibold text-sm" style={{ background: lastKick.scored ? "rgba(63,138,107,0.15)" : "rgba(180,68,59,0.15)", color: lastKick.scored ? C.win : C.loss }}>
            {lastKick.scored ? "⚽" : "❌"} {lastKick.playerName} ({lastKick.team === "user" ? userClub.name : oppClub.name}) {lastKick.scored ? "gör mål!" : "missar!"}
          </div>
        )}
      </PaperCard>
      <PaperCard>
        <div className="text-9 uppercase tracking-wide font-semibold mb-1.5" style={{ color: C.inkSoft }}>Straffar</div>
        <div className="flex flex-wrap gap-2">
          {visibleKicks.map((k, i) => (
            <div key={i} className="flex flex-col items-center" style={{ width: 44 }}>
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs" style={{ background: k.team === "user" ? (k.scored ? "rgba(63,138,107,0.25)" : "rgba(180,68,59,0.25)") : (k.scored ? "rgba(63,138,107,0.12)" : "rgba(180,68,59,0.12)"), border: `1.5px solid ${k.team === "user" ? C.gold : C.paperDim}` }}>
                {k.scored ? "⚽" : "❌"}
              </div>
              <div className="text-9 font-semibold mt-0.5 truncate" style={{ maxWidth: 44, color: C.inkSoft }}>{k.playerName.split(" ").slice(-1)[0]}</div>
            </div>
          ))}
        </div>
      </PaperCard>
      {!allRevealed ? (
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => setRevealed(r => r + 1)} className="pulse-cta py-2.5 rounded-xl font-display text-sm tracking-wide" style={{ background: C.gold, color: C.turfDeep }}>NÄSTA STRAFF</button>
          <button onClick={() => setRevealed(total)} className="py-2.5 rounded-xl font-display text-sm tracking-wide" style={{ background: "transparent", border: `1px solid ${C.paperDim}`, color: C.paperDim }}>VISA ALLA</button>
        </div>
      ) : (
        <>
          <PaperCard style={{ background: shootout.userWon ? "rgba(63,138,107,0.15)" : "rgba(180,68,59,0.15)", textAlign: "center" }}>
            <div className="font-display text-lg" style={{ color: shootout.userWon ? C.win : C.loss }}>{shootout.userWon ? "NI VINNER STRAFFLÄGGNINGEN!" : "NI FÖRLORAR STRAFFLÄGGNINGEN"}</div>
            <div className="font-mono text-sm mt-1" style={{ color: C.inkSoft }}>Slutresultat: {shootout.label}</div>
          </PaperCard>
          <button onClick={onComplete} className="pulse-cta w-full py-2.5 rounded-xl font-display text-sm tracking-wide" style={{ background: C.gold, color: C.turfDeep }}>FORTSÄTT</button>
        </>
      )}
    </div>
  );
}
function BoardCrisisView({ clubName, financialCrisis, onAcknowledge }) {
  return (
    <div className="rise-in space-y-2.5">
      <PaperCard style={{ background: "rgba(180,68,59,0.12)" }}>
        <div className="text-center py-3">
          <Swords size={30} color={C.loss} className="mx-auto mb-2" />
          <div className="font-display text-xl" style={{ color: C.loss }}>STYRELSEN ÄR UPPRÖRD</div>
          <div className="text-sm mt-2" style={{ color: C.paper }}>{financialCrisis ? `Klubbens ekonomi har varit i djup kris under en längre tid, utöver eventuella sportsliga bekymmer. Styrelsen överväger ett tränarbyte om det inte vänder.` : "Flera säsonger av missade mål har fått styrelsen att överväga ett tränarbyte."} Ni får en sista chans att vända utvecklingen på {clubName}.</div>
        </div>
      </PaperCard>
      <button onClick={onAcknowledge} className="w-full py-2.5 rounded-xl font-display text-sm tracking-wide" style={{ background: C.gold, color: C.turfDeep }}>TA EMOT UTMANINGEN</button>
    </div>
  );
}

function SackedView({ clubName, financialCrisis, onSeeJobs }) {
  return (
    <div className="rise-in space-y-2.5">
      <PaperCard style={{ background: "rgba(180,68,59,0.15)" }}>
        <div className="text-center py-3">
          <X size={30} color={C.loss} className="mx-auto mb-2" />
          <div className="font-display text-xl" style={{ color: C.loss }}>NI HAR FÅTT SPARKEN</div>
          <div className="text-sm mt-2" style={{ color: C.paper }}>Styrelsen på {clubName} har tappat förtroendet helt{financialCrisis ? " — klubbens ekonomi har varit i djup kris för länge" : ""} och sparkar er som tränare. Er karriär fortsätter dock — dags att hitta en ny klubb.</div>
        </div>
      </PaperCard>
      <button onClick={onSeeJobs} className="pulse-cta w-full py-2.5 rounded-xl font-display text-sm tracking-wide" style={{ background: C.gold, color: C.turfDeep }}>SE LEDIGA JOBB</button>
    </div>
  );
}
function ManagerContractDecisionView({ g, userClub, onRenew, onSeeJobs }) {
  const baseWage = g.manager.wage;
  const [chosen, setChosen] = useState(null);
  const interest = g.manager.interestedClub;
  return (
    <div className="rise-in space-y-2.5">
      <PaperCard>
        <div className="font-display text-lg">Kontraktet har löpt ut</div>
        <div className="text-11 mt-0.5" style={{ color: C.inkSoft }}>Ert avtal med {userClub.name} är slut. Skriv på ett nytt kontrakt, eller sök er vidare — särskilt om andra klubbar visat intresse.</div>
      </PaperCard>
      {interest && (
        <PaperCard style={{ background: "rgba(201,154,62,0.15)" }}>
          <div className="text-10 uppercase tracking-wide font-semibold" style={{ color: C.inkSoft }}>Intresserad klubb</div>
          <div className="text-sm font-semibold mt-1">{interest.clubName}</div>
          <div className="text-11 mt-1" style={{ color: C.inkSoft }}>Antyder en lön på {formatMoney(interest.offeredWage)}/omg. Tacka nej till {userClub.name} och utforska hela jobbmarknaden om du vill förhandla vidare med dem eller andra.</div>
        </PaperCard>
      )}
      <PaperCard>
        <div className="text-xs uppercase tracking-wide font-semibold mb-1.5" style={{ color: C.inkSoft }}>Förnya kontrakt med {userClub.name}</div>
        <div className="text-11 mb-2" style={{ color: C.inkSoft }}>Nuvarande lön: {formatMoney(baseWage)}/omg</div>
        {!chosen ? (
          <div className="grid grid-cols-3 gap-1.5">
            <button onClick={() => setChosen(Math.round(baseWage * 0.95))} className="py-2 rounded-xl text-9 font-semibold" style={{ background: C.paperDim, color: C.ink }}>Lågt<br />{formatMoney(Math.round(baseWage * 0.95))}</button>
            <button onClick={() => setChosen(Math.round(baseWage * 1.15))} className="py-2 rounded-xl text-9 font-semibold" style={{ background: C.turf, color: C.paper }}>Marknad<br />{formatMoney(Math.round(baseWage * 1.15))}</button>
            <button onClick={() => setChosen(Math.round(baseWage * 1.4))} className="py-2 rounded-xl text-9 font-semibold" style={{ background: C.gold, color: C.turfDeep }}>Generöst<br />{formatMoney(Math.round(baseWage * 1.4))}</button>
          </div>
        ) : (
          <button onClick={() => onRenew(chosen)} className="w-full py-2.5 rounded-xl text-sm font-semibold" style={{ background: C.turf, color: C.paper }}>Skriv på för {formatMoney(chosen)}/omg</button>
        )}
      </PaperCard>
      <button onClick={onSeeJobs} className="w-full py-2.5 rounded-xl font-display text-sm tracking-wide" style={{ background: "transparent", border: `1px solid ${C.gold}`, color: C.goldSoft }}>SÖK NYTT JOBB ISTÄLLET</button>
    </div>
  );
}
function JobMarketView({ g, onTakeJob, onBack }) {
  const [selectedId, setSelectedId] = useState(null);
  const [chosen, setChosen] = useState(null);
  const offers = g.jobOffers || [];
  const selected = offers.find(o => o.id === selectedId);
  return (
    <div className="rise-in space-y-2.5">
      {onBack && (
        <button onClick={onBack} style={{ position: "fixed", bottom: 14, right: 14, display: "inline-block", color: "rgba(255,255,255,0.85)", background: "rgba(19,34,29,0.88)", padding: "6px 13px", borderRadius: 999, fontSize: 11, fontWeight: 600, zIndex: 50, backdropFilter: "blur(4px)", boxShadow: "0 2px 10px rgba(0,0,0,0.35)" }}>← Bakåt</button>
      )}
      <PaperCard>
        <div className="font-display text-lg">Jobbmarknad</div>
        <div className="text-11 mt-0.5" style={{ color: C.inkSoft }}>Erbjudanden baserade på ert rykte ({Math.round(g.manager.reputation)}). {onBack ? "" : "Ni måste välja en ny klubb för att fortsätta karriären."}</div>
      </PaperCard>
      {!selected ? (
        <div className="space-y-2">
          {offers.map(o => {
            const club = g.clubs[o.clubId];
            if (!club) return null;
            const overall = squadOverallRating(club.squad);
            return (
              <PaperCard key={o.id}>
                <button onClick={() => { setSelectedId(o.id); setChosen(null); }} className="w-full text-left flex items-center gap-2.5">
                  <ClubJersey club={club} size={30} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold truncate">{club.name}</div>
                    <div className="text-10" style={{ color: C.inkSoft }}>{LEAGUES.find(l => l.id === o.league)?.name} · {divisionLabel(o.league, o.division)}</div>
                    <div className="mt-0.5"><StarRating rating={overallToStars(overall)} size={8} /></div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-mono text-11 font-semibold">{formatMoney(o.offeredWage)}</div>
                    <div className="text-9" style={{ color: C.inkSoft }}>/omg</div>
                  </div>
                </button>
              </PaperCard>
            );
          })}
        </div>
      ) : (
        <PaperCard>
          <div className="flex items-center gap-2.5">
            <ClubJersey club={g.clubs[selected.clubId]} size={34} />
            <div>
              <div className="font-display text-lg">{g.clubs[selected.clubId]?.name}</div>
              <div className="text-11" style={{ color: C.inkSoft }}>{LEAGUES.find(l => l.id === selected.league)?.name} · {divisionLabel(selected.league, selected.division)}</div>
            </div>
          </div>
          <div className="text-11 mt-2" style={{ color: C.inkSoft }}>Erbjuden lön: {formatMoney(selected.offeredWage)}/omg</div>
          {!chosen ? (
            <div className="grid grid-cols-3 gap-1.5 mt-2">
              <button onClick={() => setChosen(Math.round(selected.offeredWage * 0.9))} className="py-2 rounded-xl text-9 font-semibold" style={{ background: C.paperDim, color: C.ink }}>Lågt<br />{formatMoney(Math.round(selected.offeredWage * 0.9))}</button>
              <button onClick={() => setChosen(selected.offeredWage)} className="py-2 rounded-xl text-9 font-semibold" style={{ background: C.turf, color: C.paper }}>Marknad<br />{formatMoney(selected.offeredWage)}</button>
              <button onClick={() => setChosen(Math.round(selected.offeredWage * 1.2))} className="py-2 rounded-xl text-9 font-semibold" style={{ background: C.gold, color: C.turfDeep }}>Begär mer<br />{formatMoney(Math.round(selected.offeredWage * 1.2))}</button>
            </div>
          ) : (
            <div className="space-y-2 mt-2">
              <button onClick={() => onTakeJob(selected.clubId, chosen)} className="w-full py-2.5 rounded-xl text-sm font-semibold" style={{ background: C.gold, color: C.turfDeep }}>Ta jobbet för {formatMoney(chosen)}/omg</button>
              <button onClick={() => setSelectedId(null)} className="w-full py-2 rounded-xl text-xs font-semibold" style={{ background: "transparent", border: `1px solid ${C.inkSoft}`, color: C.inkSoft }}>Tillbaka till listan</button>
            </div>
          )}
        </PaperCard>
      )}
    </div>
  );
}

const MATCH_SEGMENTS = [[0, 15], [15, 30], [30, 45], [45, 60], [60, 75], [75, 90]];
function SubListPlayerRowCompact({ player, liveRating }) {
  const overall = overallOf(player);
  const stamina = Math.round(player.stamina ?? 100);
  const staminaColor = stamina >= 60 ? C.win : stamina >= 35 ? C.gold : C.loss;
  const hasLive = liveRating !== null && liveRating !== undefined;
  return (
    <div className="flex items-center gap-1.5">
      <PlayerAvatar player={player} size={22} />
      <div className="flex-1 min-w-0">
        <div className="text-11 font-semibold truncate" style={{ color: C.ink }}>{player.name}</div>
        <div className="flex items-center gap-1 text-9" style={{ color: C.inkSoft }}>
          <span>{player.specificPosition}</span><span>·</span><span className="font-mono font-bold" style={{ color: C.ink }}>{overall}</span><span>·</span><span style={{ color: staminaColor, fontWeight: 600 }}>{stamina}%</span>
        </div>
      </div>
      {hasLive && <div className="font-mono text-11 font-bold shrink-0" style={{ color: liveRating >= 7 ? C.win : liveRating < 5.5 ? C.loss : C.ink }}>{liveRating.toFixed(1)}</div>}
    </div>
  );
}
function SubListPlayerRow({ player, liveRating }) {
  const overall = overallOf(player);
  const stamina = Math.round(player.stamina ?? 100);
  const staminaColor = stamina >= 60 ? C.win : stamina >= 35 ? C.gold : C.loss;
  const recent = player.recentRatings || [];
  const recentAvg = recent.length ? recent.reduce((s, r) => s + r, 0) / recent.length : null;
  const seasonAvg = player.apps ? player.ratingSum / player.apps : null;
  const hasLive = liveRating !== null && liveRating !== undefined;
  return (
    <div>
      <div className="flex items-center gap-2">
        <PlayerAvatar player={player} size={24} />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold truncate" style={{ color: C.ink }}>{player.name} <span className="text-9 font-normal" style={{ color: C.inkSoft }}>· {player.specificPosition}</span></div>
        </div>
        {hasLive && (
          <div className="text-right shrink-0">
            <div className="font-mono text-sm font-bold" style={{ color: liveRating >= 7 ? C.win : liveRating < 5.5 ? C.loss : C.ink }}>{liveRating.toFixed(1)}</div>
            <div className="text-9" style={{ color: C.inkSoft }}>Nu i match</div>
          </div>
        )}
      </div>
      <div className="flex items-center gap-2.5 mt-1 flex-wrap" style={{ paddingLeft: 32 }}>
        <StarRating rating={overallToStars(overall)} size={7} showLabel={false} />
        <span className="font-mono text-9 font-bold" style={{ color: C.ink }}>{overall}</span>
        <span className="text-9 font-semibold" style={{ color: staminaColor }}>Ork {stamina}%</span>
        {(recentAvg !== null || seasonAvg !== null) && (
          <span className="text-9" style={{ color: C.inkSoft }}>
            {recentAvg !== null && <>5m: <b style={{ color: C.ink }}>{recentAvg.toFixed(1)}</b></>}
            {recentAvg !== null && seasonAvg !== null && " · "}
            {seasonAvg !== null && <>Säs: <b style={{ color: C.ink }}>{seasonAvg.toFixed(1)}</b></>}
          </span>
        )}
      </div>
    </div>
  );
}
function PlayerQuickInfoCard({ player, ratings }) {
  const overall = overallOf(player);
  const recent = player.recentRatings || [];
  const recentAvg = recent.length ? recent.reduce((s, r) => s + r, 0) / recent.length : null;
  const seasonAvg = player.apps ? player.ratingSum / player.apps : null;
  const liveRating = ratings ? ratings[player.id] : null;
  return (
    <div className="px-3 pb-2.5 pt-1" style={{ background: C.paper, borderTop: `1px dashed ${C.paperDim}` }}>
      <div className="flex items-center gap-2 mb-1.5">
        <PlayerAvatar player={player} size={30} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-sm font-bold" style={{ color: C.ink }}>{overall}</span>
            <StarRating rating={overallToStars(overall)} size={8} />
          </div>
          <div className="text-9" style={{ color: C.inkSoft }}>{player.age} år · {nationalityLabel(player.nationality)}</div>
        </div>
        {liveRating !== null && liveRating !== undefined && (
          <div className="text-right shrink-0">
            <div className="font-mono text-sm font-bold" style={{ color: liveRating >= 7 ? C.win : liveRating < 5.5 ? C.loss : C.ink }}>{liveRating.toFixed(1)}</div>
            <div className="text-9" style={{ color: C.inkSoft }}>Nu i match</div>
          </div>
        )}
      </div>
      <div className="grid grid-cols-4 gap-1.5 text-center">
        <div className="rounded-lg py-1" style={{ background: C.paperDim }}><div className="font-mono text-11 font-bold">{Math.round(player.attack)}</div><div className="text-9" style={{ color: C.inkSoft }}>Anfall</div></div>
        <div className="rounded-lg py-1" style={{ background: C.paperDim }}><div className="font-mono text-11 font-bold">{Math.round(player.defense)}</div><div className="text-9" style={{ color: C.inkSoft }}>Försvar</div></div>
        <div className="rounded-lg py-1" style={{ background: C.paperDim }}><div className="font-mono text-11 font-bold" style={{ color: (player.stamina ?? 100) >= 60 ? C.win : (player.stamina ?? 100) >= 35 ? C.gold : C.loss }}>{Math.round(player.stamina ?? 100)}%</div><div className="text-9" style={{ color: C.inkSoft }}>Ork</div></div>
        <div className="rounded-lg py-1" style={{ background: C.paperDim }}><div className="font-mono text-11 font-bold" style={{ color: (player.morale ?? 70) >= 60 ? C.win : (player.morale ?? 70) >= 35 ? C.gold : C.loss }}>{Math.round(player.morale ?? 70)}%</div><div className="text-9" style={{ color: C.inkSoft }}>Trivsel</div></div>
      </div>
      <div className="flex items-center justify-center gap-3 mt-1.5 text-9" style={{ color: C.inkSoft }}>
        <span>Snitt 5 match: <b style={{ color: C.ink }}>{recentAvg !== null ? recentAvg.toFixed(1) : "–"}</b></span>
        <span>Snitt säsong: <b style={{ color: C.ink }}>{seasonAvg !== null ? seasonAvg.toFixed(1) : "–"}</b></span>
      </div>
    </div>
  );
}
function LiveMatchView({ pending, userClub, oppClub, squad, tactic, spelide, tacticalSettings, lineupCells, staff, formationFamiliarity, teamTalk, onFinalize }) {
  const [segmentIdx, setSegmentIdx] = useState(0);
  const [log, setLog] = useState([]);
  const [userGoals, setUserGoals] = useState(0);
  const [oppGoals, setOppGoals] = useState(0);
  const [currentXiIds, setCurrentXiIds] = useState(pending.xiIds);
  const [localTactic, setLocalTactic] = useState(tactic);
  const [subLog, setSubLog] = useState([]);
  const [panelMode, setPanelMode] = useState(null); // null | "tactics" | "subs" | "ratings"
  const [subOutId, setSubOutId] = useState(null);
  const [infoPlayerId, setInfoPlayerId] = useState(null);
  const [dragBenchId, setDragBenchId] = useState(null);
  const [dragPos, setDragPos] = useState(null);
  const [dropTargetId, setDropTargetId] = useState(null);
  function onBenchPointerDown(e, playerId) {
    e.preventDefault();
    setDragBenchId(playerId);
    setDragPos({ x: e.clientX, y: e.clientY });
  }
  function onBenchPointerMove(e) {
    if (!dragBenchId) return;
    setDragPos({ x: e.clientX, y: e.clientY });
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const row = el?.closest("[data-xi-player-id]");
    setDropTargetId(row ? row.getAttribute("data-xi-player-id") : null);
  }
  function onBenchPointerUp() {
    if (dragBenchId && dropTargetId) makeSub(dropTargetId, dragBenchId);
    setDragBenchId(null); setDragPos(null); setDropTargetId(null);
  }
  const [stats, setStats] = useState({ shotsUser: 0, shotsOpp: 0, possessionSum: 0, segmentsPlayed: 0 });
  const [ratings, setRatings] = useState(() => Object.fromEntries(pending.xiIds.map(id => [id, 6.0])));
  const [scoredByIds, setScoredByIds] = useState([]);

  const done = segmentIdx >= MATCH_SEGMENTS.length;
  const homeIsUser = pending.userIsHome;
  const homeGoals = homeIsUser ? userGoals : oppGoals;
  const awayGoals = homeIsUser ? oppGoals : userGoals;
  const homeName = homeIsUser ? userClub.name : oppClub.name;
  const awayName = homeIsUser ? oppClub.name : userClub.name;
  const minuteLabel = done ? "Full tid" : `${MATCH_SEGMENTS[segmentIdx][0]}'`;
  const possessionUser = stats.segmentsPlayed > 0 ? Math.round(stats.possessionSum / stats.segmentsPlayed) : 50;

  function playSegment() {
    const xi = squad.filter(p => currentXiIds.includes(p.id));
    const { attack, defense } = userStrength(xi, localTactic, spelide, tacticalSettings, teamPositionFit(lineupCells, squad), staff);
    const talk = TEAM_TALK_OPTIONS[teamTalk] || TEAM_TALK_OPTIONS.neutral;
    const famBonus = 1 + familiarityBonus(formationFamiliarity);
    const [start, end] = MATCH_SEGMENTS[segmentIdx];
    const segLen = end - start;
    // Match momentum: chasing the game late means throwing more numbers forward at some defensive cost;
    // protecting a lead late means the reverse. Only kicks in from the hour mark on, and only meaningfully
    // when the gap is still realistically chaseable (a heavy deficit isn't "push a bit harder" territory).
    const scoreDiff = userGoals - oppGoals;
    const lateGame = start >= 60;
    let momentumAtk = 1, momentumDef = 1;
    if (lateGame && scoreDiff < 0 && scoreDiff >= -2) { momentumAtk = 1 + clamp(-scoreDiff * 0.07, 0, 0.14); momentumDef = 1 - clamp(-scoreDiff * 0.05, 0, 0.1); }
    else if (lateGame && scoreDiff > 0 && scoreDiff <= 2) { momentumDef = 1 + clamp(scoreDiff * 0.06, 0, 0.12); momentumAtk = 1 - clamp(scoreDiff * 0.04, 0, 0.08); }
    const attackMomentum = attack * momentumAtk, defenseMomentum = defense * momentumDef;
    const weatherStyleMult = weatherTeamMult(xi, pending.weather.mult);
    const lambdaUser = expectedGoals(attackMomentum * talk.atkMult * famBonus, pending.oppStrength, pending.userIsHome) * pending.weather.mult * weatherStyleMult * (segLen / 90);
    const lambdaOpp = expectedGoals(pending.oppStrength, defenseMomentum * talk.defMult * famBonus, !pending.userIsHome) * pending.weather.mult * weatherStyleMult * (segLen / 90);
    const segUser = poisson(lambdaUser), segOpp = poisson(lambdaOpp);
    const entries = [];
    const attackers = xi.filter(p => p.pos !== "MV");
    const scorerIds = [];
    for (let i = 0; i < segUser; i++) { const scorer = pick(attackers) || xi[0]; if (scorer) scorerIds.push(scorer.id); entries.push({ minute: rndInt(start + 1, end), text: `⚽ MÅL! ${scorer?.name || userClub.name} sätter dit den för ${userClub.name}!`, goal: true, isUser: true }); }
    for (let i = 0; i < segOpp; i++) entries.push({ minute: rndInt(start + 1, end), text: `⚽ Mål för ${oppClub.name}.`, goal: true, isUser: false });
    if (!entries.length) {
      const flavor = pick(["Jämnt spel i mittfältet.", "Inget att notera just nu — bollen cirkulerar.", `${Math.random() < 0.5 ? userClub.name : oppClub.name} testar från distans, utan framgång.`, "Ett par avbrutna anfall, men ingenting farligt."]);
      entries.push({ minute: rndInt(start + 1, end), text: flavor, goal: false });
    }
    entries.sort((a, b) => a.minute - b.minute);
    setLog(l => [...l, ...entries]);
    setUserGoals(v => v + segUser);
    setOppGoals(v => v + segOpp);
    if (scorerIds.length) setScoredByIds(ids => [...ids, ...scorerIds]);

    // live stats: shots roughly track chance volume, possession tracks relative strength this segment
    const segShotsUser = segUser * 2 + rndInt(0, 2) + (Math.random() < 0.5 ? 1 : 0);
    const segShotsOpp = segOpp * 2 + rndInt(0, 2) + (Math.random() < 0.5 ? 1 : 0);
    const tacticalMods = combinedTacticalMods(tacticalSettings);
    const possThisSeg = clamp(50 + (attack - pending.oppStrength) / 2.6 + (segUser - segOpp) * 4 + tacticalMods.possBias + rnd(-4, 4), 18, 82);
    setStats(s => ({ shotsUser: s.shotsUser + segShotsUser, shotsOpp: s.shotsOpp + segShotsOpp, possessionSum: s.possessionSum + possThisSeg, segmentsPlayed: s.segmentsPlayed + 1 }));

    // live ratings: nudge each player on the pitch based on team performance this segment, bonus for scoring
    setRatings(r => {
      const next = { ...r };
      const teamDelta = segUser > segOpp ? rnd(0.05, 0.18) : segUser < segOpp ? -rnd(0.05, 0.2) : rnd(-0.03, 0.05);
      xi.forEach(p => {
        const attrs = getAttrs(p);
        const relevantQuality = p.pos === "MV" ? attrs.defending : p.pos === "FÖ" ? attrs.defending : p.pos === "MF" ? (attrs.passing + attrs.defending) / 2 : attrs.dribbling;
        const qualityNudge = clamp((relevantQuality - 55) * 0.0018, -0.06, 0.08);
        next[p.id] = clamp((next[p.id] ?? 6.0) + teamDelta + qualityNudge + rnd(-0.05, 0.08), 3.5, 9.8);
      });
      scorerIds.forEach(id => { next[id] = clamp((next[id] ?? 6.0) + 0.45, 3.5, 9.8); });
      return next;
    });
    setSegmentIdx(i => i + 1);
  }

  function handleFinish() {
    onFinalize(currentXiIds, subLog.length ? subLog.join("; ") : null, userGoals, oppGoals, null, scoredByIds);
  }

  const xiPlayers = squad.filter(p => currentXiIds.includes(p.id));
  const benchPlayers = squad.filter(p => !currentXiIds.includes(p.id) && !p.injuryWeeks && !p.suspendedMatches && !p.internationalDuty);
  function makeSub(outId, inId) {
    const outP = squad.find(p => p.id === outId), inP = squad.find(p => p.id === inId);
    if (!outP || !inP) return;
    setCurrentXiIds(ids => ids.filter(id => id !== outId).concat([inId]));
    setSubLog(s => [...s, `${outP.name} → ${inP.name} (${MATCH_SEGMENTS[Math.min(segmentIdx, 5)][0]}')`]);
    setRatings(r => ({ ...r, [inId]: 6.0 }));
    setSubOutId(null);
    setPanelMode(null);
  }

  return (
    <div className="rise-in space-y-2.5">
      <div className="ticket rounded-2xl overflow-hidden" style={{ background: C.paper, color: C.ink }}>
        <div className="px-4 pt-3 pb-3 text-center">
          <div className="text-10 tracking-20 uppercase font-semibold" style={{ color: C.inkSoft }}>{minuteLabel} · {pending.weather.icon} {pending.weather.name}</div>
          <div className="flex items-center justify-center gap-3 mt-1">
            <span className="flex items-center gap-1.5 w-28 justify-end"><span className="text-sm font-medium text-right truncate">{homeName}</span><ClubJersey club={homeIsUser ? userClub : oppClub} size={20} /></span>
            <span className="font-display text-3xl tabular-nums">{homeGoals} – {awayGoals}</span>
            <span className="flex items-center gap-1.5 w-28"><ClubJersey club={homeIsUser ? oppClub : userClub} size={20} /><span className="text-sm font-medium text-left truncate">{awayName}</span></span>
          </div>
          {subLog.length > 0 && <div className="text-10 mt-1" style={{ color: C.inkSoft }}>{subLog.length} byte{subLog.length > 1 ? "n" : ""} gjorda · Taktik: {localTactic}</div>}
        </div>
        <div className="border-t px-4 py-2 grid grid-cols-3 gap-2 text-center" style={{ borderColor: C.paperDim }}>
          <div>
            <div className="font-mono text-sm font-bold">{homeIsUser ? stats.shotsUser : stats.shotsOpp}–{homeIsUser ? stats.shotsOpp : stats.shotsUser}</div>
            <div className="text-9 uppercase" style={{ color: C.inkSoft }}>Skott</div>
          </div>
          <div>
            <div className="font-mono text-sm font-bold">{homeIsUser ? possessionUser : 100 - possessionUser}%–{homeIsUser ? 100 - possessionUser : possessionUser}%</div>
            <div className="text-9 uppercase" style={{ color: C.inkSoft }}>Bollinnehav</div>
          </div>
          <button onClick={() => setPanelMode(panelMode === "ratings" ? null : "ratings")} className="text-9 uppercase font-semibold rounded-lg py-1" style={{ color: C.gold, background: "rgba(201,154,62,0.12)" }}>Se betyg</button>
        </div>
      </div>
      {panelMode === "ratings" ? (
        <PaperCard>
          <div className="text-xs uppercase tracking-wide font-semibold mb-1.5" style={{ color: C.inkSoft }}>Betyg just nu</div>
          <div className="space-y-1">
            {xiPlayers.slice().sort((a, b) => (ratings[b.id] ?? 6) - (ratings[a.id] ?? 6)).map(p => (
              <div key={p.id} className="flex items-center justify-between text-sm">
                <span className="truncate">{p.name} <span className="text-10" style={{ color: C.inkSoft }}>· {p.specificPosition}</span></span>
                <span className="font-mono font-bold shrink-0 ml-2">{(ratings[p.id] ?? 6).toFixed(1)}</span>
              </div>
            ))}
          </div>
          <button onClick={() => setPanelMode(null)} className="w-full py-2 mt-2.5 rounded-xl text-xs font-semibold" style={{ background: C.gold, color: C.turfDeep }}>Stäng</button>
        </PaperCard>
      ) : panelMode === "tactics" ? (
        <PaperCard>
          <div className="text-xs uppercase tracking-wide font-semibold mb-1.5" style={{ color: C.inkSoft }}>Justera taktik</div>
          <div className="grid grid-cols-3 gap-2">
            {[["anfall", "Anfall"], ["balanserad", "Balanserad"], ["forsvar", "Försvar"]].map(([key, label]) => (
              <button key={key} onClick={() => setLocalTactic(key)} className="py-2 rounded-xl text-xs font-semibold border"
                style={localTactic === key ? { background: C.turf, color: C.paper, borderColor: C.turf } : { background: "transparent", color: C.inkSoft, borderColor: C.paperDim }}>{label}</button>
            ))}
          </div>
          <button onClick={() => setPanelMode(null)} className="w-full py-2 mt-2.5 rounded-xl text-xs font-semibold" style={{ background: C.gold, color: C.turfDeep }}>Klar</button>
        </PaperCard>
      ) : panelMode === "subs" ? (
        <PaperCard>
          <div className="flex items-center justify-between mb-1.5">
            <div className="text-xs uppercase tracking-wide font-semibold" style={{ color: C.inkSoft }}>Byte — dra en avbytare till spelaren som ska ut, eller tryck</div>
            <button onClick={() => setPanelMode(null)} className="text-9 font-semibold px-2 py-1 rounded-lg shrink-0" style={{ background: C.paperDim, color: C.inkSoft }}>Stäng</button>
          </div>
          <div className="grid grid-cols-2 gap-2" onPointerMove={onBenchPointerMove} onPointerUp={onBenchPointerUp} onPointerCancel={onBenchPointerUp} style={{ touchAction: dragBenchId ? "none" : "auto" }}>
            <div>
              <div className="text-9 uppercase font-semibold mb-1 px-0.5" style={{ color: C.inkSoft }}>På plan</div>
              <div className="space-y-1">
                {xiPlayers.map(p => (
                  <div key={p.id} data-xi-player-id={p.id} onClick={() => (dragBenchId ? null : setSubOutId(subOutId === p.id ? null : p.id))}
                    className="rounded-lg px-2 py-1.5 cursor-pointer" style={{ background: dropTargetId === p.id ? "rgba(201,154,62,0.35)" : subOutId === p.id ? "rgba(201,154,62,0.2)" : C.paperDim, border: subOutId === p.id ? `1.5px solid ${C.gold}` : dropTargetId === p.id ? `1.5px dashed ${C.gold}` : "1.5px solid transparent", transition: "background 0.1s" }}>
                    <SubListPlayerRowCompact player={p} liveRating={ratings[p.id]} />
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className="text-9 uppercase font-semibold mb-1 px-0.5" style={{ color: C.inkSoft }}>Bänken</div>
              {benchPlayers.length === 0 && <div className="text-11 px-0.5" style={{ color: C.inkSoft }}>Ingen tillgänglig.</div>}
              <div className="space-y-1">
                {benchPlayers.map(p => (
                  <div key={p.id} onPointerDown={e => onBenchPointerDown(e, p.id)} onClick={() => { if (!dragBenchId && subOutId) makeSub(subOutId, p.id); }}
                    className="rounded-lg px-2 py-1.5" style={{ background: dragBenchId === p.id ? "rgba(201,154,62,0.25)" : C.paperDim, border: dragBenchId === p.id ? `1.5px solid ${C.gold}` : "1.5px solid transparent", cursor: "grab", touchAction: "none", opacity: dragBenchId === p.id ? 0.4 : 1 }}>
                    <SubListPlayerRowCompact player={p} liveRating={null} />
                  </div>
                ))}
              </div>
            </div>
          </div>
          {subOutId && !dragBenchId && <div className="text-10 mt-2 text-center" style={{ color: C.gold }}>{xiPlayers.find(p => p.id === subOutId)?.name} vald — tryck på en avbytare för att byta in, eller dra en avbytare hit.</div>}
          {dragBenchId && dragPos && (
            <div style={{ position: "fixed", left: dragPos.x, top: dragPos.y, transform: "translate(-50%, -50%)", zIndex: 60, pointerEvents: "none", background: C.paper, border: `2px solid ${C.gold}`, borderRadius: 10, padding: "6px 10px", boxShadow: "0 8px 20px rgba(0,0,0,0.4)", width: 160 }}>
              <SubListPlayerRowCompact player={benchPlayers.find(p => p.id === dragBenchId)} liveRating={null} />
            </div>
          )}
        </PaperCard>
      ) : (
        <div className="space-y-2">
          {!done ? (
            <>
              <button onClick={playSegment} className="w-full py-2.5 rounded-xl font-display text-sm tracking-wide flex items-center justify-center gap-2" style={{ background: C.gold, color: C.turfDeep }}>
                <Play size={16} fill={C.turfDeep} /> SPELA VIDARE ({MATCH_SEGMENTS[segmentIdx][0]}'–{MATCH_SEGMENTS[segmentIdx][1]}')
              </button>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setPanelMode("tactics")} className="py-2 rounded-xl text-xs font-semibold" style={{ background: C.paperDim, color: C.ink }}>PAUSA — justera taktik</button>
                <button onClick={() => setPanelMode("subs")} disabled={subLog.length >= 5} className="py-2 rounded-xl text-xs font-semibold" style={{ background: C.paperDim, color: subLog.length >= 5 ? C.inkSoft : C.ink, opacity: subLog.length >= 5 ? 0.5 : 1 }}>PAUSA — gör byte {subLog.length >= 5 ? "(max)" : ""}</button>
              </div>
            </>
          ) : (
            <button onClick={handleFinish} className="w-full py-2.5 rounded-xl font-display text-sm tracking-wide" style={{ background: C.gold, color: C.turfDeep }}>SE MATCHRAPPORT</button>
          )}
        </div>
      )}

      <PaperCard style={{ maxHeight: 260, overflowY: "auto" }}>
        <div className="space-y-1.5">
          {log.length === 0 && <div className="text-12 text-center py-2" style={{ color: C.inkSoft }}>Matchen är igång...</div>}
          {log.slice().reverse().map((e, i) => (
            <div key={i} className="text-12 flex gap-2" style={{ fontWeight: e.goal ? 700 : 400, color: e.goal ? (e.isUser ? C.win : C.loss) : C.ink }}>
              <span className="font-mono shrink-0" style={{ color: C.inkSoft }}>{e.minute}'</span>
              <span>{e.text}</span>
            </div>
          ))}
        </div>
      </PaperCard>

    </div>
  );
}

function roundNameWithArticle(roundName) {
  if (roundName === "Gruppspelet") return "i gruppspelet";
  if (/^Omgång \d+$/.test(roundName)) return `i ${roundName.toLowerCase()}`;
  return `i ${roundName.toLowerCase()}en`;
}
function cupDueRoundNow(cup) {
  if (cup.phase === "groups") return cup.dueRounds?.[cup.groupRound] ?? 0;
  const activeDueRounds = (cup.type === "cup1" && cup.phase !== "groups") ? cup.knockoutDueRounds : cup.dueRounds;
  return activeDueRounds?.[cup.dueIndex ?? 0] ?? 0;
}
function CupView({ cup, clubs, userClubId, userTeamName, onPlayDomestic, onContinueDomestic, onPlayGroup, onContinueGroup, onPlayLeg, onContinueLeg, onPlayFinal, onContinueFinal, onFinish, onBackToHome, currentRound }) {
  if (!cup) {
    // Defensive fallback: activeCupType and cups[type] should always be set together, but if they were
    // ever to fall out of sync, this avoids a hard crash and gives the user a way back to Home instead.
    return (
      <div className="rise-in space-y-2.5">
        <PaperCard><div className="text-sm text-center py-3" style={{ color: C.inkSoft }}>Ingen aktiv cupmatch just nu.</div></PaperCard>
        <button onClick={onBackToHome} className="w-full py-2.5 rounded-xl font-display text-sm tracking-wide" style={{ background: C.gold, color: C.turfDeep }}>TILLBAKA</button>
      </div>
    );
  }
  if (cup.champion) {
    return (
      <div className="rise-in space-y-2.5">
        <PaperCard style={{ position: "relative", overflow: "hidden" }}>
          <Confetti />
          <div className="text-center py-4"><Medal size={36} color={C.gold} className="mx-auto mb-2" /><div className="font-display text-2xl">NI VANN {cup.label.toUpperCase()}!</div></div>
        </PaperCard>
        <button onClick={onFinish} className="pulse-cta w-full py-2.5 rounded-xl font-display text-sm tracking-wide" style={{ background: C.gold, color: C.turfDeep }}>FORTSÄTT</button>
      </div>
    );
  }
  if (cup.eliminated) {
    return (
      <div className="rise-in space-y-2.5">
        <PaperCard>
          <div className="text-center py-4">
            <Swords size={32} color={C.loss} className="mx-auto mb-2" />
            <div className="font-display text-2xl">UTSLAGNA</div>
            <div className="text-sm mt-1" style={{ color: C.inkSoft }}>Er resa i {cup.label} slutade {roundNameWithArticle(cup.roundName)}.</div>
          </div>
        </PaperCard>
        <button onClick={onFinish} className="w-full py-2.5 rounded-xl font-display text-sm tracking-wide" style={{ background: C.gold, color: C.turfDeep }}>FORTSÄTT</button>
      </div>
    );
  }

  const hasPendingFixture = !!(cup.userReport || cup.pendingReport);
  const dueRound = cupDueRoundNow(cup);
  if (!hasPendingFixture && currentRound !== undefined && currentRound < dueRound) {
    return (
      <div className="rise-in space-y-2.5">
        <PaperCard>
          <div className="text-center py-4">
            <CalendarDays size={30} color={C.gold} className="mx-auto mb-2" />
            <div className="font-display text-lg">{cup.label}</div>
            <div className="text-sm mt-1" style={{ color: C.inkSoft }}>Nästa match {roundNameWithArticle(cup.roundName)} spelas omgång {dueRound + 1}. Fortsätt med ligaspelet under tiden.</div>
          </div>
        </PaperCard>
        <button onClick={onBackToHome} className="w-full py-2.5 rounded-xl font-display text-sm tracking-wide" style={{ background: C.gold, color: C.turfDeep }}>TILLBAKA</button>
      </div>
    );
  }

  // domestic cup: single-match knockout
  if (cup.type === "domestic") {
    if (cup.userReport) return <MatchResultView report={cup.userReport} userTeamName={userTeamName} competitionLabel={`${cup.label} · ${cup.roundName}`} onContinue={onContinueDomestic} />;
    const seed = `domesticpair${cup.roundIndex || 1}${cup.teams.join(",")}`;
    const { pairs, byeTeam } = resolveDomesticPairing(cup.teams, seed);
    let oppName = byeTeam === userClubId ? "Ledigt lag (vidare utan match)" : "";
    for (const [a, b] of pairs) {
      if (a === userClubId) { oppName = clubs[b]?.name || "Okänt lag"; break; }
      if (b === userClubId) { oppName = clubs[a]?.name || "Okänt lag"; break; }
    }
    return (
      <div className="rise-in space-y-2.5">
        <PaperCard>
          <div className="text-xs uppercase tracking-wide font-semibold" style={{ color: C.inkSoft }}>{cup.label} · {cup.roundName}</div>
          <div className="flex items-center justify-center gap-3 mt-3"><span className="text-sm font-medium">{userTeamName}</span><span className="font-display text-xl" style={{ color: C.inkSoft }}>VS</span><span className="text-sm font-medium">{oppName}</span></div>
          <div className="text-xs text-center mt-2" style={{ color: C.inkSoft }}>{cup.teams.length} lag kvar</div>
          <button onClick={onPlayDomestic} className="mt-4 w-full py-2.5 rounded-xl font-display text-sm tracking-wide flex items-center justify-center gap-2" style={{ background: C.gold, color: C.turfDeep }}><Play size={16} fill={C.turfDeep} /> SPELA MATCH</button>
        </PaperCard>
      </div>
    );
  }

  // cup1 group stage
  if (cup.phase === "groups") {
    if (cup.pendingReport) return <MatchResultView report={cup.pendingReport} userTeamName={userTeamName} competitionLabel={`${cup.label} · Gruppspel`} onContinue={onContinueGroup} />;
    const groupIds = cup.groups[cup.userGroupIndex];
    const groupStandings = computeStandings(cup.groupSchedule, groupIds);
    const nextFixture = cup.groupRound < cup.groupSchedule.length ? cup.groupSchedule[cup.groupRound].find(f => f.home === userClubId || f.away === userClubId) : null;
    const oppId = nextFixture ? (nextFixture.home === userClubId ? nextFixture.away : nextFixture.home) : null;
    return (
      <div className="rise-in space-y-2.5">
        <PaperCard>
          <div className="text-xs uppercase tracking-wide font-semibold" style={{ color: C.inkSoft }}>{cup.label} · Gruppspel · Omgång {cup.groupRound + 1}/{cup.groupSchedule.length}</div>
          {oppId && <div className="flex items-center justify-center gap-3 mt-3"><span className="text-sm font-medium">{userTeamName}</span><span className="font-display text-xl" style={{ color: C.inkSoft }}>VS</span><span className="text-sm font-medium">{clubs[oppId].name}</span></div>}
          <button onClick={onPlayGroup} className="mt-4 w-full py-2.5 rounded-xl font-display text-sm tracking-wide flex items-center justify-center gap-2" style={{ background: C.gold, color: C.turfDeep }}><Play size={16} fill={C.turfDeep} /> SPELA MATCH</button>
        </PaperCard>
        <PaperCard style={{ padding: 0 }}>
          <div className="px-3 pt-3 pb-2 text-xs uppercase tracking-wide font-semibold" style={{ color: C.inkSoft }}>Gruppställning (topp 2 går vidare)</div>
          {groupStandings.map((row, i) => {
            const t = clubs[row.id]; const isUser = row.id === userClubId;
            return (
              <div key={row.id} className="flex items-center justify-between px-3 py-1.5 text-sm font-mono" style={{ background: isUser ? "rgba(201,154,62,0.18)" : "transparent", fontWeight: isUser ? 800 : 400, color: isUser ? C.gold : "inherit", borderLeft: i < 2 ? `3px solid ${C.win}` : "3px solid transparent" }}>
                <span>{i + 1}. {t.short}</span><span>{row.played}sp · {row.pts}p</span>
              </div>
            );
          })}
        </PaperCard>
      </div>
    );
  }

  // final
  if (cup.phase === "final") {
    if (cup.pendingReport) return <MatchResultView report={cup.pendingReport} userTeamName={userTeamName} competitionLabel={`${cup.label} · Final · ${cup.finalArena}`} onContinue={onContinueFinal} />;
    const opp = clubs[cup.finalOpponentId];
    return (
      <div className="rise-in space-y-2.5">
        <PaperCard>
          <div className="text-xs uppercase tracking-wide font-semibold" style={{ color: C.inkSoft }}>{cup.label} · FINAL</div>
          <div className="text-xs text-center mt-1" style={{ color: C.inkSoft }}>{cup.finalArena}</div>
          <div className="flex items-center justify-center gap-3 mt-3"><span className="text-sm font-medium">{userTeamName}</span><span className="font-display text-xl" style={{ color: C.inkSoft }}>VS</span><span className="text-sm font-medium">{opp.name}</span></div>
          <button onClick={onPlayFinal} className="mt-4 w-full py-2.5 rounded-xl font-display text-sm tracking-wide flex items-center justify-center gap-2" style={{ background: C.gold, color: C.turfDeep }}><Play size={16} fill={C.turfDeep} /> SPELA FINAL</button>
        </PaperCard>
      </div>
    );
  }

  // knockout phase (two-legged)
  if (!cup.tie) {
    return (
      <div className="rise-in space-y-2.5">
        <PaperCard><div className="text-sm text-center py-3" style={{ color: C.inkSoft }}>{cup.label} · {cup.roundName || "Väntar på lottning"}</div></PaperCard>
        <button onClick={onBackToHome} className="w-full py-2.5 rounded-xl font-display text-sm tracking-wide" style={{ background: C.gold, color: C.turfDeep }}>TILLBAKA</button>
      </div>
    );
  }
  if (cup.tie.leg1 && cup.tie.leg === 2 && !cup.tie.leg2 && !cup.pendingReport) {
    const opp = clubs[cup.tie.oppId];
    const userClub = clubs[userClubId];
    const userGoals1 = cup.tie.leg1.userGoals, oppGoals1 = cup.tie.leg1.oppGoals;
    const status = userGoals1 > oppGoals1 ? { text: "Ni leder efter match 1!", color: C.win } : userGoals1 < oppGoals1 ? { text: "Ni ligger under efter match 1.", color: C.loss } : { text: "Lika efter match 1 — allt att spela om.", color: C.gold };
    return (
      <div className="rise-in space-y-2.5">
        <PaperCard>
          <div className="text-xs uppercase tracking-wide font-semibold" style={{ color: C.inkSoft }}>{cup.label} · {cup.roundName} · Match 2 av 2</div>
          <div className="text-9 uppercase tracking-wide font-semibold text-center mt-3" style={{ color: C.inkSoft }}>Resultat från match 1 ({cup.tie.userHomeLeg1 ? "hemma" : "borta"})</div>
          <div className="flex items-center justify-center gap-4 mt-1.5">
            <div className="flex flex-col items-center gap-1"><ClubJersey club={userClub} size={30} /><span className="text-11 font-semibold">{userTeamName}</span></div>
            <div className="font-display text-2xl">{userGoals1} – {oppGoals1}</div>
            <div className="flex flex-col items-center gap-1"><ClubJersey club={opp} size={30} /><span className="text-11 font-semibold">{opp.name}</span></div>
          </div>
          <div className="text-center text-sm font-bold mt-2.5 py-1.5 rounded-lg" style={{ color: status.color, background: `${status.color}1a` }}>{status.text}</div>
          <button onClick={onPlayLeg} className="mt-3 w-full py-2.5 rounded-xl font-display text-sm tracking-wide flex items-center justify-center gap-2" style={{ background: C.gold, color: C.turfDeep }}><Play size={16} fill={C.turfDeep} /> SPELA MATCH 2</button>
        </PaperCard>
      </div>
    );
  }
  if (cup.pendingReport) return <MatchResultView report={cup.pendingReport} userTeamName={userTeamName} competitionLabel={`${cup.label} · ${cup.roundName} · Match ${cup.tie.leg} av 2`} onContinue={onContinueLeg} />;
  const opp = clubs[cup.tie.oppId];
  return (
    <div className="rise-in space-y-2.5">
      <PaperCard>
        <div className="text-xs uppercase tracking-wide font-semibold" style={{ color: C.inkSoft }}>{cup.label} · {cup.roundName} · Match 1 av 2</div>
        <div className="flex items-center justify-center gap-3 mt-3"><span className="text-sm font-medium">{userTeamName}</span><span className="font-display text-xl" style={{ color: C.inkSoft }}>VS</span><span className="text-sm font-medium">{opp.name}</span></div>
        <button onClick={onPlayLeg} className="mt-4 w-full py-2.5 rounded-xl font-display text-sm tracking-wide flex items-center justify-center gap-2" style={{ background: C.gold, color: C.turfDeep }}><Play size={16} fill={C.turfDeep} /> SPELA MATCH 1</button>
      </PaperCard>
    </div>
  );
}

const TABLE_COLS = "1.6rem minmax(0,1fr) 1.7rem 1.7rem 1.7rem 1.7rem 2.3rem 3.4rem 2.3rem";
function CupStandingsPanel({ cup, clubs, userClubId }) {
  if (cup.champion) return <PaperCard><div className="text-sm font-semibold text-center py-2" style={{ color: C.gold }}>🏆 Mästare i {cup.label}!</div></PaperCard>;
  if (cup.eliminated) return <PaperCard><div className="text-sm text-center py-2" style={{ color: C.inkSoft }}>Utslagna ur {cup.label} — {cup.roundName}</div></PaperCard>;

  if (cup.type === "domestic") {
    const seed = `domesticpair${cup.roundIndex || 1}${cup.teams.join(",")}`;
    const { pairs, byeTeam } = resolveDomesticPairing(cup.teams, seed);
    let oppName = byeTeam === userClubId ? "Ledigt lag (vidare utan match)" : null;
    for (const [a, b] of pairs) {
      if (a === userClubId) { oppName = clubs[b]?.name || "Okänt lag"; break; }
      if (b === userClubId) { oppName = clubs[a]?.name || "Okänt lag"; break; }
    }
    return (
      <PaperCard>
        <div className="text-xs uppercase tracking-wide font-semibold" style={{ color: C.inkSoft }}>{cup.label} · {cup.roundName}</div>
        <div className="text-sm mt-2">{cup.teams.length} lag kvar i turneringen.</div>
        {oppName && <div className="text-sm mt-1">Nästa motstånd: <b>{oppName}</b></div>}
      </PaperCard>
    );
  }

  if (cup.phase === "groups") {
    const groupIds = cup.groups[cup.userGroupIndex];
    const groupStandings = computeStandings(cup.groupSchedule, groupIds);
    return (
      <PaperCard style={{ padding: 0 }}>
        <div className="px-3 pt-3 pb-2 text-xs uppercase tracking-wide font-semibold" style={{ color: C.inkSoft }}>{cup.label} · Gruppställning · Omgång {cup.groupRound + 1}/{cup.groupSchedule.length}</div>
        {groupStandings.map((row, i) => {
          const t = clubs[row.id]; const isUser = row.id === userClubId;
          return (
            <div key={row.id} className="flex items-center justify-between px-3 py-1.5 text-sm font-mono" style={{ background: isUser ? "rgba(201,154,62,0.18)" : "transparent", fontWeight: isUser ? 800 : 400, color: isUser ? C.gold : "inherit", borderLeft: i < 2 ? `3px solid ${C.win}` : "3px solid transparent" }}>
              <span>{i + 1}. {t.name}</span><span>{row.played}sp · {row.pts}p</span>
            </div>
          );
        })}
        <div className="text-9 px-3 pb-2.5 pt-1" style={{ color: C.paperDim }}>Topp 2 går vidare till slutspelet.</div>
      </PaperCard>
    );
  }

  if (cup.phase === "final") {
    const opp = clubs[cup.finalOpponentId];
    return (
      <PaperCard>
        <div className="text-xs uppercase tracking-wide font-semibold" style={{ color: C.inkSoft }}>{cup.label} · FINAL</div>
        <div className="text-sm mt-2">{cup.finalArena}</div>
        <div className="text-sm mt-1">Motstånd: <b>{opp.name}</b></div>
      </PaperCard>
    );
  }

  if (!cup.tie) return <PaperCard><div className="text-sm text-center py-2" style={{ color: C.inkSoft }}>{cup.label} · {cup.roundName || "Väntar på nästa omgång"}</div></PaperCard>;
  const opp = clubs[cup.tie.oppId];
  const leg1Score = cup.tie.leg1 ? (cup.tie.userHomeLeg1 ? `${cup.tie.leg1.userGoals}–${cup.tie.leg1.oppGoals}` : `${cup.tie.leg1.oppGoals}–${cup.tie.leg1.userGoals}`) : null;
  return (
    <PaperCard>
      <div className="text-xs uppercase tracking-wide font-semibold" style={{ color: C.inkSoft }}>{cup.label} · {cup.roundName}</div>
      <div className="text-sm mt-2">Motstånd: <b>{opp.name}</b></div>
      <div className="text-11 mt-1" style={{ color: C.inkSoft }}>{leg1Score ? `Efter match 1: ${leg1Score} · Match 2 återstår` : "Match 1 av 2 återstår"}</div>
    </PaperCard>
  );
}

function CupFixturesPanel({ cup, clubs, userClubId }) {
  if (cup.phase === "groups") {
    return (
      <PaperCard style={{ padding: 0 }}>
        <div className="px-3 pt-3 pb-2 text-xs uppercase tracking-wide font-semibold" style={{ color: C.inkSoft }}>{cup.label} · Gruppspel</div>
        <div className="divide-y" style={{ borderColor: C.paperDim }}>
          {cup.groupSchedule.map((round, ri) => {
            const f = round.find(x => x.home === userClubId || x.away === userClubId);
            if (!f) return null;
            const userIsHome = f.home === userClubId;
            const oppId = userIsHome ? f.away : f.home;
            const played = f.homeGoals !== null;
            const isCurrent = ri === cup.groupRound;
            let resultTag = null;
            if (played) { const ug = userIsHome ? f.homeGoals : f.awayGoals, og = userIsHome ? f.awayGoals : f.homeGoals; resultTag = ug > og ? "win" : ug < og ? "loss" : "draw"; }
            return (
              <div key={ri} className="flex items-center justify-between px-3 py-2.5 text-sm" style={{ background: isCurrent ? "rgba(201,154,62,0.15)" : "transparent" }}>
                <span className="font-mono text-xs w-16 shrink-0" style={{ color: C.inkSoft }}>Omg {ri + 1}</span>
                <span className="flex-1 flex items-center gap-1.5 truncate px-1"><ClubJersey club={clubs[oppId]} size={16} /><span className="truncate">{userIsHome ? "vs" : "@"} {clubs[oppId].name}</span></span>
                {played ? <span className="flex items-center gap-1.5 font-mono">{resultTag && <ResultChip result={resultTag} />}<span>{f.homeGoals} – {f.awayGoals}</span></span> : <span className="font-mono text-xs" style={{ color: C.inkSoft }}>{isCurrent ? "Nästa" : "–"}</span>}
              </div>
            );
          })}
        </div>
      </PaperCard>
    );
  }
  return <CupStandingsPanel cup={cup} clubs={clubs} userClubId={userClubId} />;
}

function StandingsTable({ standings, clubs, userClubId, division, nextOppId, hideZones, schedule, round }) {
  const n = standings.length;
  return (
    <PaperCard style={{ padding: 0 }}>
      <div style={{ display: "grid", gridTemplateColumns: TABLE_COLS, columnGap: 4 }} className="px-3 pt-3 pb-2 text-9 uppercase font-semibold">
        <span style={{ color: C.inkSoft }}>#</span>
        <span style={{ color: C.inkSoft }}>Lag</span>
        <span className="text-center" style={{ color: C.inkSoft }}>S</span>
        <span className="text-center" style={{ color: C.inkSoft }}>V</span>
        <span className="text-center" style={{ color: C.inkSoft }}>O</span>
        <span className="text-center" style={{ color: C.inkSoft }}>F</span>
        <span className="text-center" style={{ color: C.inkSoft }}>+/-</span>
        <span className="text-center" style={{ color: C.inkSoft }}>Form</span>
        <span className="text-right" style={{ color: C.inkSoft }}>P</span>
      </div>
      {standings.map((row, i) => {
        const t = clubs[row.id];
        if (!t) return null;
        const isUser = row.id === userClubId;
        const isNextOpp = row.id === nextOppId;
        const promoZone = !hideZones && i < 3 && division > 1;
        const relZone = !hideZones && i >= n - 3 && division < 3;
        const cup1Zone = !hideZones && division === 1 && i < 3;
        const cup2Zone = !hideZones && division === 1 && i >= 3 && i < 6;
        const diff = row.gf - row.ga;
        const form = schedule && round !== undefined ? recentForm(schedule, round, row.id) : [];
        return (
          <div key={row.id} style={{ display: "grid", gridTemplateColumns: TABLE_COLS, columnGap: 4, background: isUser ? "rgba(201,154,62,0.18)" : isNextOpp ? "rgba(201,154,62,0.08)" : i % 2 ? "rgba(0,0,0,0.03)" : "transparent", borderLeft: promoZone ? `3px solid ${C.win}` : relZone ? `3px solid ${C.loss}` : cup1Zone ? `3px solid ${C.gold}` : cup2Zone ? "3px solid #3F74A8" : "3px solid transparent" }}
            className="px-3 py-2 items-center text-sm font-mono">
            <span style={{ color: C.inkSoft }} className="flex items-center gap-0.5">{i + 1}{cup1Zone && <span style={{ fontSize: 8 }}>🏆</span>}{cup2Zone && <span style={{ fontSize: 8 }}>⚔️</span>}</span>
            <span className="flex items-center gap-1.5 font-sans font-medium truncate min-w-0" style={{ fontWeight: isUser ? 800 : isNextOpp ? 700 : 500, color: isUser ? C.gold : "inherit" }}>
              <ClubJersey club={t} size={16} /><span className="truncate">{t.name}</span>
            </span>
            <span className="text-center">{row.played}</span>
            <span className="text-center">{row.won}</span>
            <span className="text-center">{row.drawn}</span>
            <span className="text-center">{row.lost}</span>
            <span className="text-center">{diff > 0 ? "+" : ""}{diff}</span>
            <span className="flex items-center justify-center gap-0.5">
              {form.length > 0 ? form.map((r, fi) => (
                <span key={fi} style={{ width: 5, height: 5, borderRadius: "50%", background: r === "win" ? C.win : r === "loss" ? C.loss : C.gold, flexShrink: 0 }} />
              )) : <span style={{ color: C.paperDim }}>–</span>}
            </span>
            <span className="text-right font-semibold">{row.pts}</span>
          </div>
        );
      })}
      {!hideZones && division === 1 && (
        <div className="px-3 py-2 text-9 space-y-0.5" style={{ borderTop: `1px solid rgba(30,42,34,0.1)`, color: C.inkSoft }}>
          <div><span style={{ color: C.gold }}>🏆 ■</span> Kvalificerar för Kimby Mästerskapet (plats 1–3)</div>
          <div><span style={{ color: "#3F74A8" }}>⚔️ ■</span> Kvalificerar för Kimby Cupen (plats 4–6)</div>
        </div>
      )}
    </PaperCard>
  );
}
function bracketRoundLabel(n) {
  if (n === 2) return "Final";
  if (n === 4) return "Semifinal";
  if (n === 8) return "Kvartsfinal";
  if (n === 16) return "Åttondelsfinal";
  return `Omgång (${n} lag)`;
}
function CupBracketList({ rounds, clubs, revealedRounds, userClubId }) {
  const shown = revealedRounds !== undefined ? rounds.slice(0, revealedRounds) : rounds;
  return (
    <div className="space-y-2.5">
      {shown.length === 0 && (
        <PaperCard><div className="text-sm text-center py-4" style={{ color: C.inkSoft }}>Turneringen har inte börjat spelas ännu.</div></PaperCard>
      )}
      {shown.map((round, ri) => (
        <PaperCard key={ri} style={{ padding: 0 }}>
          <div className="px-3 pt-3 pb-2 text-xs uppercase tracking-wide font-semibold" style={{ color: C.inkSoft }}>{bracketRoundLabel(round.length * 2)}</div>
          <div className="divide-y" style={{ borderColor: C.paperDim }}>
            {round.map((m, mi) => {
              const home = clubs[m.home], away = m.away ? clubs[m.away] : null;
              if (!home) return null;
              return (
                <div key={mi} className="flex items-center justify-between px-3 py-2 text-11 gap-1.5">
                  <span className="flex items-center gap-1.5 flex-1 min-w-0"><ClubJersey club={home} size={16} /><span className="truncate" style={{ fontWeight: home.id === userClubId ? 800 : m.winner === m.home ? 700 : 400, color: home.id === userClubId ? C.gold : "inherit" }}>{home.name}</span></span>
                  <span className="text-9 px-1 shrink-0" style={{ color: C.inkSoft }}>vs</span>
                  <span className="flex items-center gap-1.5 flex-1 min-w-0 justify-end">{away && <span className="truncate" style={{ fontWeight: away.id === userClubId ? 800 : m.winner === m.away ? 700 : 400, color: away.id === userClubId ? C.gold : "inherit" }}>{away.name}</span>}{away ? <ClubJersey club={away} size={16} /> : <span className="text-inherit">Frilott</span>}</span>
                </div>
              );
            })}
          </div>
        </PaperCard>
      ))}
    </div>
  );
}
function YourRealCupStatus({ cup, clubs, userClubId }) {
  if (!cup) return null;
  const oppId = cup.tie?.oppId;
  const opp = oppId ? clubs[oppId] : null;
  return (
    <PaperCard style={{ border: `1.5px solid ${C.gold}` }}>
      <div className="text-9 uppercase tracking-wide font-semibold mb-1" style={{ color: C.gold }}>Er riktiga status — verkliga resultat</div>
      {cup.champion ? (
        <div className="text-sm font-bold" style={{ color: C.gold }}>🏆 Mästare!</div>
      ) : cup.eliminated ? (
        <div className="text-sm font-semibold" style={{ color: C.loss }}>Utslagna denna säsong.</div>
      ) : (
        <>
          <div className="text-sm font-semibold">{cup.roundName} · {(cup.teams || cup.groups?.flat() || []).length || "?"} lag kvar i turneringen</div>
          {opp && <div className="text-11 mt-1 flex items-center gap-1.5" style={{ color: C.inkSoft }}>Aktuell motståndare: <ClubJersey club={opp} size={16} />{opp.name}</div>}
        </>
      )}
    </PaperCard>
  );
}
function CupBrowserView({ clubs, homeLeagueId, season, currentRound, userClubId, season1Qualifiers, cup1Live, domesticLive, cup2Live, onBack }) {
  const [selected, setSelected] = useState("domestic");
  const domesticField = withSeededRandom(`${homeLeagueId}_domestic_${season}`, () => domesticCupField(homeLeagueId, clubs));
  const domesticDue = cupDueSchedule("domestic", domesticField.length);
  const domesticRevealed = domesticDue.filter(r => currentRound >= r).length;
  const domesticRounds = seededResolveBracket(domesticField, clubs, `${homeLeagueId}_domestic_${season}_bracket`, userClubId, domesticLive?.resultLog);

  // Use the real qualifier assignment (season 1) so this preview always matches what's actually
  // happening — previously this recomputed its own independent "top 16 by raw strength" split that
  // ignored per-country quotas entirely, so it could show your own club in the wrong cup's bracket.
  let cup1Field, cup2Field;
  if (season === 1 && season1Qualifiers) {
    cup1Field = season1Qualifiers.cup1;
    cup2Field = season1Qualifiers.cup2;
  } else {
    const LEAGUE_CUP_COUNTS = { england: { cup1: 4, cup2: 3 }, spain: { cup1: 3, cup2: 4 }, italy: { cup1: 3, cup2: 3 }, germany: { cup1: 3, cup2: 3 }, france: { cup1: 3, cup2: 3 } };
    cup1Field = []; cup2Field = [];
    LEAGUES.forEach(l => {
      const counts = LEAGUE_CUP_COUNTS[l.id] || { cup1: 3, cup2: 3 };
      const sorted = clubsInPool(l.id, 1, clubs).slice().sort((a, b) => b.strength - a.strength);
      cup1Field.push(...sorted.slice(0, counts.cup1).map(c => c.id));
      cup2Field.push(...sorted.slice(counts.cup1, counts.cup1 + counts.cup2).map(c => c.id));
    });
  }
  const cup1Groups = withSeededRandom(`cup1_${season}`, () => drawCup1Groups(cup1Field, clubs));
  const cup1GroupDue = spreadRounds(3, 24, 6);
  const cup1GroupRevealed = cup1GroupDue.filter(r => currentRound >= r).length;
  const cup1GroupResults = cup1Groups.map((g2, gi) => seededResolveGroup(g2, clubs, `cup1_${season}_group${gi}`, cup1GroupRevealed));
  const cup1Qualifiers = cup1GroupResults.flatMap(r => r.standings.slice(0, 2).map(row => row.id));
  const cup1QualifiersShuffled = withSeededRandom(`cup1_${season}_ko`, () => shuffle(cup1Qualifiers));
  const cup1KnockoutRounds = seededResolveBracket(cup1QualifiersShuffled, clubs, `cup1_${season}_ko_bracket`, userClubId, cup1Live?.resultLog);
  const cup1KoDue = cupDueSchedule("cup1knockout", 8);
  const cup1KoCheckpoints = [cup1KoDue[1], cup1KoDue[3], cup1KoDue[4]];
  const cup1KoRevealed = cup1GroupRevealed < 6 ? 0 : cup1KoCheckpoints.filter(r => currentRound >= r).length;

  const cup2Due = cupDueSchedule("cup2", cup2Field.length);
  const cup2Checkpoints = [cup2Due[1], cup2Due[3], cup2Due[5], cup2Due[6]];
  const cup2Revealed = cup2Checkpoints.filter(r => currentRound >= r).length;
  const cup2Rounds = seededResolveBracket(cup2Field, clubs, `cup2_${season}_bracket`, userClubId, cup2Live?.resultLog);

  const leagueName = LEAGUES.find(l => l.id === homeLeagueId)?.name || homeLeagueId;
  return (
    <div className="rise-in space-y-2.5">
      <button onClick={onBack} style={{ position: "fixed", bottom: 14, right: 14, display: "inline-block", color: "rgba(255,255,255,0.85)", background: "rgba(19,34,29,0.88)", padding: "6px 13px", borderRadius: 999, fontSize: 11, fontWeight: 600, zIndex: 50, backdropFilter: "blur(4px)", boxShadow: "0 2px 10px rgba(0,0,0,0.35)" }}>← Bakåt</button>
      <PaperCard>
        <div className="text-11 mb-2" style={{ color: C.inkSoft }}>Er egen cupresa (om ni deltar) visas med riktiga resultat i en guldkantad ruta. Övriga tabeller/träd är troliga, baserade på klubbarnas styrka — inte nödvändigtvis den officiella gången.</div>
        <div className="grid grid-cols-1 gap-1.5">
          <button onClick={() => setSelected("domestic")} className="text-left px-3 py-2 rounded-xl text-sm font-semibold" style={selected === "domestic" ? { background: C.turf, color: C.paper } : { background: C.paperDim, color: C.ink }}>{leagueName}s inhemska cup</button>
          <button onClick={() => setSelected("cup1")} className="text-left px-3 py-2 rounded-xl text-sm font-semibold" style={selected === "cup1" ? { background: C.turf, color: C.paper } : { background: C.paperDim, color: C.ink }}>Kimby Mästerskapet</button>
          <button onClick={() => setSelected("cup2")} className="text-left px-3 py-2 rounded-xl text-sm font-semibold" style={selected === "cup2" ? { background: C.turf, color: C.paper } : { background: C.paperDim, color: C.ink }}>Kimby Cupen</button>
        </div>
      </PaperCard>

      {selected === "domestic" && (
        <>
          <YourRealCupStatus cup={domesticLive} clubs={clubs} userClubId={userClubId} />
          <CupBracketList rounds={domesticRounds} clubs={clubs} revealedRounds={domesticRevealed} userClubId={userClubId} />
        </>
      )}

      {selected === "cup1" && (
        <div className="space-y-2.5">
          {cup1Live && cup1Live.phase === "groups" && cup1Live.groups && (
            <>
              <div className="text-xs uppercase tracking-wide font-semibold px-1" style={{ color: C.gold }}>Er riktiga grupp — verkliga resultat</div>
              <PaperCard style={{ padding: 0 }}>
                <div className="px-3 pt-3 pb-2 text-xs uppercase tracking-wide font-semibold" style={{ color: C.inkSoft }}>{cup1Live.label} · Gruppspel</div>
                <StandingsTable standings={computeStandings(cup1Live.groupSchedule, cup1Live.groups[cup1Live.userGroupIndex])} clubs={clubs} userClubId={userClubId} division={2} nextOppId={null} hideZones />
              </PaperCard>
            </>
          )}
          <div className="text-xs uppercase tracking-wide font-semibold px-1" style={{ color: C.paperDim }}>Övriga grupper (troliga, ej officiella) {cup1GroupRevealed === 0 && "(har inte börjat ännu)"}</div>
          {cup1GroupResults.map((r, gi) => (
            <PaperCard key={gi} style={{ padding: 0 }}>
              <div className="px-3 pt-3 pb-2 text-xs uppercase tracking-wide font-semibold" style={{ color: C.inkSoft }}>Grupp {String.fromCharCode(65 + gi)}</div>
              <StandingsTable standings={r.standings} clubs={clubs} userClubId={userClubId} division={2} nextOppId={null} hideZones />
            </PaperCard>
          ))}
          <div className="text-xs uppercase tracking-wide font-semibold px-1" style={{ color: C.paperDim }}>Slutspel</div>
          {cup1Live && cup1Live.phase !== "groups" && <YourRealCupStatus cup={cup1Live} clubs={clubs} userClubId={userClubId} />}
          <CupBracketList rounds={cup1KnockoutRounds} clubs={clubs} revealedRounds={cup1KoRevealed} userClubId={userClubId} />
        </div>
      )}

      {selected === "cup2" && (
        <>
          <YourRealCupStatus cup={cup2Live} clubs={clubs} userClubId={userClubId} />
          <CupBracketList rounds={cup2Rounds} clubs={clubs} revealedRounds={cup2Revealed} userClubId={userClubId} />
        </>
      )}
    </div>
  );
}
function ClubSquadBrowserView({ clubs, userClubId, homeLeagueId, budget, reputation, difficulty, clubGoodwill, partnerClubId, onNegotiationFailed, onFinalize, onInstantLoanFromPartner, onBack, scoutedPlayerIds, pendingPlayerScouts, onScoutPlayer, round, initialClubId, transferHistory }) {
  const [leagueId, setLeagueId] = useState(initialClubId ? clubs[initialClubId]?.league || homeLeagueId : homeLeagueId);
  const [division, setDivision] = useState(initialClubId ? clubs[initialClubId]?.division || 1 : 1);
  const [clubId, setClubId] = useState(initialClubId || null);
  const [negotiatingPlayer, setNegotiatingPlayer] = useState(null);
  const [loanConfigId, setLoanConfigId] = useState(null);
  const clubOptions = clubsInPool(leagueId, division, clubs);
  const selectedClub = clubId ? clubs[clubId] : null;
  const isPartner = clubId && clubId === partnerClubId;

  if (negotiatingPlayer) {
    const sellClub = clubs[negotiatingPlayer.clubId];
    return <NegotiationView player={negotiatingPlayer} club={sellClub ? { ...sellClub, goodwill: clubGoodwill?.[sellClub.id] ?? 50 } : syntheticFreeAgentClub(negotiatingPlayer)} region="browse" budget={budget} reputation={reputation} difficulty={difficulty} userClubId={userClubId} clubs={clubs} scoutedPlayerIds={scoutedPlayerIds}
      onNegotiationFailed={onNegotiationFailed}
      onBack={() => setNegotiatingPlayer(null)} onFinalize={(r, p, price, wage, details) => { onFinalize(p, price, wage, details); setNegotiatingPlayer(null); }} />;
  }

  if (selectedClub) {
    return (
      <div className="rise-in space-y-2.5">
        <button onClick={() => setClubId(null)} style={{ position: "fixed", bottom: 14, right: 14, display: "inline-block", color: "rgba(255,255,255,0.85)", background: "rgba(19,34,29,0.88)", padding: "6px 13px", borderRadius: 999, fontSize: 11, fontWeight: 600, zIndex: 50, backdropFilter: "blur(4px)", boxShadow: "0 2px 10px rgba(0,0,0,0.35)" }}>← Bakåt</button>
        <PaperCard>
          <div className="flex items-center gap-2">
            <ClubJersey club={selectedClub} size={22} />
            <div className="font-display text-lg">{selectedClub.name}</div>
          </div>
          {isPartner && (
            <div className="text-11 mt-1.5 px-2.5 py-1.5 rounded-lg font-bold" style={{ background: C.gold, color: C.turfDeep }}>🤝 Samarbetsklubb — lån till/från denna klubb sker direkt, utan förhandling.</div>
          )}
          {(() => {
            const isDerby = selectedClub.rivalId === userClubId;
            const rel = clubRelationshipLabel(clubGoodwill?.[selectedClub.id], isDerby);
            return (
              <div className="flex items-center justify-between mt-2 pt-2" style={{ borderTop: `1px dashed ${C.paperDim}` }}>
                <span className="text-10 uppercase tracking-wide font-semibold" style={{ color: C.inkSoft }}>Relation med klubb</span>
                <span className="text-11 font-bold" style={{ color: rel.color }}>{rel.text}</span>
              </div>
            );
          })()}
          {selectedClub.rivalId === userClubId && (
            <div className="text-10 mt-1.5" style={{ color: C.loss }}>🔥 Lokal ärkerival — övergångar hit eller härifrån är extra svåra att genomföra.</div>
          )}
        </PaperCard>
        {(() => {
          const clubTransfers = (transferHistory || []).filter(t => t.fromClubId === selectedClub.id || t.toClubId === selectedClub.id).slice(0, 15);
          if (!clubTransfers.length) return null;
          return (
            <PaperCard style={{ padding: 0 }}>
              <div className="px-3 pt-3 pb-1.5 text-10 uppercase tracking-wide font-semibold" style={{ color: C.inkSoft }}>Transferhistorik — {selectedClub.name}</div>
              <div>
                {clubTransfers.map((t, i) => {
                  const isBuy = t.toClubId === selectedClub.id;
                  return (
                    <div key={t.id} className="flex items-center gap-2.5 px-3 py-2" style={{ borderTop: i === 0 ? "none" : `1px solid ${C.paperDim}` }}>
                      <span className="text-9 font-bold uppercase px-1.5 py-0.5 rounded-full shrink-0" style={{ background: isBuy ? "rgba(180,68,59,0.15)" : "rgba(63,138,107,0.15)", color: isBuy ? C.loss : C.win }}>{isBuy ? "Köpte" : "Sålde"}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold truncate">{t.playerName}</div>
                        <div className="text-9" style={{ color: C.inkSoft }}>{isBuy ? `från ${t.fromClubName || "fri agent"}` : `till ${t.toClubName || "okänd köpare"}`} · säsong {t.season}</div>
                      </div>
                      <div className="font-mono text-sm font-bold shrink-0" style={{ color: isBuy ? C.loss : C.win }}>{formatMoney(t.fee)}</div>
                    </div>
                  );
                })}
              </div>
            </PaperCard>
          );
        })()}
        <PaperCard style={{ padding: 0 }}>
          <div className="px-3 pt-2.5 pb-1 text-9 uppercase tracking-wide font-semibold" style={{ color: C.inkSoft }}>Trupp & akademi</div>
          <div className="divide-y" style={{ borderColor: C.paperDim }}>
            {[...(selectedClub.squad || []).map(p => ({ p, isAcademy: false })), ...(selectedClub.youthSquad || []).map(p => ({ p, isAcademy: true }))].sort((a, b) => overallOf(b.p) - overallOf(a.p)).map(({ p, isAcademy }) => {
              const scouted = isPlayerScouted(p, scoutedPlayerIds, userClubId);
              const pendingScout = (pendingPlayerScouts || []).find(s => s.playerId === p.id);
              const pOverall = overallOf(p);
              const [ovLo, ovHi] = scouted ? [pOverall, pOverall] : fuzzyStatRange(pOverall, p.id, "overall", false);
              const [potLo, potHi] = scouted ? [p.potential, p.potential] : fuzzyStatRange(p.potential ?? pOverall, p.id, "potential", false);
              return (
              <div key={p.id} className="px-3 py-2.5">
                <div className="w-full flex items-center justify-between text-left">
                  <button onClick={() => setNegotiatingPlayer({ ...p, clubId, isAcademy })} className="min-w-0 flex-1 text-left">
                    <div className="text-sm font-semibold truncate">{p.name}</div>
                    <div className="text-10" style={{ color: C.inkSoft }}>{p.specificPosition} · {p.age} år · Potential {scouted ? (p.potential ?? "–") : `${potLo}–${potHi}`}</div>
                    {(isAcademy || p.transferListed || p.loanListed) && (
                      <div className="flex gap-1 mt-1">
                        {isAcademy && <span className="text-9 font-bold px-1.5 py-0.5 rounded-full" style={{ background: "rgba(201,154,62,0.18)", color: "#B8862E" }}>Akademi</span>}
                        {p.transferListed && <span className="text-9 font-bold px-1.5 py-0.5 rounded-full" style={{ background: "rgba(63,143,107,0.18)", color: C.win }}>Till salu</span>}
                        {p.loanListed && <span className="text-9 font-bold px-1.5 py-0.5 rounded-full" style={{ background: "rgba(63,116,168,0.18)", color: "#3F74A8" }}>Går att låna</span>}
                      </div>
                    )}
                    {!scouted && (pendingScout ? (
                      <div className="text-9 font-semibold mt-1" style={{ color: C.inkSoft }}>🔍 Scoutas — {Math.max(1, pendingScout.dueRound - round)} omg kvar</div>
                    ) : (
                      <button onClick={e => { e.stopPropagation(); onScoutPlayer(p.id, null, selectedClub.id); }} className="text-9 font-semibold mt-1" style={{ color: "#B8862E" }}>🔍 Scouta spelaren</button>
                    ))}
                  </button>
                  <div className="text-right shrink-0 ml-2">
                    <button onClick={() => setNegotiatingPlayer({ ...p, clubId, isAcademy })} className="block">
                      <div className="font-mono text-sm font-bold">{scouted ? pOverall : `${ovLo}–${ovHi}`}</div>
                      <div className="text-10 font-mono" style={{ color: C.inkSoft }}>{formatMoney(p.value)}</div>
                    </button>
                    {isPartner && (
                      <button onClick={() => setLoanConfigId(loanConfigId === p.id ? null : p.id)} className="mt-1 text-9 font-bold px-2 py-1 rounded-md" style={{ background: C.gold, color: C.turfDeep }}>Låna direkt</button>
                    )}
                  </div>
                </div>
                {isPartner && loanConfigId === p.id && (
                  <div className="mt-2 p-2 rounded-lg" style={{ background: C.paperDim }}>
                    <div className="text-9 uppercase tracking-wide font-semibold mb-1" style={{ color: C.inkSoft }}>Hur mycket av lönen tar ni på er? ({formatMoney(p.wage)}/omg totalt)</div>
                    <div className="grid grid-cols-4 gap-1.5">
                      {[0, 25, 50, 100].map(pct => (
                        <button key={pct} onClick={() => { onInstantLoanFromPartner(p.id, pct); setLoanConfigId(null); }} className="py-1.5 rounded-lg text-9 font-semibold" style={{ background: C.paper, color: C.ink, border: `1px solid ${C.inkSoft}` }}>{pct}%</button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              );
            })}
          </div>
        </PaperCard>
      </div>
    );
  }

  return (
    <div className="rise-in space-y-2.5">
      <button onClick={onBack} style={{ position: "fixed", bottom: 14, right: 14, display: "inline-block", color: "rgba(255,255,255,0.85)", background: "rgba(19,34,29,0.88)", padding: "6px 13px", borderRadius: 999, fontSize: 11, fontWeight: 600, zIndex: 50, backdropFilter: "blur(4px)", boxShadow: "0 2px 10px rgba(0,0,0,0.35)" }}>← Bakåt</button>
      <PaperCard>
        <div className="text-xs uppercase tracking-wide font-semibold mb-1.5" style={{ color: C.inkSoft }}>Liga</div>
        <div className="grid grid-cols-1 gap-1.5">
          {LEAGUES.map(l => (
            <button key={l.id} onClick={() => setLeagueId(l.id)} className="text-left px-3 py-2 rounded-xl text-sm font-semibold" style={leagueId === l.id ? { background: C.turf, color: C.paper } : { background: C.paperDim, color: C.ink }}>{l.name}{l.id === homeLeagueId ? " (er liga)" : ""}</button>
          ))}
        </div>
        <div className="text-xs uppercase tracking-wide font-semibold mt-3 mb-1.5" style={{ color: C.inkSoft }}>Division</div>
        <div className="grid grid-cols-3 gap-1.5">
          {[1, 2, 3].map(d => (
            <button key={d} onClick={() => setDivision(d)} className="py-2 rounded-xl text-sm font-semibold" style={division === d ? { background: C.turf, color: C.paper } : { background: C.paperDim, color: C.ink }}>{divisionLabel(leagueId, d)}</button>
          ))}
        </div>
      </PaperCard>
      <div className="text-xs uppercase tracking-wide font-semibold px-1" style={{ color: C.paperDim }}>Klubbar</div>
      <PaperCard style={{ padding: 0 }}>
        <div className="divide-y" style={{ borderColor: C.paperDim }}>
          {clubOptions.map(c => (
            <button key={c.id} onClick={() => setClubId(c.id)} className="w-full flex items-center gap-2 px-3 py-2.5 text-left">
              <ClubJersey club={c} size={18} />
              <span className="text-sm font-semibold flex-1 truncate">{c.name}{c.id === userClubId ? " (ni)" : ""}</span>
              <span className="text-10 font-mono" style={{ color: C.inkSoft }}>{c.squad?.length || 0} spelare</span>
            </button>
          ))}
        </div>
      </PaperCard>
    </div>
  );
}
function MatchInsightsGuideView({ onBack }) {
  const sections = [
    {
      title: "🏃 Grundstyrka: anfall & försvar",
      body: "Varje spelares anfall/försvar viktas efter position — anfallare och mittfältare bidrar mest till lagets anfallsstyrka, försvarare och målvakt mest till försvarsstyrkan. En stark trupp på pappret räcker dock inte ensamt — hur de faktiskt presterar beror på allt nedan.",
    },
    {
      title: "🎯 Position & passform",
      body: "Att spela spelare på sina rätta positioner är ett av de enskilt största sätten att öka matchstyrkan — en spelare långt utanför sin position kan sänka laget upp till 25%. Träna en spelare mot en ny position (eller för att perfektionera en de redan har) i deras spelarprofil för att gradvis höja passformen ända upp mot 100%.",
    },
    {
      title: "⚙️ Delegenskaper räknas — inte bara siffran",
      body: "Två spelare med samma anfallssiffra kan ändå prestera olika i matcher, beroende på om deras avslut/passning/dribbling/fart/försvarsspel/fysik faktiskt matchar vad positionen kräver. En anfallare med genuint bra avslut och dribbling presterar bättre än en vars siffra bara är \"uppblåst\" av annat.",
    },
    {
      title: "🔥 Stråkform",
      body: "En spelares senaste matcher påverkar deras nästa insats — en spelare i strålande form presterar bättre än vad grundsiffrorna säger, medan en i svacka presterar sämre. Effekten kräver några matchers historik innan den slår in på riktigt.",
    },
    {
      title: "⏱️ Matchmomentum",
      body: "Ligger ni under sent i en jämn match trycker laget på hårdare offensivt, men blir samtidigt sårbarare defensivt. Leder ni istället sent håller laget igen och skyddar resultatet. Gäller bara i den sista tredjedelen av matchen och vid en realistisk poängskillnad.",
    },
    {
      title: "🧠 Taktik & spelidé",
      body: "Offensiv/defensiv grundtaktik samt spelidén (t.ex. kontringsfotboll eller possession) skiftar balansen mellan anfall och försvar. Byter ni taktik ofta tar det tid för laget att vänja sig — formationsvana byggs upp över tid och sänks vid täta ändringar.",
    },
    {
      title: "🌧️ Väder & spelstil",
      body: "Dåligt väder (regn, blåst, snöfall) sänker den totala målchansen — men tekniska, passningstunga lag drabbas extra hårt, medan fysiska, direkta lag klarar sig bättre relativt sett i tuffa förhållanden.",
    },
    {
      title: "🔋 Uthållighet, ork & skaderisk",
      body: "Ork töms i takt med matchbelastning, snabbare för spelare med låg uthållighet. Låg ork sänker prestationen direkt, och en tungt belastad spelare (många matcher tätt inpå varandra) löper också märkbart högre skaderisk — rotera truppen för att hålla nyckelspelare fräscha inför viktiga matcher.",
    },
    {
      title: "👔 Personal & din managerprofil",
      body: "Assisterande tränare minskar antalet gula/röda kort, målvaktstränare stärker försvaret, analytiker stärker anfallet, fystränare snabbar upp återhämtningen. Din egen taktik-attribut som manager ger också ett litet men märkbart lyft till hela laget.",
    },
    {
      title: "🏟️ Hemmaplan & derby",
      body: "Hemmalag har ett naturligt övertag. Lokala derbyn adderar extra volatilitet och kan trigga storform-effekten hos spelare som är starka i stora matcher — eller tvärtom tynga de som inte är det.",
    },
  ];
  const tips = [
    "Håll spelare på sina bästa positioner — flytta hellre truppen än att tvinga in någon där de inte hör hemma.",
    "Träna upp passform i förväg, inte akut inför en stor match — det tar tid att bygga.",
    "Rotera truppen mot slutet av en tät period med många matcher för att hålla ork uppe och skaderisk nere.",
    "Undvik att byta taktik precis inför avgörande matcher — låt formationsvanan hinna byggas upp.",
    "Kolla väderprognosen inför match — ett tekniskt lag kan behöva en mer direkt plan B en regnig kväll.",
    "En trupp i god stråkform slår ofta en trupp med högre siffror men sämre form just nu.",
  ];
  return (
    <div className="rise-in space-y-3">
      <PaperCard>
        <div className="text-lg font-display font-bold">Vad påverkar matchresultat?</div>
        <div className="text-11 mt-1" style={{ color: C.inkSoft }}>En genomgång av allt som formar hur era matcher går, från din assisterande manager.</div>
      </PaperCard>
      {sections.map((s, i) => (
        <PaperCard key={i}>
          <div className="text-sm font-semibold">{s.title}</div>
          <div className="text-11 mt-1.5" style={{ color: C.ink }}>{s.body}</div>
        </PaperCard>
      ))}
      <PaperCard style={{ background: "rgba(201,154,62,0.1)", border: `1px solid ${C.gold}` }}>
        <div className="text-sm font-semibold" style={{ color: "#B8862E" }}>💡 Tips för att maximera resultat</div>
        <div className="mt-2 space-y-1.5">
          {tips.map((t, i) => (
            <div key={i} className="flex items-start gap-1.5 text-11" style={{ color: C.ink }}>
              <span className="shrink-0" style={{ color: C.gold }}>•</span>
              <span>{t}</span>
            </div>
          ))}
        </div>
      </PaperCard>
      <button onClick={onBack} className="w-full py-3 rounded-xl text-sm font-semibold" style={{ background: C.turf, color: C.paper }}>Tillbaka</button>
    </div>
  );
}
function VisionBoardView({ manager, season, division, history, transferHistory, squad, userClubId, onCreateVision, onBack }) {
  const maxYearSpan = clamp((manager.contractYears || 0) + 1, 1, 5);
  const [creating, setCreating] = useState(false);
  const [yearSpan, setYearSpan] = useState(Math.min(3, maxYearSpan));
  const [selectedTypes, setSelectedTypes] = useState(["top_position"]);
  const visions = manager.visions || [];
  const active = visions.filter(v => !v.resolved);
  const resolved = [...visions.filter(v => v.resolved)].reverse();
  function toggleType(key) {
    setSelectedTypes(prev => prev.includes(key) ? prev.filter(k => k !== key) : (prev.length < 3 ? [...prev, key] : prev));
  }
  function confirmCreate() {
    if (!selectedTypes.length) return;
    onCreateVision(Math.min(yearSpan, maxYearSpan), selectedTypes.map(type => ({ type })));
    setCreating(false); setSelectedTypes(["top_position"]); setYearSpan(Math.min(3, maxYearSpan));
  }
  return (
    <div className="rise-in space-y-2.5">
      <button onClick={onBack} style={{ position: "fixed", bottom: 14, right: 14, color: "rgba(255,255,255,0.85)", background: "rgba(19,34,29,0.88)", padding: "6px 13px", borderRadius: 999, fontSize: 11, fontWeight: 600, zIndex: 50 }}>← Bakåt</button>
      <PaperCard>
        <div className="font-display text-lg">Framtidsvisionen</div>
        <div className="text-11 mt-1" style={{ color: C.inkSoft }}>Sätt ett mål för klubbens framtid, med ett årsspann. Sälj in visionen till spelare för att bygga äkta förtroende — men ni blir dömda efter den när tiden är ute.</div>
      </PaperCard>

      {!creating ? (
        <button onClick={() => setCreating(true)} className="w-full py-2.5 rounded-xl font-display text-sm tracking-wide" style={{ background: C.gold, color: C.turfDeep }}>+ Skapa ny vision</button>
      ) : (
        <PaperCard>
          <div className="text-xs uppercase tracking-wide font-semibold mb-2" style={{ color: C.inkSoft }}>Ny vision</div>
          <div className="text-11 mb-1" style={{ color: C.inkSoft }}>Årsspann: <span className="font-mono font-bold" style={{ color: C.ink }}>{yearSpan} {yearSpan === 1 ? "år" : "år"}</span> (mål: säsong {season + yearSpan})</div>
          <input type="range" min="1" max={maxYearSpan} step="1" value={yearSpan} onChange={e => setYearSpan(Number(e.target.value))} className="w-full" />
          <div className="text-9 mt-1" style={{ color: C.inkSoft }}>Max {maxYearSpan} {maxYearSpan === 1 ? "år" : "år"} — ni kan aldrig lova längre än ert eget avtal ({manager.contractYears} {manager.contractYears === 1 ? "år" : "år"} kvar) plus ett extra år. {maxYearSpan < 5 && "Vill ni sätta en längre vision, förläng avtalet med ägaren först."}</div>
          <div className="text-9 uppercase font-semibold mt-3 mb-1.5" style={{ color: C.inkSoft }}>Mål (välj 1-3)</div>
          <div className="space-y-1.5">
            {Object.entries(VISION_GOAL_TYPES).map(([key, def]) => (
              <button key={key} onClick={() => toggleType(key)} className="w-full text-left px-3 py-2 rounded-xl text-11 font-semibold" style={selectedTypes.includes(key) ? { background: C.turf, color: C.paper } : { background: C.paperDim, color: C.ink }}>
                {def.label}<div className="text-9 font-normal mt-0.5" style={{ color: selectedTypes.includes(key) ? "rgba(255,255,255,0.75)" : C.inkSoft }}>{def.describe({ target: def.defaultTarget })}</div>
              </button>
            ))}
          </div>
          <div className="flex gap-2 mt-3">
            <button onClick={() => setCreating(false)} className="flex-1 py-2 rounded-xl text-xs font-semibold" style={{ background: "transparent", border: `1px solid ${C.paperDim}`, color: C.inkSoft }}>Avbryt</button>
            <button onClick={confirmCreate} disabled={!selectedTypes.length} className="flex-1 py-2 rounded-xl text-xs font-semibold" style={{ background: C.gold, color: C.turfDeep, opacity: selectedTypes.length ? 1 : 0.5 }}>Sätt visionen</button>
          </div>
        </PaperCard>
      )}

      {active.length > 0 && (
        <>
          <div className="text-9 uppercase tracking-wide font-semibold px-1">Aktiva visioner</div>
          {active.map(v => {
            const progress = visionProgressSummary(v, { history: history || [], transferHistory: transferHistory || [], squad: squad || [], season, userClubId });
            const pitchCount = Object.keys(v.pitches || {}).length;
            return (
              <PaperCard key={v.id}>
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold">Säsong {v.createdSeason} → {v.targetSeason}</div>
                  <div className="text-10 font-mono" style={{ color: progress.onTrack ? C.win : C.loss }}>{progress.onTrack ? "På rätt spår" : "Efter plan"}</div>
                </div>
                <div className="space-y-1 mt-1.5">
                  {v.goals.map((goal, i) => (
                    <div key={i} className="text-11 flex items-center gap-1.5">
                      <span>{goal.achieved ? "✅" : "⬜"}</span>
                      <span style={{ color: goal.achieved ? C.win : C.inkSoft }}>{VISION_GOAL_TYPES[goal.type].describe(goal)}</span>
                    </div>
                  ))}
                </div>
                {pitchCount > 0 && <div className="text-9 mt-1.5" style={{ color: C.gold }}>Insåld hos {pitchCount} {pitchCount === 1 ? "spelare" : "spelare"}</div>}
              </PaperCard>
            );
          })}
        </>
      )}

      {resolved.length > 0 && (
        <>
          <div className="text-9 uppercase tracking-wide font-semibold px-1">Historik</div>
          {resolved.map(v => (
            <PaperCard key={v.id} style={{ opacity: 0.85 }}>
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold">Säsong {v.createdSeason} → {v.targetSeason}</div>
                <div className="text-10 font-semibold" style={{ color: v.success ? C.win : C.loss }}>{v.success ? "Infriad" : "Bruten"}</div>
              </div>
              <div className="text-11 mt-1" style={{ color: C.inkSoft }}>{v.goals.filter(g => g.achieved).length} av {v.goals.length} mål uppnådda.</div>
            </PaperCard>
          ))}
        </>
      )}
    </div>
  );
}
function ManagerCVView({ manager, onBack }) {
  const stints = manager.stints || [];
  const totalTrophies = stints.reduce((s, st) => s + st.trophies.length, 0);
  const longestStint = stints.reduce((max, st) => {
    const len = (st.endSeason ?? (stints[stints.length - 1] === st ? st.startSeason + manager.yearsAsManager : st.startSeason)) - st.startSeason + 1;
    return len > max.len ? { len, club: st.clubName } : max;
  }, { len: 0, club: null });
  return (
    <div className="rise-in space-y-2.5">
      <button onClick={onBack} style={{ position: "fixed", bottom: 14, right: 14, color: "rgba(255,255,255,0.85)", background: "rgba(19,34,29,0.88)", padding: "6px 13px", borderRadius: 999, fontSize: 11, fontWeight: 600, zIndex: 50 }}>← Bakåt</button>
      <PaperCard>
        <div className="font-display text-xl">{manager.name}</div>
        <div className="text-11 mt-0.5" style={{ color: C.inkSoft }}>{nationalityLabel(manager.nationality)} · {manager.yearsAsManager} år som tränare · Rykte {Math.round(manager.reputation)}</div>
      </PaperCard>
      <div className="grid grid-cols-3 gap-2">
        <PaperCard style={{ textAlign: "center", padding: 10 }}>
          <div className="font-display text-lg">{stints.length}</div>
          <div className="text-9 uppercase font-semibold" style={{ color: C.inkSoft }}>Klubbar</div>
        </PaperCard>
        <PaperCard style={{ textAlign: "center", padding: 10 }}>
          <div className="font-display text-lg" style={{ color: C.gold }}>{totalTrophies}</div>
          <div className="text-9 uppercase font-semibold" style={{ color: C.inkSoft }}>Troféer</div>
        </PaperCard>
        <PaperCard style={{ textAlign: "center", padding: 10 }}>
          <div className="font-display text-lg">{longestStint.len}</div>
          <div className="text-9 uppercase font-semibold" style={{ color: C.inkSoft }}>Längsta (säsonger)</div>
        </PaperCard>
      </div>
      <div className="text-9 uppercase tracking-wide font-semibold px-1" style={{ color: C.inkSoft }}>Manager-attribut</div>
      <PaperCard>
        <div className="grid grid-cols-2 gap-3">
          {Object.entries(manager.attributes).map(([key, val]) => (
            <div key={key}>
              <div className="flex items-center justify-between text-11 mb-1"><span style={{ textTransform: "capitalize" }}>{key}</span><span className="font-mono font-bold">{Math.round(val)}</span></div>
              <div style={{ height: 6, borderRadius: 3, background: "rgba(30,42,34,0.08)", overflow: "hidden" }}><div style={{ height: "100%", width: `${clamp(val, 0, 100)}%`, background: C.gold }} /></div>
            </div>
          ))}
        </div>
      </PaperCard>
      <div className="text-9 uppercase tracking-wide font-semibold px-1">Karriärhistorik</div>
      {[...stints].reverse().map((st, i) => (
        <PaperCard key={i} style={{ padding: 0 }}>
          <div className="flex items-center justify-between px-3 pt-2.5">
            <div className="font-semibold text-sm">{st.clubName}</div>
            <div className="text-10" style={{ color: C.inkSoft }}>Säsong {st.startSeason}{st.endSeason ? `–${st.endSeason}` : " – nu"}</div>
          </div>
          <div className="px-3 pb-2.5 pt-1">
            {st.trophies.length === 0 ? (
              <div className="text-10" style={{ color: C.inkSoft }}>Inga troféer denna period.</div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {st.trophies.map((t, j) => <span key={j} className="text-9 font-semibold px-2 py-1 rounded-full" style={{ background: "rgba(201,154,62,0.18)", color: C.gold }}>🏆 {t}</span>)}
              </div>
            )}
          </div>
        </PaperCard>
      ))}
    </div>
  );
}
function SeasonAwardsView({ awards, userClubId, userAwardWins, userManagerAwardBonus, onContinue }) {
  const [scope, setScope] = useState("global"); // "global" | "eng_d1" etc.
  const wonSomething = (userAwardWins && userAwardWins.length > 0) || (userManagerAwardBonus > 0);
  if (!awards) return (
    <div className="rise-in space-y-2.5">
      <PaperCard><div className="text-sm text-center py-4" style={{ color: C.inkSoft }}>Inga utmärkelser registrerade.</div></PaperCard>
      <button onClick={onContinue} className="w-full py-2.5 rounded-xl font-display text-sm tracking-wide" style={{ background: C.gold, color: C.turfDeep }}>FORTSÄTT</button>
    </div>
  );
  const current = scope === "global" ? awards.global : awards.byDivision[scope];
  const scopeLabel = scope === "global" ? "🌍 Globalt (alla länder & divisioner)" : `${current.countryName} · Division ${current.division}`;
  const rows = [
    { key: "topScorer", label: "⚽ Skyttekung", data: current.topScorer, valueLabel: "mål", getValue: a => a.value },
    { key: "topPoints", label: "🎯 Poängkung", data: current.topPoints, valueLabel: "poäng (mål+assist)", getValue: a => a.value },
    { key: "playerOfYear", label: "⭐ Årets spelare", data: current.playerOfYear, valueLabel: "snittbetyg", getValue: a => a.value.toFixed(2) },
    { key: "managerOfYear", label: "🧠 Årets manager", data: current.managerOfYear, valueLabel: null, getValue: () => null, isManager: true },
  ];
  return (
    <div className="rise-in space-y-2.5">
      <PaperCard style={{ position: "relative", overflow: "hidden", ...(wonSomething ? { background: "linear-gradient(160deg, #2A4636, #13221D 70%)", border: `2px solid ${C.gold}`, boxShadow: "0 0 28px rgba(217,169,75,0.35)" } : {}) }}>
        {wonSomething && <Confetti count={40} />}
        <div className="text-center py-2">
          <div style={{ fontSize: 34 }}>🏅</div>
          <div className="font-display text-2xl" style={{ color: wonSomething ? C.goldSoft : C.ink }}>Säsongens utmärkelser</div>
          {wonSomething ? (
            <div className="text-sm mt-1.5 font-semibold" style={{ color: C.paper }}>
              {userManagerAwardBonus > 0 && "Ni utses till Årets Manager! "}
              {userAwardWins?.length > 0 && `${userAwardWins.length} av era spelare belönas denna säsong!`}
            </div>
          ) : (
            <div className="text-sm mt-1" style={{ color: C.inkSoft }}>Här är säsongens vinnare — globalt och i varje division.</div>
          )}
        </div>
      </PaperCard>
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        <button onClick={() => setScope("global")} className="px-3 py-1.5 rounded-full text-11 font-semibold shrink-0" style={scope === "global" ? { background: C.gold, color: C.turfDeep } : { background: C.paperDim, color: C.inkSoft }}>🌍 Globalt</button>
        {LEAGUES.flatMap(l => [1, 2, 3].map(d => (
          <button key={`${l.id}_d${d}`} onClick={() => setScope(`${l.id}_d${d}`)} className="px-3 py-1.5 rounded-full text-11 font-semibold shrink-0" style={scope === `${l.id}_d${d}` ? { background: C.gold, color: C.turfDeep } : { background: C.paperDim, color: C.inkSoft }}>{l.name} D{d}</button>
        )))}
      </div>
      <PaperCard>
        <div className="text-10 uppercase tracking-wide font-semibold mb-2" style={{ color: C.inkSoft }}>{scopeLabel}</div>
        <div className="space-y-2">
          {rows.map(r => {
            const isUserWinner = r.isManager ? r.data?.clubId === userClubId : r.data?.clubId === userClubId;
            return (
              <div key={r.key} className="rounded-xl p-2.5" style={{ background: isUserWinner ? "rgba(201,154,62,0.18)" : C.paperDim, border: isUserWinner ? `1.5px solid ${C.gold}` : "none" }}>
                <div className="text-9 uppercase tracking-wide font-semibold mb-1" style={{ color: C.inkSoft }}>{r.label}</div>
                {!r.data ? (
                  <div className="text-11" style={{ color: C.inkSoft }}>Ingen kvalificerad kandidat.</div>
                ) : r.isManager ? (
                  <div className="flex items-center gap-2">
                    <PlayerAvatar player={{ id: r.data.manager?.name, age: 48 }} size={28} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold truncate">{r.data.manager?.name}</div>
                      <div className="text-9 flex items-center gap-1" style={{ color: C.inkSoft }}><ClubJersey club={{ id: r.data.clubId, color: r.data.clubColor }} size={12} />{r.data.clubName} · Plats {r.data.pos}</div>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <PlayerAvatar player={r.data.player} size={28} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold truncate">{r.data.player.name}</div>
                      <div className="text-9 flex items-center gap-1" style={{ color: C.inkSoft }}><ClubJersey club={{ id: r.data.clubId, color: r.data.clubColor }} size={12} />{r.data.clubName}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-mono text-base font-bold" style={{ color: C.win }}>{r.getValue(r.data)}</div>
                      <div className="text-9" style={{ color: C.inkSoft }}>{r.valueLabel}</div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </PaperCard>
      <button onClick={onContinue} className="pulse-cta w-full py-2.5 rounded-xl font-display text-sm tracking-wide" style={{ background: C.gold, color: C.turfDeep }}>FORTSÄTT</button>
    </div>
  );
}
function OwnTransferHistoryView({ transferHistory, userClubId, currentSeason, onBack }) {
  const seasonsWithData = [...new Set((transferHistory || []).map(t => t.season))];
  const seasons = [...new Set([currentSeason, ...seasonsWithData])].sort((a, b) => b - a);
  const [season, setSeason] = useState(currentSeason);
  const ownTransfers = (transferHistory || []).filter(t => (t.fromClubId === userClubId || t.toClubId === userClubId) && t.season === season);
  const bought = ownTransfers.filter(t => t.toClubId === userClubId);
  const sold = ownTransfers.filter(t => t.fromClubId === userClubId);
  const totalSpent = bought.reduce((s, t) => s + t.fee, 0);
  const totalIncome = sold.reduce((s, t) => s + t.fee, 0);
  const net = totalIncome - totalSpent;
  return (
    <div className="rise-in space-y-2.5">
      <button onClick={onBack} style={{ position: "fixed", bottom: 14, right: 14, color: "rgba(255,255,255,0.85)", background: "rgba(19,34,29,0.88)", padding: "6px 13px", borderRadius: 999, fontSize: 11, fontWeight: 600, zIndex: 50 }}>← Bakåt</button>
      <PaperCard>
        <div className="font-display text-xl">Transferhistorik</div>
        <div className="text-11 mt-0.5" style={{ color: C.inkSoft }}>Er klubbs köp och försäljningar, säsong för säsong.</div>
      </PaperCard>
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {seasons.map(s => (
          <button key={s} onClick={() => setSeason(s)} className="px-3 py-1.5 rounded-full text-11 font-semibold shrink-0" style={s === season ? { background: C.gold, color: C.turfDeep } : { background: C.paperDim, color: C.inkSoft }}>Säsong {s}</button>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2">
        <PaperCard style={{ textAlign: "center", padding: 10 }}>
          <div className="text-9 uppercase font-semibold" style={{ color: C.inkSoft }}>Utgifter</div>
          <div className="font-mono text-sm font-bold mt-0.5" style={{ color: C.loss }}>{formatMoney(totalSpent)}</div>
        </PaperCard>
        <PaperCard style={{ textAlign: "center", padding: 10 }}>
          <div className="text-9 uppercase font-semibold" style={{ color: C.inkSoft }}>Inkomster</div>
          <div className="font-mono text-sm font-bold mt-0.5" style={{ color: C.win }}>{formatMoney(totalIncome)}</div>
        </PaperCard>
        <PaperCard style={{ textAlign: "center", padding: 10 }}>
          <div className="text-9 uppercase font-semibold" style={{ color: C.inkSoft }}>Netto</div>
          <div className="font-mono text-sm font-bold mt-0.5" style={{ color: net >= 0 ? C.win : C.loss }}>{net >= 0 ? "+" : ""}{formatMoney(net)}</div>
        </PaperCard>
      </div>
      <PaperCard style={{ padding: 0 }}>
        {ownTransfers.length === 0 ? (
          <div className="text-sm text-center py-4" style={{ color: C.inkSoft }}>Inga transfers den här säsongen.</div>
        ) : ownTransfers.map((t, i) => {
          const isBuy = t.toClubId === userClubId;
          return (
            <div key={t.id} className="flex items-center gap-2.5 px-3 py-2" style={{ borderTop: i === 0 ? "none" : `1px solid ${C.paperDim}` }}>
              <span className="text-9 font-bold uppercase px-1.5 py-0.5 rounded-full shrink-0" style={{ background: isBuy ? "rgba(180,68,59,0.15)" : "rgba(63,138,107,0.15)", color: isBuy ? C.loss : C.win }}>{isBuy ? "Köp" : "Sälj"}</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold truncate">{t.playerName}</div>
                <div className="text-9" style={{ color: C.inkSoft }}>{isBuy ? `från ${t.fromClubName}` : `till ${t.toClubName || "okänd köpare"}`}</div>
              </div>
              <div className="font-mono text-sm font-bold shrink-0" style={{ color: isBuy ? C.loss : C.win }}>{isBuy ? "-" : "+"}{formatMoney(t.fee)}</div>
            </div>
          );
        })}
      </PaperCard>
    </div>
  );
}
function GlobalTransfersView({ transferHistory, userClubId, onBack }) {
  const [leagueFilter, setLeagueFilter] = useState("all");
  const [detailId, setDetailId] = useState(null);
  const filtered = (leagueFilter === "all" ? (transferHistory || []) : (transferHistory || []).filter(t => t.leagueId === leagueFilter)).slice(0, 200);
  const detail = filtered.find(t => t.id === detailId);
  return (
    <div className="rise-in space-y-2.5">
      <button onClick={onBack} style={{ position: "fixed", bottom: 14, right: 14, color: "rgba(255,255,255,0.85)", background: "rgba(19,34,29,0.88)", padding: "6px 13px", borderRadius: 999, fontSize: 11, fontWeight: 600, zIndex: 50 }}>← Bakåt</button>
      <PaperCard>
        <div className="font-display text-xl">Alla transfers</div>
        <div className="text-11 mt-0.5" style={{ color: C.inkSoft }}>Övergångar i hela spelvärlden, senaste överst. Tryck på en spelare för detaljer.</div>
      </PaperCard>
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        <button onClick={() => setLeagueFilter("all")} className="px-3 py-1.5 rounded-full text-11 font-semibold shrink-0" style={leagueFilter === "all" ? { background: C.gold, color: C.turfDeep } : { background: C.paperDim, color: C.inkSoft }}>🌍 Alla ligor</button>
        {LEAGUES.map(l => (
          <button key={l.id} onClick={() => setLeagueFilter(l.id)} className="px-3 py-1.5 rounded-full text-11 font-semibold shrink-0" style={leagueFilter === l.id ? { background: C.gold, color: C.turfDeep } : { background: C.paperDim, color: C.inkSoft }}>{l.name}</button>
        ))}
      </div>
      <PaperCard style={{ padding: 0 }}>
        {filtered.length === 0 ? (
          <div className="text-sm text-center py-4" style={{ color: C.inkSoft }}>Inga transfers registrerade ännu.</div>
        ) : filtered.map((t, i) => (
          <button key={t.id} onClick={() => setDetailId(t.id)} className="w-full flex items-center gap-2.5 px-3 py-2 text-left" style={{ borderTop: i === 0 ? "none" : `1px solid ${C.paperDim}`, background: (t.fromClubId === userClubId || t.toClubId === userClubId) ? "rgba(201,154,62,0.10)" : "transparent" }}>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold truncate">{t.playerName} <span className="text-9 font-normal" style={{ color: C.inkSoft }}>· {t.playerPos}</span></div>
              <div className="text-9 flex items-center gap-1 truncate" style={{ color: C.inkSoft }}>
                <ClubJersey club={{ id: t.fromClubId, color: t.fromColor }} size={12} />{t.fromClubName} → <ClubJersey club={{ id: t.toClubId, color: t.toColor }} size={12} />{t.toClubName}
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="font-mono text-sm font-bold" style={{ color: C.ink }}>{formatMoney(t.fee)}</div>
              <div className="text-9" style={{ color: C.inkSoft }}>S{t.season}</div>
            </div>
          </button>
        ))}
      </PaperCard>
      {detail && (
        <>
          <div onClick={() => setDetailId(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 40 }} />
          <div style={{ position: "fixed", top: 100, left: 20, right: 20, background: C.paper, color: C.ink, borderRadius: 16, boxShadow: "0 16px 40px rgba(0,0,0,0.5)", border: `2px solid ${C.gold}`, zIndex: 41, padding: 16 }}>
            <div className="flex items-center justify-between mb-2">
              <div className="font-display text-lg">{detail.playerName}</div>
              <button onClick={() => setDetailId(null)} style={{ width: 22, height: 22, borderRadius: "50%", background: C.paperDim, color: C.ink, fontWeight: 900, fontSize: 12 }}>✕</button>
            </div>
            <div className="text-11 mb-2" style={{ color: C.inkSoft }}>{detail.playerPos} · Säsong {detail.season}</div>
            <div className="flex items-center gap-2 mb-1.5"><ClubJersey club={{ id: detail.fromClubId, color: detail.fromColor }} size={22} /><span className="text-sm font-semibold">{detail.fromClubName}</span></div>
            <div className="text-center text-9 my-1" style={{ color: C.inkSoft }}>↓</div>
            <div className="flex items-center gap-2 mb-2"><ClubJersey club={{ id: detail.toClubId, color: detail.toColor }} size={22} /><span className="text-sm font-semibold">{detail.toClubName || "Okänd köpare"}</span></div>
            <div className="font-mono text-lg font-bold text-center py-2 rounded-xl" style={{ background: C.paperDim }}>{formatMoney(detail.fee)}</div>
          </div>
        </>
      )}
    </div>
  );
}
function StatsLeagueView({ clubs, leagueId, division, userClubId, onBack }) {
  const [selectedLeagueId, setSelectedLeagueId] = useState(leagueId);
  const [selectedDivision, setSelectedDivision] = useState(division);
  const [statType, setStatType] = useState("goals");
  const [competitionFilter, setCompetitionFilter] = useState("all");
  const countryName = LEAGUES.find(l => l.id === selectedLeagueId)?.name || "";

  // "all" reads the season-wide combined totals (works for every club, AI included, since those have
  // always been tracked). Per-competition views read the competition-specific fields — meaningful mainly
  // for your own squad, since AI-vs-AI cup matches aren't simulated at individual-player detail.
  const suffix = competitionFilter === "all" ? "" : `_${competitionFilter}`;
  const goalsKey = `goals${suffix}`, assistsKey = `assists${suffix}`;
  const yellowKey = `seasonYellowCards${suffix}`, redKey = `seasonRedCards${suffix}`;

  const players = [];
  Object.values(clubs).forEach(c => {
    if (c.league !== selectedLeagueId || c.division !== selectedDivision) return;
    (c.squad || []).forEach(p => {
      const cards = (p[yellowKey] || 0) + (p[redKey] || 0);
      if (!(p[goalsKey] || 0) && !(p[assistsKey] || 0) && !cards) return;
      players.push({ ...p, club: c, clubName: c.name, clubId: c.id, cards, displayGoals: p[goalsKey] || 0, displayAssists: p[assistsKey] || 0, displayYellow: p[yellowKey] || 0, displayRed: p[redKey] || 0 });
    });
  });
  const sortKey = statType === "goals" ? "displayGoals" : statType === "assists" ? "displayAssists" : "cards";
  const sorted = [...players].sort((a, b) => (b[sortKey] || 0) - (a[sortKey] || 0)).slice(0, 25);

  return (
    <div className="rise-in space-y-2.5">
      <button onClick={onBack} style={{ position: "fixed", bottom: 14, right: 14, display: "inline-block", color: "rgba(255,255,255,0.85)", background: "rgba(19,34,29,0.88)", padding: "6px 13px", borderRadius: 999, fontSize: 11, fontWeight: 600, zIndex: 50, backdropFilter: "blur(4px)", boxShadow: "0 2px 10px rgba(0,0,0,0.35)" }}>← Bakåt</button>
      <PaperCard>
        <div className="font-display text-xl">Statistikliga</div>
        <div className="text-11 mt-0.5" style={{ color: C.inkSoft }}>{countryName} · {divisionLabel(selectedLeagueId, selectedDivision)}</div>
      </PaperCard>
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {LEAGUES.map(l => (
          <button key={l.id} onClick={() => setSelectedLeagueId(l.id)} className="px-3 py-1.5 rounded-full text-11 font-semibold shrink-0" style={selectedLeagueId === l.id ? { background: C.gold, color: C.turfDeep } : { background: C.paperDim, color: C.inkSoft }}>{l.name}</button>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {[1, 2, 3].map(d => (
          <button key={d} onClick={() => setSelectedDivision(d)} className="py-1.5 rounded-xl text-11 font-semibold" style={selectedDivision === d ? { background: C.gold, color: C.turfDeep } : { background: "transparent", border: `1px solid ${C.paperDim}`, color: C.paperDim }}>{divisionLabel(selectedLeagueId, d)}</button>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {[["goals", "⚽ Mål"], ["assists", "🅰️ Assist"], ["cards", "🟨 Kort"]].map(([key, label]) => (
          <button key={key} onClick={() => setStatType(key)} className="py-1.5 rounded-xl text-11 font-semibold" style={statType === key ? { background: C.turf, color: C.paper } : { background: "transparent", border: `1px solid ${C.paperDim}`, color: C.paperDim }}>{label}</button>
        ))}
      </div>
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {[["all", "Alla tävlingar"], ["league", "Ligan"], ["domestic", "Inhemska cupen"], ["cup1", "Kimby Mästerskapet"], ["cup2", "Kimby Cupen"]].map(([key, label]) => (
          <button key={key} onClick={() => setCompetitionFilter(key)} className="px-3 py-1.5 rounded-full text-10 font-semibold shrink-0" style={competitionFilter === key ? { background: C.gold, color: C.turfDeep } : { background: C.paperDim, color: C.inkSoft }}>{label}</button>
        ))}
      </div>
      {competitionFilter !== "all" && <div className="text-9 px-1" style={{ color: C.inkSoft }}>Visar bara {competitionFilter === "league" ? "ligamatcher" : "denna cup"} — mest meningsfullt för din egen trupp, eftersom motståndarnas cupmatcher inte simuleras med individuell spelarstatistik.</div>}
      <PaperCard style={{ padding: 0 }}>
        {sorted.length === 0 ? (
          <div className="text-sm text-center py-6" style={{ color: C.inkSoft }}>Ingen statistik registrerad ännu den här säsongen.</div>
        ) : sorted.map((p, i) => (
          <div key={p.id} className="flex items-center gap-2.5 px-3 py-2" style={{ borderTop: i === 0 ? "none" : `1px solid ${C.paperDim}`, background: p.clubId === userClubId ? "rgba(201,154,62,0.12)" : "transparent" }}>
            <span className="font-mono text-11 shrink-0" style={{ color: C.inkSoft, width: 18 }}>{i + 1}</span>
            <PlayerAvatar player={p} size={26} />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold truncate">{p.name}</div>
              <div className="text-9 flex items-center gap-1" style={{ color: C.inkSoft }}><ClubJersey club={p.club} size={12} />{p.clubName}</div>
            </div>
            <div className="font-mono text-base font-bold shrink-0" style={{ color: statType === "cards" ? (p.displayRed > 0 ? C.loss : C.gold) : C.win }}>
              {statType === "goals" ? p.displayGoals || 0 : statType === "assists" ? p.displayAssists || 0 : `${p.displayYellow || 0}🟨${p.displayRed ? ` ${p.displayRed}🟥` : ""}`}
            </div>
          </div>
        ))}
      </PaperCard>
    </div>
  );
}
function LeagueBrowserView({ allSchedules, clubs, userClubId, homeLeagueId, onBack }) {
  const [leagueId, setLeagueId] = useState(homeLeagueId);
  const [division, setDivision] = useState(1);
  const key = `${leagueId}_d${division}`;
  const schedule = allSchedules?.[key];
  const ids = clubsInPool(leagueId, division, clubs).map(c => c.id);
  const standings = schedule ? computeStandings(schedule, ids) : [];
  const leagueName = LEAGUES.find(l => l.id === leagueId)?.name || leagueId;
  return (
    <div className="rise-in space-y-2.5">
      <button onClick={onBack} style={{ position: "fixed", bottom: 14, right: 14, display: "inline-block", color: "rgba(255,255,255,0.85)", background: "rgba(19,34,29,0.88)", padding: "6px 13px", borderRadius: 999, fontSize: 11, fontWeight: 600, zIndex: 50, backdropFilter: "blur(4px)", boxShadow: "0 2px 10px rgba(0,0,0,0.35)" }}>← Bakåt</button>
      <PaperCard>
        <div className="text-xs uppercase tracking-wide font-semibold mb-1.5" style={{ color: C.inkSoft }}>Liga</div>
        <div className="grid grid-cols-1 gap-1.5">
          {LEAGUES.map(l => (
            <button key={l.id} onClick={() => setLeagueId(l.id)} className="text-left px-3 py-2 rounded-xl text-sm font-semibold" style={leagueId === l.id ? { background: C.turf, color: C.paper } : { background: C.paperDim, color: C.ink }}>{l.name}{l.id === homeLeagueId ? " (er liga)" : ""}</button>
          ))}
        </div>
        <div className="text-xs uppercase tracking-wide font-semibold mt-3 mb-1.5" style={{ color: C.inkSoft }}>Division</div>
        <div className="grid grid-cols-3 gap-1.5">
          {[1, 2, 3].map(d => (
            <button key={d} onClick={() => setDivision(d)} className="py-2 rounded-xl text-sm font-semibold" style={division === d ? { background: C.turf, color: C.paper } : { background: C.paperDim, color: C.ink }}>{divisionLabel(leagueId, d)}</button>
          ))}
        </div>
      </PaperCard>
      <div className="text-xs uppercase tracking-wide font-semibold px-1" style={{ color: C.paperDim }}>{leagueName} · {divisionLabel(leagueId, division)}</div>
      {standings.length > 0 ? <StandingsTable standings={standings} clubs={clubs} userClubId={userClubId} division={division} nextOppId={null} /> : <PaperCard><div className="text-sm text-center py-4" style={{ color: C.inkSoft }}>Ingen data ännu.</div></PaperCard>}
    </div>
  );
}
function TableTab({ standings, clubs, userClubId, division, cup, nextFixture, allSchedules, leagueId, season, currentRound, onSubViewChange, season1Qualifiers, schedule, cup1Live, domesticLive, cup2Live }) {
  const [subView, setSubView] = useState("league");
  const [showBrowser, setShowBrowser] = useState(false);
  const [showCupBrowser, setShowCupBrowser] = useState(false);
  const [showStatsLeague, setShowStatsLeague] = useState(false);
  useEffect(() => { onSubViewChange?.(showBrowser || showCupBrowser || showStatsLeague); }, [showBrowser, showCupBrowser, showStatsLeague]);
  if (showBrowser) return <LeagueBrowserView allSchedules={allSchedules} clubs={clubs} userClubId={userClubId} homeLeagueId={leagueId} onBack={() => setShowBrowser(false)} />;
  if (showCupBrowser) return <CupBrowserView clubs={clubs} homeLeagueId={leagueId} season={season} currentRound={currentRound} userClubId={userClubId} season1Qualifiers={season1Qualifiers} cup1Live={cup1Live} domesticLive={domesticLive} cup2Live={cup2Live} onBack={() => setShowCupBrowser(false)} />;
  if (showStatsLeague) return <StatsLeagueView clubs={clubs} leagueId={leagueId} division={division} userClubId={userClubId} onBack={() => setShowStatsLeague(false)} />;
  const n = standings.length;
  const nextOppId = nextFixture ? (nextFixture.home === userClubId ? nextFixture.away : nextFixture.home) : null;
  const showCupTab = cup && !cup.champion && !cup.eliminated;
  return (
    <div className="rise-in">
      <div className="grid grid-cols-2 gap-2 mb-2">
        <button onClick={() => setShowBrowser(true)} className="py-2 rounded-xl text-xs font-semibold" style={{ background: C.gold, color: C.turfDeep }}>Bläddra ligor & divisioner</button>
        <button onClick={() => setShowCupBrowser(true)} className="py-2 rounded-xl text-xs font-semibold" style={{ background: "transparent", border: `1px solid ${C.paperDim}`, color: C.paperDim }}>Bläddra cuper</button>
      </div>
      <button onClick={() => setShowStatsLeague(true)} className="w-full py-2 rounded-xl text-xs font-semibold mb-3" style={{ background: "transparent", border: `1px solid ${C.paperDim}`, color: C.paperDim }}>⚽ Statistikliga — {divisionLabel(leagueId, division)}</button>
      {showCupTab && (
        <div className="flex gap-2 mb-3">
          {[["league", "Liga"], ["cup", cup.label]].map(([key, label]) => (
            <button key={key} onClick={() => setSubView(key)} className="flex-1 py-2 rounded-xl text-11 font-semibold" style={subView === key ? { background: C.gold, color: C.turfDeep } : { background: "rgba(255,255,255,0.08)", color: C.paperDim }}>{label}</button>
          ))}
        </div>
      )}
      {subView === "cup" && showCupTab ? <CupStandingsPanel cup={cup} clubs={clubs} userClubId={userClubId} /> : (
        <>
          <div className="flex items-center justify-between mb-2 px-1">
            <span className="text-xs uppercase tracking-wide font-semibold" style={{ color: C.paperDim }}>{divisionLabel(leagueId, division)}</span>
            {nextOppId && <span className="text-11" style={{ color: C.paperDim }}>Nästa: <b style={{ color: C.goldSoft }}>{clubs[nextOppId].name}</b></span>}
          </div>
          <StandingsTable standings={standings} clubs={clubs} userClubId={userClubId} division={division} nextOppId={nextOppId} schedule={schedule} round={currentRound} />
          {division > 1 && <div className="text-10 mt-2 px-1" style={{ color: C.paperDim }}><span style={{ color: C.win }}>■</span> Uppflyttning till {divisionLabel(leagueId, division - 1)}</div>}
          {division < 3 && <div className="text-10 mt-1 px-1" style={{ color: C.paperDim }}><span style={{ color: C.loss }}>■</span> Nedflyttning till {divisionLabel(leagueId, division + 1)}</div>}
        </>
      )}
    </div>
  );
}

function ScheduleBrowserView({ allSchedules, clubs, homeLeagueId, season, onBack }) {
  const [leagueId, setLeagueId] = useState(homeLeagueId);
  const [division, setDivision] = useState(1);
  const key = `${leagueId}_d${division}`;
  const schedule = allSchedules?.[key] || [];
  const leagueName = LEAGUES.find(l => l.id === leagueId)?.name || leagueId;
  return (
    <div className="rise-in space-y-2.5">
      <button onClick={onBack} style={{ position: "fixed", bottom: 14, right: 14, display: "inline-block", color: "rgba(255,255,255,0.85)", background: "rgba(19,34,29,0.88)", padding: "6px 13px", borderRadius: 999, fontSize: 11, fontWeight: 600, zIndex: 50, backdropFilter: "blur(4px)", boxShadow: "0 2px 10px rgba(0,0,0,0.35)" }}>← Bakåt</button>
      <PaperCard>
        <div className="text-xs uppercase tracking-wide font-semibold mb-1.5" style={{ color: C.inkSoft }}>Liga</div>
        <div className="grid grid-cols-1 gap-1.5">
          {LEAGUES.map(l => (
            <button key={l.id} onClick={() => setLeagueId(l.id)} className="text-left px-3 py-2 rounded-xl text-sm font-semibold" style={leagueId === l.id ? { background: C.turf, color: C.paper } : { background: C.paperDim, color: C.ink }}>{l.name}{l.id === homeLeagueId ? " (er liga)" : ""}</button>
          ))}
        </div>
        <div className="text-xs uppercase tracking-wide font-semibold mt-3 mb-1.5" style={{ color: C.inkSoft }}>Division</div>
        <div className="grid grid-cols-3 gap-1.5">
          {[1, 2, 3].map(d => (
            <button key={d} onClick={() => setDivision(d)} className="py-2 rounded-xl text-sm font-semibold" style={division === d ? { background: C.turf, color: C.paper } : { background: C.paperDim, color: C.ink }}>{divisionLabel(leagueId, d)}</button>
          ))}
        </div>
      </PaperCard>
      <div className="text-xs uppercase tracking-wide font-semibold px-1" style={{ color: C.paperDim }}>{leagueName} · {divisionLabel(leagueId, division)}</div>
      <PaperCard style={{ padding: 0 }}>
        <div className="max-h-96 overflow-y-auto divide-y" style={{ borderColor: C.paperDim }}>
          {schedule.map((round, ri) => round.map((f, fi) => {
            const home = clubs[f.home], away = clubs[f.away];
            if (!home || !away) return null;
            const played = f.homeGoals !== null;
            return (
              <div key={`${ri}-${fi}`} className="flex items-center justify-between px-3 py-2 text-11">
                <span className="font-mono w-14 shrink-0" style={{ color: C.inkSoft }}>{formatGameDateShort(roundDate(season, ri))}</span>
                <span className="flex-1 truncate px-1">{home.name} – {away.name}</span>
                {played ? <span className="font-mono font-semibold shrink-0">{f.homeGoals}–{f.awayGoals}</span> : <span className="font-mono shrink-0" style={{ color: C.inkSoft }}>–</span>}
              </div>
            );
          })).flat().filter(Boolean).slice(0, 200)}
        </div>
      </PaperCard>
    </div>
  );
}
function FixturesTab({ schedule, clubs, currentRound, userClubId, cup, budget, tourOffers, lastTourResult, tourCompletedThisOffseason, onOpenTours, onStartTour, season, allSchedules, leagueId, onSubViewChange, season1Qualifiers, cup1Live, domesticLive, cup2Live }) {
  const [subView, setSubView] = useState("league");
  const [showBrowser, setShowBrowser] = useState(false);
  const [showCupBrowser, setShowCupBrowser] = useState(false);
  useEffect(() => { onSubViewChange?.(showBrowser || showCupBrowser); }, [showBrowser, showCupBrowser]);
  const rivalId = clubs[userClubId]?.rivalId;
  const showCupTab = cup && !cup.champion && !cup.eliminated;
  if (showBrowser) return <ScheduleBrowserView allSchedules={allSchedules} clubs={clubs} homeLeagueId={leagueId} season={season} onBack={() => setShowBrowser(false)} />;
  if (showCupBrowser) return <CupBrowserView clubs={clubs} homeLeagueId={leagueId} season={season} currentRound={currentRound} userClubId={userClubId} season1Qualifiers={season1Qualifiers} cup1Live={cup1Live} domesticLive={domesticLive} cup2Live={cup2Live} onBack={() => setShowCupBrowser(false)} />;
  return (
    <div className="rise-in">
      <div className="grid grid-cols-2 gap-2 mb-2.5">
        <button onClick={() => setShowBrowser(true)} className="py-2 rounded-xl text-xs font-semibold" style={{ background: C.gold, color: C.turfDeep }}>Bläddra spelscheman</button>
        <button onClick={() => setShowCupBrowser(true)} className="py-2 rounded-xl text-xs font-semibold" style={{ background: "transparent", border: `1px solid ${C.paperDim}`, color: C.paperDim }}>Bläddra cuper</button>
      </div>

      {showCupTab && (
        <div className="flex gap-2 mb-3 mt-2.5">
          {[["league", "Liga"], ["cup", cup.label]].map(([key, label]) => (
            <button key={key} onClick={() => setSubView(key)} className="flex-1 py-2 rounded-xl text-11 font-semibold" style={subView === key ? { background: C.gold, color: C.turfDeep } : { background: "rgba(30,42,34,0.08)", color: C.ink }}>{label}</button>
          ))}
        </div>
      )}
      {subView === "cup" && showCupTab ? <CupFixturesPanel cup={cup} clubs={clubs} userClubId={userClubId} /> : (
        <PaperCard style={{ padding: 0, marginTop: showCupTab ? 0 : 10 }}>
          <div className="max-h-70 overflow-y-auto divide-y" style={{ borderColor: C.paperDim }}>
            {schedule.map((round, ri) => {
              const f = round.find(x => x.home === userClubId || x.away === userClubId);
              if (!f) return null;
              const userIsHome = f.home === userClubId;
              const oppId = userIsHome ? f.away : f.home;
              const isRival = oppId === rivalId;
              const played = f.homeGoals !== null;
              const isCurrent = ri === currentRound;
              let resultTag = null;
              if (played) {
                const ug = userIsHome ? f.homeGoals : f.awayGoals, og = userIsHome ? f.awayGoals : f.homeGoals;
                resultTag = ug > og ? "win" : ug < og ? "loss" : "draw";
              }
              return (
                <div key={ri} className="flex items-center justify-between px-3 py-2.5 text-sm" style={{ background: isCurrent ? "rgba(201,154,62,0.15)" : "transparent" }}>
                  <span className="font-mono text-xs w-16 shrink-0" style={{ color: C.inkSoft }}>{formatGameDateShort(roundDate(season, ri))}</span>
                  <span className="flex-1 flex items-center gap-1.5 truncate px-1">{isRival && <Star size={11} fill={C.gold} color={C.gold} className="shrink-0" />}<ClubJersey club={clubs[oppId]} size={16} /><span className="truncate">{userIsHome ? "vs" : "@"} {clubs[oppId].name}</span></span>
                  {played ? (
                    <span className="flex items-center gap-1.5 font-mono">{resultTag && <ResultChip result={resultTag} />}<span>{f.homeGoals} – {f.awayGoals}</span></span>
                  ) : <span className="font-mono text-xs" style={{ color: C.inkSoft }}>{isCurrent ? "Nästa" : "–"}</span>}
                </div>
              );
            })}
          </div>
        </PaperCard>
      )}
    </div>
  );
}


const PRESTIGE_KIT_OVERRIDES = {
  eng1: { pattern: "solid", trim: "#ffffff" },       // Liverpool Athletic
  eng2: { pattern: "solid", trim: "#ffffff" },       // Manchester Rovers
  eng7: { pattern: "solid", trim: "#ffffff" },       // Trafford United
  eng3: { pattern: "solid", trim: "#1C87C9" },       // Thames Ironworks (claret + blue trim)
  eng5: { pattern: "solid", trim: "#ffffff" },        // Millwall Rovers (navy + white trim)
  eng10: { pattern: "solid", trim: "#132257" },       // White Hart Wanderers (white + navy trim)
  eng11: { pattern: "solid", trim: "#FFCD00" },       // Elland Whites (white + yellow trim)
  eng12: { pattern: "stripes", secondary: "#ffffff" }, // Tyneside Magpies (black/white stripes)
  ita1: { pattern: "solid", trim: "#F2C230" },       // Roma 1927 (red + gold)
  ita2: { pattern: "stripes", secondary: "#111111" }, // Milano 1899 (red/black stripes)
  ita3: { pattern: "stripes", secondary: "#111111" }, // Milano Nerazzurri (blue/black stripes)
  ita4: { pattern: "stripes", secondary: "#ffffff" }, // Piemonte Bianconeri (black/white stripes)
  esp1: { pattern: "solid", trim: "#1B458F" },        // CF Madrid (white + navy trim)
  esp2: { pattern: "stripes", secondary: "#A50044" }, // Deportivo Barcelona (blue/garnet)
  esp3: { pattern: "stripes", secondary: "#ffffff" }, // Atlético Rojiblanco (red/white stripes)
  esp9: { pattern: "stripes", secondary: "#ffffff" }, // Bilbao Vizcaya (red/white stripes)
  ger1: { pattern: "solid", trim: "#ffffff" },        // München 1900
  ger2: { pattern: "solid", trim: "#111111" },        // Dortmund 1909 (yellow + black trim)
  fra1: { pattern: "solid", trim: "#ffffff" },        // FC Paris
  fra2: { pattern: "solid", trim: "#ffffff" },        // Racing Marseille
};
function kitPatternFor(club) {
  if (!club) return { pattern: "solid", secondary: null, trim: "#ffffff" };
  if (club.jerseyPattern || club.secondaryColor) {
    const rng = seededRandom(String(club.id) + "kit")();
    const defaultPattern = rng < 0.4 ? "solid" : rng < 0.62 ? "stripes" : rng < 0.81 ? "hoops" : "halves";
    return { pattern: club.jerseyPattern || defaultPattern, secondary: club.secondaryColor || null, trim: club.secondaryColor || "#ffffff" };
  }
  if (PRESTIGE_KIT_OVERRIDES[club.id]) return PRESTIGE_KIT_OVERRIDES[club.id];
  const rng = seededRandom(String(club.id) + "kit")();
  const pattern = rng < 0.4 ? "solid" : rng < 0.62 ? "stripes" : rng < 0.81 ? "hoops" : "halves";
  return { pattern, secondary: null, trim: "#ffffff" };
}
function ClubJersey({ club, size = 34 }) {
  if (!club) return <div style={{ width: size, height: size, borderRadius: "50%", background: C.paperDim }} />;
  const kit = kitPatternFor(club);
  const base = club.color;
  const secondary = kit.secondary || kit.trim || "#ffffff";
  const clipId = `jsy-${club.id}`;
  const bodyPath = "M35,8 L20,8 L4,26 L16,40 L16,92 L84,92 L84,40 L96,26 L80,8 L65,8 Q50,20 35,8 Z";
  return (
    <div style={{ width: size, height: size, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      <svg width={size} height={size} viewBox="0 0 100 100">
        <defs>
          <clipPath id={clipId}><path d={bodyPath} /></clipPath>
        </defs>
        <g clipPath={`url(#${clipId})`}>
          <rect x="0" y="0" width="100" height="100" fill={base} />
          {kit.pattern === "stripes" && [0, 2, 4].map(i => <rect key={i} x={16 + i * 17} y="0" width="8.5" height="100" fill={secondary} />)}
          {kit.pattern === "hoops" && [0, 1, 2].map(i => <rect key={i} x="0" y={22 + i * 22} width="100" height="11" fill={secondary} />)}
          {kit.pattern === "halves" && <rect x="50" y="0" width="50" height="100" fill={secondary} />}
        </g>
        <path d={bodyPath} fill="none" stroke="#1a1a1a" strokeWidth="3" strokeLinejoin="round" />
        <path d="M35,8 Q50,20 65,8" fill="none" stroke={kit.pattern === "solid" && kit.trim ? kit.trim : "#1a1a1a"} strokeWidth="2.5" />
      </svg>
    </div>
  );
}
const AVATAR_SKIN_TONES = ["#F6D3B3", "#EAB98C", "#D2996B", "#B37A4C", "#8C5A34", "#6B4023", "#4A2C18"];
const AVATAR_HAIR_COLORS = ["#170F09", "#3A2A1E", "#5C3B1E", "#8B5A2B", "#B8892A", "#C9A227", "#5B5B5B", "#7A2E1E"];
const AVATAR_BG = ["#8FA89A", "#A98F6B", "#8B9EBF", "#C79E8F", "#9A9670", "#7D9C9C", "#B08FA0", "#9CAB7E"];
// A deterministic, illustrated identity for every fictional player — same face every time you view them,
// varied by skin tone, hair colour/style and a muted background tint, purely generated from their own ID
// (not tied to nationality in any fixed 1:1 way, so there's natural variety within every group).
function PlayerAvatar({ player, size = 44 }) {
  if (!player) return <div style={{ width: size, height: size, borderRadius: "50%", background: C.paperDim }} />;
  const rng = seededRandom(String(player.id ?? player.name ?? "x") + "avatar");
  const skin = AVATAR_SKIN_TONES[Math.floor(rng() * AVATAR_SKIN_TONES.length)];
  const isGrey = (player.age ?? 45) >= 33 && rng() < 0.4;
  const hair = isGrey ? "#BFC2C4" : AVATAR_HAIR_COLORS[Math.floor(rng() * AVATAR_HAIR_COLORS.length)];
  const bg = AVATAR_BG[Math.floor(rng() * AVATAR_BG.length)];
  const styleRoll = rng();
  const style = styleRoll < 0.16 ? "bald" : styleRoll < 0.42 ? "short" : styleRoll < 0.68 ? "curly" : styleRoll < 0.87 ? "swept" : "long";
  const hasBeard = rng() < 0.3;
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", overflow: "hidden", flexShrink: 0, background: bg }}>
      <svg width={size} height={size} viewBox="0 0 100 100">
        <circle cx="50" cy="105" r="34" fill="#00000022" />
        <ellipse cx="50" cy="102" rx="30" ry="26" fill={skin} />
        {hasBeard && <ellipse cx="50" cy="70" rx="19" ry="16" fill={hair} opacity="0.85" />}
        <circle cx="50" cy="46" r="24" fill={skin} />
        {style === "short" && <path d="M24,42 Q26,14 50,14 Q74,14 76,42 Q74,26 50,26 Q26,26 24,42 Z" fill={hair} />}
        {style === "curly" && <g fill={hair}>
          <circle cx="30" cy="30" r="9" /><circle cx="42" cy="21" r="10" /><circle cx="58" cy="21" r="10" /><circle cx="70" cy="30" r="9" /><circle cx="50" cy="18" r="10" />
        </g>}
        {style === "swept" && <path d="M22,38 Q20,12 50,12 Q80,12 78,38 Q68,20 50,24 Q34,18 22,38 Z" fill={hair} />}
        {style === "long" && <path d="M20,55 Q16,10 50,10 Q84,10 80,55 Q78,30 66,26 Q70,42 62,44 Q64,26 50,24 Q36,26 38,44 Q30,42 34,26 Q22,30 20,55 Z" fill={hair} />}
        {style === "bald" && <ellipse cx="50" cy="30" rx="3" ry="1.5" fill={hair} opacity="0" />}
        <circle cx="41" cy="47" r="2.4" fill="#241a12" />
        <circle cx="59" cy="47" r="2.4" fill="#241a12" />
        <path d="M45,58 Q50,61 55,58" stroke="#6b4a35" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      </svg>
    </div>
  );
}
function OverallBadge({ overall, size = 34 }) {
  const tier = overallTier(overall);
  return (
    <div className="rounded-full flex items-center justify-center font-display shrink-0" style={{ width: size, height: size, background: tier.color, color: tier.color === C.gold ? C.turfDeep : "#fff", fontSize: size * 0.44 }}>{overall}</div>
  );
}
function overallToStars(overall) { return Math.round(clamp(overall / 10, 1, 10) * 10) / 10; }
function StarRating({ rating, size = 9, showLabel = true, emptyColor = "rgba(0,0,0,0.15)" }) {
  const clamped = clamp(rating, 0, 10);
  return (
    <div className="flex items-center" style={{ gap: 3 }}>
      <div className="flex items-center" style={{ gap: 1 }}>
        {Array.from({ length: 10 }, (_, i) => {
          const fill = clamp(clamped - i, 0, 1);
          return (
            <div key={i} style={{ position: "relative", width: size, height: size }}>
              <Star size={size} color={emptyColor} style={{ position: "absolute", top: 0, left: 0 }} />
              {fill > 0 && (
                <div style={{ position: "absolute", top: 0, left: 0, width: `${fill * 100}%`, height: "100%", overflow: "hidden" }}>
                  <Star size={size} fill={C.gold} color={C.gold} />
                </div>
              )}
            </div>
          );
        })}
      </div>
      {showLabel && <span className="font-mono font-semibold" style={{ fontSize: Math.max(9, size), color: "#B8862E" }}>{clamped.toFixed(1).replace(".", ",")}</span>}
    </div>
  );
}

function AnimatedNumber({ value, format, duration = 600 }) {
  const [display, setDisplay] = useState(value);
  const prevRef = useRef(value);
  useEffect(() => {
    const from = prevRef.current;
    const to = value;
    if (from === to) { setDisplay(to); return; }
    const start = performance.now();
    let raf;
    function tick(now) {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const current = from + (to - from) * eased;
      setDisplay(current);
      if (t < 1) raf = requestAnimationFrame(tick);
      else prevRef.current = to;
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  const fmt = format || (v => Math.round(v));
  return <>{fmt(display)}</>;
}

function Sparkline({ data, width = 100, height = 28, color }) {
  if (!data || data.length < 2) return <div style={{ height }} />;
  const min = Math.min(...data), max = Math.max(...data);
  const range = max - min || 1;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * height;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const trendUp = data[data.length - 1] >= data[0];
  const lineColor = color || (trendUp ? C.win : C.loss);
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: "block" }}>
      <polyline points={points} fill="none" stroke={lineColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Confetti({ count = 24 }) {
  const pieces = useMemo(() => Array.from({ length: count }, (_, i) => ({
    id: i, left: Math.random() * 100, delay: Math.random() * 0.6, duration: 1.6 + Math.random() * 1.2,
    color: pick([C.gold, C.goldSoft, C.win, "#fff"]), size: 5 + Math.random() * 5,
  })), [count]);
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none", borderRadius: "inherit" }}>
      {pieces.map(p => (
        <div key={p.id} style={{
          position: "absolute", top: -10, left: `${p.left}%`, width: p.size, height: p.size * 1.6,
          background: p.color, opacity: 0.9, animation: `confettiFall ${p.duration}s ease-in ${p.delay}s both`,
        }} />
      ))}
    </div>
  );
}

function PitchMarkings({ vertical }) {
  if (vertical) {
    return (
      <>
        <div style={{ position: "absolute", top: "50%", left: 0, right: 0, height: 2, background: "rgba(255,255,255,0.2)" }} />
        <div style={{ position: "absolute", top: "50%", left: "50%", width: 74, height: 74, marginLeft: -37, marginTop: -37, border: "2px solid rgba(255,255,255,0.2)", borderRadius: "50%" }} />
        <div style={{ position: "absolute", top: 0, left: "22%", height: "12%", width: "56%", borderLeft: "2px solid rgba(255,255,255,0.2)", borderRight: "2px solid rgba(255,255,255,0.2)", borderBottom: "2px solid rgba(255,255,255,0.2)" }} />
        <div style={{ position: "absolute", bottom: 0, left: "22%", height: "12%", width: "56%", borderLeft: "2px solid rgba(255,255,255,0.2)", borderRight: "2px solid rgba(255,255,255,0.2)", borderTop: "2px solid rgba(255,255,255,0.2)" }} />
      </>
    );
  }
  return (
    <>
      <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 2, background: "rgba(255,255,255,0.2)" }} />
      <div style={{ position: "absolute", left: "50%", top: "50%", width: 74, height: 74, marginLeft: -37, marginTop: -37, border: "2px solid rgba(255,255,255,0.2)", borderRadius: "50%" }} />
      <div style={{ position: "absolute", left: 0, top: "22%", width: "12%", height: "56%", borderTop: "2px solid rgba(255,255,255,0.2)", borderBottom: "2px solid rgba(255,255,255,0.2)", borderRight: "2px solid rgba(255,255,255,0.2)" }} />
      <div style={{ position: "absolute", right: 0, top: "22%", width: "12%", height: "56%", borderTop: "2px solid rgba(255,255,255,0.2)", borderBottom: "2px solid rgba(255,255,255,0.2)", borderLeft: "2px solid rgba(255,255,255,0.2)" }} />
    </>
  );
}
function dedupeCells(gridSlots) {
  const used = new Set();
  return gridSlots.map(s => {
    let [col, row] = s.id.split("-").map(Number);
    let key = cellKey(col, row);
    let tries = 0;
    while (used.has(key) && tries < GRID_COLS * GRID_ROWS) {
      row = (row + 1) % GRID_ROWS;
      tries++;
      if (tries % GRID_ROWS === 0) col = (col + 1) % GRID_COLS;
      key = cellKey(col, row);
    }
    used.add(key);
    return { ...s, id: key };
  });
}
function formationPresetToCells(code, squad, xiIds) {
  const slots = parseFormation(code);
  const gridSlots = dedupeCells(slots.map(s => ({
    id: cellKey(Math.round((s.x / 100) * (GRID_COLS - 1)), Math.round((s.y / 100) * (GRID_ROWS - 1))),
    role: s.role,
  })));
  return autoAssignFormation(gridSlots, squad, xiIds);
}
function initialLineup(squad, startingXI, formationCode, savedCells) {
  if (savedCells && Object.keys(savedCells).length) {
    const valid = {};
    Object.entries(savedCells).forEach(([k, id]) => { if (!id || squad.some(p => p.id === id)) valid[k] = id; });
    const entries = Object.entries(valid);
    const maxSlots = (startingXI && startingXI.length) || 11;
    if (entries.length > maxSlots) {
      // More cells than the starting XI can ever fill — almost always a leftover from switching formations
      // or an older save. Keep filled cells first, then trim any excess empty placeholders.
      entries.sort(([, a], [, b]) => (b ? 1 : 0) - (a ? 1 : 0));
      const trimmed = {};
      entries.slice(0, maxSlots).forEach(([k, id]) => { trimmed[k] = id; });
      if (Object.keys(trimmed).length) return trimmed;
    } else if (entries.length) return valid;
  }
  return formationPresetToCells(formationCode || "4-4-2", squad, startingXI);
}

function FormationView({ squad, startingXI, formationCode, lineupCells, onBack, onSave, onToggleStarter, confirmSell, setConfirmSell, onSell, onToggleListed, onToggleLoanListed, onRenew, onChat, clubs, round, onSendLoan, chemistryPairs, onAssessPlayer }) {
  const [code, setCode] = useState(formationCode || "4-4-2");
  const [lineup, setLineup] = useState(() => initialLineup(squad, startingXI, formationCode, lineupCells));
  const [selectedCell, setSelectedCell] = useState(null);
  const [pickingCell, setPickingCell] = useState(null);
  const [viewingProfileId, setViewingProfileId] = useState(null);
  const [quickViewId, setQuickViewId] = useState(null);

  function applyPreset(newCode) {
    const currentIds = Object.values(lineup).filter(Boolean);
    setLineup(formationPresetToCells(newCode, squad, currentIds));
    setCode(newCode);
    setSelectedCell(null);
  }

  function handleCellTap(col, row) {
    const key = cellKey(col, row);
    if (selectedCell) {
      if (selectedCell === key) { setSelectedCell(null); return; }
      setLineup(prev => {
        const next = { ...prev };
        const movingId = prev[selectedCell];
        const targetId = prev[key];
        if (movingId) next[key] = movingId; else delete next[key];
        if (targetId) next[selectedCell] = targetId; else delete next[selectedCell];
        return next;
      });
      setSelectedCell(null);
      return;
    }
    if (lineup[key]) setSelectedCell(key);
    else setPickingCell(key);
  }
  function benchSelected() {
    if (!selectedCell) return;
    setLineup(prev => { const next = { ...prev }; delete next[selectedCell]; return next; });
    setSelectedCell(null);
  }

  const cells = [];
  for (let row = 0; row < GRID_ROWS; row++) for (let col = 0; col < GRID_COLS; col++) cells.push({ col, row });
  const assignedIds = new Set(Object.values(lineup).filter(Boolean));
  const bench = squad.filter(p => !assignedIds.has(p.id));
  const filledCount = assignedIds.size;
  const teamOverall = filledCount ? Math.round(Array.from(assignedIds).map(id => overallOf(squad.find(p => p.id === id))).reduce((a, b) => a + b, 0) / filledCount) : 0;
  const fitPct = Math.round(teamPositionFit(lineup, squad) * 100);

  if (viewingProfileId) {
    const p = squad.find(x => x.id === viewingProfileId);
    if (!p) { setViewingProfileId(null); return null; }
    return <PlayerProfile player={p} isStarter={Object.values(lineup).includes(p.id)} onToggleStarter={() => onToggleStarter(p.id)}
      onBack={() => setViewingProfileId(null)} confirmSell={confirmSell} setConfirmSell={setConfirmSell}
      onSell={p2 => { onSell(p2); setViewingProfileId(null); }} onToggleListed={onToggleListed} onToggleLoanListed={onToggleLoanListed} onRenew={onRenew} onChat={onChat}
      clubs={clubs} round={round} onSendLoan={onSendLoan ? (toId, toName) => { onSendLoan(toId, toName); setViewingProfileId(null); } : null} squadSize={squad.length} squad={squad} chemistryPairs={chemistryPairs} onAssessPlayer={onAssessPlayer} />;
  }

  if (pickingCell) {
    const [pCol, pRow] = pickingCell.split("-").map(Number);
    const candidates = [...bench].sort((a, b) => positionFit(b.specificPosition, pCol, pRow) - positionFit(a.specificPosition, pCol, pRow));
    return (
      <div className="rise-in space-y-3">
        <button onClick={() => setPickingCell(null)} style={{ position: "fixed", bottom: 14, right: 14, display: "inline-block", color: "rgba(255,255,255,0.85)", background: "rgba(19,34,29,0.88)", padding: "6px 13px", borderRadius: 999, fontSize: 11, fontWeight: 600, zIndex: 50, backdropFilter: "blur(4px)", boxShadow: "0 2px 10px rgba(0,0,0,0.35)" }}>← Bakåt</button>
        <div className="text-xs uppercase tracking-wide font-semibold px-1" style={{ color: C.paperDim }}>Välj spelare till rutan</div>
        {candidates.length === 0 && <PaperCard><div className="text-sm text-center py-3" style={{ color: C.inkSoft }}>Ingen ledig spelare på bänken.</div></PaperCard>}
        <div className="space-y-2">
          {candidates.map(p => {
            const unavailable = p.injuryWeeks > 0 || p.suspendedMatches > 0 || p.internationalDuty;
            const fit = Math.round(positionFit(p.specificPosition, pCol, pRow) * 100);
            return (
              <PaperCard key={p.id} style={{ opacity: unavailable ? 0.5 : 1 }}>
                <button disabled={unavailable} onClick={() => { setLineup(prev => ({ ...prev, [pickingCell]: p.id })); setPickingCell(null); }} className="w-full flex items-center gap-3 text-left">
                  <OverallBadge overall={overallOf(p)} size={34} />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm truncate">#{p.number} {p.name} <span className="font-normal text-10" style={{ color: C.inkSoft }}>{specificPositionLabel(p.specificPosition)}</span></div>
                    <div className="text-10" style={{ color: unavailable ? C.loss : fit >= 70 ? C.win : fit >= 45 ? C.gold : C.loss }}>{unavailable ? "Ej tillgänglig just nu" : `Passform i rutan: ${fit}%`}</div>
                  </div>
                </button>
              </PaperCard>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="rise-in space-y-2.5">
      <button onClick={onBack} style={{ position: "fixed", bottom: 14, right: 14, display: "inline-block", color: "rgba(255,255,255,0.85)", background: "rgba(19,34,29,0.88)", padding: "6px 13px", borderRadius: 999, fontSize: 11, fontWeight: 600, zIndex: 50, backdropFilter: "blur(4px)", boxShadow: "0 2px 10px rgba(0,0,0,0.35)" }}>← Bakåt</button>
      <button onClick={() => { setLineup({}); setSelectedCell(null); }} className="text-11 self-start" style={{ color: C.loss }}>Rensa startelva</button>
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {FORMATION_CODES.map(fc => (
          <button key={fc} onClick={() => applyPreset(fc)} className="px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap" style={fc === code ? { background: C.gold, color: C.turfDeep } : { background: "rgba(30,42,34,0.08)", color: C.ink }}>{fc}</button>
        ))}
      </div>
      <PaperCard>
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs uppercase tracking-wide font-semibold" style={{ color: C.inkSoft }}>{filledCount}/11 utsedda · Snitt {teamOverall}</div>
          <div className="font-mono text-sm font-semibold" style={{ color: fitPct >= 80 ? C.win : fitPct >= 55 ? C.gold : C.loss }}>Passform {fitPct}%</div>
        </div>
        <div style={{ position: "relative", width: 480, height: 210, margin: "0 auto", background: "linear-gradient(180deg,#1B5E45,#134C39)", borderRadius: 12, overflow: "hidden", border: "2px solid rgba(255,255,255,0.2)" }}>
          <PitchMarkings />
          <div style={{ position: "absolute", inset: 0, display: "grid", gridTemplateColumns: `repeat(${GRID_COLS}, 1fr)`, gridTemplateRows: `repeat(${GRID_ROWS}, 1fr)` }}>
            {cells.map(({ col, row }) => {
              const key = cellKey(col, row);
              const player = lineup[key] ? squad.find(p => p.id === lineup[key]) : null;
              const isSelected = selectedCell === key;
              const tier = player ? overallTier(overallOf(player)) : null;
              const fit = player ? positionFit(player.specificPosition, col, row) : null;
              return (
                <div key={key} onClick={() => handleCellTap(col, row)} onDoubleClick={() => player && setQuickViewId(player.id)} style={{ border: "1px solid rgba(255,255,255,0.07)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", background: isSelected ? "rgba(201,154,62,0.28)" : "transparent" }}>
                  {player ? (
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "100%", padding: "0 2px" }}>
                      <div style={{ width: 21, height: 21, borderRadius: "50%", background: tier.color, border: `1.5px solid ${isSelected ? C.gold : fit < 0.55 ? C.loss : "#fff"}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <span className="font-display" style={{ fontSize: 7.5, color: tier.color === C.gold ? C.turfDeep : "#fff" }}>{nearestPositionForCell(col, row)}</span>
                      </div>
                      <div className="font-semibold mt-0.5" style={{ fontSize: 7, color: "#ffffff", background: "rgba(0,0,0,0.5)", padding: "0 2.5px", borderRadius: 3, maxWidth: "100%", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", lineHeight: "10px" }}>{player.name.split(" ").slice(-1)[0]}</div>
                    </div>
                  ) : (
                    <div style={{ width: 12, height: 12, borderRadius: "50%", border: "1.5px dashed rgba(255,255,255,0.3)" }} />
                  )}
                </div>
              );
            })}
          </div>
        </div>
        <div className="text-10 text-center mt-2" style={{ color: C.inkSoft }}>Dubbelklicka på spelare för mer info</div>
        <div className="mt-3 pt-3" style={{ borderTop: `1px solid ${C.paperDim}` }}>
          <div className="text-9 uppercase tracking-wide font-semibold mb-1.5" style={{ color: C.inkSoft }}>Färgnyckel</div>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            <span className="text-9 flex items-center gap-1" style={{ color: C.inkSoft }}><span style={{ width: 10, height: 10, borderRadius: "50%", background: C.gold, display: "inline-block" }} />Fyllning: Världsklass</span>
            <span className="text-9 flex items-center gap-1" style={{ color: C.inkSoft }}><span style={{ width: 10, height: 10, borderRadius: "50%", background: C.win, display: "inline-block" }} />Mycket bra</span>
            <span className="text-9 flex items-center gap-1" style={{ color: C.inkSoft }}><span style={{ width: 10, height: 10, borderRadius: "50%", background: "#3F7AB0", display: "inline-block" }} />Solid</span>
            <span className="text-9 flex items-center gap-1" style={{ color: C.inkSoft }}><span style={{ width: 10, height: 10, borderRadius: "50%", background: C.inkSoft, display: "inline-block" }} />Utvecklingsbar</span>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-1.5">
            <span className="text-9 flex items-center gap-1" style={{ color: C.inkSoft }}><span style={{ width: 10, height: 10, borderRadius: "50%", border: "2px solid #fff", display: "inline-block" }} />Ram: Bra passform</span>
            <span className="text-9 flex items-center gap-1" style={{ color: C.inkSoft }}><span style={{ width: 10, height: 10, borderRadius: "50%", border: `2px solid ${C.loss}`, display: "inline-block" }} />Dålig passform</span>
            <span className="text-9 flex items-center gap-1" style={{ color: C.inkSoft }}><span style={{ width: 10, height: 10, borderRadius: "50%", border: `2px solid ${C.gold}`, display: "inline-block" }} />Markerad</span>
          </div>
        </div>
        {selectedCell && lineup[selectedCell] && (
          <div className="flex gap-2 mt-2">
            <button onClick={() => setViewingProfileId(lineup[selectedCell])} className="flex-1 py-2 rounded-xl text-xs font-semibold" style={{ background: "transparent", border: `1px solid ${C.inkSoft}`, color: C.inkSoft }}>Visa profil</button>
            <button onClick={benchSelected} className="flex-1 py-2 rounded-xl text-xs font-semibold" style={{ background: "transparent", border: `1px solid ${C.loss}`, color: C.loss }}>Skicka till bänken</button>
          </div>
        )}
      </PaperCard>
      <div>
        <div className="text-xs uppercase tracking-wide font-semibold mb-2 px-1" style={{ color: C.paperDim }}>Bänk ({bench.length})</div>
        <div className="flex flex-wrap gap-1.5">
          {bench.map(p => (
            <button key={p.id} onClick={() => setViewingProfileId(p.id)} className="text-10 font-mono px-2 py-1 rounded-lg" style={{ background: "rgba(255,255,255,0.08)", color: p.injuryWeeks > 0 || p.suspendedMatches > 0 ? C.loss : C.paperDim }}>#{p.number} {playerInitials(p.name)} · {p.specificPosition}</button>
          ))}
        </div>
      </div>
      <button onClick={() => onSave(code, Array.from(assignedIds), lineup)} disabled={filledCount < 11} className="w-full py-2.5 rounded-xl font-display text-sm tracking-wide" style={filledCount >= 11 ? { background: C.gold, color: C.turfDeep } : { background: C.paperDim, color: C.inkSoft, opacity: 0.6 }}>{filledCount >= 11 ? "SPARA STARTELVA" : `VÄLJ ${11 - filledCount} SPELARE TILL`}</button>
      {quickViewId && (() => {
        const qp = squad.find(p => p.id === quickViewId);
        if (!qp) return null;
        const qOverall = overallOf(qp);
        const qTier = overallTier(qOverall);
        const qBest = bestAttribute(qp);
        return (
          <div onClick={() => setQuickViewId(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
            <div onClick={e => e.stopPropagation()} style={{ background: C.paper, borderRadius: 16, padding: 16, width: "100%", maxWidth: 330, boxShadow: "0 12px 30px rgba(0,0,0,0.4)" }}>
              <div className="flex items-center gap-3">
                <OverallBadge overall={qOverall} size={44} />
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm truncate">#{qp.number} {qp.name}</div>
                  <div className="text-11" style={{ color: C.inkSoft }}>{specificPositionLabel(qp.specificPosition)} · {nationalityLabel(qp.nationality)}, {qp.age} år</div>
                  {qp.personality && qp.personality !== "Balanserad" && <div className="text-10 font-semibold mt-0.5" style={{ color: C.gold }}>{qp.personality}</div>}
                  <div className="mt-1"><StarRating rating={overallToStars(qOverall)} size={9} /></div>
                </div>
              </div>
              <div className="flex gap-2 mt-3"><StatBar label="Anfall" value={qp.attack} color={C.gold} /><StatBar label="Försvar" value={qp.defense} color={C.turf} /><StatBar label="Trivsel" value={qp.morale} color={qp.morale >= 60 ? C.win : qp.morale >= 35 ? C.gold : C.loss} /></div>
              <div className="mt-2"><StatBar label="Ork" value={qp.stamina ?? 100} color={(qp.stamina ?? 100) >= 60 ? C.win : (qp.stamina ?? 100) >= 35 ? C.gold : C.loss} /></div>
              <div className="text-11 mt-2" style={{ color: C.inkSoft }}>Bäst: {qBest.label} {qBest.value} · Värde: {formatMoney(qp.value)}</div>
              <div className="text-11 mt-1" style={{ color: C.inkSoft }}>Kontrakt: {qp.contractYears} år kvar · Lön: {formatMoney(qp.wage)}/omg</div>
              <button onClick={() => { setQuickViewId(null); setViewingProfileId(qp.id); }} className="mt-3 w-full py-2 rounded-xl text-xs font-semibold" style={{ background: C.turf, color: C.paper }}>Visa hela profilen</button>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

const CONTRACT_SORT_OPTIONS = [
  { key: "position", label: "Position" },
  { key: "age", label: "Ålder" },
  { key: "contract", label: "Kontraktslängd" },
  { key: "wage", label: "Kontraktsvärde" },
  { key: "value", label: "Marknadsvärde" },
];
function penaltyRating(player) {
  const attrs = getAttrs(player);
  const cf = clutchFactor(player);
  return clamp(Math.round(attrs.shooting * 0.55 + (cf + 1) / 2 * 45), 8, 99);
}
function freekickRating(player) {
  const attrs = getAttrs(player);
  return clamp(Math.round(attrs.shooting * 0.5 + attrs.dribbling * 0.3 + weakFoot(player) * 3), 8, 99);
}
function cornerRating(player) {
  const attrs = getAttrs(player);
  return clamp(Math.round(attrs.passing * 0.75 + attrs.dribbling * 0.15), 8, 99);
}
function SetPieceRosterRow({ player, statLabel, statValue, dragId, dragOverId, onSelectPlayer, onRowPointerDown, onRowPointerMove, onRowPointerUp }) {
  const isDragging = dragId === player.id;
  const isDragOver = dragOverId === player.id && dragId && dragId !== player.id;
  return (
    <div data-setpiece-row={player.id}
      style={{ borderTop: "1px solid rgba(255,255,255,0.07)", opacity: isDragging ? 0.4 : 1, boxShadow: isDragOver ? `inset 0 0 0 2px ${C.gold}` : "none" }}
      className="flex items-center gap-2 py-1.5 px-1">
      <span onPointerDown={e => onRowPointerDown(e, player.id)} onPointerMove={onRowPointerMove} onPointerUp={onRowPointerUp} onPointerCancel={onRowPointerUp}
        style={{ touchAction: "none", cursor: "grab", color: "rgba(255,255,255,0.5)", width: 26, height: 32, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 15, lineHeight: 1 }}>⠿⠿</span>
      <button onClick={() => onSelectPlayer(player.id)} className="flex-1 min-w-0 text-left">
        <span className="text-11 font-semibold truncate" style={{ display: "block", color: C.paper }}>{player.name}</span>
        <span className="text-9" style={{ color: C.paperDim }}>{player.specificPosition} · {POS_LABEL[player.pos]}</span>
      </button>
      <span className="font-mono text-11 font-bold shrink-0" style={{ color: C.goldSoft, width: 26, textAlign: "center" }}>{statValue}</span>
    </div>
  );
}
function SetPieceDropSlot({ label, player, onRemove, isDragOver }) {
  return (
    <div data-setpiece-slot={label} style={{ background: "rgba(255,255,255,0.05)", border: `1.5px dashed ${isDragOver ? C.gold : "rgba(255,255,255,0.15)"}`, borderRadius: 10, padding: "8px 10px", minHeight: 40 }} className="flex items-center justify-between">
      {player ? (
        <>
          <span className="text-11 font-semibold" style={{ color: C.paper }}>{player.name}</span>
          <button onClick={onRemove} className="text-9 px-1.5" style={{ color: C.loss }}>×</button>
        </>
      ) : <span className="text-9" style={{ color: C.paperDim }}>Släpp en spelare här</span>}
    </div>
  );
}
function RankedPickerPopup({ title, candidates, statLabel, starterIds, onPick, onClose }) {
  const [showAll, setShowAll] = useState(false);
  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 40 }} />
      <div style={{ position: "fixed", top: 70, left: 110, width: 270, maxHeight: "72vh", overflowY: "auto", background: C.paper, color: C.ink, borderRadius: 16, boxShadow: "0 16px 40px rgba(0,0,0,0.5)", border: `2px solid ${C.gold}`, zIndex: 41, padding: 12 }}>
        <div className="flex items-center justify-between mb-2">
          <div className="text-10 uppercase tracking-wide font-bold" style={{ color: C.ink }}>{title}</div>
          <button onClick={onClose} className="shrink-0 ml-2" style={{ width: 22, height: 22, borderRadius: "50%", background: C.paperDim, color: C.ink, fontWeight: 900, fontSize: 12, lineHeight: "22px", textAlign: "center" }}>✕</button>
        </div>
        <div className="space-y-1.5">
          {(showAll ? candidates : candidates.slice(0, 5)).map(({ player, statValue }) => {
            const overall = overallOf(player);
            const stamina = Math.round(player.stamina ?? 100);
            const staminaColor = stamina >= 60 ? C.win : stamina >= 35 ? C.gold : C.loss;
            return (
              <button key={player.id} onClick={() => onPick(player.id)} className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-left" style={{ background: C.paperDim }}>
                <PlayerAvatar player={player} size={26} />
                <div className="flex-1 min-w-0">
                  <div className="text-11 font-semibold truncate">{player.name}{player.personality === "Ledare" ? " · Ledartyp" : ""}{starterIds && starterIds.has(player.id) && <span className="text-9 font-semibold" style={{ color: C.gold }}> · I startelvan</span>}</div>
                  <div className="flex items-center gap-1 mt-0.5">
                    <StarRating rating={overallToStars(overall)} size={7} showLabel={false} />
                    <span className="font-mono text-9 font-bold" style={{ color: C.ink }}>{overall}</span>
                    <span className="font-mono text-9 font-semibold" style={{ color: staminaColor }}>· Ork {stamina}%</span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-mono text-11 font-bold" style={{ color: C.gold }}>{Math.round(statValue)}</div>
                  <div className="text-9" style={{ color: C.inkSoft }}>{statLabel}</div>
                </div>
              </button>
            );
          })}
        </div>
        {!showAll && candidates.length > 5 && (
          <button onClick={() => setShowAll(true)} className="w-full mt-1.5 py-2 rounded-xl text-9 font-semibold" style={{ background: "transparent", border: `1px solid ${C.paperDim}`, color: C.inkSoft }}>Visa alla spelare ({candidates.length})</button>
        )}
      </div>
    </>
  );
}
function SetPieceSection({ title, desc, outfield, startingXI, statFn, statLabel, mode, value, onChange, onSelectPlayer }) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const sorted = [...outfield].sort((a, b) => statFn(b) - statFn(a));
  const pickerCandidates = sorted.filter(p => mode === "ranked" ? !value.includes(p.id) : p.id !== value).map(p => ({ player: p, statValue: statFn(p) }));
  const rankedPlayers = mode === "ranked" ? value.map(id => outfield.find(p => p.id === id)).filter(Boolean) : [];
  function movePenalty(id, dir) {
    onChange(prev => {
      const i = prev.indexOf(id);
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }
  const singlePlayer = mode === "single" && value ? outfield.find(p => p.id === value) : null;
  return (
    <PaperCard>
      <div className="text-xs uppercase tracking-wide font-semibold mb-0.5" style={{ color: C.inkSoft }}>{title}</div>
      <div className="text-10 mb-2" style={{ color: C.inkSoft }}>{desc}</div>
      {mode === "ranked" ? (
        <div className="space-y-1.5">
          {rankedPlayers.map((p, i) => (
            <div key={p.id} style={{ background: C.paperDim, border: "1px solid rgba(30,42,34,0.1)", borderRadius: 10, padding: "6px 8px" }} className="flex items-center gap-1.5">
              <span className="font-display text-11 shrink-0" style={{ color: C.gold }}>{i + 1}</span>
              <PlayerAvatar player={p} size={22} />
              <span className="text-10 font-semibold flex-1 truncate" style={{ color: C.ink }}>{p.name}</span>
              <span className="font-mono text-9 font-bold shrink-0" style={{ color: C.gold }}>{Math.round(statFn(p))}</span>
              <button onClick={() => movePenalty(p.id, -1)} disabled={i === 0} className="text-9 px-1" style={{ color: i === 0 ? "rgba(30,42,34,0.2)" : C.inkSoft }}>↑</button>
              <button onClick={() => movePenalty(p.id, 1)} disabled={i === rankedPlayers.length - 1} className="text-9 px-1" style={{ color: i === rankedPlayers.length - 1 ? "rgba(30,42,34,0.2)" : C.inkSoft }}>↓</button>
              <button onClick={() => onChange(prev => prev.filter(x => x !== p.id))} className="text-9 px-1" style={{ color: C.loss }}>×</button>
            </div>
          ))}
          {rankedPlayers.length < 5 && (
            <button onClick={() => setPickerOpen(true)} className="w-full py-2 rounded-xl text-xs font-semibold" style={{ background: C.gold, color: C.turfDeep }}>Välj spelare ({rankedPlayers.length}/5)</button>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-2">
          {singlePlayer ? (
            <div className="flex-1 flex items-center gap-2 px-2.5 py-1.5 rounded-xl" style={{ background: C.paperDim, border: "1px solid rgba(30,42,34,0.1)" }}>
              <PlayerAvatar player={singlePlayer} size={26} />
              <div className="flex-1 min-w-0">
                <div className="text-11 font-semibold truncate" style={{ color: C.ink }}>{singlePlayer.name}</div>
                <div className="font-mono text-9 font-bold" style={{ color: C.gold }}>{Math.round(statFn(singlePlayer))} {statLabel}</div>
              </div>
              <button onClick={() => onChange(null)} className="text-9 px-1.5" style={{ color: C.loss }}>×</button>
            </div>
          ) : (
            <div className="flex-1 text-10" style={{ color: C.inkSoft }}>Ingen vald</div>
          )}
          <button onClick={() => setPickerOpen(true)} className="text-9 font-bold px-3 py-2 rounded-lg shrink-0" style={{ background: C.gold, color: C.turfDeep }}>{singlePlayer ? "Byt" : "Välj"}</button>
        </div>
      )}
      {pickerOpen && (
        <RankedPickerPopup
          title={title}
          candidates={pickerCandidates}
          statLabel={statLabel}
          starterIds={startingXI ? new Set(startingXI) : null}
          onClose={() => setPickerOpen(false)}
          onPick={id => {
            if (mode === "ranked") onChange(prev => prev.includes(id) ? prev : prev.length < 5 ? [...prev, id] : prev);
            else onChange(id);
            setPickerOpen(false);
          }}
        />
      )}
    </PaperCard>
  );
}
function SetPieceTakersPanel({ squad, startingXI, setPieceTakers, onSave, onBack, onSelectPlayer }) {
  const [penalties, setPenalties] = useState(setPieceTakers.penalties || []);
  const [freeKick, setFreeKick] = useState(setPieceTakers.freeKick || null);
  const [cornerLeft, setCornerLeft] = useState(setPieceTakers.cornerLeft || null);
  const [cornerRight, setCornerRight] = useState(setPieceTakers.cornerRight || null);
  const outfield = squad.filter(p => p.pos !== "MV");
  return (
    <div className="rise-in space-y-2.5">
      <button onClick={onBack} style={{ position: "fixed", bottom: 14, right: 14, display: "inline-block", color: "rgba(255,255,255,0.85)", background: "rgba(19,34,29,0.88)", padding: "6px 13px", borderRadius: 999, fontSize: 11, fontWeight: 600, zIndex: 50, backdropFilter: "blur(4px)", boxShadow: "0 2px 10px rgba(0,0,0,0.35)" }}>← Bakåt</button>
      <PaperCard>
        <div className="font-display text-lg">Standardsituationer</div>
        <div className="text-11 mt-1" style={{ color: C.inkSoft }}>Dra en spelare till en ruta för att utse dem. Tryck på en spelare för att se profilen. Utses ingen tas nästa tillgängliga i prioritetsordning automatiskt över.</div>
      </PaperCard>
      <SetPieceSection title="Straffskyttar (prioritetsordning, max 5)" desc="Straffsäkerhet byggd på avslut och lugn i pressade lägen." outfield={outfield} startingXI={startingXI} statFn={penaltyRating} statLabel="Straff" mode="ranked" value={penalties} onChange={setPenalties} onSelectPlayer={onSelectPlayer} />
      <SetPieceSection title="Frisparksskytt" desc="Frisparksträffsäkerhet byggd på avslut, dribbling och starkast fot." outfield={outfield} startingXI={startingXI} statFn={freekickRating} statLabel="Frispark" mode="single" value={freeKick} onChange={setFreeKick} onSelectPlayer={onSelectPlayer} />
      <SetPieceSection title="Hörnläggare vänster" desc="Inläggsprecision byggd på passningsförmåga." outfield={outfield} startingXI={startingXI} statFn={cornerRating} statLabel="Hörna" mode="single" value={cornerLeft} onChange={setCornerLeft} onSelectPlayer={onSelectPlayer} />
      <SetPieceSection title="Hörnläggare höger" desc="Inläggsprecision byggd på passningsförmåga." outfield={outfield} startingXI={startingXI} statFn={cornerRating} statLabel="Hörna" mode="single" value={cornerRight} onChange={setCornerRight} onSelectPlayer={onSelectPlayer} />
      <button onClick={() => onSave({ penalties, freeKick, cornerLeft, cornerRight })} className="w-full py-2.5 rounded-xl font-display text-sm tracking-wide" style={{ background: C.gold, color: C.turfDeep }}>SPARA STANDARDSITUATIONER</button>
    </div>
  );
}
const LINEUP_TABLE_POS_TINT = { MV: "rgba(217,169,75,0.16)", FÖ: "rgba(63,143,107,0.14)", MF: "rgba(63,116,168,0.12)", AN: "rgba(180,68,59,0.12)" };
function LineupTablePlayerRow({ player, posCode, cellCol, cellRow, selectedBenchId, onRowTap, onSelectPlayer, compact }) {
  const overall = overallOf(player);
  const fit = cellCol !== undefined ? effectivePositionFit(player, cellCol, cellRow) : null;
  const unavailable = player.injuryWeeks > 0 || player.suspendedMatches > 0 || player.internationalDuty;
  const isTapSelected = selectedBenchId === player.id;
  const outOfPosition = posCode && posCode !== player.specificPosition;
  const staminaColor = (player.stamina ?? 100) >= 60 ? C.win : (player.stamina ?? 100) >= 35 ? C.gold : C.loss;
  const otherGood = [], otherLesser = [];
  Object.keys(SPECIFIC_POSITION_LOOKUP).forEach(code => {
    if (code === player.specificPosition) return;
    const anchor = SPECIFIC_POSITION_LOOKUP[code];
    const f = positionFit(player.specificPosition, anchor.col, anchor.row);
    if (f >= 0.75) otherGood.push(code); else if (f >= 0.55) otherLesser.push(code);
  });
  const altCount = otherGood.length + otherLesser.length;
  const rowStyle = {
    background: isTapSelected ? "rgba(201,154,62,0.22)" : unavailable ? "rgba(180,68,59,0.08)" : LINEUP_TABLE_POS_TINT[player.pos], borderTop: "1px solid rgba(30,42,34,0.08)",
    opacity: unavailable ? 0.75 : 1,
    boxShadow: isTapSelected ? `inset 0 0 0 2px ${C.gold}` : unavailable ? `inset 0 0 0 1.5px ${C.loss}` : "none", cursor: "pointer",
  };

  if (compact) {
    return (
      <div onClick={() => onRowTap(player.id)} style={rowStyle} className="px-2.5 py-1 flex items-center gap-2">
        <span className="font-mono text-9 shrink-0" style={{ color: C.inkSoft, width: 14 }}>{player.number}</span>
        <span className="shrink-0"><PlayerAvatar player={player} size={20} /></span>
        <span className="flex-1 min-w-0 font-semibold text-11 truncate" style={{ color: unavailable ? C.loss : C.ink }}>{player.name}</span>
        <span className="font-mono text-9 font-bold shrink-0" style={{ width: 32, textAlign: "center", color: unavailable ? C.loss : C.ink }}>{player.specificPosition}</span>
        <span className="font-mono text-11 font-bold shrink-0" style={{ width: 20, textAlign: "center" }}>{overall}</span>
        <span title="Ork" className="shrink-0" style={{ width: 7, height: 7, borderRadius: "50%", background: unavailable ? C.loss : staminaColor }} />
        <button onClick={e => { e.stopPropagation(); onSelectPlayer(player.id); }} className="shrink-0 font-bold" style={{ width: 16, height: 16, borderRadius: "50%", background: "rgba(30,42,34,0.08)", color: C.inkSoft, fontSize: 8, lineHeight: "16px", textAlign: "center" }}>ⓘ</button>
      </div>
    );
  }

  return (
    <div onClick={() => onRowTap(player.id)} style={rowStyle} className="px-2.5 py-1.5">
      <div className="flex items-center gap-2">
        <span className="font-mono text-9 shrink-0" style={{ color: C.inkSoft, width: 14 }}>{player.number}</span>
        <span className="shrink-0"><PlayerAvatar player={player} size={24} /></span>
        <span className="flex-1 min-w-0">
          <span className="font-semibold text-11 truncate" style={{ display: "block", color: unavailable ? C.loss : C.ink }}>{player.name}</span>
        </span>
        <div style={{ width: 50, flexShrink: 0, overflow: "hidden" }}><StarRating rating={overallToStars(overall)} size={7} showLabel={false} /></div>
        <span className="shrink-0 text-center" style={{ width: 58, whiteSpace: "nowrap", overflow: "hidden" }}>
          <span className="font-mono text-9 font-bold" style={{ color: unavailable ? C.loss : C.ink }}>{player.specificPosition}</span>
          {outOfPosition && <span className="font-mono text-9" style={{ color: C.loss }}> ({posCode})</span>}
        </span>
        <span className="font-mono text-11 font-bold shrink-0" style={{ width: 22, textAlign: "center" }}>{overall}</span>
        <button onClick={e => { e.stopPropagation(); onSelectPlayer(player.id); }} className="shrink-0 font-bold" style={{ width: 18, height: 18, borderRadius: "50%", background: "rgba(30,42,34,0.08)", color: C.inkSoft, fontSize: 9, lineHeight: "18px", textAlign: "center" }}>ⓘ</button>
      </div>
      {unavailable && (
        <div className="text-9 font-bold mt-0.5" style={{ paddingLeft: 38, color: C.loss }}>
          🔴 {player.injuryWeeks > 0 ? `Skadad · ${player.injuryWeeks} ${player.injuryWeeks === 1 ? "omgång" : "omgångar"} kvar` : player.suspendedMatches > 0 ? `Avstängd · ${player.suspendedMatches} ${player.suspendedMatches === 1 ? "omgång" : "omgångar"} kvar` : "Landslagsuppdrag"}
        </div>
      )}
      <div className="flex items-center gap-1.5 mt-0.5" style={{ paddingLeft: 38, overflowX: "auto", flexWrap: "nowrap", scrollbarWidth: "none" }}>
        {fit !== null && <span className="text-9 font-semibold px-1.5 py-0.5 rounded-full shrink-0" style={{ background: `${fit >= 0.8 ? C.win : fit >= 0.55 ? C.gold : C.loss}1a`, color: fit >= 0.8 ? C.win : fit >= 0.55 ? C.gold : C.loss }}>Pass {Math.round(fit * 100)}%</span>}
        <span className="text-9 font-semibold px-1.5 py-0.5 rounded-full shrink-0" style={{ background: `${staminaColor}1a`, color: staminaColor }}>Ork {Math.round(player.stamina ?? 100)}%</span>
        {(() => {
          const recent = player.recentRatings || [];
          const recentAvg = recent.length ? recent.reduce((s, r) => s + r, 0) / recent.length : null;
          const seasonAvg = player.apps ? player.ratingSum / player.apps : null;
          if (recentAvg === null && seasonAvg === null) return null;
          return (
            <span className="text-9 font-semibold shrink-0" style={{ color: C.inkSoft, whiteSpace: "nowrap" }}>
              {recentAvg !== null && <>5m: <span style={{ color: recentAvg >= 7 ? C.win : recentAvg < 5.5 ? C.loss : C.ink, fontWeight: 700 }}>{recentAvg.toFixed(1)}</span></>}
              {recentAvg !== null && seasonAvg !== null && " · "}
              {seasonAvg !== null && <>Säs: <span style={{ color: seasonAvg >= 7 ? C.win : seasonAvg < 5.5 ? C.loss : C.ink, fontWeight: 700 }}>{seasonAvg.toFixed(1)}</span></>}
            </span>
          );
        })()}
        {altCount > 0 && <span className="text-9 font-semibold px-1.5 py-0.5 rounded-full shrink-0" style={{ background: "rgba(30,42,34,0.06)", color: C.inkSoft, whiteSpace: "nowrap" }} title={`Även: ${otherGood.join(", ")}${otherGood.length && otherLesser.length ? ", " : ""}${otherLesser.map(c => `(${c})`).join(", ")}`}>Även: {otherGood.slice(0, 2).join(", ")}{otherGood.length > 2 || otherLesser.length ? ` +${altCount - Math.min(2, otherGood.length)}` : ""}</span>}
      </div>
    </div>
  );
}
function deriveFormationLabel(lineup, squad) {
  const counts = { FÖ: 0, MF: 0, AN: 0 };
  Object.values(lineup).forEach(id => {
    if (!id) return;
    const p = squad.find(x => x.id === id);
    if (p && counts[p.pos] !== undefined) counts[p.pos]++;
  });
  return `${counts.FÖ}-${counts.MF}-${counts.AN}`;
}
function LineupTableView({ squad, startingXI, formationCode, lineupCells, onSaveFormation, onSelectPlayer, rowMode, onSetRowMode, showAllBench, onSetShowAllBench, clubOverall, squadSize }) {
  const [lineup, setLineup] = useState(() => initialLineup(squad, startingXI, formationCode, lineupCells));
  const [selectedSlotKey, setSelectedSlotKey] = useState(null);
  const [selectedBenchId, setSelectedBenchId] = useState(null);
  const [showAllCandidates, setShowAllCandidates] = useState(false);
  const [dragTileId, setDragTileId] = useState(null);
  const [dragPos, setDragPos] = useState(null);
  const [dragTargetCell, setDragTargetCell] = useState(null);
  const pitchRef = useRef(null);
  const dragState = useRef({ id: null, moved: false, startX: 0, startY: 0 });
  const firstRun = useRef(true);

  useEffect(() => {
    if (firstRun.current) { firstRun.current = false; return; }
    onSaveFormation(deriveFormationLabel(lineup, squad), Object.values(lineup).filter(Boolean), lineup);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineup]);

  // If a starting-XI player is sold/removed from the squad, free their slot but keep the slot itself —
  // the position stays visible on the pitch as an empty tile rather than disappearing entirely.
  useEffect(() => {
    setLineup(prev => {
      let changed = false;
      const next = { ...prev };
      for (const key of Object.keys(next)) {
        if (next[key] && !squad.find(p => p.id === next[key])) {
          next[key] = null;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [squad]);

  function swapPlayers(idA, idB) {
    if (!idA || !idB || idA === idB) return;
    setLineup(prev => {
      const keyA = Object.entries(prev).find(([, pid]) => pid === idA)?.[0];
      const keyB = Object.entries(prev).find(([, pid]) => pid === idB)?.[0];
      const next = { ...prev };
      if (keyA && keyB) { next[keyA] = idB; next[keyB] = idA; }
      else if (keyA && !keyB) { next[keyA] = idB; }
      else if (!keyA && keyB) { next[keyB] = idA; }
      return next;
    });
  }
  function moveToCell(sourceId, targetCellKey) {
    if (!sourceId || !targetCellKey) return;
    setLineup(prev => {
      const sourceKey = Object.entries(prev).find(([, pid]) => pid === sourceId)?.[0];
      const targetPlayerId = prev[targetCellKey] || null;
      if (sourceKey === targetCellKey) return prev;
      const next = { ...prev };
      if (sourceKey) next[sourceKey] = targetPlayerId;
      next[targetCellKey] = sourceId;
      return next;
    });
  }
  function onRowTap(playerId) {
    const cellKeyForPlayer = Object.entries(lineup).find(([, pid]) => pid === playerId)?.[0];
    if (cellKeyForPlayer) {
      openPositionPicker(cellKeyForPlayer);
    } else {
      setSelectedBenchId(prev => prev === playerId ? null : playerId);
      setSelectedSlotKey(null);
      setShowAllCandidates(false);
    }
  }
  function openPositionPicker(key) {
    setSelectedSlotKey(prev => prev === key ? null : key);
    setSelectedBenchId(null);
    setShowAllCandidates(false);
  }
  function pickSlotForBench(targetCellKey) {
    if (!selectedBenchId) return;
    moveToCell(selectedBenchId, targetCellKey);
    setSelectedBenchId(null);
    setShowAllCandidates(false);
  }
  function pickCandidate(playerId) {
    if (!selectedSlotKey) return;
    moveToCell(playerId, selectedSlotKey);
    setSelectedSlotKey(null);
    setShowAllCandidates(false);
  }

  function pitchPctFromEvent(e) {
    const rect = pitchRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const xPct = clamp(((e.clientX - rect.left) / rect.width) * 100, 0, 100);
    const yPct = clamp(((e.clientY - rect.top) / rect.height) * 100, 0, 100);
    const withinBounds = e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom;
    return { xPct, yPct, withinBounds };
  }
  function cellFromPct(xPct, yPct) {
    const row = clamp(Math.floor((xPct / 100) * GRID_ROWS), 0, GRID_ROWS - 1);
    const col = clamp(GRID_COLS - 1 - Math.floor((yPct / 100) * GRID_COLS), 0, GRID_COLS - 1);
    return { col, row };
  }
  function onTilePointerDown(e, playerId) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    dragState.current = { id: playerId, moved: false, startX: e.clientX, startY: e.clientY };
    setDragTileId(playerId);
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) {}
  }
  function onTilePointerMove(e) {
    if (!dragState.current.id) return;
    const dx = e.clientX - dragState.current.startX, dy = e.clientY - dragState.current.startY;
    if (!dragState.current.moved && Math.hypot(dx, dy) < 7) return;
    dragState.current.moved = true;
    const pct = pitchPctFromEvent(e);
    if (!pct) return;
    setDragPos(pct);
    if (pct.withinBounds) {
      const { col, row } = cellFromPct(pct.xPct, pct.yPct);
      setDragTargetCell(cellKey(col, row));
    } else {
      setDragTargetCell(null);
    }
  }
  function onTilePointerUp() {
    const { id, moved } = dragState.current;
    if (id && moved && dragTargetCell) {
      moveToCell(id, dragTargetCell);
    } else if (id && !moved) {
      const key = Object.entries(lineup).find(([, pid]) => pid === id)?.[0];
      if (key) openPositionPicker(key);
    }
    dragState.current = { id: null, moved: false, startX: 0, startY: 0 };
    setDragTileId(null);
    setDragPos(null);
    setDragTargetCell(null);
  }

  const assignedIds = new Set(Object.values(lineup).filter(Boolean));
  const starterRows = Object.entries(lineup).map(([key, id]) => {
    const [col, row] = key.split("-").map(Number);
    return { key, col, row, player: id ? squad.find(p => p.id === id) || null : null };
  }).sort((a, b) => (a.col - b.col) || (a.row - b.row));
  const filledStarterRows = starterRows.filter(r => r.player);
  const benchPlayers = squad.filter(p => !assignedIds.has(p.id));
  const rowProps = { selectedBenchId, onRowTap, onSelectPlayer };
  const selectedSlot = selectedSlotKey ? { col: Number(selectedSlotKey.split("-")[0]), row: Number(selectedSlotKey.split("-")[1]) } : null;
  const slotCandidates = selectedSlotKey ? squad
    .filter(p => lineup[selectedSlotKey] !== p.id)
    .map(p => ({ player: p, fit: effectivePositionFit(p, selectedSlot.col, selectedSlot.row) }))
    .sort((a, b) => (b.fit - a.fit) || (overallOf(b.player) - overallOf(a.player)))
    : [];
  const selectedBenchPlayer = selectedBenchId ? squad.find(p => p.id === selectedBenchId) : null;
  const benchSlotCandidates = selectedBenchPlayer ? starterRows
    .map(r => ({ ...r, fit: effectivePositionFit(selectedBenchPlayer, r.col, r.row) }))
    .sort((a, b) => (b.fit - a.fit) || ((b.player ? overallOf(b.player) : -1) - (a.player ? overallOf(a.player) : -1)))
    : [];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 10, alignItems: "start" }}>
      <div style={{ minWidth: 0 }}>
        <PaperCard style={{ padding: 0 }}>
          <div className="flex items-center justify-between px-2.5 pt-2.5 pb-1">
            <div className="text-xs uppercase tracking-wide font-semibold" style={{ color: C.inkSoft }}>Startelva ({filledStarterRows.length}/11)</div>
            <div className="flex rounded-lg overflow-hidden" style={{ border: `1px solid ${C.paperDim}` }}>
              <button onClick={() => onSetRowMode("detaljerad")} className="px-2 py-0.5 text-9 font-semibold" style={rowMode === "detaljerad" ? { background: C.turf, color: C.paper } : { background: "transparent", color: C.inkSoft }}>Detaljerad</button>
              <button onClick={() => onSetRowMode("kompakt")} className="px-2 py-0.5 text-9 font-semibold" style={rowMode === "kompakt" ? { background: C.turf, color: C.paper } : { background: "transparent", color: C.inkSoft }}>Kompakt</button>
            </div>
          </div>
          {rowMode === "detaljerad" && (
            <div className="flex items-center gap-2 px-2.5 pb-1 text-9 uppercase font-semibold" style={{ color: C.inkSoft }}>
              <span style={{ width: 14 + 8 + 24 + 8 }}></span><span className="flex-1">Namn</span><span style={{ width: 60, textAlign: "center" }}>Betyg</span>
              <span style={{ width: 40, textAlign: "center" }}>Pos</span><span style={{ width: 22, textAlign: "center" }}>Övr</span><span style={{ width: 18 }}></span>
            </div>
          )}
          {filledStarterRows.map(r => <LineupTablePlayerRow key={r.player.id} player={r.player} posCode={nearestPositionForCell(r.col, r.row)} cellCol={r.col} cellRow={r.row} compact={rowMode === "kompakt"} {...rowProps} />)}
        </PaperCard>
        <PaperCard style={{ padding: 0, marginTop: 10 }}>
          <div className="flex items-center justify-between px-2.5 pt-2.5 pb-1">
            <div className="text-xs uppercase tracking-wide font-semibold" style={{ color: C.inkSoft }}>Bänken ({benchPlayers.length})</div>
            {benchPlayers.length > 4 && (
              <button onClick={() => onSetShowAllBench(!showAllBench)} className="text-9 font-semibold px-2 py-0.5 rounded-lg" style={{ background: C.paperDim, color: C.inkSoft }}>{showAllBench ? "Visa färre ▲" : `Visa alla ▼`}</button>
            )}
          </div>
          {(showAllBench ? benchPlayers : benchPlayers.slice(0, 4)).map(p => <LineupTablePlayerRow key={p.id} player={p} compact={rowMode === "kompakt"} {...rowProps} />)}
        </PaperCard>
      </div>
      <PaperCard style={{ minWidth: 0 }}>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <div className="text-9 uppercase tracking-wide font-semibold truncate" style={{ color: C.inkSoft }}>Truppen <span className="font-mono" style={{ color: startingXI.length === 11 ? C.win : C.loss }}>({startingXI.length}/11)</span></div>
            <div className="mt-0.5 flex items-center gap-1"><StarRating rating={overallToStars(clubOverall)} size={6} showLabel={false} /><span className="font-mono text-9 font-bold" style={{ color: C.ink }}>{(clubOverall / 10).toFixed(1)}</span></div>
          </div>
          <div style={{ borderLeft: `1px dashed ${C.paperDim}`, paddingLeft: 8 }}>
            <div className="text-9 uppercase tracking-wide font-semibold truncate" style={{ color: C.inkSoft }}>Startelvan</div>
            <div className="mt-0.5 flex items-center gap-1">
              <StarRating rating={overallToStars(squadOverallRating(filledStarterRows.map(r => r.player)))} size={6} showLabel={false} />
              <span className="font-mono text-9 font-bold" style={{ color: C.ink }}>{(squadOverallRating(filledStarterRows.map(r => r.player)) / 10).toFixed(1)}</span>
            </div>
          </div>
        </div>
        {selectedSlotKey ? (
          <div className="flex items-center justify-between gap-2 mb-2 px-2.5 py-1.5 rounded-lg mt-2.5" style={{ background: C.gold, color: C.turfDeep }}>
            <span className="text-11 font-bold">📍 {nearestPositionForCell(selectedSlot.col, selectedSlot.row)} vald — välj vem som ska spela där nedan</span>
            <button onClick={() => setSelectedSlotKey(null)} className="text-9 font-bold px-2 py-1 rounded-md shrink-0" style={{ background: "rgba(19,34,29,0.15)" }}>Stäng</button>
          </div>
        ) : null}
        <div ref={pitchRef} style={{ position: "relative", width: "100%", aspectRatio: "5/8.5", margin: "10px auto 0", background: "linear-gradient(90deg,#1B5E45,#134C39)", borderRadius: 12, overflow: "hidden", border: "2px solid rgba(255,255,255,0.2)", touchAction: "none" }}>
          <PitchMarkings vertical />
          {dragTileId && dragTargetCell && (() => {
            const [tCol, tRow] = dragTargetCell.split("-").map(Number);
            const leftPct = (tRow + 0.5) / GRID_ROWS * 100, topPct = (GRID_COLS - 1 - tCol + 0.5) / GRID_COLS * 100;
            return <div style={{ position: "absolute", left: `${leftPct}%`, top: `${topPct}%`, width: 38, height: 38, marginLeft: -19, marginTop: -19, borderRadius: "50%", border: `2.5px solid ${C.gold}`, background: "rgba(217,169,75,0.25)", pointerEvents: "none", zIndex: 5 }} />;
          })()}
          {starterRows.map(r => {
            const { key, col, row, player } = r;
            const leftPct = (row + 0.5) / GRID_ROWS * 100, topPct = (GRID_COLS - 1 - col + 0.5) / GRID_COLS * 100;
            const isSlotSelected = selectedSlotKey === key;
            if (!player) return null;
            const fit = positionFit(player.specificPosition, col, row);
            const unavailable = player.injuryWeeks > 0 || player.suspendedMatches > 0 || player.internationalDuty;
            const fitColor = unavailable ? C.loss : fit >= 0.8 ? C.win : fit >= 0.55 ? C.gold : C.loss;
            const isDragging = dragTileId === player.id;
            const posStyle = (isDragging && dragPos)
              ? { position: "absolute", left: `${dragPos.xPct}%`, top: `${dragPos.yPct}%`, zIndex: 10 }
              : { position: "absolute", left: `${leftPct}%`, top: `${topPct}%`, zIndex: 2, transition: "left .25s ease, top .25s ease" };
            return (
              <div key={player.id}
                onPointerDown={e => onTilePointerDown(e, player.id)}
                onPointerMove={onTilePointerMove}
                onPointerUp={onTilePointerUp}
                onPointerCancel={onTilePointerUp}
                style={{ ...posStyle, transform: "translate(-50%, -50%)", display: "flex", flexDirection: "column", alignItems: "center", cursor: "pointer", touchAction: "none" }}>
                <div style={{ position: "relative", width: 26, height: 26 }}>
                  <div style={{ width: 26, height: 26, borderRadius: "50%", background: overallTier(overallOf(player)).color, border: `2.5px solid ${isSlotSelected ? C.gold : fitColor}`, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: unavailable ? `0 0 8px 1px ${C.loss}` : "0 2px 6px rgba(0,0,0,0.35)", animation: (isSlotSelected || unavailable) ? "selectPulse 1.1s ease-in-out infinite" : "none" }}>
                    <span className="font-display" style={{ fontSize: 8, color: overallTier(overallOf(player)).color === C.gold ? C.turfDeep : "#fff" }}>{nearestPositionForCell(col, row)}</span>
                  </div>
                  {isSlotSelected && <span style={{ position: "absolute", top: -5, right: -5, width: 12, height: 12, borderRadius: "50%", background: C.gold, color: C.turfDeep, fontSize: 8, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center", border: `1.5px solid ${C.turfDeep}` }}>📍</span>}
                  {unavailable && <span style={{ position: "absolute", top: -5, right: -5, width: 12, height: 12, borderRadius: "50%", background: C.loss, color: "#fff", fontSize: 8, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center", border: `1.5px solid ${C.turfDeep}` }}>!</span>}
                </div>
                <div className="font-semibold" style={{ fontSize: 6.5, color: "#fff", background: "rgba(0,0,0,0.55)", padding: "0 3px", borderRadius: 3, marginTop: 2, maxWidth: 62, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", lineHeight: "9px" }}>{player.name.split(" ").slice(-1)[0]}</div>
                {unavailable ? (
                  <div className="font-mono font-bold" style={{ fontSize: 6, marginTop: 1, color: "#fff", background: C.loss, borderRadius: 3, padding: "1px 3px", maxWidth: 62, textAlign: "center" }}>{player.injuryWeeks > 0 ? `Skadad ${player.injuryWeeks}` : player.suspendedMatches > 0 ? `Avstängd ${player.suspendedMatches}` : "Landslag"}</div>
                ) : (
                  <div className="font-mono font-bold" style={{ fontSize: 6.5, marginTop: 1, color: "#fff", background: "rgba(0,0,0,0.5)", borderRadius: 3, padding: "1px 3px" }}>⭐ {overallOf(player)}</div>
                )}
              </div>
            );
          })}
        </div>
        <div className="text-9 text-center mt-2" style={{ color: C.inkSoft }}>Tryck = bäst-passande-lista · Dra = flytta position</div>
      </PaperCard>
      {selectedSlotKey && (
        <>
          <div onClick={() => setSelectedSlotKey(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 40 }} />
          <div style={{ position: "fixed", top: 70, left: 110, width: 260, maxHeight: "72vh", overflowY: "auto", background: C.paper, color: C.ink, borderRadius: 16, boxShadow: "0 16px 40px rgba(0,0,0,0.5)", border: `2px solid ${C.gold}`, zIndex: 41, padding: 12 }}>
            <div className="flex items-center justify-between mb-2">
              <div className="text-10 uppercase tracking-wide font-bold" style={{ color: C.ink }}>Bäst passande för {nearestPositionForCell(selectedSlot.col, selectedSlot.row)}</div>
              <button onClick={() => setSelectedSlotKey(null)} className="shrink-0 ml-2" style={{ width: 22, height: 22, borderRadius: "50%", background: C.paperDim, color: C.ink, fontWeight: 900, fontSize: 12, lineHeight: "22px", textAlign: "center" }}>✕</button>
            </div>
            <div className="space-y-1.5">
              {(showAllCandidates ? slotCandidates : slotCandidates.slice(0, 5)).map(({ player, fit }) => {
                const unavailable = player.injuryWeeks > 0 || player.suspendedMatches > 0 || player.internationalDuty;
                const fitPct = Math.round(fit * 100);
                const fitColor = fitPct >= 80 ? C.win : fitPct >= 55 ? C.gold : C.loss;
                const overall = overallOf(player);
                const stamina = Math.round(player.stamina ?? 100);
                const staminaColor = stamina >= 60 ? C.win : stamina >= 35 ? C.gold : C.loss;
                const alreadyStarter = assignedIds.has(player.id);
                return (
                  <button key={player.id} onClick={() => pickCandidate(player.id)} className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-left" style={unavailable ? { background: "rgba(180,68,59,0.15)", border: `1px solid ${C.loss}` } : { background: C.paperDim, border: "1px solid transparent" }}>
                    <PlayerAvatar player={player} size={26} />
                    <div className="flex-1 min-w-0">
                      <div className="text-11 font-semibold truncate">{player.name}{alreadyStarter && <span className="text-9 font-semibold" style={{ color: C.gold }}> · I startelvan</span>}</div>
                      <div className="text-9 font-semibold" style={{ color: unavailable ? C.loss : C.inkSoft }}>{player.specificPosition}{unavailable ? (player.injuryWeeks > 0 ? ` · Skadad ${player.injuryWeeks}omg` : player.suspendedMatches > 0 ? ` · Avstängd ${player.suspendedMatches}omg` : " · Landslag") : ""}</div>
                      <div className="flex items-center gap-1 mt-0.5">
                        <StarRating rating={overallToStars(overall)} size={7} showLabel={false} />
                        <span className="font-mono text-9 font-bold" style={{ color: C.ink }}>{overall}</span>
                        <span className="font-mono text-9 font-semibold" style={{ color: staminaColor }}>· Ork {stamina}%</span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-mono text-11 font-bold" style={{ color: fitColor }}>{fitPct}%</div>
                      <div className="text-9" style={{ color: C.inkSoft }}>passform</div>
                    </div>
                  </button>
                );
              })}
            </div>
            {!showAllCandidates && slotCandidates.length > 5 && (
              <button onClick={() => setShowAllCandidates(true)} className="w-full mt-1.5 py-2 rounded-xl text-9 font-semibold" style={{ background: "transparent", border: `1px solid ${C.paperDim}`, color: C.inkSoft }}>Visa alla spelare ({slotCandidates.length})</button>
            )}
          </div>
        </>
      )}
      {selectedBenchId && selectedBenchPlayer && (
        <>
          <div onClick={() => setSelectedBenchId(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 40 }} />
          <div style={{ position: "fixed", top: 70, left: 110, width: 260, maxHeight: "72vh", overflowY: "auto", background: C.paper, color: C.ink, borderRadius: 16, boxShadow: "0 16px 40px rgba(0,0,0,0.5)", border: `2px solid ${C.gold}`, zIndex: 41, padding: 12 }}>
            <div className="flex items-center justify-between mb-2">
              <div className="text-10 uppercase tracking-wide font-bold" style={{ color: C.ink }}>Var passar {selectedBenchPlayer.name} bäst?</div>
              <button onClick={() => setSelectedBenchId(null)} className="shrink-0 ml-2" style={{ width: 22, height: 22, borderRadius: "50%", background: C.paperDim, color: C.ink, fontWeight: 900, fontSize: 12, lineHeight: "22px", textAlign: "center" }}>✕</button>
            </div>
            <div className="space-y-1.5">
              {(showAllCandidates ? benchSlotCandidates : benchSlotCandidates.slice(0, 5)).map(({ key, col, row, player, fit }) => {
                const fitPct = Math.round(fit * 100);
                const fitColor = fitPct >= 80 ? C.win : fitPct >= 55 ? C.gold : C.loss;
                const occupantUnavailable = player && (player.injuryWeeks > 0 || player.suspendedMatches > 0 || player.internationalDuty);
                return (
                  <button key={key} onClick={() => pickSlotForBench(key)} className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-left" style={occupantUnavailable ? { background: "rgba(180,68,59,0.15)", border: `1px solid ${C.loss}` } : { background: C.paperDim, border: "1px solid transparent" }}>
                    <PlayerAvatar player={player} size={26} />
                    <div className="flex-1 min-w-0">
                      <div className="text-11 font-semibold truncate">{nearestPositionForCell(col, row)}{player ? ` — ersätter ${player.name}` : " — ledig position"}</div>
                      <div className="text-9 font-semibold" style={{ color: occupantUnavailable ? C.loss : C.inkSoft }}>{player ? (occupantUnavailable ? (player.injuryWeeks > 0 ? `Skadad · ${player.injuryWeeks}omg` : player.suspendedMatches > 0 ? `Avstängd · ${player.suspendedMatches}omg` : "Landslagsuppdrag") : `Nuvarande overall: ${overallOf(player)}`) : "Ingen spelare där just nu"}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-mono text-11 font-bold" style={{ color: fitColor }}>{fitPct}%</div>
                      <div className="text-9" style={{ color: C.inkSoft }}>passform</div>
                    </div>
                  </button>
                );
              })}
            </div>
            {!showAllCandidates && benchSlotCandidates.length > 5 && (
              <button onClick={() => setShowAllCandidates(true)} className="w-full mt-1.5 py-2 rounded-xl text-9 font-semibold" style={{ background: "transparent", border: `1px solid ${C.paperDim}`, color: C.inkSoft }}>Visa alla positioner ({benchSlotCandidates.length})</button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
function ContractsView({ squad, onBack, onSelectPlayer }) {
  const [sortBy, setSortBy] = useState("contract");
  const [sortDir, setSortDir] = useState("asc");

  function toggleSort(key) {
    if (sortBy === key) { setSortDir(d => d === "asc" ? "desc" : "asc"); return; }
    setSortBy(key);
    setSortDir(key === "contract" ? "asc" : "desc");
  }

  const sorted = [...squad].sort((a, b) => {
    let av, bv;
    switch (sortBy) {
      case "position": av = POS_ORDER.indexOf(a.pos); bv = POS_ORDER.indexOf(b.pos); break;
      case "age": av = a.age; bv = b.age; break;
      case "contract": av = a.contractYears; bv = b.contractYears; break;
      case "wage": av = a.wage; bv = b.wage; break;
      default: av = a.value; bv = b.value;
    }
    return sortDir === "asc" ? av - bv : bv - av;
  });

  return (
    <div className="rise-in space-y-2.5">
      <button onClick={onBack} style={{ position: "fixed", bottom: 14, right: 14, display: "inline-block", color: "rgba(255,255,255,0.85)", background: "rgba(19,34,29,0.88)", padding: "6px 13px", borderRadius: 999, fontSize: 11, fontWeight: 600, zIndex: 50, backdropFilter: "blur(4px)", boxShadow: "0 2px 10px rgba(0,0,0,0.35)" }}>← Bakåt</button>
      <div>
        <div className="text-xs uppercase tracking-wide font-semibold mb-2 px-1" style={{ color: C.paperDim }}>Sortera efter</div>
        <div className="flex flex-wrap gap-2">
          {CONTRACT_SORT_OPTIONS.map(opt => {
            const active = sortBy === opt.key;
            return (
              <button key={opt.key} onClick={() => toggleSort(opt.key)} className="px-3 py-1.5 rounded-full text-11 font-semibold flex items-center gap-1"
                style={active ? { background: C.gold, color: C.turfDeep } : { background: "rgba(30,42,34,0.08)", color: C.ink }}>
                {opt.label}{active && <span>{sortDir === "asc" ? "↑" : "↓"}</span>}
              </button>
            );
          })}
        </div>
      </div>
      <PaperCard style={{ padding: 0 }}>
        <div style={{ display: "grid", gridTemplateColumns: "2.2fr 0.7fr 0.9fr 1.1fr 1.1fr" }} className="px-3 pt-3 pb-2 text-9 uppercase font-semibold">
          <span style={{ color: C.inkSoft }}>Spelare</span>
          <span className="text-center" style={{ color: sortBy === "age" ? C.gold : C.inkSoft }}>Ålder</span>
          <span className="text-center" style={{ color: sortBy === "contract" ? C.gold : C.inkSoft }}>Kontraktslängd</span>
          <span className="text-right" style={{ color: sortBy === "wage" ? C.gold : C.inkSoft }}>Kontraktsvärde</span>
          <span className="text-right" style={{ color: sortBy === "value" ? C.gold : C.inkSoft }}>Marknadsvärde</span>
        </div>
        {sorted.map(p => {
          const expiring = p.contractYears <= 1;
          return (
            <button key={p.id} onClick={() => onSelectPlayer(p.id)} className="w-full text-left player-row" style={{ borderTop: `1px solid rgba(30,42,34,0.08)`, display: "block" }}>
              <div style={{ display: "grid", gridTemplateColumns: "2.2fr 0.7fr 0.9fr 1.1fr 1.1fr" }} className="px-3 py-2.5 items-center text-sm font-mono">
                <span className="font-sans font-medium truncate min-w-0 flex items-center gap-1.5" style={{ color: C.ink }}><PlayerAvatar player={p} size={20} /><span><span style={{ color: C.inkSoft }}>#{p.number}</span> {p.name} <span className="text-9" style={{ color: C.inkSoft }}>{p.specificPosition}</span></span></span>
                <span className="text-center" style={{ color: C.inkSoft }}>{p.age}</span>
                <span className="text-center font-semibold" style={{ color: expiring ? C.loss : C.inkSoft }}>{p.contractYears} år</span>
                <span className="text-right" style={{ color: C.inkSoft }}>{formatMoney(p.wage)}/omg</span>
                <span className="text-right" style={{ color: C.inkSoft }}>{formatMoney(p.value)}</span>
              </div>
            </button>
          );
        })}
      </PaperCard>
      <div className="text-10 px-1" style={{ color: C.paperDim }}><span style={{ color: C.loss }}>■</span> Kontrakt med 1 år eller mindre kvar</div>
    </div>
  );
}


function TacticsPanel({ squad, startingXI, tactic, onTactic, tacticalSettings, onSetTactical, spelide, onSetSpelide, captainId, onSetCaptain, onBack }) {
  const [captainPickerOpen, setCaptainPickerOpen] = useState(false);
  const starters = squad.filter(p => startingXI.includes(p.id));
  const captain = squad.find(p => p.id === captainId);
  const captainScore = p => overallOf(p) + (p.personality === "Ledare" ? 15 : p.personality === "Lojal" ? 5 : p.personality === "Problemspelare" ? -10 : 0);
  const captainCandidates = starters.filter(p => p.id !== captainId).sort((a, b) => captainScore(b) - captainScore(a)).map(p => ({ player: p, statValue: captainScore(p) }));
  return (
    <div className="rise-in space-y-2.5">
      <button onClick={onBack} style={{ position: "fixed", bottom: 14, right: 14, display: "inline-block", color: "rgba(255,255,255,0.85)", background: "rgba(19,34,29,0.88)", padding: "6px 13px", borderRadius: 999, fontSize: 11, fontWeight: 600, zIndex: 50, backdropFilter: "blur(4px)", boxShadow: "0 2px 10px rgba(0,0,0,0.35)" }}>← Bakåt</button>
      <PaperCard>
        <div className="text-xs uppercase tracking-wide font-semibold mb-1.5" style={{ color: C.inkSoft }}>Taktik</div>
        <div className="grid grid-cols-3 gap-2">
          {[["anfall", "Anfall"], ["balanserad", "Balanserad"], ["forsvar", "Försvar"]].map(([key, label]) => (
            <button key={key} onClick={() => onTactic(key)} className="py-2 rounded-xl text-xs font-semibold border"
              style={tactic === key ? { background: C.turf, color: C.paper, borderColor: C.turf } : { background: "transparent", color: C.inkSoft, borderColor: C.paperDim }}>{label}</button>
          ))}
        </div>
        <div className="mt-3">
          <div className="text-xs uppercase tracking-wide font-semibold mb-1.5" style={{ color: C.inkSoft }}>Taktiska instruktioner</div>
          <div className="space-y-1.5">
            {TACTICAL_DIALS.map(dial => (
              <div key={dial.key}>
                <div className="text-10 mb-1 font-semibold" style={{ color: C.inkSoft }}>{dial.label}</div>
                <div className="grid grid-cols-3 gap-2">
                  {Object.entries(dial.options).map(([key, opt]) => (
                    <button key={key} onClick={() => onSetTactical(dial.key, key)} className="py-1.5 rounded-xl text-9 font-semibold border"
                      style={tacticalSettings?.[dial.key] === key ? { background: C.turf, color: C.paper, borderColor: C.turf } : { background: "transparent", color: C.inkSoft, borderColor: C.paperDim }}>{opt.label}</button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </PaperCard>
      <PaperCard>
        <div className="text-xs uppercase tracking-wide font-semibold mb-2" style={{ color: C.inkSoft }}>Spelidé</div>
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(SPELIDE_LABELS).map(([key, label]) => (
            <button key={key} onClick={() => onSetSpelide(key)} className="text-left p-2.5 rounded-xl border" style={spelide === key ? { background: C.turf, color: C.paper, borderColor: C.turf } : { background: "transparent", color: C.inkSoft, borderColor: C.paperDim }}>
              <div className="text-xs font-semibold">{label}</div>
            </button>
          ))}
        </div>
        <div className="text-11 mt-2" style={{ color: C.inkSoft }}>{SPELIDE_DESC[spelide]}</div>
      </PaperCard>
      <PaperCard>
        <div className="text-xs uppercase tracking-wide font-semibold mb-1" style={{ color: C.inkSoft }}>Kapten</div>
        <div className="text-11 mb-2" style={{ color: C.inkSoft }}>En kapten på plan ger laget en liten extra stadga. Välj bland startelvan.</div>
        {captain ? (
          <div className="flex items-center gap-2.5 p-2.5 rounded-xl" style={{ background: C.paperDim }}>
            <PlayerAvatar player={captain} size={30} />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold truncate">{captain.name}{captain.personality === "Ledare" ? " · Ledartyp" : ""}</div>
              <div className="text-9 font-semibold" style={{ color: C.gold }}>NUVARANDE KAPTEN</div>
            </div>
            <button onClick={() => setCaptainPickerOpen(true)} className="text-9 font-bold px-2.5 py-2 rounded-lg shrink-0" style={{ background: C.gold, color: C.turfDeep }}>Byt</button>
          </div>
        ) : (
          <button onClick={() => setCaptainPickerOpen(true)} className="w-full py-2.5 rounded-xl text-sm font-semibold" style={{ background: C.gold, color: C.turfDeep }}>Välj kapten</button>
        )}
        {captainPickerOpen && (
          <RankedPickerPopup
            title="Välj kapten"
            candidates={captainCandidates}
            statLabel="Poäng"
            onClose={() => setCaptainPickerOpen(false)}
            onPick={id => { onSetCaptain(id); setCaptainPickerOpen(false); }}
          />
        )}
      </PaperCard>
    </div>
  );
}
function SquadTab({ squad, startingXI, onToggleStarter, confirmSell, setConfirmSell, onSell, onToggleListed, onToggleLoanListed, onRenew, formationCode, lineupCells, onSaveFormation, onChat, clubs, round, onSendLoan, outgoingLoans, setPieceTakers, onSetSetPieceTakers, chemistryPairs, onAssessPlayer, tactic, onTactic, tacticalSettings, onSetTactical, spelide, onSetSpelide, captainId, onSetCaptain, dev, budget, akademiParts, youthSquad, onUpgrade, onUpgradePart, onSellYouth, onPromoteYouth, onSubViewChange, pendingSelectedPlayerId, onClearPendingSelection, reputation, squadViewPrefs, onSetSquadViewPrefs, transferHistory, userClubId, onHintForSale, onStartTraining, onCancelTraining, manager, onPitchVision }) {
  const [selectedId, setSelectedId] = useState(null);
  const [showContracts, setShowContracts] = useState(false);
  const [showSetPieces, setShowSetPieces] = useState(false);
  const [showTactics, setShowTactics] = useState(false);
  const [showAkademi, setShowAkademi] = useState(false);
  useEffect(() => {
    if (pendingSelectedPlayerId) { setSelectedId(pendingSelectedPlayerId); onClearPendingSelection?.(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingSelectedPlayerId]);
  useEffect(() => { onSubViewChange?.(!!selectedId || showContracts || showSetPieces || showTactics || showAkademi); }, [selectedId, showContracts, showSetPieces, showTactics, showAkademi]);

  if (showTactics) {
    return <TacticsPanel squad={squad} startingXI={startingXI} tactic={tactic} onTactic={onTactic} tacticalSettings={tacticalSettings} onSetTactical={onSetTactical}
      spelide={spelide} onSetSpelide={onSetSpelide} captainId={captainId} onSetCaptain={onSetCaptain} onBack={() => setShowTactics(false)} />;
  }

  if (showAkademi) {
    return <AkademiDetail dev={dev} budget={budget} akademiParts={akademiParts} youthSquad={youthSquad} onUpgrade={onUpgrade} onUpgradePart={onUpgradePart} onSellYouth={onSellYouth} onPromoteYouth={onPromoteYouth} onBack={() => setShowAkademi(false)} />;
  }

  if (showContracts) {
    return <ContractsView squad={squad} onBack={() => setShowContracts(false)} onSelectPlayer={id => { setShowContracts(false); setSelectedId(id); }} />;
  }

  if (showSetPieces) {
    return <SetPieceTakersPanel squad={squad} startingXI={startingXI} setPieceTakers={setPieceTakers} onSave={next => { onSetSetPieceTakers(next); setShowSetPieces(false); }} onBack={() => setShowSetPieces(false)} onSelectPlayer={id => { setShowSetPieces(false); setSelectedId(id); }} />;
  }

  if (selectedId) {
    const p = squad.find(x => x.id === selectedId);
    if (!p) { setSelectedId(null); return null; }
    return <PlayerProfile player={p} isStarter={startingXI.includes(p.id)} onToggleStarter={() => onToggleStarter(p.id)}
      onBack={() => setSelectedId(null)} confirmSell={confirmSell} setConfirmSell={setConfirmSell} onSell={p2 => { onSell(p2); setSelectedId(null); }} onToggleListed={onToggleListed} onToggleLoanListed={onToggleLoanListed} onRenew={onRenew} onChat={onChat}
      clubs={clubs} round={round} onSendLoan={onSendLoan ? (toId, toName) => { onSendLoan(toId, toName); setSelectedId(null); } : null} squadSize={squad.length} squad={squad} chemistryPairs={chemistryPairs} onAssessPlayer={onAssessPlayer} reputation={reputation} budget={budget} transferHistory={transferHistory} userClubId={userClubId} onHintForSale={onHintForSale} onStartTraining={onStartTraining} onCancelTraining={onCancelTraining} manager={manager} onPitchVision={onPitchVision} />;
  }

  const clubOverall = squadOverallRating(squad);
  return (
    <div className="rise-in space-y-2.5">
      <div className="grid grid-cols-4 gap-1.5">
        <button onClick={() => setShowContracts(true)} className="py-1 rounded-lg text-9 font-semibold" style={{ background: "transparent", border: `1px solid ${C.paperDim}`, color: C.paperDim, position: "relative" }}>
          Kontrakt
          {squad.filter(p => p.contractYears <= 1).length > 0 && <span style={{ position: "absolute", top: -4, right: -4, width: 9, height: 9, borderRadius: "50%", background: "#D9534F", border: `1.5px solid ${C.turfDeep}` }} />}
        </button>
        <button onClick={() => setShowTactics(true)} className="py-1 rounded-lg text-9 font-semibold" style={{ background: C.gold, color: C.turfDeep }}>Taktik</button>
        <button onClick={() => setShowAkademi(true)} className="py-1 rounded-lg text-9 font-semibold" style={{ background: "transparent", border: `1px solid ${C.paperDim}`, color: C.paperDim }}>Akademi</button>
        <button onClick={() => setShowSetPieces(true)} className="py-1 rounded-lg text-9 font-semibold" style={{ background: "transparent", border: `1px solid ${C.paperDim}`, color: C.paperDim }}>Standard</button>
      </div>
      {outgoingLoans && outgoingLoans.length > 0 && (
        <PaperCard>
          <div className="text-xs uppercase tracking-wide font-semibold mb-2" style={{ color: C.inkSoft }}>Utlånade spelare</div>
          <div className="space-y-1.5">
            {outgoingLoans.map(l => (
              <div key={l.player.id} className="flex items-center justify-between text-sm">
                <span>{l.player.name}</span>
                <span className="text-11" style={{ color: C.inkSoft }}>Lån hos {l.toClubName} · resten av säsongen</span>
              </div>
            ))}
          </div>
        </PaperCard>
      )}
      <LineupTableView squad={squad} startingXI={startingXI} formationCode={formationCode} lineupCells={lineupCells} onSaveFormation={onSaveFormation} onSelectPlayer={setSelectedId}
        rowMode={squadViewPrefs?.rowMode || "detaljerad"} onSetRowMode={m => onSetSquadViewPrefs({ ...squadViewPrefs, rowMode: m })}
        showAllBench={!!squadViewPrefs?.showAllBench} onSetShowAllBench={v => onSetSquadViewPrefs({ ...squadViewPrefs, showAllBench: v })}
        clubOverall={clubOverall} squadSize={squad.length} />
    </div>
  );
}

function PlayerProfile({ player, isStarter, onToggleStarter, onBack, confirmSell, setConfirmSell, onSell, onToggleListed, onToggleLoanListed, onRenew, onChat, clubs, round, onSendLoan, squadSize, squad, chemistryPairs, onAssessPlayer, reputation, budget, transferHistory, userClubId, onHintForSale, onStartTraining, onCancelTraining, manager, onPitchVision }) {
  const attrs = getAttrs(player);
  const labels = attrLabels(player.pos);
  const overall = overallOf(player);
  const tier = overallTier(overall);
  const avgRating = player.apps ? (player.ratingSum / player.apps).toFixed(1) : "–";
  const recentRatingsList = player.recentRatings || [];
  const recentAvgRating = recentRatingsList.length ? (recentRatingsList.reduce((s, r) => s + r, 0) / recentRatingsList.length).toFixed(1) : "–";
  const seasonLog = player.seasonLog || [];
  const careerApps = seasonLog.reduce((s, r) => s + (r.apps || 0), 0) + (player.apps || 0);
  const careerGoals = seasonLog.reduce((s, r) => s + (r.goals || 0), 0) + (player.goals || 0);
  const careerAssists = seasonLog.reduce((s, r) => s + (r.assists || 0), 0) + (player.assists || 0);
  const milestones = [];
  if (careerGoals >= 50) milestones.push("50+ mål för klubben");
  else if (careerGoals >= 25) milestones.push("25+ mål för klubben");
  if (careerApps >= 100) milestones.push("100+ matcher för klubben");
  if (seasonLog.some(r => r.avgRating && r.avgRating >= 7.5)) milestones.push("Toppsäsong (snitt 7.5+)");
  if (seasonLog.length >= 5 && seasonLog.every(r => r.apps > 0)) milestones.push("Järnman — spelat varje säsong");
  const otherPositions = Object.keys(SPECIFIC_POSITION_LOOKUP).filter(code => {
    const anchor = SPECIFIC_POSITION_LOOKUP[code];
    return code !== player.specificPosition && positionFit(player.specificPosition, anchor.col, anchor.row) >= 0.7;
  });
  const attackTrend = [...seasonLog.map(r => r.attack), player.attack].filter(v => v !== undefined);
  const defenseTrend = [...seasonLog.map(r => r.defense), player.defense].filter(v => v !== undefined);
  const injured = player.injuryWeeks > 0;
  const suspended = player.suspendedMatches > 0;
  const demand = contractDemand(player);
  const target = wageDemand(player, reputation, budget);
  const best = bestAttribute(player);
  const [wageOutcome, setWageOutcome] = useState(null);
  const [chatResult, setChatResult] = useState(null);
  const [includeClause, setIncludeClause] = useState(false);
  const [showLoanPicker, setShowLoanPicker] = useState(false);
  const loanCandidates = useMemo(() => {
    if (!clubs) return [];
    const others = Object.values(clubs).filter(c => Math.abs(c.strength - overall) < 22);
    const pool = others.length >= 3 ? others : Object.values(clubs);
    const picked = [];
    for (let i = 0; i < 3 && pool.length; i++) picked.push(pool[Math.floor(Math.random() * pool.length)]);
    return picked;
  }, [showLoanPicker]);
  function tryRenewWage(mult) {
    const offerWage = Math.round(target * mult);
    const breakoutRoll = seededRandom(String(player.id) + "breakoutrefuse" + player.contractYears)();
    if (isBreakoutStar(player, reputation) && breakoutRoll < 0.4) {
      setWageOutcome({ result: "breakout_refuse", offerWage });
      return;
    }
    const result = negotiateWage(offerWage, target, 50);
    setWageOutcome({ ...result, offerWage });
  }
  function doChat(approach) {
    const delta = onChat(player.id, approach);
    setChatResult({ approach, delta });
  }
  const moraleLabel = player.morale >= 75 ? "Nöjd" : player.morale >= 45 ? "Neutral" : player.morale >= 25 ? "Missnöjd" : "Vill lämna klubben";
  const moraleColor = player.morale >= 75 ? C.win : player.morale >= 45 ? C.gold : C.loss;
  const [profileTab, setProfileTab] = useState("oversikt");
  return (
    <div className="rise-in space-y-2.5">
      <button onClick={onBack} style={{ position: "fixed", bottom: 14, right: 14, display: "inline-block", color: "rgba(255,255,255,0.85)", background: "rgba(19,34,29,0.88)", padding: "6px 13px", borderRadius: 999, fontSize: 11, fontWeight: 600, zIndex: 50, backdropFilter: "blur(4px)", boxShadow: "0 2px 10px rgba(0,0,0,0.35)" }}>← Bakåt</button>
      <div className="grid grid-cols-3 gap-2">
        {[["oversikt", "Översikt"], ["scoutrapport", "Scoutrapport"], ["historia", "Historia"]].map(([key, label]) => (
          <button key={key} onClick={() => setProfileTab(key)} className="py-2 rounded-xl text-11 font-semibold border"
            style={profileTab === key ? { background: C.turf, color: C.paper, borderColor: C.turf } : { background: "transparent", color: C.inkSoft, borderColor: C.paperDim }}>{label}</button>
        ))}
      </div>
      <PaperCard>
        <div className="flex items-center gap-3">
          <div style={{ position: "relative", width: 60, height: 60, flexShrink: 0 }}>
            <PlayerAvatar player={player} size={60} />
            <div style={{ position: "absolute", bottom: -4, right: -4 }}><OverallBadge overall={overall} size={26} /></div>
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-display text-xl truncate">{player.name}</div>
            <div className="text-11" style={{ color: C.inkSoft }}>{POS_LABEL[player.pos]} ({specificPositionLabel(player.specificPosition)}) · {nationalityLabel(player.nationality)} · {player.age} år · <span style={{ color: tier.color === C.gold ? "#B8862E" : tier.color }}>{tier.label}</span></div>
            <div className="text-11 mt-0.5" style={{ color: C.inkSoft }}>Lön: <span className="font-semibold" style={{ color: C.ink }}>{formatMoney(player.wage)}/omg</span> · Värde: <span className="font-semibold" style={{ color: C.ink }}>{formatMoney(player.value)}</span></div>
            {otherPositions.length > 0 && (
              <div className="flex flex-wrap items-center gap-1 mt-0.5">
                <span className="text-9" style={{ color: C.inkSoft }}>Kan även spela:</span>
                {otherPositions.map(code => <span key={code} className="text-9 font-mono px-1.5 py-0.5 rounded" style={{ background: C.paperDim, color: C.ink }}>{code}</span>)}
              </div>
            )}
            <div className="text-11 mt-0.5" style={{ color: C.gold }}>Bästa egenskap: {best.label} ({best.value})</div>
            {player.personality && player.personality !== "Balanserad" && (
              <div className="text-11 mt-0.5" style={{ color: C.inkSoft }}><span className="font-semibold" style={{ color: C.ink }}>{player.personality}</span> — {PERSONALITY_DESC[player.personality]}</div>
            )}
            <div className="mt-1.5"><StarRating rating={overallToStars(overall)} size={11} /></div>
          </div>
        </div>
        {injured && <div className="mt-2 text-11 font-semibold px-2.5 py-1.5 rounded-lg text-center" style={{ background: "rgba(180,68,59,0.15)", color: C.loss }}>Skadad — {player.injuryWeeks} omgångar kvar</div>}
        {suspended && <div className="mt-2 text-11 font-semibold px-2.5 py-1.5 rounded-lg text-center" style={{ background: "rgba(180,68,59,0.15)", color: C.loss }}>Avstängd — {player.suspendedMatches} omgångar kvar</div>}
        {player.internationalDuty && <div className="mt-2 text-11 font-semibold px-2.5 py-1.5 rounded-lg text-center" style={{ background: "rgba(180,68,59,0.15)", color: C.loss }}>Landslagsuppdrag — missar nästa match</div>}
      </PaperCard>

      {profileTab === "oversikt" && (
        <>
        {(() => {
          const interested = computeInterestedClubs(player, clubs, userClubId, round);
          const recentlyHinted = player.hintedSaleRound != null && (round - player.hintedSaleRound) <= 10;
          if (!interested.length && !recentlyHinted) return null;
          return (
            <PaperCard>
              <div className="text-xs uppercase tracking-wide font-semibold mb-1" style={{ color: C.inkSoft }}>Marknadsintresse</div>
              {interested.length > 0 ? (
                <div className="text-11" style={{ color: C.inkSoft }}>
                  <span className="font-semibold" style={{ color: C.ink }}>{interested.length} {interested.length === 1 ? "klubb bevakar" : "klubbar bevakar"}</span> {player.name.split(" ")[0]} just nu: {interested.map(c => c.name).join(", ")}.
                </div>
              ) : (
                <div className="text-11" style={{ color: C.inkSoft }}>Inget känt marknadsintresse just nu.</div>
              )}
              {recentlyHinted && <div className="text-11 mt-1.5 font-semibold" style={{ color: C.gold }}>Ni har antytt intresse av att sälja — ökad chans för bud den närmaste tiden.</div>}
              {onHintForSale && !player.transferListed && (
                <button onClick={() => onHintForSale(player.id)} disabled={recentlyHinted} className="w-full mt-2 py-2 rounded-xl text-sm font-semibold" style={recentlyHinted ? { background: "rgba(30,42,34,0.06)", color: C.inkSoft } : { background: "transparent", border: `1px solid ${C.gold}`, color: "#B8862E" }}>
                  {recentlyHinted ? "Redan antytt nyligen" : "Antyd diskret att spelaren kan säljas"}
                </button>
              )}
            </PaperCard>
          );
        })()}
        {(() => {
          const eligible = eligibleTrainingPositions(player);
          const active = player.trainingTarget;
          if (!active && !eligible.length) return null;
          return (
            <PaperCard>
              <div className="text-xs uppercase tracking-wide font-semibold mb-1" style={{ color: C.inkSoft }}>Positionsträning</div>
              {active ? (
                <>
                  <div className="text-sm font-semibold">Tränar mot {active.position}</div>
                  <div className="text-11 mt-0.5" style={{ color: C.inkSoft }}>Passform-bonus hittills: +{Math.round((player.trainedPositions?.[active.position] || 0) * 100)}% · {round - active.startedRound} omgångar in</div>
                  <div style={{ height: 6, borderRadius: 3, background: "rgba(30,42,34,0.08)", overflow: "hidden", marginTop: 6 }}>
                    <div style={{ height: "100%", width: `${clamp(((player.trainedPositions?.[active.position] || 0) / 0.35) * 100, 2, 100)}%`, background: C.gold }} />
                  </div>
                  <button onClick={() => onCancelTraining(player.id)} className="w-full mt-2.5 py-2 rounded-xl text-sm font-semibold" style={{ background: "transparent", border: `1px solid ${C.paperDim}`, color: C.inkSoft }}>Avbryt träning</button>
                </>
              ) : (
                <>
                  <div className="text-11 mb-2" style={{ color: C.inkSoft }}>Träna spelaren för att öka passform och relevanta egenskaper — antingen genom att perfektionera en position de redan behärskar väl, eller lära in en helt ny.</div>
                  <div className="flex flex-wrap gap-1.5">
                    {eligible
                      .map(code => { const anchor = SPECIFIC_POSITION_LOOKUP[code]; return { code, fit: effectivePositionFit(player, anchor.col, anchor.row) }; })
                      .sort((a, b) => b.fit - a.fit)
                      .map(({ code, fit }) => {
                        const isPolish = fit >= 0.68;
                        return <button key={code} onClick={() => onStartTraining(player.id, code)} className="text-9 font-semibold px-2.5 py-1.5 rounded-lg" style={isPolish ? { background: "rgba(201,154,62,0.18)", border: `1px solid ${C.gold}`, color: "#B8862E" } : { background: "transparent", border: `1px solid ${C.gold}`, color: "#B8862E" }}>{code} ({Math.round(fit * 100)}%)</button>;
                      })}
                  </div>
                </>
              )}
            </PaperCard>
          );
        })()}
        <PaperCard>
        <div className="grid grid-cols-5 gap-1.5 text-center">
          <div><div className="font-display text-lg">{careerApps}</div><div className="text-9 uppercase" style={{ color: C.inkSoft }}>Matcher</div></div>
          <div><div className="font-display text-lg">{careerGoals}</div><div className="text-9 uppercase" style={{ color: C.inkSoft }}>Mål</div></div>
          <div><div className="font-display text-lg">{careerAssists}</div><div className="text-9 uppercase" style={{ color: C.inkSoft }}>Assist</div></div>
          <div><div className="font-display text-lg">{recentAvgRating}</div><div className="text-9 uppercase" style={{ color: C.inkSoft }}>Snitt (5)</div></div>
          <div><div className="font-display text-lg">{avgRating}</div><div className="text-9 uppercase" style={{ color: C.inkSoft }}>Snitt (säsong)</div></div>
        </div>
        <div className="mt-3 flex items-center justify-between text-11" style={{ color: C.inkSoft }}>
          <span>Gula kort denna säsong: {player.yellowCards}/5</span>
        </div>
        {milestones.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {milestones.map((m, i) => <span key={i} className="text-9 font-semibold px-2 py-1 rounded-full" style={{ background: "rgba(201,154,62,0.18)", color: C.gold }}>{m}</span>)}
          </div>
        )}
        <div className="text-9 uppercase tracking-wide font-semibold mt-3 mb-1.5" style={{ color: C.inkSoft }}>Egenskaper</div>
        <div className="grid grid-cols-3 gap-1.5">
          {Object.entries(labels).map(([key, label]) => <AttributeGridCard key={key} attrKey={key} label={label} value={attrs[key]} />)}
        </div>
        <div className="text-9 uppercase tracking-wide font-semibold mt-3 mb-1.5" style={{ color: C.inkSoft }}>Ytterligare egenskaper</div>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg p-1.5" style={{ background: "#fff", border: "1px solid rgba(30,42,34,0.08)" }}>
            <div className="flex items-center justify-between">
              <span className="w-4 h-4 rounded-full flex items-center justify-center text-9 shrink-0" style={{ background: "rgba(201,154,62,0.13)" }}>🦶</span>
              <div className="flex gap-0.5">{[1, 2, 3, 4, 5].map(n => <Star key={n} size={9} fill={n <= weakFoot(player) ? C.gold : "none"} color={n <= weakFoot(player) ? C.gold : C.paperDim} />)}</div>
            </div>
            <div className="text-9 font-semibold truncate mt-0.5" style={{ color: C.ink }}>Svag fot</div>
          </div>
          <div className="rounded-lg p-1.5" style={{ background: "#fff", border: "1px solid rgba(30,42,34,0.08)" }}>
            <div className="flex items-center justify-between">
              <span className="w-4 h-4 rounded-full flex items-center justify-center text-9 shrink-0" style={{ background: `${attrQualityColor(headingAbility(player))}22` }}>🎯</span>
              <span className="font-mono text-11 font-bold" style={{ color: C.ink }}>{headingAbility(player)}</span>
            </div>
            <div className="text-9 font-semibold truncate mt-0.5" style={{ color: C.ink }}>Huvudspel</div>
          </div>
          <div className="rounded-lg p-1.5" style={{ background: "#fff", border: "1px solid rgba(30,42,34,0.08)" }}>
            <div className="flex items-center justify-between">
              <span className="w-4 h-4 rounded-full flex items-center justify-center text-9 shrink-0" style={{ background: injuryProneness(player) === "Skör" ? "rgba(180,68,59,0.15)" : injuryProneness(player) === "Robust" ? "rgba(63,143,107,0.15)" : "rgba(92,107,96,0.12)" }}>🩹</span>
            </div>
            <div className="text-9 font-semibold truncate mt-0.5" style={{ color: C.ink }}>Skaderisk</div>
            <div className="text-10 font-bold mt-0.5" style={{ color: injuryProneness(player) === "Skör" ? C.loss : injuryProneness(player) === "Robust" ? C.win : C.inkSoft }}>{injuryProneness(player)}</div>
          </div>
          <div className="rounded-lg p-1.5" style={{ background: "#fff", border: "1px solid rgba(30,42,34,0.08)" }}>
            <div className="flex items-center justify-between">
              <span className="w-4 h-4 rounded-full flex items-center justify-center text-9 shrink-0" style={{ background: clutchFactor(player) >= 0.6 ? "rgba(63,143,107,0.15)" : clutchFactor(player) <= -0.6 ? "rgba(180,68,59,0.15)" : "rgba(92,107,96,0.12)" }}>🔥</span>
            </div>
            <div className="text-9 font-semibold truncate mt-0.5" style={{ color: C.ink }}>Storform</div>
            <div className="text-10 font-bold mt-0.5" style={{ color: clutchFactor(player) >= 0.6 ? C.win : clutchFactor(player) <= -0.6 ? C.loss : C.inkSoft }}>{clutchLabel(clutchFactor(player))}</div>
          </div>
          <div className="rounded-lg p-1.5" style={{ background: "#fff", border: "1px solid rgba(30,42,34,0.08)" }}>
            <div className="flex items-center justify-between">
              <span className="w-4 h-4 rounded-full flex items-center justify-center text-9 shrink-0" style={{ background: `${attrQualityColor(endurance(player))}22` }}>🔋</span>
              <span className="font-mono text-11 font-bold" style={{ color: C.ink }}>{endurance(player)}</span>
            </div>
            <div className="text-9 font-semibold truncate mt-0.5" style={{ color: C.ink }}>Uthållighet</div>
          </div>
          <div className="rounded-lg p-1.5" style={{ background: "#fff", border: "1px solid rgba(30,42,34,0.08)" }}>
            <div className="flex items-center justify-between">
              <span className="w-4 h-4 rounded-full flex items-center justify-center text-9 shrink-0" style={{ background: `${attrQualityColor(determination(player))}22` }}>🎓</span>
              <span className="font-mono text-11 font-bold" style={{ color: C.ink }}>{determination(player)}</span>
            </div>
            <div className="text-9 font-semibold truncate mt-0.5" style={{ color: C.ink }}>Beslutsamhet</div>
          </div>
        </div>
        </PaperCard>
        </>
      )}

      {profileTab === "historia" && (
        <>
          {(() => {
            const moves = (transferHistory || []).filter(t => t.playerId === player.id).sort((a, b) => (b.season - a.season) || (b.round - a.round));
            if (!moves.length) return null;
            return (
              <PaperCard style={{ padding: 0 }}>
                <div className="px-3 pt-3 pb-2 text-xs uppercase tracking-wide font-semibold" style={{ color: C.inkSoft }}>Övergångshistorik</div>
                {moves.map((t, i) => (
                  <div key={t.id} className="flex items-center gap-2.5 px-3 py-2" style={{ borderTop: i === 0 ? "none" : "1px solid rgba(30,42,34,0.08)" }}>
                    <div className="flex-1 min-w-0 text-11" style={{ color: C.inkSoft }}>
                      <ClubJersey club={{ id: t.fromClubId, color: t.fromColor }} size={16} /> {t.fromClubName} → <ClubJersey club={{ id: t.toClubId, color: t.toColor }} size={16} /> {t.toClubName || "Okänd köpare"}
                      <div className="text-9 mt-0.5">Säsong {t.season}</div>
                    </div>
                    <div className="font-mono text-sm font-bold shrink-0">{formatMoney(t.fee)}</div>
                  </div>
                ))}
              </PaperCard>
            );
          })()}
          {player.joinedInfo && (
            <PaperCard>
              <div className="text-xs uppercase tracking-wide font-semibold mb-1" style={{ color: C.inkSoft }}>Klubbhistorik</div>
              <div className="text-11" style={{ color: C.inkSoft }}>{player.joinedInfo.text}</div>
            </PaperCard>
          )}
          {attackTrend.length > 1 && (
            <PaperCard>
              <div className="text-xs uppercase tracking-wide font-semibold mb-1" style={{ color: C.inkSoft }}>Utveckling — anfall / försvar</div>
              <div className="flex gap-4">
                <Sparkline data={attackTrend} width={140} height={32} color={C.gold} />
                <Sparkline data={defenseTrend} width={140} height={32} color={C.turf} />
              </div>
            </PaperCard>
          )}
          {(() => {
            const valueTrend = [...seasonLog.map(r => r.value).filter(v => v !== undefined), player.value];
            const wageTrend = [...seasonLog.map(r => r.wage).filter(v => v !== undefined), player.wage];
            if (valueTrend.length < 2) return null;
            return (
              <PaperCard>
                <div className="text-xs uppercase tracking-wide font-semibold mb-1" style={{ color: C.inkSoft }}>Utveckling — marknadsvärde / lön</div>
                <div className="flex gap-4">
                  <div>
                    <Sparkline data={valueTrend} width={140} height={32} color={C.gold} />
                    <div className="text-9 mt-0.5" style={{ color: C.inkSoft }}>Värde: {formatMoney(valueTrend[0])} → {formatMoney(valueTrend[valueTrend.length - 1])}</div>
                  </div>
                  <div>
                    <Sparkline data={wageTrend} width={140} height={32} color={C.turf} />
                    <div className="text-9 mt-0.5" style={{ color: C.inkSoft }}>Lön: {formatMoney(wageTrend[0])} → {formatMoney(wageTrend[wageTrend.length - 1])}</div>
                  </div>
                </div>
              </PaperCard>
            );
          })()}
          {player.seasonLog && player.seasonLog.length > 0 && (
            <PaperCard style={{ padding: 0 }}>
              <div className="px-3 pt-3 pb-2 text-xs uppercase tracking-wide font-semibold" style={{ color: C.inkSoft }}>Säsong för säsong</div>
              <div style={{ display: "grid", gridTemplateColumns: "0.8fr 0.8fr 0.8fr 0.8fr 1fr" }} className="px-3 pb-1.5 text-9 uppercase font-semibold">
                <span style={{ color: C.inkSoft }}>Säsong</span>
                <span className="text-center" style={{ color: C.inkSoft }}>M</span>
                <span className="text-center" style={{ color: C.inkSoft }}>Mål</span>
                <span className="text-center" style={{ color: C.inkSoft }}>Ass</span>
                <span className="text-right" style={{ color: C.inkSoft }}>Snitt</span>
              </div>
              {[...player.seasonLog].reverse().map((s, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "0.8fr 0.8fr 0.8fr 0.8fr 1fr", borderTop: "1px solid rgba(30,42,34,0.08)" }} className="px-3 py-1.5 text-sm font-mono">
                  <span>S{s.season}</span>
                  <span className="text-center">{s.apps}</span>
                  <span className="text-center">{s.goals}</span>
                  <span className="text-center">{s.assists}</span>
                  <span className="text-right">{s.avgRating ?? "–"}</span>
                </div>
              ))}
            </PaperCard>
          )}
          {milestones.length === 0 && (!player.seasonLog || !player.seasonLog.length) && (
            <PaperCard><div className="text-sm text-center py-3" style={{ color: C.inkSoft }}>Ingen historik ännu — kommer byggas upp allteftersom säsonger spelas.</div></PaperCard>
          )}
        </>
      )}

      {profileTab === "scoutrapport" && (
        <>
          {(player.scoutReports && player.scoutReports.length > 0) ? (
            [...player.scoutReports].reverse().map((r, i) => (
              <PaperCard key={i}>
                <div className="flex items-center justify-between mb-1">
                  <div className="text-xs uppercase tracking-wide font-semibold" style={{ color: C.inkSoft }}>{r.source === "scout" ? "Scoutrapport" : "Ass. tränarens omdöme"}</div>
                  <div className="text-10" style={{ color: C.inkSoft }}>Säsong {r.season}</div>
                </div>
                <div className="text-11" style={{ color: C.ink }}>{r.comment}</div>
              </PaperCard>
            ))
          ) : (
            <PaperCard>
              <div className="text-xs uppercase tracking-wide font-semibold mb-1" style={{ color: C.inkSoft }}>Ass. tränarens omdöme</div>
              <div className="text-11" style={{ color: C.ink }}>{scoutComment(player)}</div>
              <div className="text-10 mt-1.5" style={{ color: C.inkSoft }}>Ingen formell scoutrapport har gjorts på {player.name.split(" ")[0]} — det här är en snabb bedömning från assisterande tränaren istället.</div>
            </PaperCard>
          )}
          {onAssessPlayer && (
            <button onClick={() => onAssessPlayer(player.id)} className="w-full py-2.5 rounded-xl text-sm font-semibold" style={{ background: "transparent", border: `1px solid ${C.inkSoft}`, color: C.inkSoft }}>Be assisterande tränaren om ett nytt omdöme</button>
          )}
        </>
      )}

      {profileTab === "oversikt" && (
      <>
      <PaperCard>
        <div className="flex items-center justify-between mb-1">
          <div className="text-xs uppercase tracking-wide font-semibold" style={{ color: C.inkSoft }}>Ork</div>
          <span className="text-11 font-semibold" style={{ color: (player.stamina ?? 100) >= 60 ? C.win : (player.stamina ?? 100) >= 35 ? C.gold : C.loss }}>
            {(player.stamina ?? 100) >= 75 ? "Pigg" : (player.stamina ?? 100) >= 45 ? "Måttligt trött" : "Utsliten"}
          </span>
        </div>
        <StatBar label="" value={player.stamina ?? 100} color={(player.stamina ?? 100) >= 60 ? C.win : (player.stamina ?? 100) >= 35 ? C.gold : C.loss} />
        {(player.stamina ?? 100) < 45 && <div className="text-10 mt-1.5" style={{ color: C.loss }}>Låg ork ger sämre matchprestation och högre skaderisk.</div>}
      </PaperCard>

      {(() => {
        if (!squad || !chemistryPairs) return null;
        const partners = squad.filter(t => t.id !== player.id).map(t => ({ t, games: chemistryPairs[[player.id, t.id].sort().join("|")] || 0 })).filter(x => x.games > 0).sort((a, b) => b.games - a.games);
        if (!partners.length) return null;
        const best = partners[0];
        return (
          <PaperCard>
            <div className="text-xs uppercase tracking-wide font-semibold mb-1" style={{ color: C.inkSoft }}>Relation till lagkamrater</div>
            <div className="text-11" style={{ color: C.inkSoft }}>Bäst inspelad med <span className="font-semibold" style={{ color: C.ink }}>{best.t.name}</span> — {best.games} matcher tillsammans.</div>
          </PaperCard>
        );
      })()}

      <PaperCard>
        <div className="flex items-center justify-between mb-1">
          <div className="text-xs uppercase tracking-wide font-semibold" style={{ color: C.inkSoft }}>Trivsel</div>
          <span className="text-11 font-semibold" style={{ color: moraleColor }}>{moraleLabel}</span>
        </div>
        <StatBar label="" value={player.morale} color={moraleColor} />
        {!chatResult ? (
          <div className="mt-3">
            <div className="text-10 uppercase tracking-wide font-semibold mb-1.5" style={{ color: C.inkSoft }}>Enskilt samtal</div>
            <div className="grid grid-cols-3 gap-2">
              {Object.entries(CHAT_APPROACHES).map(([key, cfg]) => (
                <button key={key} onClick={() => doChat(key)} className="py-2 rounded-xl text-9 font-semibold border" style={{ background: "transparent", color: C.inkSoft, borderColor: C.paperDim }} title={cfg.desc}>{cfg.label}</button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mt-3 text-11 font-semibold text-center px-2.5 py-1.5 rounded-lg" style={{ background: chatResult.delta >= 0 ? "rgba(47,125,90,0.15)" : "rgba(180,68,59,0.15)", color: chatResult.delta >= 0 ? C.win : C.loss }}>
            {chatResult.delta >= 0 ? `Samtalet gick bra — trivseln steg med ${chatResult.delta}.` : `Samtalet gick sämre än väntat — trivseln sjönk med ${Math.abs(chatResult.delta)}.`}
          </div>
        )}
      </PaperCard>

      <PaperCard>
        <div className="flex items-center justify-between">
          <div className="text-xs uppercase tracking-wide font-semibold" style={{ color: C.inkSoft }}>Kontrakt & lön</div>
          <div className="font-mono text-sm font-semibold" style={{ color: player.contractYears <= 1 ? C.loss : C.ink }}>{player.contractYears} {player.contractYears === 1 ? "år" : "år"} kvar</div>
        </div>
        <div className="text-11 mt-1" style={{ color: C.inkSoft }}>Nuvarande lön: <span className="font-mono font-semibold">{formatMoney(player.wage)}</span>/omgång</div>
        {player.releaseClause && <div className="text-11 mt-1" style={{ color: C.gold }}>Utköpsklausul: {formatMoney(player.releaseClause)}</div>}
        {isBreakoutStar(player, reputation) && <div className="text-11 mt-1.5 font-semibold" style={{ color: C.gold }}>⚠️ Fostrad i akademin och har klart vuxit ur klubbens nivå — risk att {player.name.split(" ")[0]} inte vill förlänga oavsett lön.</div>}
        {isBreakoutStar(player, reputation) && (() => {
          const activeVisions = (manager?.visions || []).filter(v => !v.resolved && !(v.pitches && v.pitches[player.id]));
          if (!activeVisions.length) return <div className="text-10 mt-1.5" style={{ color: C.inkSoft }}>Ingen aktiv framtidsvision att sälja in ännu — sätt en under Manager → Framtidsvisionen.</div>;
          return (
            <div className="mt-2 space-y-1.5">
              {activeVisions.map(v => (
                <button key={v.id} onClick={() => onPitchVision(player.id, v.id)} className="w-full text-left px-3 py-2 rounded-xl text-11 font-semibold" style={{ background: "transparent", border: `1px solid ${C.gold}`, color: "#B8862E" }}>
                  🔮 Sälj in visionen (säsong {v.createdSeason}–{v.targetSeason})
                  <div className="text-9 font-normal mt-0.5" style={{ color: C.inkSoft }}>{v.goals.map(gl => VISION_GOAL_TYPES[gl.type].label).join(" · ")}</div>
                </button>
              ))}
            </div>
          );
        })()}
        {player.contractYears <= 2 ? (
          !wageOutcome ? (
            <>
              <div className="text-11 mt-1" style={{ color: C.inkSoft }}>{player.name.split(" ")[0]} vill ha ett {demand.years}-årskontrakt. Löneanspråk: ca {formatMoney(target)}/omgång.</div>
              <button onClick={() => setIncludeClause(v => !v)} className="flex items-center gap-2 mt-2 text-11">
                <span style={{ width: 16, height: 16, borderRadius: 4, border: `1.5px solid ${C.gold}`, background: includeClause ? C.gold : "transparent" }} />
                Inkludera utköpsklausul (ca {formatMoney(Math.round(demand.newValue * 1.6))}, sänker löneanspråket ~8%)
              </button>
              <div className="grid grid-cols-2 gap-2 mt-2">
                <button onClick={() => tryRenewWage(includeClause ? 0.83 : 0.9)} className="py-2 rounded-xl text-9 font-semibold" style={{ background: C.paperDim, color: C.ink }}>Lågt ({formatMoney(Math.round(target * (includeClause ? 0.83 : 0.9)))}/omg)</button>
                <button onClick={() => tryRenewWage(includeClause ? 0.92 : 1.0)} className="py-2 rounded-xl text-9 font-semibold" style={{ background: C.turf, color: C.paper }}>Marknadsmässigt ({formatMoney(Math.round(target * (includeClause ? 0.92 : 1.0)))}/omg)</button>
              </div>
            </>
          ) : wageOutcome.result === "accept" ? (
            <>
              <div className="text-11 mt-1.5 font-semibold" style={{ color: C.win }}>{player.name.split(" ")[0]} accepterar {formatMoney(wageOutcome.offerWage)}/omg!</div>
              <button onClick={() => { onRenew(player.id, wageOutcome.offerWage, includeClause); setWageOutcome(null); }} className="mt-2 w-full py-2 rounded-xl text-xs font-semibold" style={{ background: C.turf, color: C.paper }}>Förläng kontrakt</button>
            </>
          ) : wageOutcome.result === "counter" ? (
            <>
              <div className="text-11 mt-1.5" style={{ color: C.ink }}>{player.name.split(" ")[0]} vill ha {formatMoney(wageOutcome.counterWage)}/omg istället.</div>
              <div className="flex gap-2 mt-2">
                <button onClick={() => { onRenew(player.id, wageOutcome.counterWage, includeClause); setWageOutcome(null); }} className="flex-1 py-2 rounded-xl text-xs font-semibold" style={{ background: C.turf, color: C.paper }}>Acceptera</button>
                <button onClick={() => setWageOutcome(null)} className="flex-1 py-2 rounded-xl text-xs font-semibold" style={{ background: "transparent", border: `1px solid ${C.inkSoft}`, color: C.inkSoft }}>Avbryt</button>
              </div>
            </>
          ) : wageOutcome.result === "breakout_refuse" ? (
            <>
              <div className="text-11 mt-1.5 font-semibold" style={{ color: C.loss }}>{player.name.split(" ")[0]} vill inte förlänga — oavsett lön.</div>
              <div className="text-10 mt-1" style={{ color: C.inkSoft }}>Fostrad i akademin, men har vuxit ur klubben. {player.name.split(" ")[0]} vill ta nästa steg i karriären på en större scen — pengar löser inte det här.</div>
              <button onClick={() => setWageOutcome(null)} className="mt-2 w-full py-2 rounded-xl text-xs font-semibold" style={{ background: "transparent", border: `1px solid ${C.inkSoft}`, color: C.inkSoft }}>Stäng</button>
            </>
          ) : (
            <>
              <div className="text-11 mt-1.5 font-semibold" style={{ color: C.loss }}>{player.name.split(" ")[0]} tackar nej.</div>
              <button onClick={() => setWageOutcome(null)} className="mt-2 w-full py-2 rounded-xl text-xs font-semibold" style={{ background: C.turf, color: C.paper }}>Försök igen</button>
            </>
          )
        ) : <div className="text-11 mt-1" style={{ color: C.inkSoft }}>Inget behov av förhandling ännu.</div>}
      </PaperCard>

      <PaperCard>
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs uppercase tracking-wide font-semibold" style={{ color: C.inkSoft }}>Marknadsvärde</div>
          <div className="font-mono text-sm font-semibold">{formatMoney(player.value)}</div>
        </div>
        {player.sellOnPct > 0 && <div className="text-11 mb-2" style={{ color: C.loss }}>Säljklausul: {player.sellOnClubName} får {player.sellOnPct}% vid vidareförsäljning</div>}
        <button onClick={onToggleStarter} disabled={(injured || suspended || player.internationalDuty) && !isStarter} className="w-full py-2.5 rounded-xl text-sm font-semibold mb-2" style={((injured || suspended || player.internationalDuty) && !isStarter) ? { background: C.paperDim, color: C.inkSoft, opacity: 0.6 } : isStarter ? { background: C.turf, color: C.paper } : { background: C.gold, color: C.turfDeep }}>
          {isStarter ? "Ta bort från startelvan" : injured ? "Skadad — kan inte spela" : suspended ? "Avstängd — kan inte spela" : player.internationalDuty ? "Landslagsuppdrag — kan inte spela" : "Ta ut i startelvan"}
        </button>
        <div className="text-10 uppercase tracking-wide font-semibold mb-1.5" style={{ color: C.inkSoft }}>Listning — kan vara båda samtidigt</div>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => onToggleListed(player.id)} className="py-2 rounded-xl text-9 font-semibold" style={player.transferListed ? { background: C.win, color: "#fff" } : { background: "transparent", border: `1px solid ${C.loss}`, color: C.loss }}>{player.transferListed ? "✓ Till salu" : "Lista till salu"}</button>
          <button onClick={() => onToggleLoanListed && onToggleLoanListed(player.id)} className="py-2 rounded-xl text-9 font-semibold" style={player.loanListed ? { background: "#3F74A8", color: "#fff" } : { background: "transparent", border: `1px solid ${C.inkSoft}`, color: C.inkSoft }}>{player.loanListed ? "✓ Går att låna" : "Lista för lån"}</button>
        </div>
      </PaperCard>

      {onSendLoan && (
        <PaperCard>
          <div className="text-xs uppercase tracking-wide font-semibold mb-1.5" style={{ color: C.inkSoft }}>Lån</div>
          <div className="text-11 mb-2" style={{ color: C.inkSoft }}>Skicka {player.name} på lån för säsongen. Spelaren spelar regelbundet på annat håll och utvecklas, men är otillgänglig för er under tiden.</div>
          {!showLoanPicker ? (
            <button onClick={() => setShowLoanPicker(true)} disabled={squadSize <= 11} className="w-full py-2 rounded-xl text-sm font-semibold" style={squadSize <= 11 ? { background: C.paperDim, color: C.inkSoft, opacity: 0.6 } : { background: "transparent", border: `1px solid ${C.inkSoft}`, color: C.inkSoft }}>
              {squadSize <= 11 ? "Truppen är för liten för lån" : "Skicka på lån"}
            </button>
          ) : (
            <div className="space-y-1.5">
              {loanCandidates.map(c => (
                <button key={c.id} onClick={() => onSendLoan(c.id, c.name)} className="w-full text-left px-3 py-2 rounded-xl text-sm font-semibold flex items-center justify-between" style={{ background: C.paperDim }}>
                  <span>{c.name}</span>
                  <span className="text-10 font-mono" style={{ color: C.inkSoft }}>Div {c.division}</span>
                </button>
              ))}
              <button onClick={() => setShowLoanPicker(false)} className="w-full py-1.5 text-11" style={{ color: C.inkSoft }}>Avbryt</button>
            </div>
          )}
        </PaperCard>
      )}
      </>
      )}
    </div>
  );
}

function NegotiationView({ player, club, region, budget, reputation, onBack, onFinalize, difficulty, onNegotiationFailed, userClubId, clubs, scoutedPlayerIds }) {
  const [agreedPrice, setAgreedPrice] = useState(null);
  // Locked in once, at the moment negotiation starts — the player's base wage ask shouldn't silently
  // drift mid-negotiation just because the club's budget or reputation happens to shift elsewhere in the
  // game while this screen is open. Only the deliberate per-attempt drift (negotiationDrift) should move it.
  const [baseWageDemand] = useState(() => wageDemand(player, reputation, budget));
  const [priceMessages, setPriceMessages] = useState(() => [{ from: "them", text: sellerOpeningLine(club, player) }]);
  const [priceOutcome, setPriceOutcome] = useState(null);
  const [priceAttempts, setPriceAttempts] = useState(0);
  const [priceWalkedAway, setPriceWalkedAway] = useState(false);
  const [rivalStole, setRivalStole] = useState(false);
  const [sellOnOffer, setSellOnOffer] = useState(0);
  const [paymentPlan, setPaymentPlan] = useState(null);
  const [upfrontPct, setUpfrontPct] = useState(100);
  const [financeMonths, setFinanceMonths] = useState(12);
  const [releaseClauseOffer, setReleaseClauseOffer] = useState(0);
  const [signOnBonus, setSignOnBonus] = useState(0);
  const [houseCar, setHouseCar] = useState(false);
  const [wageMessages, setWageMessages] = useState(() => [{ from: "them", text: playerWageOpeningLine(player) }]);
  const [wageOutcome, setWageOutcome] = useState(null);
  const [wageAttempts, setWageAttempts] = useState(0);
  const [wageWalkedAway, setWageWalkedAway] = useState(false);
  const rivalMult = (DIFFICULTY_SETTINGS[difficulty] || DIFFICULTY_SETTINGS.normal).rivalMult;
  // A rival club's interest should mean something: only players who are genuinely good for their level
  // (or hot young prospects) attract competing interest, and the rival should be a real, named club —
  // not vague flavor text. Picked from the same country, at a similar-or-better level than the seller.
  const isDesirablePlayer = overallOf(player) >= 62 || (player.potential && player.age <= 23 && player.potential - overallOf(player) >= 12);
  const [rivalClub] = useState(() => {
    if (region === "scout" || !isDesirablePlayer || !clubs || !club) return null;
    const rng = seededRandom(`rival${player.id}${region}`);
    if (rng() >= 0.3 * rivalMult) return null;
    const candidates = Object.values(clubs).filter(c => c.id !== club.id && c.id !== userClubId && c.league === club.league && c.strength >= (club.strength || 55) - 8);
    if (!candidates.length) return null;
    return candidates[Math.floor(rng() * candidates.length)];
  });
  const hasRival = !!rivalClub;
  const isDerbyClub = !!(club && club.rivalId && userClubId && club.rivalId === userClubId);
  const relation = clubRelationshipLabel(club?.goodwill, isDerbyClub);
  const priceLeverage = negotiationLeverage(reputation, club.strength || 55);
  const wageLeverage = negotiationLeverage(reputation, overallOf(player));
  const isBigTalent = overallOf(player) >= 78 || (player.potential && player.potential >= 80 && player.potential - overallOf(player) >= 6);
  const toughSale = isBigTalent && (club.strength || 0) >= reputation;
  function tryOffer(mult, label) {
    const driftedValue = negotiationDrift(player.value, priceAttempts);
    const offerAmount = Math.round(driftedValue * mult);
    if (priceAttempts === 0 && Math.random() < opportunityChance(priceLeverage)) {
      setPriceMessages(prev => [...prev, { from: "you", text: `${label}: ${formatMoney(offerAmount)}` }, { from: "them", text: `Ärligt talat är vi imponerade av er klubb just nu — vi tackar ja utan krångel.` }]);
      setPriceOutcome({ result: "accept", offerAmount });
      setPriceAttempts(1);
      return;
    }
    const result = negotiateOffer(offerAmount, driftedValue, club, reputation, hasRival ? 1.12 : 1, player, sellOnOffer, isDerbyClub);
    const nextAttempts = priceAttempts + 1;
    setPriceAttempts(nextAttempts);
    if (result.result !== "accept") {
      if (hasRival && Math.random() < rivalStealChance(nextAttempts, rivalMult)) {
        setPriceMessages(prev => [...prev, { from: "you", text: `${label}: ${formatMoney(offerAmount)}` }, { from: "them", text: `Tyvärr — ${player.name.split(" ")[0]} skrev just på för en annan klubb medan vi förhandlade.` }]);
        setRivalStole(true);
        onNegotiationFailed?.(player, club, "rival");
        return;
      }
      const goodwillPenalty = clamp((50 - (club.goodwill ?? 50)) / 300, 0, 0.16);
      const walkChance = negotiationWalkAwayChance(offerAmount / driftedValue, reputation) + goodwillPenalty;
      if (nextAttempts >= NEGOTIATION_MAX_ATTEMPTS || Math.random() < walkChance) {
        const lowGoodwillNote = (club.goodwill ?? 50) < 35 ? ` ${club.name} minns fortfarande tidigare bud och är extra ovilliga.` : "";
        setPriceMessages(prev => [...prev, { from: "you", text: `${label}: ${formatMoney(offerAmount)}` }, { from: "them", text: `${negoRejectLine(player)} Vi avslutar förhandlingen här.${lowGoodwillNote}` }]);
        setPriceWalkedAway(true);
        onNegotiationFailed?.(player, club, "lowball");
        return;
      }
    }
    const reply = result.result === "accept" ? negoAcceptLine() : result.result === "counter" ? negoCounterLine(result.counterPrice) : negoRejectLine(player);
    setPriceMessages(prev => [...prev, { from: "you", text: `${label}: ${formatMoney(offerAmount)}` }, { from: "them", text: reply }]);
    setPriceOutcome({ ...result, offerAmount });
  }
  const releaseClauseNum = releaseClauseOffer;
  const signOnBonusNum = signOnBonus;
  const houseCarCost = houseCar ? 350 : 0;
  const sweetenerScore = perkSweetenerScore(releaseClauseNum, signOnBonusNum, houseCar, player.value);
  const [clubInterest] = useState(() => playerInterestInClub(player, reputation, clubs[userClubId]?.division || 1));
  // A player who isn't keen on joining still CAN be convinced — but it costs real money, not charm. Below
  // ~55 interest the wage premium scales up sharply the more reluctant they are.
  const interestWageMult = clubInterest >= 55 ? 1 : 1 + clamp((55 - clubInterest) / 100, 0, 0.6);
  function tryWage(mult) {
    const target = negotiationDrift(baseWageDemand * interestWageMult, wageAttempts);
    const offerWage = Math.round(target * mult);
    if (wageAttempts === 0 && Math.random() < opportunityChance(wageLeverage)) {
      setWageMessages(prev => [...prev, { from: "you", text: `Erbjuder ${formatMoney(offerWage)}/omg` }, { from: "them", text: `Er klubb känns som rätt nästa steg för mig — jag skriver på utan att krångla.` }]);
      setWageOutcome({ result: "accept", offerWage });
      setWageAttempts(1);
      return;
    }
    const result = negotiateWage(offerWage, target, reputation, sweetenerScore, isDerbyClub);
    const nextAttempts = wageAttempts + 1;
    setWageAttempts(nextAttempts);
    if (result.result !== "accept") {
      const walkChance = negotiationWalkAwayChance(offerWage / target, reputation);
      if (nextAttempts >= NEGOTIATION_MAX_ATTEMPTS || Math.random() < walkChance) {
        setWageMessages(prev => [...prev, { from: "you", text: `Erbjuder ${formatMoney(offerWage)}/omg` }, { from: "them", text: `${wageRejectLine()} Jag tackar nej till hela flytten.` }]);
        setWageWalkedAway(true);
        onNegotiationFailed?.(player, null, "wage");
        return;
      }
    }
    const reply = result.result === "accept" ? wageAcceptLine() : result.result === "counter" ? wageCounterLine(result.counterWage) : wageRejectLine();
    setWageMessages(prev => [...prev, { from: "you", text: `Erbjuder ${formatMoney(offerWage)}/omg` }, { from: "them", text: reply }]);
    setWageOutcome({ ...result, offerWage });
  }
  const overall = overallOf(player);
  const scouted = isPlayerScouted(player, scoutedPlayerIds, userClubId);
  const isWorldPoolOrigin = !!player.region;
  const [ovLo, ovHi] = scouted ? [overall, overall] : fuzzyStatRange(overall, player.id, "overall", isWorldPoolOrigin);
  const [atkLo, atkHi] = scouted ? [player.attack, player.attack] : fuzzyStatRange(player.attack, player.id, "attack", isWorldPoolOrigin);
  const [defLo, defHi] = scouted ? [player.defense, player.defense] : fuzzyStatRange(player.defense, player.id, "defense", isWorldPoolOrigin);
  const attemptsLeftBadge = (used) => <span className="text-9 font-mono" style={{ color: C.inkSoft }}>{NEGOTIATION_MAX_ATTEMPTS - used} försök kvar</span>;
  const backBtn = <button onClick={onBack} style={{ position: "fixed", bottom: 14, right: 14, display: "inline-block", color: "rgba(255,255,255,0.85)", background: "rgba(19,34,29,0.88)", padding: "6px 13px", borderRadius: 999, fontSize: 11, fontWeight: 600, zIndex: 50, backdropFilter: "blur(4px)", boxShadow: "0 2px 10px rgba(0,0,0,0.35)" }}>← Bakåt</button>;

  if (rivalStole) {
    return (
      <div className="rise-in space-y-2.5">
        {backBtn}
        <PaperCard>
          <div className="text-center py-2">
            <div style={{ fontSize: 34 }}>❌</div>
            <div className="font-display text-lg mt-1" style={{ color: C.loss }}>FÖRHANDLINGEN FÖRLORAD</div>
          </div>
          <div className="text-sm font-semibold" style={{ color: C.loss }}>{player.name} värvades av {rivalClub?.name || "en annan klubb"} medan ni förhandlade.</div>
          <div className="text-11 mt-1.5" style={{ color: C.inkSoft }}>Att dra ut på förhandlingar ger konkurrenter en chans att slå till. Nästa gång kan ett snabbare, mer bestämt bud vara värt att överväga.</div>
        </PaperCard>
      </div>
    );
  }
  if (priceWalkedAway) {
    return (
      <div className="rise-in space-y-2.5">
        {backBtn}
        <PaperCard>
          <div className="text-center py-2">
            <div style={{ fontSize: 34 }}>❌</div>
            <div className="font-display text-lg mt-1" style={{ color: C.loss }}>FÖRHANDLINGEN AVBRUTEN</div>
          </div>
          <div className="text-sm font-semibold" style={{ color: C.loss }}>{club.name} avslutade förhandlingen.</div>
          <div className="text-11 mt-1.5" style={{ color: C.inkSoft }}>Alldeles för låga bud eller för många misslyckade försök kan få säljande klubb att dra sig ur helt. Ni får försöka igen en annan gång.</div>
        </PaperCard>
      </div>
    );
  }

  // ---- Step: payment plan (upfront cash + optional financed installments) ----
  if (agreedPrice !== null && paymentPlan === null) {
    const upfrontAmount = Math.round(agreedPrice * (upfrontPct / 100));
    const financedAmount = agreedPrice - upfrontAmount;
    const plan = financedAmount > 0 ? installmentPlan(financedAmount, financeMonths) : null;
    return (
      <div className="rise-in space-y-2.5">
        {backBtn}
        <PaperCard>
          <div className="flex items-center gap-3">
            <div style={{ position: "relative", width: 44, height: 44, flexShrink: 0 }}>
              <PlayerAvatar player={player} size={44} />
              <div style={{ position: "absolute", bottom: -4, right: -4 }}><OverallBadge overall={scouted ? overall : Math.round((ovLo + ovHi) / 2)} size={20} /></div>
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-display text-lg truncate">{player.name}</div>
              <div className="text-11" style={{ color: C.win }}>Övergångssumma klar: {formatMoney(agreedPrice)}</div>
            </div>
          </div>
        </PaperCard>
        <PaperCard>
          <div className="text-xs uppercase tracking-wide font-semibold mb-1" style={{ color: C.inkSoft }}>Betalningsplan</div>
          <div className="text-11 mb-2" style={{ color: C.inkSoft }}>Betala direkt, eller dela upp resten som delbetalning i upp till 24 månader (8% ränta totalt). Delbetalning gör stora affärer möjliga, men kostar mer totalt.</div>
          <div className="text-10 uppercase tracking-wide font-semibold mb-1" style={{ color: C.inkSoft }}>Betala direkt</div>
          <div className="grid grid-cols-5 gap-1.5 mb-3">
            {[0, 25, 50, 75, 100].map(pct => (
              <button key={pct} onClick={() => setUpfrontPct(pct)} className="py-2 rounded-lg text-10 font-semibold border"
                style={upfrontPct === pct ? { background: C.turf, color: C.paper, borderColor: C.turf } : { background: "transparent", color: C.inkSoft, borderColor: C.paperDim }}>{pct}%</button>
            ))}
          </div>
          <div className="text-11 mb-2" style={{ color: C.ink }}>Direkt nu: <span className="font-mono font-semibold">{formatMoney(upfrontAmount)}</span></div>
          {financedAmount > 0 && (
            <>
              <div className="text-10 uppercase tracking-wide font-semibold mb-1" style={{ color: C.inkSoft }}>Delbetala resten ({formatMoney(financedAmount)}) över</div>
              <div className="flex items-center gap-2 mb-2">
                <input type="range" min={1} max={24} value={financeMonths} onChange={e => setFinanceMonths(Number(e.target.value))} className="flex-1" />
                <span className="font-mono text-sm font-semibold w-20 text-right">{financeMonths} mån</span>
              </div>
              {plan && (
                <div className="p-2.5 rounded-xl" style={{ background: "rgba(180,68,59,0.08)" }}>
                  <div className="flex items-center justify-between text-11"><span style={{ color: C.inkSoft }}>Finansierat belopp</span><span className="font-mono">{formatMoney(plan.amountFinanced)}</span></div>
                  <div className="flex items-center justify-between text-11"><span style={{ color: C.inkSoft }}>Ränta (8%)</span><span className="font-mono" style={{ color: C.loss }}>+{formatMoney(plan.interestCost)}</span></div>
                  <div className="flex items-center justify-between text-11 font-semibold" style={{ borderTop: `1px dashed ${C.paperDim}`, marginTop: 4, paddingTop: 4 }}><span>Totalt att betala av</span><span className="font-mono">{formatMoney(plan.totalWithInterest)}</span></div>
                  <div className="flex items-center justify-between text-sm font-bold mt-1" style={{ color: C.loss }}><span>Per månad</span><span className="font-mono">{formatMoney(plan.monthlyPayment)}</span></div>
                </div>
              )}
            </>
          )}
          <button onClick={() => setPaymentPlan({ upfrontAmount, financedAmount, months: financedAmount > 0 ? financeMonths : 0, plan })} className="mt-3 w-full py-2.5 rounded-xl text-sm font-semibold" style={{ background: C.gold, color: C.turfDeep }}>Bekräfta betalningsplan</button>
        </PaperCard>
      </div>
    );
  }

  if (agreedPrice !== null) {
    const totalCashNow = paymentPlan.upfrontAmount + signOnBonusNum + houseCarCost;
    const canAfford = budget >= totalCashNow;
    return (
      <div className="rise-in space-y-2.5">
        {backBtn}
        <PaperCard>
          <div className="flex items-center gap-3">
            <div style={{ position: "relative", width: 44, height: 44, flexShrink: 0 }}>
              <PlayerAvatar player={player} size={44} />
              <div style={{ position: "absolute", bottom: -4, right: -4 }}><OverallBadge overall={scouted ? overall : Math.round((ovLo + ovHi) / 2)} size={20} /></div>
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-display text-lg truncate">{player.name}</div>
              <div className="text-11" style={{ color: C.win }}>Övergångssumma klar: {formatMoney(agreedPrice)}{paymentPlan.months > 0 ? ` (${formatMoney(paymentPlan.upfrontAmount)} direkt + ${paymentPlan.months} mån delbetalning)` : ""}</div>
            </div>
          </div>
        </PaperCard>
        {wageWalkedAway ? (
          <PaperCard>
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl font-semibold text-sm mb-2" style={{ background: "rgba(180,68,59,0.15)", color: C.loss }}>❌ {player.name.split(" ")[0]} tackade nej till hela flytten.</div>
            <div className="text-11" style={{ color: C.inkSoft }}>Övergångssumman var klar, men löneförhandlingen gick i stöpet — affären faller i sin helhet.</div>
          </PaperCard>
        ) : (
          <>
            <PaperCard>
              <div className="text-xs uppercase tracking-wide font-semibold mb-1.5" style={{ color: C.inkSoft }}>Extra lockbeten (frivilligt, förhandlingsbart)</div>
              <div className="text-10 mb-3" style={{ color: C.inkSoft }}>Dra i reglagen för att välja belopp — kan erbjudas var för sig eller tillsammans. Allt mjukar upp löneanspråket, precis som avbetalningsplanen ovan.</div>
              <div className="mb-3">
                <div className="text-10 font-semibold mb-1" style={{ color: C.ink }}>Utköpsklausul</div>
                <div className="flex items-center gap-2">
                  <input type="range" min={0} max={Math.round(player.value * 3)} step={Math.max(10, Math.round(player.value * 3 / 50))} value={releaseClauseOffer} onChange={e => setReleaseClauseOffer(Number(e.target.value))} className="flex-1" />
                  <span className="font-mono text-sm font-semibold w-20 text-right">{releaseClauseOffer > 0 ? formatMoney(releaseClauseOffer) : "Ingen"}</span>
                </div>
              </div>
              <div className="mb-3">
                <div className="text-10 font-semibold mb-1" style={{ color: C.ink }}>Sign on-bonus (engångsbelopp, från transferbudget)</div>
                <div className="flex items-center gap-2">
                  <input type="range" min={0} max={Math.max(50, Math.round(player.value * 0.3))} step={Math.max(5, Math.round(player.value * 0.3 / 50))} value={signOnBonus} onChange={e => setSignOnBonus(Number(e.target.value))} className="flex-1" />
                  <span className="font-mono text-sm font-semibold w-20 text-right">{signOnBonus > 0 ? formatMoney(signOnBonus) : "Ingen"}</span>
                </div>
              </div>
              <button onClick={() => setHouseCar(v => !v)} className="flex items-center gap-2 text-11">
                <span style={{ width: 16, height: 16, borderRadius: 4, border: `1.5px solid ${C.gold}`, background: houseCar ? C.gold : "transparent" }} />
                Hus + bil (kostar ytterligare {formatMoney(350)} från transferbudgeten)
              </button>
              <div className="text-10 mt-2 font-semibold" style={{ color: sweetenerScore > 0 ? C.win : C.inkSoft }}>{sweetenerScore > 0 ? `Mjukar upp löneanspråket med ${Math.round(sweetenerScore * 100)}% — se de lägre beloppen nedan.` : "Inga lockbeten erbjudna än — löneanspråket är opåverkat."}</div>
            </PaperCard>
            <PaperCard>
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs uppercase tracking-wide font-semibold" style={{ color: C.inkSoft }}>Löneförhandling med {player.name.split(" ")[0]}</div>
                {attemptsLeftBadge(wageAttempts)}
              </div>
              <div className="text-11" style={{ color: C.inkSoft }}>Ursprungligt löneanspråk: ca {formatMoney(wageDemand(player))}/omgång</div>
              {clubInterest < 55 && <div className="text-11 mt-1 font-semibold" style={{ color: clubInterest < 30 ? C.loss : C.gold }}>{clubInterest < 30 ? "Ovillig att gå till er" : "Avvaktande till en flytt"} — kräver en lönepremie för att övertygas. Att ändå driva igenom värvningen kan skapa dålig stämning över tid.</div>}
              {wageAttempts > 0 && <div className="text-11 mt-0.5 font-semibold" style={{ color: C.gold }}>Nuvarande anspråk (efter {wageAttempts} {wageAttempts === 1 ? "försök" : "försök"}): ca {formatMoney(Math.round(negotiationDrift(baseWageDemand * interestWageMult, wageAttempts)))}/omgång</div>}
              {sweetenerScore > 0 && <div className="text-11 mb-1" style={{ color: C.win }}>Med lockbetena: ca {formatMoney(Math.round(negotiationDrift(baseWageDemand * interestWageMult, wageAttempts) * (1 - sweetenerScore)))}/omgång</div>}
              <div className="mb-2"><LeverageBadge score={wageLeverage} /></div>
              <NegotiationThread messages={wageMessages} />
              {!wageOutcome ? (
                <div className="grid grid-cols-3 gap-1.5 mt-3">
                  <button onClick={() => tryWage(0.85)} className="py-2 rounded-xl text-9 font-semibold" style={{ background: C.paperDim, color: C.ink }}>Lågt<br />{formatMoney(Math.round(negotiationDrift(baseWageDemand * interestWageMult, wageAttempts) * (1 - sweetenerScore) * 0.85))}/omg</button>
                  <button onClick={() => tryWage(1.0)} className="py-2 rounded-xl text-9 font-semibold" style={{ background: C.turf, color: C.paper }}>Marknad<br />{formatMoney(Math.round(negotiationDrift(baseWageDemand * interestWageMult, wageAttempts) * (1 - sweetenerScore)))}/omg</button>
                  <button onClick={() => tryWage(1.2)} className="py-2 rounded-xl text-9 font-semibold" style={{ background: C.gold, color: C.turfDeep }}>Generöst<br />{formatMoney(Math.round(negotiationDrift(baseWageDemand * interestWageMult, wageAttempts) * (1 - sweetenerScore) * 1.2))}/omg</button>
                </div>
              ) : wageOutcome.result === "accept" ? (
                <>
                  <div className="flex items-center gap-2 mt-3 px-3 py-2 rounded-xl font-semibold text-sm" style={{ background: "rgba(63,143,107,0.15)", color: C.win }}>✅ {player.name.split(" ")[0]} accepterar lönebudet!</div>
                  {!canAfford && <div className="text-11 font-semibold mt-2" style={{ color: C.loss }}>Otillräcklig budget för {formatMoney(totalCashNow)} i direktkostnad (direkt betalning + sign on-bonus + hus/bil).</div>}
                  <button onClick={() => onFinalize(region, player, agreedPrice, wageOutcome.offerWage, { paymentPlan, releaseClauseOffer: releaseClauseNum, signOnBonus: signOnBonusNum, houseCar, sellOnOffer, clubInterest })} disabled={!canAfford} className="mt-2 w-full py-2.5 rounded-xl text-sm font-semibold" style={canAfford ? { background: C.turf, color: C.paper } : { background: C.paperDim, color: C.inkSoft, opacity: 0.6 }}>Slutför övergången</button>
                </>
              ) : wageOutcome.result === "counter" ? (
                <>
                  <div className="flex items-center gap-2 mt-3 px-3 py-2 rounded-xl font-semibold text-sm" style={{ background: "rgba(201,154,62,0.18)", color: "#8A6A20" }}>🤝 {player.name.split(" ")[0]} vill ha mer — motbud, inte ett nej.</div>
                  <div className="flex gap-2 mt-2">
                    <button onClick={() => onFinalize(region, player, agreedPrice, wageOutcome.counterWage, { paymentPlan, releaseClauseOffer: releaseClauseNum, signOnBonus: signOnBonusNum, houseCar, sellOnOffer, clubInterest })} disabled={!canAfford} className="flex-1 py-2.5 rounded-xl text-sm font-semibold" style={canAfford ? { background: C.turf, color: C.paper } : { background: C.paperDim, color: C.inkSoft, opacity: 0.6 }}>Acceptera</button>
                    <button onClick={() => setWageOutcome(null)} className="flex-1 py-2.5 rounded-xl text-sm font-semibold" style={{ background: "transparent", border: `1px solid ${C.inkSoft}`, color: C.inkSoft }}>Nytt bud</button>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2 mt-3 px-3 py-2 rounded-xl font-semibold text-sm" style={{ background: "rgba(180,68,59,0.15)", color: C.loss }}>❌ {player.name.split(" ")[0]} tackar nej till budet.</div>
                  <button onClick={() => setWageOutcome(null)} className="mt-2 w-full py-2.5 rounded-xl text-sm font-semibold" style={{ background: C.turf, color: C.paper }}>Försök igen</button>
                </>
              )}
            </PaperCard>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="rise-in space-y-2.5">
      {backBtn}
      <PaperCard>
        <div className="flex items-center gap-3">
          <div style={{ position: "relative", width: 48, height: 48, flexShrink: 0 }}>
            <PlayerAvatar player={player} size={48} />
            <div style={{ position: "absolute", bottom: -4, right: -4 }}><OverallBadge overall={scouted ? overall : Math.round((ovLo + ovHi) / 2)} size={20} /></div>
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-display text-lg truncate">{player.name}</div>
            <div className="text-11" style={{ color: C.inkSoft }}>{POS_LABEL[player.pos]} ({specificPositionLabel(player.specificPosition)}) · {nationalityLabel(player.nationality)} · {player.age} år</div>
          </div>
        </div>
        <div className="mt-3 p-2.5 rounded-xl" style={{ background: "rgba(0,0,0,0.04)" }}>
          <div className="text-10 uppercase tracking-wide font-semibold" style={{ color: C.inkSoft }}>Nuvarande klubb</div>
          <div className="text-sm font-semibold mt-0.5">{club.name}</div>
          <div className="text-11" style={{ color: C.inkSoft }}>{ARCHETYPE_LABEL[club.archetype]} · Uppskattat värde {formatMoney(player.value)}</div>
          <div className="flex items-center justify-between mt-1.5 pt-1.5" style={{ borderTop: `1px dashed ${C.paperDim}` }}>
            <span className="text-10 uppercase tracking-wide font-semibold" style={{ color: C.inkSoft }}>Relation med klubb</span>
            <span className="text-11 font-bold" style={{ color: relation.color }}>{relation.text}</span>
          </div>
        </div>
        <div className="flex gap-3 mt-3"><StatBar label="Anfall" value={scouted ? player.attack : (atkLo + atkHi) / 2} displayText={scouted ? undefined : `${atkLo}–${atkHi}`} color={C.gold} /><StatBar label="Försvar" value={scouted ? player.defense : (defLo + defHi) / 2} displayText={scouted ? undefined : `${defLo}–${defHi}`} color={C.turf} /></div>
        {!scouted && <div className="text-9 mt-1" style={{ color: C.inkSoft }}>Ej scoutad — siffrorna ovan är ett uppskattat spann, inte exakta värden.</div>}
      </PaperCard>

      {isDerbyClub && (
        <div className="text-11 px-3 py-2.5 rounded-xl font-semibold text-center" style={{ background: "rgba(180,68,59,0.18)", color: C.loss }}>
          🔥 {club.name} är er lokala ärkerival! Både klubben och {player.name.split(" ")[0]} själv kommer vara extremt ovilliga — mycket högre bud och lön krävs. Inte omöjligt, men en riktig uppförsbacke. Fansen kommer garanterat reagera på en sådan affär.
        </div>
      )}
      {toughSale && !isDerbyClub && (
        <div className="text-11 px-3 py-2 rounded-xl font-semibold text-center" style={{ background: "rgba(180,68,59,0.15)", color: C.loss }}>
          🛡️ {player.name.split(" ")[0]} är en nyckelspelare i en klubb som är minst lika stor som er — de kommer vara mycket ovilliga att sälja, och det krävs betydligt högre bud.
        </div>
      )}
      {hasRival && (
        <div className="text-11 px-3 py-2 rounded-xl font-semibold text-center" style={{ background: "rgba(180,68,59,0.15)", color: C.loss }}>
          ⚔️ {rivalClub.name} bevakar samma spelare — dra ut på förhandlingen så riskerar ni att bli av med spelaren helt.
        </div>
      )}

      <PaperCard>
        <div className="text-xs uppercase tracking-wide font-semibold mb-1.5" style={{ color: C.inkSoft }}>Erbjud vidareförsäljningsprocent</div>
        <div className="text-10 mb-2" style={{ color: C.inkSoft }}>Ge säljande klubb en andel av en framtida vidareförsäljning — sänker priset de kräver nu.</div>
        <div className="grid grid-cols-5 gap-1.5">
          {[0, 10, 15, 20, 25].map(pct => (
            <button key={pct} onClick={() => setSellOnOffer(pct)} className="py-2 rounded-lg text-10 font-semibold border"
              style={sellOnOffer === pct ? { background: C.gold, color: C.turfDeep, borderColor: C.gold } : { background: "transparent", color: C.ink, borderColor: C.paperDim }}>{pct}%</button>
          ))}
        </div>
      </PaperCard>

      <PaperCard>
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs uppercase tracking-wide font-semibold" style={{ color: C.inkSoft }}>Förhandling med {club.name}</div>
          {attemptsLeftBadge(priceAttempts)}
        </div>
        <div className="mb-2"><LeverageBadge score={priceLeverage} /></div>
        {(club.goodwill ?? 50) < 35 && (
          <div className="text-11 px-3 py-2 rounded-xl font-semibold text-center mb-2" style={{ background: "rgba(180,68,59,0.12)", color: C.loss }}>Relationen med {club.name} är ansträngd efter tidigare förhandlingar — de är extra ovilliga att sälja billigt.</div>
        )}
        {(club.goodwill ?? 50) > 68 && (
          <div className="text-11 px-3 py-2 rounded-xl font-semibold text-center mb-2" style={{ background: "rgba(63,143,107,0.12)", color: C.win }}>Ni har en god relation med {club.name} sedan tidigare — det gör förhandlingen lite lättare.</div>
        )}
        <NegotiationThread messages={priceMessages} />
        {!priceOutcome ? (
          <div className="grid grid-cols-3 gap-1.5 mt-3">
            <button onClick={() => tryOffer(0.85, "Lågt bud")} className="py-2 rounded-xl text-9 font-semibold" style={{ background: C.paperDim, color: C.ink }}>Lågt<br />{formatMoney(Math.round(negotiationDrift(player.value, priceAttempts) * 0.85))}</button>
            <button onClick={() => tryOffer(1.05, "Rimligt bud")} className="py-2 rounded-xl text-9 font-semibold" style={{ background: C.turf, color: C.paper }}>Rimligt<br />{formatMoney(Math.round(negotiationDrift(player.value, priceAttempts) * 1.05))}</button>
            <button onClick={() => tryOffer(1.3, "Högt bud")} className="py-2 rounded-xl text-9 font-semibold" style={{ background: C.gold, color: C.turfDeep }}>Högt<br />{formatMoney(Math.round(negotiationDrift(player.value, priceAttempts) * 1.3))}</button>
          </div>
        ) : priceOutcome.result === "accept" ? (
          <>
            <div className="flex items-center gap-2 mt-3 px-3 py-2 rounded-xl font-semibold text-sm" style={{ background: "rgba(63,143,107,0.15)", color: C.win }}>✅ {club.name} accepterar budet!</div>
            <button onClick={() => setAgreedPrice(priceOutcome.offerAmount)} className="mt-2 w-full py-2.5 rounded-xl text-sm font-semibold" style={{ background: C.turf, color: C.paper }}>Gå vidare till betalningsplan</button>
          </>
        ) : priceOutcome.result === "counter" ? (
          <>
            <div className="flex items-center gap-2 mt-3 px-3 py-2 rounded-xl font-semibold text-sm" style={{ background: "rgba(201,154,62,0.18)", color: "#8A6A20" }}>🤝 {club.name} ger ett motbud — inte ett nej, men inte ett ja heller.</div>
            <div className="flex gap-2 mt-2">
              <button onClick={() => setAgreedPrice(priceOutcome.counterPrice)} className="flex-1 py-2.5 rounded-xl text-sm font-semibold" style={{ background: C.turf, color: C.paper }}>Acceptera</button>
              <button onClick={() => setPriceOutcome(null)} className="flex-1 py-2.5 rounded-xl text-sm font-semibold" style={{ background: "transparent", border: `1px solid ${C.inkSoft}`, color: C.inkSoft }}>Nytt bud</button>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2 mt-3 px-3 py-2 rounded-xl font-semibold text-sm" style={{ background: "rgba(180,68,59,0.15)", color: C.loss }}>❌ {club.name} nekar budet — för lågt.</div>
            <button onClick={() => setPriceOutcome(null)} className="mt-2 w-full py-2.5 rounded-xl text-sm font-semibold" style={{ background: C.turf, color: C.paper }}>Försök igen</button>
          </>
        )}
      </PaperCard>
    </div>
  );
}

function ScoutMissionPanel({ scoutMission, scoutLevel, budget, squad, savedProfiles, onStart, onDismiss, onCancel, onNegotiate, onSaveProfile, onDeleteProfile, onOpenClubBrowser, reputation, division }) {
  const [selectedCandidateIdx, setSelectedCandidateIdx] = useState(0);
  const [posFilter, setPosFilter] = useState(null);
  const [sideFilter, setSideFilter] = useState(null);
  const [ageMin, setAgeMin] = useState("");
  const [ageMax, setAgeMax] = useState("");
  const [activeAttrs, setActiveAttrs] = useState({});
  const [attrMins, setAttrMins] = useState({});
  const [maxValue, setMaxValue] = useState("");
  const [maxWage, setMaxWage] = useState("");
  const [wantPotential, setWantPotential] = useState(false);
  const [wantInterested, setWantInterested] = useState(false);
  const [worldPoolRegion, setWorldPoolRegion] = useState(null);
  const [savingProfileName, setSavingProfileName] = useState(null);
  const inputStyle = { background: "transparent", border: `1px solid ${C.paperDim}`, borderRadius: 10, padding: "8px 10px", color: C.ink, fontSize: 13, width: "100%" };
  function applyPreset(preset) {
    setPosFilter(preset.posFilter);
    setSideFilter(preset.sideFilter || null);
    setActiveAttrs(Object.fromEntries(Object.keys(preset.attrs).map(k => [k, true])));
    setAttrMins(Object.fromEntries(Object.entries(preset.attrs).map(([k, v]) => [k, String(v)])));
    setAgeMax(preset.ageMax ? String(preset.ageMax) : "");
    setWantPotential(!!preset.minPotential);
    setWantInterested(!!preset.interestedOnly);
    setWorldPoolRegion(preset.worldPoolRegion || null);
  }
  function currentFilters() {
    return {
      posFilter, sideFilter: posFilter && posFilter !== "MV" ? sideFilter : null,
      ageMin: ageMin ? parseInt(ageMin) : null, ageMax: ageMax ? parseInt(ageMax) : null,
      attributeFilters: Object.fromEntries(Object.keys(activeAttrs).filter(k => activeAttrs[k] && attrMins[k]).map(k => [k, parseInt(attrMins[k])])),
      maxValue: maxValue ? parseInt(maxValue) : null, maxWage: maxWage ? parseInt(maxWage) : null,
      minPotential: wantPotential ? 76 : null,
      interestedOnly: wantInterested,
      worldPoolRegion,
    };
  }

  if (scoutMission && !scoutMission.complete) {
    const pct = clamp(Math.round((scoutMission.roundsElapsed / scoutMission.roundsTotal) * 100), 0, 100);
    const parts = [];
    if (scoutMission.posFilter) parts.push(POS_LABEL[scoutMission.posFilter]);
    if (scoutMission.sideFilter) parts.push({ left: "Vänster", center: "Central", right: "Höger" }[scoutMission.sideFilter]);
    if (scoutMission.ageMin || scoutMission.ageMax) parts.push(`${scoutMission.ageMin || "?"}–${scoutMission.ageMax || "?"} år`);
    Object.entries(scoutMission.attributeFilters || {}).forEach(([key, minVal]) => parts.push(`${ATTR_LABELS_OUTFIELD[key] || key} ≥${minVal}`));
    if (scoutMission.maxValue) parts.push(`Max ${formatMoney(scoutMission.maxValue)}`);
    if (scoutMission.maxWage) parts.push(`Max ${formatMoney(scoutMission.maxWage)}/omg`);
    if (scoutMission.minPotential) parts.push(`Hög potential (≥${scoutMission.minPotential})`);
    if (scoutMission.interestedOnly) parts.push("Intresserad av klubben");
    if (scoutMission.worldPoolRegion) parts.push(`Övriga världen — ${REGION_LABELS[scoutMission.worldPoolRegion]}`);
    return (
      <PaperCard>
        <div className="text-xs uppercase tracking-wide font-semibold" style={{ color: C.inkSoft }}>Scouten är ute på uppdrag</div>
        <div className="text-sm mt-1 font-semibold">{scoutMission.roundsElapsed} av {scoutMission.roundsTotal} omgångar</div>
        <div className="h-2 rounded-full mt-2" style={{ background: "rgba(0,0,0,0.08)" }}><div style={{ width: `${pct}%`, background: C.gold, height: "100%", borderRadius: 999, transition: "width .5s ease" }} /></div>
        <div className="text-11 mt-2" style={{ color: C.inkSoft }}>{parts.length ? `Kriterier: ${parts.join(" · ")}` : "Fri sökning, inga specifika kriterier."}</div>
        <button onClick={onCancel} className="w-full py-2 mt-2.5 rounded-xl text-xs font-semibold" style={{ background: "transparent", border: `1px solid ${C.paperDim}`, color: C.inkSoft }}>Avbryt uppdraget</button>
      </PaperCard>
    );
  }

  if (scoutMission?.complete) {
    const results = scoutMission.results || (scoutMission.result ? [scoutMission.result] : []);
    if (!results.length) {
      return (
        <PaperCard>
          <div className="text-sm text-center py-2" style={{ color: C.inkSoft }}>Scouten hittade ingen spelare som matchade kriterierna. Försök med bredare filter.</div>
          <button onClick={onDismiss} className="mt-2 w-full py-2.5 rounded-xl text-xs font-semibold" style={{ background: C.turf, color: C.paper }}>Sök igen</button>
        </PaperCard>
      );
    }
    const p = results[Math.min(selectedCandidateIdx, results.length - 1)];
    const overall = overallOf(p);
    const uncertain = scoutUncertainty(scoutLevel) > 0;
    const comparable = (squad || []).filter(s => s.pos === p.pos).sort((a, b) => overallOf(b) - overallOf(a)).slice(0, 2);
    const interest = interestLabel(playerInterestInClub(p, reputation, division));
    return (
      <PaperCard>
        <div className="text-xs uppercase tracking-wide font-semibold" style={{ color: C.inkSoft }}>{results.length > 1 ? `Scouten har hittat ${results.length} spelare` : "Scouten har hittat en spelare"}</div>
        {results.length > 1 && (
          <div className="flex gap-1.5 mt-2 overflow-x-auto pb-1">
            {results.map((c, i) => (
              <button key={c.id} onClick={() => setSelectedCandidateIdx(i)} className="shrink-0 px-2.5 py-1.5 rounded-lg text-9 font-semibold" style={i === Math.min(selectedCandidateIdx, results.length - 1) ? { background: C.gold, color: C.turfDeep } : { background: C.paperDim, color: C.inkSoft }}>{c.name.split(" ")[0]} · {overallOf(c)}</button>
            ))}
          </div>
        )}
        <div className="flex items-center gap-3 mt-2">
          <div style={{ position: "relative", width: 42, height: 42, flexShrink: 0 }}>
            <PlayerAvatar player={p} size={42} />
            <div style={{ position: "absolute", bottom: -4, right: -4 }}><OverallBadge overall={overall} size={20} /></div>
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-sm truncate">{p.name}</div>
            <div className="text-11" style={{ color: C.inkSoft }}>{POS_LABEL[p.pos]} ({specificPositionLabel(p.specificPosition)}) · {nationalityLabel(p.nationality)}, {p.age} år</div>
            <div className="mt-1"><StarRating rating={overallToStars(overall)} size={9} /></div>
          </div>
        </div>
        <div className="text-11 font-semibold mt-1.5" style={{ color: interest.color }}>{interest.text}</div>
        <div className="text-11 mt-2" style={{ color: C.inkSoft }}>{scoutComment(p)}</div>
        <div className="flex gap-3 mt-2 text-11 font-mono" style={{ color: C.inkSoft }}>
          <span>Anfall: {scoutRangeText(p.attack, scoutLevel)}</span>
          <span>Försvar: {scoutRangeText(p.defense, scoutLevel)}</span>
        </div>
        {uncertain && <div className="text-10 mt-1" style={{ color: C.gold }}>Osäkert intervall — en högre scoutnivå ger säkrare bedömningar.</div>}
        <div className="font-mono text-sm mt-2" style={{ color: C.inkSoft }}>{formatMoney(p.value)} · {formatMoney(p.wage)}/omg</div>
        {comparable.length > 0 && (
          <div className="mt-3 pt-3" style={{ borderTop: `1px dashed ${C.paperDim}` }}>
            <div className="text-10 uppercase tracking-wide font-semibold mb-1.5" style={{ color: C.inkSoft }}>Jämfört med er trupp ({POS_LABEL[p.pos]})</div>
            <div className="space-y-1">
              {comparable.map(s => (
                <div key={s.id} className="flex items-center justify-between text-11">
                  <span>{s.name}</span>
                  <span style={{ color: overallOf(s) >= overall ? C.inkSoft : C.win }}>{overallOf(s)}</span>
                </div>
              ))}
              <div className="flex items-center justify-between text-11 font-semibold">
                <span>{p.name} (scoutad)</span>
                <span style={{ color: C.gold }}>{overall}</span>
              </div>
            </div>
          </div>
        )}
        <div className="flex gap-2 mt-3">
          <button onClick={() => onNegotiate(p.id)} className="flex-1 py-2.5 rounded-xl text-xs font-semibold" style={{ background: C.turf, color: C.paper }}>Förhandla</button>
          <button onClick={onDismiss} className="flex-1 py-2.5 rounded-xl text-xs font-semibold" style={{ background: "transparent", border: `1px solid ${C.inkSoft}`, color: C.inkSoft }}>Avfärda</button>
        </div>
      </PaperCard>
    );
  }

  return (
    <div className="space-y-3">
      <PaperCard>
        <div className="text-xs uppercase tracking-wide font-semibold" style={{ color: C.inkSoft }}>Skicka ut scouten</div>
        <div className="text-11 mt-1" style={{ color: C.inkSoft }}>Ange kriterier — lämna ett fält tomt för att inte begränsa sökningen där. {scoutLevel ? `Er scout (nivå ${scoutLevel}) hittar bättre spelare, snabbare.` : "Utan anställd scout hittar ni bara okej spelare, och det tar längre tid."}</div>
      </PaperCard>
      <button onClick={onOpenClubBrowser} className="w-full py-2.5 rounded-xl text-xs font-semibold" style={{ background: C.gold, color: C.turfDeep }}>Bläddra klubbar & truppar direkt</button>
      <PaperCard>
        <div className="text-10 uppercase tracking-wide font-semibold mb-1.5" style={{ color: C.inkSoft }}>Snabbval — spelstil</div>
        <div className="flex gap-2 flex-wrap">
          {SCOUT_PRESETS.map(preset => (
            <button key={preset.key} onClick={() => applyPreset(preset)} className="px-3 py-1.5 rounded-full text-11 font-semibold" style={{ background: "rgba(201,154,62,0.15)", color: C.gold }}>{preset.label}</button>
          ))}
        </div>
        {savedProfiles && savedProfiles.length > 0 && (
          <>
            <div className="text-10 uppercase tracking-wide font-semibold mb-1.5 mt-3 pt-3" style={{ color: C.inkSoft, borderTop: `1px solid rgba(30,42,34,0.1)` }}>Sparade sökningar</div>
            <div className="flex gap-2 flex-wrap">
              {savedProfiles.map(sp => (
                <div key={sp.id} className="flex items-center gap-1 pl-3 pr-1 py-1 rounded-full" style={{ background: C.paperDim }}>
                  <button onClick={() => applyPreset({ posFilter: sp.posFilter, attrs: sp.attributeFilters || {}, ageMax: sp.ageMax, minPotential: sp.minPotential, interestedOnly: sp.interestedOnly })} className="text-11 font-semibold" style={{ color: C.ink }}>{sp.name}</button>
                  <button onClick={() => onDeleteProfile(sp.id)} className="text-11 px-1" style={{ color: C.loss }}>×</button>
                </div>
              ))}
            </div>
          </>
        )}
      </PaperCard>
      <PaperCard>
        <div className="text-10 uppercase tracking-wide font-semibold mb-1.5" style={{ color: C.inkSoft }}>Position</div>
        <div className="flex gap-2 flex-wrap">
          {[[null, "Valfri"], ...POS_ORDER.map(p => [p, POS_LABEL[p]])].map(([key, label]) => (
            <button key={label} onClick={() => { setPosFilter(key); if (key === "MV" || !key) setSideFilter(null); }} className="px-3 py-1.5 rounded-full text-11 font-semibold" style={posFilter === key ? { background: C.gold, color: C.turfDeep } : { background: C.paperDim, color: C.ink }}>{label}</button>
          ))}
        </div>
        {posFilter && posFilter !== "MV" && (
          <>
            <div className="text-10 uppercase tracking-wide font-semibold mb-1.5 mt-3 pt-3" style={{ color: C.inkSoft, borderTop: `1px solid rgba(30,42,34,0.1)` }}>Sida</div>
            <div className="flex gap-2 flex-wrap">
              {[[null, "Valfri"], ["left", "Vänster"], ["center", "Central"], ["right", "Höger"]].map(([key, label]) => (
                <button key={label} onClick={() => setSideFilter(key)} className="px-3 py-1.5 rounded-full text-11 font-semibold" style={sideFilter === key ? { background: C.gold, color: C.turfDeep } : { background: C.paperDim, color: C.ink }}>{label}</button>
              ))}
            </div>
          </>
        )}
      </PaperCard>
      <PaperCard>
        <div className="text-10 uppercase tracking-wide font-semibold mb-1.5" style={{ color: C.inkSoft }}>Åldersspann</div>
        <div className="grid grid-cols-2 gap-2">
          <input type="number" placeholder="Min" value={ageMin} onChange={e => setAgeMin(e.target.value)} style={inputStyle} />
          <input type="number" placeholder="Max" value={ageMax} onChange={e => setAgeMax(e.target.value)} style={inputStyle} />
        </div>
      </PaperCard>
      <PaperCard>
        <div className="text-10 uppercase tracking-wide font-semibold mb-1.5" style={{ color: C.inkSoft }}>Egenskaper</div>
        <div className="text-11 mb-2" style={{ color: C.inkSoft }}>Välj vilka egenskaper som ska ha ett minimikrav. Ovalda egenskaper påverkar inte sökningen.</div>
        <div className="flex flex-wrap gap-2 mb-2">
          {Object.entries(ATTR_LABELS_OUTFIELD).map(([key, label]) => {
            const active = !!activeAttrs[key];
            return (
              <button key={key} onClick={() => setActiveAttrs(a => ({ ...a, [key]: !a[key] }))} className="px-3 py-1.5 rounded-full text-11 font-semibold"
                style={active ? { background: C.gold, color: C.turfDeep } : { background: C.paperDim, color: C.ink }}>{label}</button>
            );
          })}
        </div>
        {Object.keys(activeAttrs).filter(k => activeAttrs[k]).length > 0 && (
          <div className="space-y-2">
            {Object.entries(ATTR_LABELS_OUTFIELD).filter(([key]) => activeAttrs[key]).map(([key, label]) => (
              <div key={key} className="flex items-center gap-2">
                <span className="text-11 w-24 shrink-0" style={{ color: C.inkSoft }}>{label} ≥</span>
                <input type="number" placeholder="Min. nivå (1–95)" value={attrMins[key] || ""} onChange={e => setAttrMins(a => ({ ...a, [key]: e.target.value }))} style={inputStyle} />
              </div>
            ))}
          </div>
        )}
      </PaperCard>
      <PaperCard>
        <div className="text-10 uppercase tracking-wide font-semibold mb-1.5" style={{ color: C.inkSoft }}>Ekonomiskt tak</div>
        <div className="grid grid-cols-2 gap-2">
          <input type="number" placeholder="Max marknadsvärde" value={maxValue} onChange={e => setMaxValue(e.target.value)} style={inputStyle} />
          <input type="number" placeholder="Max kontraktsvärde/omg" value={maxWage} onChange={e => setMaxWage(e.target.value)} style={inputStyle} />
        </div>
      </PaperCard>
      <PaperCard>
        <button onClick={() => setWantPotential(w => !w)} className="w-full flex items-center justify-between text-left">
          <div>
            <div className="text-xs font-semibold">Fokusera på potential</div>
            <div className="text-10 mt-0.5" style={{ color: C.inkSoft }}>Prioriterar unga talanger med hög utvecklingskurva framför färdiga spelare.</div>
          </div>
          <div style={{ width: 40, height: 22, borderRadius: 999, background: wantPotential ? C.gold : "rgba(0,0,0,0.1)", position: "relative", flexShrink: 0 }}>
            <div style={{ width: 18, height: 18, borderRadius: "50%", background: "#fff", position: "absolute", top: 2, left: wantPotential ? 20 : 2, transition: "left .15s ease" }} />
          </div>
        </button>
      </PaperCard>
      <PaperCard>
        <div className="text-xs font-semibold mb-1.5">Var ska scouten leta?</div>
        <div className="flex flex-wrap gap-1.5">
          <button onClick={() => setWorldPoolRegion(null)} className="px-2.5 py-1.5 rounded-lg text-9 font-semibold" style={!worldPoolRegion ? { background: C.gold, color: C.turfDeep } : { background: "rgba(30,42,34,0.08)", color: C.ink }}>Ligaspelare</button>
          {Object.entries(REGION_LABELS).map(([key, label]) => {
            const locked = scoutLevel < REGION_UNLOCK[key];
            return (
              <button key={key} onClick={() => !locked && setWorldPoolRegion(key)} disabled={locked} className="px-2.5 py-1.5 rounded-lg text-9 font-semibold flex items-center gap-1" style={worldPoolRegion === key ? { background: C.gold, color: C.turfDeep } : locked ? { background: "rgba(30,42,34,0.05)", color: C.inkSoft, opacity: 0.7 } : { background: "rgba(30,42,34,0.08)", color: C.ink }}>
                {locked && <Lock size={9} />}{label}
              </button>
            );
          })}
        </div>
        {worldPoolRegion && <div className="text-10 mt-1.5" style={{ color: C.inkSoft }}>Söker bland de faktiska spelarna i Övriga världen-poolen för {REGION_LABELS[worldPoolRegion]} — samma spelare som syns under Spelare-fliken.</div>}
      </PaperCard>
      <PaperCard>
        <button onClick={() => setWantInterested(w => !w)} className="w-full flex items-center justify-between text-left">
          <div>
            <div className="text-xs font-semibold">Intresserad av din klubb</div>
            <div className="text-10 mt-0.5" style={{ color: C.inkSoft }}>Visar bara spelare som verkar öppna för en flytt till er — enklare (men dyrare) att övertyga de som är ovilliga.</div>
          </div>
          <div style={{ width: 40, height: 22, borderRadius: 999, background: wantInterested ? C.gold : "rgba(0,0,0,0.1)", position: "relative", flexShrink: 0 }}>
            <div style={{ width: 18, height: 18, borderRadius: "50%", background: "#fff", position: "absolute", top: 2, left: wantInterested ? 20 : 2, transition: "left .15s ease" }} />
          </div>
        </button>
      </PaperCard>
      <div className="flex gap-2">
        <button onClick={() => onStart(currentFilters())} className="flex-1 py-2.5 rounded-xl font-display text-sm tracking-wide" style={{ background: C.gold, color: C.turfDeep }}>Skicka ut scouten</button>
        <button onClick={() => setSavingProfileName(savingProfileName === null ? "" : null)} className="py-2.5 px-4 rounded-xl text-xs font-semibold" style={{ background: "transparent", border: `1px solid ${C.inkSoft}`, color: C.inkSoft }}>Spara sökning</button>
      </div>
      {savingProfileName !== null && (
        <PaperCard>
          <div className="text-10 uppercase tracking-wide font-semibold mb-1.5" style={{ color: C.inkSoft }}>Namn på sökningen</div>
          <div className="flex gap-2">
            <input type="text" value={savingProfileName} onChange={e => setSavingProfileName(e.target.value)} placeholder="T.ex. Snabb kant" style={inputStyle} />
            <button onClick={() => { if (savingProfileName.trim()) { onSaveProfile({ name: savingProfileName.trim(), ...currentFilters() }); setSavingProfileName(null); } }} className="py-2 px-4 rounded-xl text-xs font-semibold shrink-0" style={{ background: C.turf, color: C.paper }}>Spara</button>
          </div>
        </PaperCard>
      )}
    </div>
  );
}


function LoanOfferCard({ o, onAccept, onDecline }) {
  const [wageSharePct, setWageSharePct] = useState(null);
  const overall = overallOf(o.player);
  return (
    <PaperCard>
      <div className="flex items-center gap-3">
        <div style={{ position: "relative", width: 36, height: 36, flexShrink: 0 }}>
          <PlayerAvatar player={o.player} size={36} />
          <div style={{ position: "absolute", bottom: -4, right: -4 }}><OverallBadge overall={overall} size={18} /></div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm truncate">{o.player.name}</div>
          <div className="text-11" style={{ color: C.inkSoft }}>{POS_LABEL[o.player.pos]} · Lån från {o.fromClubName} · {o.weeksLeft} omgångar</div>
          <div className="text-10 mt-0.5 font-mono" style={{ color: C.inkSoft }}>Lön: {formatMoney(o.player.wage)}/omg</div>
        </div>
      </div>
      <div className="text-10 uppercase tracking-wide font-semibold mt-2.5 mb-1" style={{ color: C.inkSoft }}>Hur mycket av lönen tar ni på er?</div>
      <div className="grid grid-cols-4 gap-1.5">
        {[0, 25, 50, 100].map(pct => (
          <button key={pct} onClick={() => setWageSharePct(pct)} className="py-1.5 rounded-lg text-9 font-semibold" style={wageSharePct === pct ? { background: C.gold, color: C.turfDeep } : { background: C.paperDim, color: C.ink }}>{pct}%</button>
        ))}
      </div>
      {wageSharePct !== null && <div className="text-10 mt-1.5" style={{ color: C.inkSoft }}>Er del: <span className="font-mono font-semibold" style={{ color: C.ink }}>{formatMoney(Math.round(o.player.wage * wageSharePct / 100))}/omg</span> {wageSharePct < 100 && `· ${o.fromClubName} betalar resten`}</div>}
      <div className="flex gap-2 mt-2.5">
        <button onClick={() => onAccept(o.id, wageSharePct ?? 100)} disabled={wageSharePct === null} className="flex-1 py-2 rounded-xl text-xs font-semibold" style={wageSharePct !== null ? { background: C.turf, color: C.paper } : { background: C.paperDim, color: C.inkSoft, opacity: 0.6 }}>Ta emot på lån</button>
        <button onClick={onDecline} className="flex-1 py-2 rounded-xl text-xs font-semibold" style={{ background: "transparent", border: `1px solid ${C.inkSoft}`, color: C.inkSoft }}>Tacka nej</button>
      </div>
    </PaperCard>
  );
}
function PlayerSearchPanel({ clubs, squad, userClubId, worldPool, scoutedPlayerIds, onSelectClubPlayer, onSelectWorldPoolPlayer }) {
  const [query, setQuery] = useState("");
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    const out = [];
    // Own squad
    squad.forEach(p => { if (p.name.toLowerCase().includes(q)) out.push({ player: p, kind: "own", clubName: "Din trupp" }); });
    // Every other club's first team + academy
    Object.values(clubs).forEach(c => {
      if (c.id === userClubId) return;
      (c.squad || []).forEach(p => { if (p.name.toLowerCase().includes(q)) out.push({ player: p, kind: "club", clubId: c.id, clubName: c.name }); });
      (c.youthSquad || []).forEach(p => { if (p.name.toLowerCase().includes(q)) out.push({ player: p, kind: "academy", clubId: c.id, clubName: `${c.name} (akademi)` }); });
    });
    // World-pool players — only ones you've actually scouted, matching the fog-of-war everywhere else
    Object.entries(worldPool || {}).forEach(([region, players]) => {
      (players || []).forEach(p => {
        if (!p.name.toLowerCase().includes(q)) return;
        if (!isPlayerScouted(p, scoutedPlayerIds, userClubId)) return;
        out.push({ player: p, kind: "worldpool", region, clubName: REGION_LABELS[region] || "Övriga världen" });
      });
    });
    return out.slice(0, 30);
  }, [query, clubs, squad, userClubId, worldPool, scoutedPlayerIds]);

  return (
    <div className="space-y-2.5">
      <PaperCard>
        <div className="text-xs font-semibold mb-1.5">Sök spelare</div>
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Skriv ett namn..." className="w-full px-3 py-2 rounded-xl text-sm" style={{ background: C.paper, color: C.ink, border: `1px solid ${C.paperDim}` }} />
        <div className="text-9 mt-1.5" style={{ color: C.inkSoft }}>Söker bland alla klubbars A-lag och akademier, samt Övriga världen-spelare du redan scoutat.</div>
      </PaperCard>
      {query.trim().length >= 2 && results.length === 0 && (
        <PaperCard><div className="text-sm text-center py-3" style={{ color: C.inkSoft }}>Inga spelare hittades. Ej scoutade Övriga världen-spelare syns inte här förrän du scoutat dem.</div></PaperCard>
      )}
      {results.map(({ player: p, kind, clubId, clubName, region }) => {
        const overall = overallOf(p);
        return (
          <button key={p.id + kind} onClick={() => { if (kind === "club" || kind === "academy") onSelectClubPlayer(clubId); else if (kind === "worldpool") onSelectWorldPoolPlayer(region); }} disabled={kind === "own"} className="w-full flex items-center gap-2.5 text-left" style={{ opacity: kind === "own" ? 0.7 : 1 }}>
            <PaperCard style={{ padding: 10, width: "100%" }}>
              <div className="flex items-center gap-2.5">
                <PlayerAvatar player={p} size={28} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold truncate">{p.name}</div>
                  <div className="text-9" style={{ color: C.inkSoft }}>{POS_LABEL[p.pos]} ({specificPositionLabel(p.specificPosition)}) · {p.age} år · {clubName}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-mono text-sm font-bold">{overall}</div>
                  {kind === "own" && <div className="text-9 font-semibold" style={{ color: C.gold }}>Din spelare</div>}
                </div>
              </div>
            </PaperCard>
          </button>
        );
      })}
    </div>
  );
}
function TransfersTab({ market, budget, scoutingLevel, kontakterLevel, youthSquad, youthMarket, round, season, clubs, reputation, incomingOffers, clubGoodwill, blacklistedPlayers, onNegotiationFailed, onFinalizeTransfer, onBuyYouth, onRespondOffer, scoutMission, scoutLevel, onStartScoutMission, onDismissScoutMission, onCancelScoutMission, onFinalizeScoutSignee, loanOffers, onAcceptLoan, onDeclineLoan, difficulty, squad, savedScoutProfiles, onSaveScoutProfile, onDeleteScoutProfile, userClubId, leagueId, onFinalizeClubBrowseTransfer, onSubViewChange, partnerClubId, onInstantLoanFromPartner, loanRequests, onRespondLoanRequest, transferHistory, scoutedPlayerIds, pendingPlayerScouts, onScoutPlayer, pendingScoutReveal, onClearScoutReveal, worldPool }) {
  const [showClubBrowser, setShowClubBrowser] = useState(false);
  const [showOwnHistory, setShowOwnHistory] = useState(false);
  const [showGlobalTransfers, setShowGlobalTransfers] = useState(false);
  const [subView, setSubView] = useState("spelare");
  const [region, setRegion] = useState("europa");
  const [negotiatingId, setNegotiatingId] = useState(null);
  const [negotiatingScout, setNegotiatingScout] = useState(null);
  const [browseTargetClubId, setBrowseTargetClubId] = useState(null);
  useEffect(() => {
    if (!pendingScoutReveal) return;
    setSubView("spelare");
    if (pendingScoutReveal.region) {
      setRegion(pendingScoutReveal.region);
      setShowClubBrowser(false);
    } else if (pendingScoutReveal.clubId) {
      setShowClubBrowser(true);
      setBrowseTargetClubId(pendingScoutReveal.clubId);
    }
    onClearScoutReveal?.();
  }, [pendingScoutReveal]);
  useEffect(() => { onSubViewChange?.(showClubBrowser || showOwnHistory || showGlobalTransfers || !!negotiatingId || !!negotiatingScout); }, [showClubBrowser, showOwnHistory, showGlobalTransfers, negotiatingId, negotiatingScout]);
  const currentTurn = season * 38 + round;
  const list = market[region].filter(p => !blacklistedPlayers?.[p.id] || blacklistedPlayers[p.id] <= currentTurn);
  const locked = scoutingLevel < REGION_UNLOCK[region];
  const discount = 1 - (kontakterLevel - 1) * 0.04;
  const windowOpen = transferWindowOpen(round);
  const closesIn = roundsUntilWindowCloses(round);
  const opensIn = roundsUntilWindowOpens(round);

  if (showOwnHistory) return <OwnTransferHistoryView transferHistory={transferHistory} userClubId={userClubId} currentSeason={season} onBack={() => setShowOwnHistory(false)} />;
  if (showGlobalTransfers) return <GlobalTransfersView transferHistory={transferHistory} userClubId={userClubId} onBack={() => setShowGlobalTransfers(false)} />;
  if (showClubBrowser) return <ClubSquadBrowserView clubs={clubs} userClubId={userClubId} homeLeagueId={leagueId} budget={budget} reputation={reputation} difficulty={difficulty} clubGoodwill={clubGoodwill} partnerClubId={partnerClubId} onNegotiationFailed={onNegotiationFailed} onFinalize={onFinalizeClubBrowseTransfer} onInstantLoanFromPartner={onInstantLoanFromPartner} onBack={() => setShowClubBrowser(false)} scoutedPlayerIds={scoutedPlayerIds} pendingPlayerScouts={pendingPlayerScouts} onScoutPlayer={onScoutPlayer} round={round} initialClubId={browseTargetClubId} transferHistory={transferHistory} />;

  if (negotiatingScout && scoutMission?.complete) {
    const scoutResults = scoutMission.results || (scoutMission.result ? [scoutMission.result] : []);
    const scoutPlayer = scoutResults.find(c => c.id === negotiatingScout);
    if (scoutPlayer) {
      const scoutClub = clubs[scoutPlayer.clubId];
      return <NegotiationView player={scoutPlayer} club={scoutClub ? { ...scoutClub, goodwill: clubGoodwill?.[scoutClub.id] ?? 50 } : syntheticFreeAgentClub(scoutPlayer)} region="scout" budget={budget} reputation={reputation} difficulty={difficulty} userClubId={userClubId} clubs={clubs} scoutedPlayerIds={[scoutPlayer.id]}
        onNegotiationFailed={onNegotiationFailed}
        onBack={() => setNegotiatingScout(null)} onFinalize={(r, p, price, wage, details) => { onFinalizeScoutSignee(p, price, wage, details); setNegotiatingScout(null); }} />;
    }
  }

  const negotiatingPlayer = negotiatingId ? list.find(p => p.id === negotiatingId) : null;
  if (negotiatingPlayer) {
    const negoClub = clubs[negotiatingPlayer.clubId];
    return <NegotiationView player={negotiatingPlayer} club={negoClub ? { ...negoClub, goodwill: clubGoodwill?.[negoClub.id] ?? 50 } : syntheticFreeAgentClub(negotiatingPlayer)} region={region} budget={budget} reputation={reputation} difficulty={difficulty} userClubId={userClubId} clubs={clubs} scoutedPlayerIds={scoutedPlayerIds}
      onNegotiationFailed={onNegotiationFailed}
      onBack={() => setNegotiatingId(null)} onFinalize={(r, p, price, wage, details) => { onFinalizeTransfer(r, p, price, wage, details); setNegotiatingId(null); }} />;
  }

  return (
    <div className="rise-in space-y-3">
      <PaperCard style={{ background: windowOpen ? (closesIn <= 2 ? "rgba(180,68,59,0.12)" : C.paper) : "rgba(0,0,0,0.25)" }}>
        {windowOpen ? (
          <div className="text-sm font-semibold" style={{ color: closesIn <= 2 ? C.loss : C.ink }}>
            Transferfönstret är öppet{closesIn <= 2 ? ` — deadline day om ${closesIn} omgång${closesIn === 1 ? "" : "ar"}!` : ` (stänger om ${closesIn} omgångar)`}
          </div>
        ) : (
          <div className="text-sm font-semibold" style={{ color: C.paperDim }}>Transferfönstret är stängt. Öppnar igen om {opensIn} omgångar.</div>
        )}
      </PaperCard>
      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => setShowOwnHistory(true)} className="py-2 rounded-xl text-11 font-semibold" style={{ background: "transparent", border: `1px solid ${C.paperDim}`, color: C.paperDim }}>📋 Vår transferhistorik</button>
        <button onClick={() => setShowGlobalTransfers(true)} className="py-2 rounded-xl text-11 font-semibold" style={{ background: "transparent", border: `1px solid ${C.paperDim}`, color: C.paperDim }}>🌍 Alla transfers</button>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-0.5">
        {[["spelare", "Spelare"], ["ungdom", "Ungdom"], ["scout", "Scout"], ["sok", "🔍 Sök"], ["bud", `Bud${(incomingOffers.length + (loanOffers?.length || 0) + (loanRequests?.length || 0)) ? ` (${incomingOffers.length + (loanOffers?.length || 0) + (loanRequests?.length || 0)})` : ""}`]].map(([key, label]) => (
          <button key={key} onClick={() => setSubView(key)} className="shrink-0 px-3.5 py-2 rounded-xl text-11 font-semibold" style={subView === key ? { background: C.gold, color: C.turfDeep } : { background: "rgba(255,255,255,0.08)", color: C.paperDim }}>{label}</button>
        ))}
      </div>
      <div className="flex items-center gap-2 px-1" style={{ color: C.paperDim }}>
        <Landmark size={14} /><span className="text-xs">Tillgänglig budget: <span className="font-mono font-semibold">{formatMoney(budget)}</span></span>
      </div>

      {subView === "spelare" ? (
        <>
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {Object.entries(REGION_LABELS).map(([key, label]) => (
              <button key={key} onClick={() => setRegion(key)} className="px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap flex items-center gap-1" style={region === key ? { background: C.gold, color: C.turfDeep } : { background: "rgba(255,255,255,0.08)", color: C.paperDim }}>
                {scoutingLevel < REGION_UNLOCK[key] && <Lock size={10} />}{label}
              </button>
            ))}
          </div>
          {locked ? (
            <PaperCard><div className="text-sm text-center py-3" style={{ color: C.inkSoft }}>Kräver Scoutnätverk nivå {REGION_UNLOCK[region]}. Uppgradera i Klubb-fliken.</div></PaperCard>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {list.map(p => {
                const owningClub = clubs[p.clubId];
                const pOverall = overallOf(p);
                const isDerby = owningClub && owningClub.rivalId === userClubId;
                const rel = owningClub ? clubRelationshipLabel(clubGoodwill?.[owningClub.id], isDerby) : null;
                const isWorldPool = !!p.region;
                const scouted = isPlayerScouted(p, scoutedPlayerIds, userClubId);
                const pendingScout = (pendingPlayerScouts || []).find(s => s.playerId === p.id);
                const [ovLo, ovHi] = scouted ? [pOverall, pOverall] : fuzzyStatRange(pOverall, p.id, "overall", isWorldPool);
                const [potLo, potHi] = scouted ? [p.potential, p.potential] : fuzzyStatRange(p.potential ?? pOverall, p.id, "potential", isWorldPool);
                return (
                  <PaperCard key={p.id} style={{ padding: 10 }}>
                    <div className="flex items-center gap-2.5">
                      <div style={{ position: "relative", width: 30, height: 30, flexShrink: 0 }}>
                        <PlayerAvatar player={p} size={30} />
                        {scouted && <div style={{ position: "absolute", bottom: -4, right: -4 }}><OverallBadge overall={pOverall} size={16} /></div>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-xs truncate">{p.name}</div>
                        <div className="font-mono text-9 mt-0.5 truncate" style={{ color: C.inkSoft }}>{POS_LABEL[p.pos]} ({specificPositionLabel(p.specificPosition)}) · {p.age} år</div>
                        <div className="font-mono text-9 truncate" style={{ color: C.inkSoft }}>{owningClub ? owningClub.name : "Fri agent"}</div>
                        {rel && <div className="text-9 font-semibold truncate" style={{ color: rel.color }}>{isDerby ? "🔥 " : ""}{rel.text}</div>}
                        {p.rivalInterest && <div className="text-9 font-semibold truncate" style={{ color: C.loss }}>👀 {p.rivalInterest} bevakar också spelaren</div>}
                      </div>
                    </div>
                    <div className="flex items-center justify-between mt-1.5">
                      {scouted ? <StarRating rating={overallToStars(pOverall)} size={7} /> : <div className="text-9 font-semibold" style={{ color: C.gold }}>Overall {ovLo}–{ovHi} · Pot. {potLo}–{potHi}</div>}
                      <div className="font-mono text-11 font-semibold shrink-0">{formatMoney(p.value)}</div>
                    </div>
                    {scouted && (
                      <div className="grid grid-cols-2 gap-1.5 mt-1.5">
                        <AttributeGridCard attrKey="shooting" label="Anfall" value={p.attack} icon="🎯" />
                        <AttributeGridCard attrKey="defending" label="Försvar" value={p.defense} icon="🛡️" />
                      </div>
                    )}
                    {!scouted && (
                      pendingScout ? (
                        <div className="mt-2 w-full py-1.5 rounded-xl text-9 font-semibold text-center" style={{ background: C.paperDim, color: C.inkSoft }}>🔍 Scoutas — {Math.max(1, pendingScout.dueRound - round)} omg kvar</div>
                      ) : (
                        <button onClick={() => onScoutPlayer(p.id, isWorldPool ? p.region : null, null)} className="mt-2 w-full py-1.5 rounded-xl text-9 font-semibold" style={{ background: "transparent", border: `1px solid ${C.gold}`, color: "#B8862E" }}>🔍 Scouta spelaren</button>
                      )
                    )}
                    <button onClick={() => setNegotiatingId(p.id)} disabled={!windowOpen} className="mt-1.5 w-full py-1.5 rounded-xl text-9 font-semibold" style={windowOpen ? { background: C.turf, color: C.paper } : { background: C.paperDim, color: C.inkSoft, opacity: 0.6 }}>{windowOpen ? "Förhandla" : "Fönstret är stängt"}</button>
                  </PaperCard>
                );
              })}
            </div>
          )}
        </>
      ) : subView === "ungdom" ? (
        <>
          <div className="text-xs" style={{ color: C.paperDim }}>Din egen akademi: {youthSquad.length}/8 spelare. Hantera dem i Klubb-fliken.</div>
          <div className="text-xs uppercase tracking-wide font-semibold px-1 pt-1" style={{ color: C.paperDim }}>Andra klubbars ungdomstalanger</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {youthMarket.map(p => {
              const price = Math.round(p.value * discount);
              const affordable = budget >= price;
              const overall = overallOf(p);
              return (
                <PaperCard key={p.id} style={{ padding: 10 }}>
                  <div className="flex items-center gap-2.5">
                    <div style={{ position: "relative", width: 30, height: 30, flexShrink: 0 }}>
                      <PlayerAvatar player={p} size={30} />
                      <div style={{ position: "absolute", bottom: -4, right: -4 }}><OverallBadge overall={overall} size={16} /></div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-xs truncate">{p.name}</div>
                      <div className="font-mono text-9 mt-0.5" style={{ color: C.inkSoft }}>{POS_LABEL[p.pos]} ({specificPositionLabel(p.specificPosition)}) · {p.age} år</div>
                      <div className="flex gap-0.5 mt-0.5">{[1,2,3,4,5].map(n=><Star key={n} size={8} fill={n<=potentialStars(p.potential)?C.gold:"none"} color={n<=potentialStars(p.potential)?C.gold:C.paperDim}/>)}</div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-1.5">
                    <div className="mt-0.5"><StarRating rating={overallToStars(overall)} size={7} /></div>
                    <div className="text-right">
                      {discount < 1 && <div className="font-mono text-9 line-through" style={{ color: C.inkSoft }}>{formatMoney(p.value)}</div>}
                      <div className="font-mono text-11 font-semibold">{formatMoney(price)}</div>
                    </div>
                  </div>
                  <button onClick={() => onBuyYouth(p)} disabled={!affordable || youthSquad.length>=8} className="mt-2 w-full py-1.5 rounded-xl text-9 font-semibold" style={(affordable && youthSquad.length<8) ? { background: C.turf, color: C.paper } : { background: C.paperDim, color: C.inkSoft, opacity: 0.6 }}>{youthSquad.length>=8?"Akademin är full":affordable?"Värva till akademin":"Otillräcklig budget"}</button>
                </PaperCard>
              );
            })}
          </div>
        </>
      ) : subView === "scout" ? (
        <ScoutMissionPanel scoutMission={scoutMission} scoutLevel={scoutLevel} budget={budget} squad={squad} savedProfiles={savedScoutProfiles}
          onStart={onStartScoutMission} onDismiss={onDismissScoutMission} onCancel={onCancelScoutMission} onNegotiate={id => setNegotiatingScout(id)} onSaveProfile={onSaveScoutProfile} onDeleteProfile={onDeleteScoutProfile} onOpenClubBrowser={() => setShowClubBrowser(true)} reputation={reputation} division={clubs[userClubId]?.division || 1} />
      ) : subView === "sok" ? (
        <PlayerSearchPanel clubs={clubs} squad={squad} userClubId={userClubId} worldPool={worldPool} scoutedPlayerIds={scoutedPlayerIds}
          onSelectClubPlayer={clubId => { setShowClubBrowser(true); setBrowseTargetClubId(clubId); }}
          onSelectWorldPoolPlayer={region => { setRegion(region); setSubView("spelare"); }} />
      ) : (
        <>
          {loanOffers && loanOffers.length > 0 && (
            <>
              <div className="text-xs uppercase tracking-wide font-semibold px-1" style={{ color: C.paperDim }}>Inkommande lån</div>
              <div className="space-y-2 mb-3">
                {loanOffers.map(o => <LoanOfferCard key={o.id} o={o} onAccept={onAcceptLoan} onDecline={() => onDeclineLoan(o.id)} />)}
              </div>
            </>
          )}
          <div className="text-xs uppercase tracking-wide font-semibold px-1" style={{ color: C.paperDim }}>Inkommande bud</div>
          {incomingOffers.length === 0 && <PaperCard><div className="text-sm text-center py-3" style={{ color: C.inkSoft }}>Inga bud just nu. Andra klubbar hör av sig när fönstret öppnar.</div></PaperCard>}
          <div className="space-y-2">
            {incomingOffers.map(o => (
              <PaperCard key={o.id}>
                <div className="text-sm"><span className="font-semibold">{o.buyerName}</span> bjuder <span className="font-mono font-semibold">{formatMoney(o.offer)}</span> för <span className="font-semibold">{o.playerName}</span>.</div>
                <div className="flex gap-2 mt-2">
                  <button onClick={() => onRespondOffer(o.id, "accept")} className="flex-1 py-2 rounded-xl text-xs font-semibold" style={{ background: C.turf, color: C.paper }}>Acceptera</button>
                  <button onClick={() => onRespondOffer(o.id, "counter")} className="flex-1 py-2 rounded-xl text-xs font-semibold" style={{ background: C.gold, color: C.turfDeep }}>Begär mer</button>
                  <button onClick={() => onRespondOffer(o.id, "reject")} className="flex-1 py-2 rounded-xl text-xs font-semibold" style={{ background: "transparent", border: `1px solid ${C.loss}`, color: C.loss }}>Avvisa</button>
                </div>
              </PaperCard>
            ))}
          </div>
          {loanRequests && loanRequests.length > 0 && (
            <>
              <div className="text-xs uppercase tracking-wide font-semibold px-1 pt-1" style={{ color: C.paperDim }}>Lånförfrågningar på era spelare</div>
              <div className="space-y-2">
                {loanRequests.map(r => (
                  <PaperCard key={r.id}>
                    <div className="text-sm"><span className="font-semibold">{r.borrowerName}</span> vill låna <span className="font-semibold">{r.playerName}</span> i {r.weeks} omgångar.</div>
                    <div className="flex gap-2 mt-2">
                      <button onClick={() => onRespondLoanRequest(r.id, "accept")} className="flex-1 py-2 rounded-xl text-xs font-semibold" style={{ background: C.turf, color: C.paper }}>Acceptera</button>
                      <button onClick={() => onRespondLoanRequest(r.id, "decline")} className="flex-1 py-2 rounded-xl text-xs font-semibold" style={{ background: "transparent", border: `1px solid ${C.loss}`, color: C.loss }}>Avvisa</button>
                    </div>
                  </PaperCard>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

const CATEGORY_META = {};

function LevelDots({ level, max = 5 }) {
  return <div className="flex gap-1">{Array.from({ length: max }, (_, i) => i + 1).map(n => <span key={n} className="w-3.5 h-3.5 rounded-full" style={{ background: n <= level ? C.gold : "rgba(0,0,0,0.12)" }} />)}</div>;
}

function BigUpgradeCard({ title, desc, level, cost, canAfford, onUpgrade }) {
  const maxed = level >= 5;
  return (
    <PaperCard>
      <div className="flex items-center justify-between"><div className="font-semibold text-sm">{title}</div><LevelDots level={level} /></div>
      <div className="text-xs mt-1.5" style={{ color: C.inkSoft }}>{desc}</div>
      <button onClick={onUpgrade} disabled={maxed || !canAfford} className="mt-2 w-full py-2 rounded-xl text-xs font-semibold" style={!maxed && canAfford ? { background: C.turf, color: C.paper } : { background: C.paperDim, color: C.inkSoft, opacity: 0.6 }}>{maxed ? "Max nivå" : `Uppgradera (${formatMoney(cost)})`}</button>
    </PaperCard>
  );
}

function PartCard({ title, desc, level, max, cost, canAfford, onUpgrade, tierName }) {
  const maxed = level >= max;
  return (
    <PaperCard>
      <div className="flex items-center justify-between"><div className="font-semibold text-sm">{title}</div><LevelDots level={level} max={max} /></div>
      {tierName && <div className="text-11 font-semibold mt-0.5" style={{ color: C.gold }}>{tierName}</div>}
      <div className="text-xs mt-1.5" style={{ color: C.inkSoft }}>{desc}</div>
      <button onClick={onUpgrade} disabled={maxed || !canAfford} className="mt-2 w-full py-2 rounded-xl text-xs font-semibold" style={!maxed && canAfford ? { background: C.turf, color: C.paper } : { background: C.paperDim, color: C.inkSoft, opacity: 0.6 }}>{maxed ? "Max nivå" : `Bygg ut (${formatMoney(cost)})`}</button>
    </PaperCard>
  );
}

const BP = { bg: "#0E2A4A", line: "#6FA8DC", lineDim: "rgba(111,168,220,0.35)", grid: "rgba(111,168,220,0.12)", ink: "#EAF3FB", inkDim: "#9FC1E0" };
function IllustratedArena({ arenaStands, selectedStand, onSelectStand, buildingStand, buildPct, capacity }) {
  const levelColor = (lvl) => {
    const shades = ["#233A2F", "#2C4739", "#345043", "#3E5C4A", "#4A6E58", "#5A8067"];
    return shades[clamp(lvl, 0, 5)];
  };
  const Stand = ({ id, x, y, w, h, labelX, labelY }) => {
    const level = arenaStands[id] || 0;
    const isEmpty = level <= 0 && buildingStand !== id;
    const isBuilding = buildingStand === id;
    const isSelected = selectedStand === id;
    const fill = isEmpty ? "rgba(111,168,220,0.05)" : levelColor(level);
    const stroke = isSelected ? C.gold : isEmpty ? "rgba(111,168,220,0.4)" : "#1A2E26";
    return (
      <g onClick={() => onSelectStand(id)} style={{ cursor: "pointer" }}>
        <rect x={x} y={y} width={w} height={h} rx="3" fill={fill} stroke={stroke} strokeWidth={isSelected ? 2 : 1.3} strokeDasharray={isEmpty ? "4 3" : "none"} />
        {isBuilding && <rect x={x} y={y} width={(w * buildPct) / 100} height={h} rx="3" fill={C.gold} opacity="0.5" style={{ transition: "width .5s ease" }} />}
        <text x={labelX} y={labelY} fontFamily="sans-serif" fontSize="8" fontWeight="700" fill={isEmpty ? "rgba(238,234,224,0.55)" : "#EEEAE0"} textAnchor="middle" letterSpacing="1">{STAND_NAMES[id].split(" ")[0].toUpperCase()}</text>
        {isEmpty && <text x={labelX} y={labelY + 10} fontFamily="sans-serif" fontSize="6.5" fill="rgba(238,234,224,0.4)" textAnchor="middle">+ Bygg läktare</text>}
        {!isEmpty && !isBuilding && <text x={labelX} y={labelY + 10} fontFamily="sans-serif" fontSize="6.5" fill="rgba(238,234,224,0.6)" textAnchor="middle">{"★".repeat(level)}{"☆".repeat(5 - level)}</text>}
        {isBuilding && <text x={labelX} y={labelY + 10} fontFamily="monospace" fontSize="7" fontWeight="700" fill={C.gold} textAnchor="middle">{Math.round(buildPct)}%</text>}
      </g>
    );
  };
  return (
    <svg width="100%" height="260" viewBox="0 0 380 320">
      <rect x="0" y="0" width="380" height="320" fill="#0F1E19" rx="12" />
      <Stand id="north" x={70} y={30} w={240} h={42} labelX={190} labelY={52} />
      <Stand id="south" x={70} y={248} w={240} h={42} labelX={190} labelY={270} />
      <Stand id="west" x={30} y={90} w={34} h={140} labelX={47} labelY={160} />
      <Stand id="east" x={316} y={90} w={34} h={140} labelX={333} labelY={160} />

      <rect x="90" y="90" width="200" height="140" fill="#2E7D5B" stroke="#EEEAE0" strokeWidth="1.5" opacity="0.95" />
      <line x1="190" y1="90" x2="190" y2="230" stroke="#EEEAE0" strokeWidth="1.2" opacity="0.7" />
      <circle cx="190" cy="160" r="22" fill="none" stroke="#EEEAE0" strokeWidth="1.2" opacity="0.7" />
      <circle cx="190" cy="160" r="1.6" fill="#EEEAE0" opacity="0.7" />
      <rect x="90" y="130" width="16" height="60" fill="none" stroke="#EEEAE0" strokeWidth="1.2" opacity="0.7" />
      <rect x="274" y="130" width="16" height="60" fill="none" stroke="#EEEAE0" strokeWidth="1.2" opacity="0.7" />

      <rect x="46" y="55" width="4" height="20" fill={C.gold} />
      <circle cx="48" cy="50" r="6" fill={C.goldSoft} />
      <rect x="330" y="55" width="4" height="20" fill={C.gold} />
      <circle cx="332" cy="50" r="6" fill={C.goldSoft} />
      <rect x="46" y="248" width="4" height="20" fill={C.gold} />
      <circle cx="48" cy="272" r="6" fill={C.goldSoft} />
      <rect x="330" y="248" width="4" height="20" fill={C.gold} />
      <circle cx="332" cy="272" r="6" fill={C.goldSoft} />

      <rect x="120" y="140" width="140" height="42" rx="8" fill="#0F1E19" opacity="0.55" />
      <text x="190" y="167" fontFamily="Georgia, serif" fontSize="26" fontWeight="700" fill={C.goldSoft} textAnchor="middle">{capacity.toLocaleString("sv-SE")}</text>
      <text x="190" y="179" fontFamily="sans-serif" fontSize="8" fill="#c7d2cb" textAnchor="middle" letterSpacing="1.2">ÅSKÅDARE</text>
    </svg>
  );
}
function ArenaDetail({ club, dev, budget, arenaStands, arenaFacilities, arenaConstruction, onUpgrade, onUpgradePart, onStartConstruction, ticketPrice, onSetTicketPrice, recentMatchFinances, onBack }) {
  const [selectedStand, setSelectedStand] = useState(null);
  const capacity = arenaCapacityOf(dev, arenaStands);
  const buildingStand = arenaConstruction?.stand;
  const buildPct = arenaConstruction ? (arenaConstruction.roundsElapsed / arenaConstruction.roundsTotal) * 100 : 0;
  return (
    <div className="rise-in space-y-2.5">
      <button onClick={onBack} style={{ position: "fixed", bottom: 14, right: 14, display: "inline-block", color: "rgba(255,255,255,0.85)", background: "rgba(19,34,29,0.88)", padding: "6px 13px", borderRadius: 999, fontSize: 11, fontWeight: 600, zIndex: 50, backdropFilter: "blur(4px)", boxShadow: "0 2px 10px rgba(0,0,0,0.35)" }}>← Bakåt</button>
      <PaperCard>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-wide font-semibold" style={{ color: C.inkSoft }}>Arenan</div>
            <div className="font-display text-xl mt-1"><AnimatedNumber value={capacity} format={v => Math.round(v).toLocaleString("sv-SE")} /> åskådare</div>
          </div>
          {arenaConstruction && (
            <div className="text-right">
              <div className="text-9 uppercase tracking-wide font-semibold flex items-center gap-1 justify-end" style={{ color: C.gold }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.gold, display: "inline-block", animation: "craneBlink 1s ease-in-out infinite" }} />
                Ombyggnad pågår
              </div>
              <div className="text-11 font-mono" style={{ color: C.inkSoft }}>{arenaConstruction.roundsElapsed}/{arenaConstruction.roundsTotal} omg</div>
              <div className="text-10 font-mono font-semibold" style={{ color: C.win }}>+{constructionSeatDelta(arenaConstruction).toLocaleString("sv-SE")} platser</div>
            </div>
          )}
        </div>
        <div className="mt-4 rounded-2xl overflow-hidden">
          <IllustratedArena arenaStands={arenaStands} selectedStand={selectedStand} onSelectStand={setSelectedStand} buildingStand={buildingStand} buildPct={buildPct} capacity={capacity} />
        </div>
        <div className="text-11 mt-3 text-center" style={{ color: C.inkSoft }}>Tryck på en läktare för att bygga ut den.</div>
      </PaperCard>

      <PaperCard>
        <div className="text-10 uppercase tracking-wide font-semibold mb-1.5" style={{ color: C.inkSoft }}>Biljettpris</div>
        <div className="grid grid-cols-3 gap-2">
          {Object.entries(TICKET_TIERS).map(([key, tier]) => (
            <button key={key} onClick={() => onSetTicketPrice(key)} className="text-center py-2 rounded-xl border" style={ticketPrice === key ? { background: C.turf, color: C.paper, borderColor: C.turf } : { background: "transparent", color: C.inkSoft, borderColor: C.paperDim }}>
              <div className="text-sm font-bold font-mono" style={{ color: ticketPrice === key ? C.paper : C.ink }}>{tier.label}</div>
            </button>
          ))}
        </div>
        <div className="text-11 mt-2" style={{ color: C.inkSoft }}>{TICKET_TIERS[ticketPrice]?.desc}</div>
      </PaperCard>

      {recentMatchFinances && recentMatchFinances.length > 0 && (
        <PaperCard style={{ padding: 0 }}>
          <div className="px-3 pt-3 pb-1.5 text-10 uppercase tracking-wide font-semibold" style={{ color: C.inkSoft }}>Senaste publiktrender</div>
          <div style={{ display: "grid", gridTemplateColumns: "0.5fr 0.9fr 0.9fr 0.7fr 0.8fr 0.9fr" }} className="px-3 pb-1 text-9 uppercase font-semibold">
            <span style={{ color: C.inkSoft }}>Omg</span><span style={{ color: C.inkSoft }}>Motstånd</span>
            <span style={{ color: C.inkSoft }}>Tävling</span>
            <span className="text-center" style={{ color: C.inkSoft }}>Pris</span>
            <span className="text-center" style={{ color: C.inkSoft }}>Publik</span>
            <span className="text-right" style={{ color: C.inkSoft }}>Intäkt</span>
          </div>
          {recentMatchFinances.map((m, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "0.5fr 0.9fr 0.9fr 0.7fr 0.8fr 0.9fr", borderTop: "1px solid rgba(30,42,34,0.08)" }} className="px-3 py-1.5 text-11 items-center">
              <span className="font-mono" style={{ color: C.ink }}>{m.round + 1}</span>
              <span className="truncate" style={{ color: C.ink }}>{m.userIsHome ? "" : "b. "}{m.oppName}</span>
              <span className="truncate text-9 font-semibold" style={{ color: m.competition ? C.gold : C.inkSoft }}>{m.competition || "Ligan"}</span>
              <span className="text-center text-10" style={{ color: C.inkSoft }}>{m.userIsHome ? (TICKET_TIERS[m.ticketPrice]?.label || "–") : "Borta"}</span>
              <span className="text-center font-mono" style={{ color: C.ink }}>
                {m.userIsHome ? (
                  <>
                    {m.attendance.toLocaleString("sv-SE")}
                    {m.arenaCapacity ? <span className="block text-9" style={{ color: C.inkSoft }}>{Math.round((m.attendance / m.arenaCapacity) * 100)}%</span> : null}
                  </>
                ) : "–"}
              </span>
              <span className="text-right font-mono font-semibold" style={{ color: m.income >= 0 ? C.win : C.loss }}>{m.income >= 0 ? "+" : ""}{formatMoney(m.income)}</span>
            </div>
          ))}
        </PaperCard>
      )}

      {selectedStand && (
        buildingStand === selectedStand ? (
          <PaperCard>
            <div className="text-xs uppercase tracking-wide font-semibold" style={{ color: C.inkSoft }}>{STAND_NAMES[selectedStand]} byggs ut</div>
            <div className="text-sm mt-1">Till {STAND_TIER_NAMES[arenaConstruction.toLevel - 1]} — klart om {arenaConstruction.roundsTotal - arenaConstruction.roundsElapsed} omgångar.</div>
            <div className="h-2 rounded-full mt-2" style={{ background: "rgba(0,0,0,0.08)" }}><div style={{ width: `${buildPct}%`, height: "100%", borderRadius: 999, background: C.gold, transition: "width .5s ease" }} /></div>
          </PaperCard>
        ) : (
          <PartCard title={STAND_NAMES[selectedStand]} tierName={STAND_TIER_NAMES[arenaStands[selectedStand] - 1]}
            desc={`Kapacitet: ${standCapacity(arenaStands[selectedStand])} platser. Fler platser ger mer matchdagsintäkt. Ombyggnad till nästa nivå tar ${arenaConstructionDuration(arenaStands[selectedStand] + 1)} omgångar.`}
            level={arenaStands[selectedStand]} max={5} cost={partUpgradeCost("arenaStands", arenaStands[selectedStand])}
            canAfford={budget >= partUpgradeCost("arenaStands", arenaStands[selectedStand]) && !arenaConstruction} onUpgrade={() => onStartConstruction(selectedStand)} />
        )
      )}

      <div className="text-xs uppercase tracking-wide font-semibold px-1" style={{ color: C.paperDim }}>🍽️ Publikservice</div>
      <PartCard title="Restauranger" desc="Mat och dryck på matchdagar — ren tilläggsintäkt varje hemmamatch."
        level={arenaFacilities.restaurant} max={3} cost={partUpgradeCost("arenaFacilities", arenaFacilities.restaurant)}
        canAfford={budget >= partUpgradeCost("arenaFacilities", arenaFacilities.restaurant)} onUpgrade={() => onUpgradePart("arenaFacilities", "restaurant")} />
      <PartCard title="Klubbutik" desc="Souvenirer och matchtröjor — ger extra intäkt på hemmamatcher."
        level={arenaFacilities.shop} max={3} cost={partUpgradeCost("arenaFacilities", arenaFacilities.shop)}
        canAfford={budget >= partUpgradeCost("arenaFacilities", arenaFacilities.shop)} onUpgrade={() => onUpgradePart("arenaFacilities", "shop")} />

      <div className="text-xs uppercase tracking-wide font-semibold px-1" style={{ color: C.paperDim }}>Stor ombyggnad</div>
      {buildingStand === "arena" ? (
        <PaperCard>
          <div className="text-xs uppercase tracking-wide font-semibold" style={{ color: C.inkSoft }}>Arenanivå byggs ut</div>
          <div className="text-sm mt-1">Klart om {arenaConstruction.roundsTotal - arenaConstruction.roundsElapsed} omgångar.</div>
          <div className="h-2 rounded-full mt-2" style={{ background: "rgba(0,0,0,0.08)" }}><div style={{ width: `${buildPct}%`, height: "100%", borderRadius: 999, background: C.gold, transition: "width .5s ease" }} /></div>
        </PaperCard>
      ) : (
        <BigUpgradeCard title="Arenanivå" desc={`Den övergripande arenastandarden — grundkapacitet och allmän matchdagsintäkt. Tar ${arenaConstructionDuration(dev.arena + 1)} omgångar att bygga.`}
          level={dev.arena} cost={Math.round(900 * Math.pow(dev.arena, 1.6))} canAfford={budget >= Math.round(900 * Math.pow(dev.arena, 1.6)) && !arenaConstruction} onUpgrade={() => onStartConstruction("arena")} />
      )}
    </div>
  );
}

function AkademiDetail({ dev, budget, akademiParts, youthSquad, onUpgrade, onUpgradePart, onSellYouth, onPromoteYouth, onBack }) {
  return (
    <div className="rise-in space-y-2.5">
      <button onClick={onBack} style={{ position: "fixed", bottom: 14, right: 14, display: "inline-block", color: "rgba(255,255,255,0.85)", background: "rgba(19,34,29,0.88)", padding: "6px 13px", borderRadius: 999, fontSize: 11, fontWeight: 600, zIndex: 50, backdropFilter: "blur(4px)", boxShadow: "0 2px 10px rgba(0,0,0,0.35)" }}>← Bakåt</button>
      <div className="text-xs uppercase tracking-wide font-semibold px-1" style={{ color: C.paperDim }}>Strategiska val</div>
      <PartCard title="Tränarstab" desc="Erfarna tränare minskar risken att lovande talanger stagnerar."
        level={akademiParts.tranare} max={3} cost={partUpgradeCost("akademiParts", akademiParts.tranare)}
        canAfford={budget >= partUpgradeCost("akademiParts", akademiParts.tranare)} onUpgrade={() => onUpgradePart("akademiParts", "tranare")} />
      <PartCard title="Ungdomsintag" desc="Bredare lokal rekrytering — högre chans att hitta nya talanger, och lite högre takpotential."
        level={akademiParts.intag} max={3} cost={partUpgradeCost("akademiParts", akademiParts.intag)}
        canAfford={budget >= partUpgradeCost("akademiParts", akademiParts.intag)} onUpgrade={() => onUpgradePart("akademiParts", "intag")} />

      <div className="text-xs uppercase tracking-wide font-semibold px-1" style={{ color: C.paperDim }}>Stor ombyggnad</div>
      <BigUpgradeCard title="Akademinivå" desc="Träningsanläggningens grundstandard — styr hur pålitligt och snabbt talanger växer."
        level={dev.akademi} cost={Math.round(600 * Math.pow(dev.akademi, 1.6))} canAfford={budget >= Math.round(600 * Math.pow(dev.akademi, 1.6))} onUpgrade={() => onUpgrade("akademi")} />

      <div className="text-xs uppercase tracking-wide font-semibold px-1 flex items-center gap-1.5" style={{ color: C.paperDim }}><GraduationCap size={13} /> Ungdomsakademin ({youthSquad.length}/8)</div>
      {youthSquad.length === 0 && <PaperCard><div className="text-sm text-center py-2" style={{ color: C.inkSoft }}>Inga spelare i akademin just nu.</div></PaperCard>}
      <div className="space-y-2">
        {youthSquad.map(y => {
          const overall = overallOf(y);
          const ready = overall >= 58 && y.yearsInAcademy >= 2;
          const refund = youthProspectValue(y.attack, y.defense, y.potential, y.id);
          return (
            <PaperCard key={y.id}>
              <div className="flex items-center gap-3">
                <div style={{ position: "relative", width: 36, height: 36, flexShrink: 0 }}>
                  <PlayerAvatar player={y} size={36} />
                  <div style={{ position: "absolute", bottom: -4, right: -4 }}><OverallBadge overall={overall} size={18} /></div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <div><div className="font-semibold text-sm">{y.name}</div><div className="font-mono text-11 mt-0.5" style={{ color: C.inkSoft }}>{POS_LABEL[y.pos]} ({specificPositionLabel(y.specificPosition)}) · {y.age} år · {y.yearsInAcademy} år i akademin</div>
                      {ready ? (
                        <div className="text-9 font-semibold mt-0.5" style={{ color: C.win }}>✅ Redo att flyttas upp till A-laget</div>
                      ) : y.yearsInAcademy < 2 ? (
                        <div className="text-9 font-semibold mt-0.5" style={{ color: C.gold }}>⏳ {2 - y.yearsInAcademy} {2 - y.yearsInAcademy === 1 ? "år" : "år"} kvar innan uppflyttning (minst 2 år krävs)</div>
                      ) : (
                        <div className="text-9 font-semibold mt-0.5" style={{ color: C.gold }}>📈 Behöver utvecklas mer — overall {overall}, kräver minst 58</div>
                      )}
                    </div>
                    <div className="flex gap-0.5">{[1,2,3,4,5].map(n=><Star key={n} size={11} fill={n<=potentialStars(y.potential)?C.gold:"none"} color={n<=potentialStars(y.potential)?C.gold:C.paperDim}/>)}</div>
                  </div>
                  <div className="mt-1"><StarRating rating={overallToStars(overall)} size={7} /></div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-1.5 mt-2">
                <AttributeGridCard attrKey="shooting" label="Anfall" value={y.attack} icon="🎯" />
                <AttributeGridCard attrKey="defending" label="Försvar" value={y.defense} icon="🛡️" />
              </div>
              <div className="flex gap-2 mt-2">
                <button onClick={() => onPromoteYouth(y)} disabled={!ready} className="flex-1 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1" style={ready ? { background: C.turf, color: C.paper } : { background: C.paperDim, color: C.inkSoft, opacity: 0.6 }}>
                  <ArrowUpCircle size={13} /> {ready ? "Flytta upp" : "Ej redo"}
                </button>
                <button onClick={() => onSellYouth(y)} className="flex-1 py-1.5 rounded-lg text-xs font-semibold" style={{ background: "transparent", border: `1px solid ${C.loss}`, color: C.loss }}>Sälj ({formatMoney(refund)})</button>
              </div>
            </PaperCard>
          );
        })}
      </div>
    </div>
  );
}

function ScoutingDetail({ dev, budget, scoutingParts, onUpgrade, onUpgradePart, onBack }) {
  return (
    <div className="rise-in space-y-2.5">
      <button onClick={onBack} style={{ position: "fixed", bottom: 14, right: 14, display: "inline-block", color: "rgba(255,255,255,0.85)", background: "rgba(19,34,29,0.88)", padding: "6px 13px", borderRadius: 999, fontSize: 11, fontWeight: 600, zIndex: 50, backdropFilter: "blur(4px)", boxShadow: "0 2px 10px rgba(0,0,0,0.35)" }}>← Bakåt</button>
      <PaperCard>
        <div className="text-xs uppercase tracking-wide font-semibold" style={{ color: C.inkSoft }}>Regioner öppna</div>
        <div className="text-sm mt-1">{Object.entries(REGION_LABELS).filter(([k]) => dev.scouting >= REGION_UNLOCK[k]).map(([, l]) => l).join(", ") || "Endast Europa"}</div>
      </PaperCard>
      <div className="text-xs uppercase tracking-wide font-semibold px-1" style={{ color: C.paperDim }}>Strategiska val</div>
      <PartCard title="Dataanalys" desc="Statistisk analys hjälper scouterna hitta bättre spelare snabbare."
        level={scoutingParts.analys} max={3} cost={partUpgradeCost("scoutingParts", scoutingParts.analys)}
        canAfford={budget >= partUpgradeCost("scoutingParts", scoutingParts.analys)} onUpgrade={() => onUpgradePart("scoutingParts", "analys")} />
      <PartCard title="Kontaktnät" desc="Goda relationer med agenter sänker priset på alla värvningar med 4% per nivå."
        level={scoutingParts.kontakter} max={3} cost={partUpgradeCost("scoutingParts", scoutingParts.kontakter)}
        canAfford={budget >= partUpgradeCost("scoutingParts", scoutingParts.kontakter)} onUpgrade={() => onUpgradePart("scoutingParts", "kontakter")} />

      <div className="text-xs uppercase tracking-wide font-semibold px-1" style={{ color: C.paperDim }}>Stor ombyggnad</div>
      <BigUpgradeCard title="Scoutnätverk" desc="Nätverkets globala räckvidd — låser upp nya regioner och höjer kvalitetstaket på marknaden."
        level={dev.scouting} cost={Math.round(820 * Math.pow(dev.scouting, 1.85))} canAfford={budget >= Math.round(820 * Math.pow(dev.scouting, 1.85))} onUpgrade={() => onUpgrade("scouting")} />
    </div>
  );
}

function SponsorDetail({ dev, budget, reputation, sponsors, customArenaName, onUpgrade, onSignSponsor, onTerminateSponsor, onNameArena, onBack }) {
  const [namingArena, setNamingArena] = useState(false);
  const [arenaNameInput, setArenaNameInput] = useState(customArenaName || "");
  const [offersFor, setOffersFor] = useState(null);
  const [offers, setOffers] = useState([]);
  const [selectedOfferId, setSelectedOfferId] = useState(null);
  const [negotiated, setNegotiated] = useState({});
  const [negotiateAttempts, setNegotiateAttempts] = useState({});
  function openOffers(slot) { setOffersFor(slot); setOffers(generateSponsorOffers(slot, reputation)); setSelectedOfferId(null); setNegotiated({}); setNegotiateAttempts({}); }
  function tryNegotiate(offer) {
    const used = negotiateAttempts[offer.id] || 0;
    const result = negotiateSponsor(offer, reputation, used);
    setNegotiateAttempts(prev => ({ ...prev, [offer.id]: used + 1 }));
    if (result.result === "walk") setNegotiated(prev => ({ ...prev, [offer.id]: { done: true, walked: true, line: result.line } }));
    else if (result.result === "improved") setNegotiated(prev => ({ ...prev, [offer.id]: { done: true, offer: result.offer, improved: true, line: result.line, canRetry: false } }));
    else if (result.result === "counter") setNegotiated(prev => ({ ...prev, [offer.id]: { done: true, offer: result.offer, countered: true, line: result.line, canRetry: used + 1 < NEGOTIATION_MAX_ATTEMPTS } }));
    else setNegotiated(prev => ({ ...prev, [offer.id]: { done: true, offer, line: result.line, canRetry: used + 1 < NEGOTIATION_MAX_ATTEMPTS } }));
  }
  return (
    <div className="rise-in space-y-2.5">
      <button onClick={onBack} style={{ position: "fixed", bottom: 14, right: 14, display: "inline-block", color: "rgba(255,255,255,0.85)", background: "rgba(19,34,29,0.88)", padding: "6px 13px", borderRadius: 999, fontSize: 11, fontWeight: 600, zIndex: 50, backdropFilter: "blur(4px)", boxShadow: "0 2px 10px rgba(0,0,0,0.35)" }}>← Bakåt</button>
      <div className="text-xs uppercase tracking-wide font-semibold px-1" style={{ color: C.paperDim }}>Sponsoravtal</div>
      {Object.entries(SPONSOR_SLOT_LABEL).map(([slot, label]) => {
        const current = sponsors[slot];
        const locked = current && current.roundsRemaining > 0;
        const remainingRatio = locked ? current.roundsRemaining / (current.totalLength || current.roundsRemaining || 1) : 0;
        const terminationCost = locked ? Math.round(current.income * (current.totalLength || 20) * 0.35 * remainingRatio) : 0;
        return (
          <PaperCard key={slot}>
            <div className="text-xs uppercase tracking-wide font-semibold" style={{ color: C.inkSoft }}>{label}</div>
            {slot === "stadium" && customArenaName ? (
              <div className="text-11 px-2.5 py-1.5 rounded-lg mt-1 font-bold" style={{ background: C.gold, color: C.turfDeep }}>🏟️ Er arena heter "{customArenaName}" — betald av er själva, ingen stadionsponsor.</div>
            ) : current ? (
              <>
                <div className="font-semibold text-sm mt-1">{current.name}</div>
                <div className="font-mono text-11 mt-0.5" style={{ color: C.win }}>+{formatMoney(current.income)} / matchomgång</div>
                <div className="text-10 mt-0.5" style={{ color: C.inkSoft }}>{current.roundsRemaining > 0 ? `${current.roundsRemaining} av ${current.totalLength} omgångar kvar på avtalet` : "Avtalet löper ut denna omgång"}</div>
              </>
            ) : <div className="text-sm mt-1" style={{ color: C.inkSoft }}>Inget avtal just nu.</div>}
            {locked ? (
              <button onClick={() => onTerminateSponsor(slot)} className="mt-2 w-full py-2 rounded-xl text-xs font-semibold" style={{ background: "transparent", border: `1px solid ${C.loss}`, color: C.loss }}>Säg upp avtalet i förtid ({formatMoney(terminationCost)})</button>
            ) : (
              <button onClick={() => openOffers(slot)} className="mt-2 w-full py-2 rounded-xl text-xs font-semibold" style={{ background: C.turf, color: C.paper }}>{current ? "Hitta ny sponsor" : "Sök sponsorer"}</button>
            )}
            {slot === "stadium" && (
              <>
                <button onClick={() => setNamingArena(!namingArena)} className="mt-1.5 w-full py-2 rounded-xl text-xs font-semibold" style={{ background: "transparent", border: `1px solid ${C.gold}`, color: C.goldSoft }}>{customArenaName ? "Byt namn själva" : "Döp arenan själva (£5,0M engångssumma)"}</button>
                {namingArena && (
                  <div className="mt-2 p-2.5 rounded-xl" style={{ background: C.paperDim }}>
                    <div className="text-10 mb-1.5" style={{ color: C.inkSoft }}>Ni betalar själva och avstår stadionsponsorns intäkter — men får namnet ni vill ha.</div>
                    <input value={arenaNameInput} onChange={e => setArenaNameInput(e.target.value)} maxLength={40} placeholder="T.ex. Silvervallen Arena" className="w-full px-2.5 py-2 rounded-lg text-sm" style={{ background: "#fff", border: `1px solid ${C.paperDim}`, color: C.ink }} />
                    <button onClick={() => { onNameArena(arenaNameInput); setNamingArena(false); }} disabled={!arenaNameInput.trim() || budget < 5000} className="mt-1.5 w-full py-2 rounded-xl text-xs font-semibold" style={(arenaNameInput.trim() && budget >= 5000) ? { background: C.gold, color: C.turfDeep } : { background: C.paperDim, color: C.inkSoft, opacity: 0.6 }}>{budget < 5000 ? "Otillräcklig budget" : "Bekräfta för £5,0M"}</button>
                  </div>
                )}
              </>
            )}
            {offersFor === slot && (
              <div className="mt-2 space-y-1.5">
                <LeverageBadge score={negotiationLeverage(reputation, 50)} />
                {offers.map(o => {
                  const neg = negotiated[o.id];
                  if (neg?.walked) return (
                    <div key={o.id} className="rounded-xl p-2.5" style={{ background: "rgba(180,68,59,0.1)" }}>
                      <div className="text-xs font-semibold mb-1.5">{o.name}</div>
                      <NegotiationThread messages={[{ from: "them", text: neg.line }]} />
                    </div>
                  );
                  const finalOffer = neg?.offer || o;
                  const isSelected = selectedOfferId === o.id;
                  return (
                    <div key={o.id} className="rounded-xl p-2.5" style={{ background: C.paperDim }}>
                      <button onClick={() => setSelectedOfferId(o.id)} className="w-full text-left">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold">{finalOffer.name}{neg?.improved && <span style={{ color: C.win }}> (förbättrat!)</span>}{neg?.countered && <span style={{ color: C.gold }}> (nya villkor)</span>}</span>
                          <span className="font-mono text-11">+{formatMoney(finalOffer.income)}/omg</span>
                        </div>
                        <div className="text-10" style={{ color: C.inkSoft }}>{SPONSOR_TYPES[o.type]?.label || "Partner"} · Signeringsbonus: {formatMoney(finalOffer.bonus)}</div>
                      </button>
                      {neg?.line && <div className="mt-2"><NegotiationThread messages={[{ from: "them", text: neg.line }]} /></div>}
                      {isSelected && (
                        <div className="flex gap-2 mt-2">
                          <button onClick={() => { onSignSponsor(slot, finalOffer); setOffersFor(null); }} className="flex-1 py-1.5 rounded-lg text-11 font-semibold" style={{ background: C.turf, color: C.paper }}>Acceptera</button>
                          {(!neg || neg.canRetry) && <button onClick={() => tryNegotiate(o)} className="flex-1 py-1.5 rounded-lg text-11 font-semibold" style={{ background: C.gold, color: C.turfDeep }}>{neg ? "Förhandla igen (risk att de drar sig ur)" : "Förhandla"}</button>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </PaperCard>
        );
      })}

      <div className="text-xs uppercase tracking-wide font-semibold px-1" style={{ color: C.paperDim }}>Stor ombyggnad</div>
      <BigUpgradeCard title="Kommersiell avdelning" desc="Sponsringsdepartementets grundstorlek — ger löpande baseffekt utöver namngivna avtal."
        level={dev.sponsring} cost={Math.round(450 * Math.pow(dev.sponsring, 1.6))} canAfford={budget >= Math.round(450 * Math.pow(dev.sponsring, 1.6))} onUpgrade={() => onUpgrade("sponsring")} />
    </div>
  );
}

function StaffDetail({ budget, staff, reputation, homeCountry, staffCandidates, onOpenCandidates, onHire, onRenegotiate, onBack }) {
  const [offersFor, setOffersFor] = useState(null);
  const [negotiatingId, setNegotiatingId] = useState(null);
  const [negoMessages, setNegoMessages] = useState([]);
  const [negoAttempts, setNegoAttempts] = useState(0);
  const [negoOutcome, setNegoOutcome] = useState(null);
  const [negoWalked, setNegoWalked] = useState(false);
  function openOffers(role) { onOpenCandidates(role); setOffersFor(role); setNegotiatingId(null); }
  function startNegotiation(candidate) {
    setNegotiatingId(candidate.id);
    setNegoMessages([{ from: "them", text: pick(["Jag vet vad jag är värd — bjud på riktigt.", "Beroende på villkoren kan jag tänka mig ett byte.", "Jag lyssnar, men förvänta er inte en fyndaffär."]) }]);
    setNegoAttempts(0); setNegoOutcome(null); setNegoWalked(false);
  }
  function tryStaffWage(candidate, mult) {
    const levelPenalty = (candidate.level - 1) * 0.02;
    const target = negotiationDrift(candidate.wage, negoAttempts) * (1 + levelPenalty);
    const offerWage = Math.round(target * mult);
    if (negoAttempts === 0 && Math.random() < opportunityChance(negotiationLeverage(reputation, candidate.level * 20))) {
      setNegoMessages(prev => [...prev, { from: "you", text: `Erbjuder ${formatMoney(offerWage)}/omg` }, { from: "them", text: `Er klubbs rykte gör det här enkelt — jag tackar ja direkt.` }]);
      setNegoOutcome({ result: "accept", offerWage });
      setNegoAttempts(1);
      return;
    }
    const result = negotiateWage(offerWage, target, reputation);
    const nextAttempts = negoAttempts + 1;
    setNegoAttempts(nextAttempts);
    if (result.result !== "accept") {
      const walkChance = negotiationWalkAwayChance(offerWage / target, reputation) + levelPenalty;
      if (nextAttempts >= NEGOTIATION_MAX_ATTEMPTS || Math.random() < walkChance) {
        setNegoMessages(prev => [...prev, { from: "you", text: `Erbjuder ${formatMoney(offerWage)}/omg` }, { from: "them", text: `${wageRejectLine()} Jag tackar för intresset, men går vidare.` }]);
        setNegoWalked(true);
        return;
      }
    }
    const reply = result.result === "accept" ? wageAcceptLine() : result.result === "counter" ? wageCounterLine(result.counterWage) : wageRejectLine();
    setNegoMessages(prev => [...prev, { from: "you", text: `Erbjuder ${formatMoney(offerWage)}/omg` }, { from: "them", text: reply }]);
    setNegoOutcome({ ...result, offerWage });
  }
  return (
    <div className="rise-in space-y-2.5">
      <button onClick={onBack} style={{ position: "fixed", bottom: 14, right: 14, display: "inline-block", color: "rgba(255,255,255,0.85)", background: "rgba(19,34,29,0.88)", padding: "6px 13px", borderRadius: 999, fontSize: 11, fontWeight: 600, zIndex: 50, backdropFilter: "blur(4px)", boxShadow: "0 2px 10px rgba(0,0,0,0.35)" }}>← Bakåt</button>
      <div className="text-xs uppercase tracking-wide font-semibold px-1" style={{ color: C.paperDim }}>Klubbens personal</div>
      {Object.entries(STAFF_ROLE_LABEL).map(([role, label]) => {
        const current = staff[role];
        return (
          <PaperCard key={role}>
            <div className="flex items-center justify-between">
              <div className="text-xs uppercase tracking-wide font-semibold" style={{ color: C.inkSoft }}>{label}</div>
              {current && <LevelDots level={current.level} />}
            </div>
            {current ? (
              <>
                <div className="flex items-center gap-2.5 mt-1.5">
                  <PlayerAvatar player={{ id: current.name, age: 42 }} size={34} />
                  <div className="min-w-0">
                    <div className="font-semibold text-sm truncate">{current.name} <span className="font-normal text-11" style={{ color: C.inkSoft }}>({nationalityLabel(current.nationality)})</span></div>
                    <div className="font-mono text-11" style={{ color: C.inkSoft }}>Lön: {formatMoney(current.wage)} / matchomgång · Kontrakt: {current.contractYears ?? "–"} år kvar</div>
                  </div>
                </div>
                {(current.contractYears || 0) > 0 && <div className="text-9 mt-1" style={{ color: C.loss }}>Att ersätta nu kostar en avgångsvederlag.</div>}
              </>
            ) : <div className="text-sm mt-1" style={{ color: C.inkSoft }}>Tjänsten är obemannad.</div>}
            <div className="text-11 mt-1.5" style={{ color: C.inkSoft }}>{STAFF_ROLE_DESC[role]}</div>
            {current?.needsRaise && (
              <div className="mt-2 p-2.5 rounded-xl" style={{ background: "rgba(201,154,62,0.15)" }}>
                <div className="text-11" style={{ color: C.ink }}>{current.name} har utvecklats och vill omförhandla sin lön till <b>{formatMoney(staffFairWage(current.level))}</b>/omg.</div>
                <div className="flex gap-2 mt-1.5">
                  <button onClick={() => onRenegotiate(role, true)} className="flex-1 py-1.5 rounded-lg text-9 font-semibold" style={{ background: C.turf, color: C.paper }}>Acceptera</button>
                  <button onClick={() => onRenegotiate(role, false)} className="flex-1 py-1.5 rounded-lg text-9 font-semibold" style={{ background: "transparent", border: `1px solid ${C.inkSoft}`, color: C.inkSoft }}>Vänta</button>
                </div>
              </div>
            )}
            <button onClick={() => openOffers(role)} className="mt-2 w-full py-2 rounded-xl text-xs font-semibold" style={{ background: C.turf, color: C.paper }}>{current ? "Rekrytera ersättare" : "Rekrytera"}</button>
            {offersFor === role && (
              <div className="mt-2 space-y-1.5">
                <div className="text-9" style={{ color: C.inkSoft }}>Nya kandidater dyker upp om ingen av dessa tre passar er — det tar några omgångar.</div>
                {(staffCandidates[role]?.list || []).map(o => (
                  <div key={o.id} className="p-2.5 rounded-xl" style={{ background: C.paperDim }}>
                    <button onClick={() => negotiatingId === o.id ? null : startNegotiation(o)} className="w-full text-left">
                      <div className="flex items-center gap-2">
                        <PlayerAvatar player={o} size={28} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold truncate">{o.name} <span className="font-normal" style={{ color: C.inkSoft }}>({nationalityLabel(o.nationality)})</span></span>
                            <LevelDots level={o.level} />
                          </div>
                          <div className="text-10 mt-0.5" style={{ color: C.inkSoft }}>Löneanspråk: ca {formatMoney(o.wage)} / matchomgång{o.level >= 4 ? " · svårförhandlad, hög nivå" : ""}</div>
                        </div>
                      </div>
                      {current && (
                        <div className="text-9 mt-0.5 font-semibold" style={{ color: o.level > current.level ? C.win : o.level < current.level ? C.loss : C.inkSoft }}>
                          {o.level > current.level ? `+${o.level - current.level} nivå` : o.level < current.level ? `${o.level - current.level} nivå` : "Samma nivå"} jämfört med {current.name.split(" ")[0]} · {o.wage > current.wage ? "dyrare" : o.wage < current.wage ? "billigare" : "samma lön"}
                        </div>
                      )}
                    </button>
                    {negotiatingId === o.id && (
                      <div className="mt-2 pt-2" style={{ borderTop: `1px solid ${C.paper}` }}>
                        {negoWalked ? (
                          <div className="text-11 font-semibold" style={{ color: C.loss }}>{o.name} gick vidare till ett annat erbjudande. Förhandlingen är över.</div>
                        ) : (
                          <>
                            <div className="mb-1.5"><LeverageBadge score={negotiationLeverage(reputation, o.level * 20)} /></div>
                            <NegotiationThread messages={negoMessages} />
                            {!negoOutcome ? (
                              <div className="grid grid-cols-3 gap-1 mt-2">
                                <button onClick={() => tryStaffWage(o, 0.85)} className="py-1.5 rounded-lg text-9 font-semibold" style={{ background: C.paper, color: C.ink }}>Lågt<br />{formatMoney(Math.round(o.wage * 0.85))}</button>
                                <button onClick={() => tryStaffWage(o, 1.0)} className="py-1.5 rounded-lg text-9 font-semibold" style={{ background: C.turf, color: C.paper }}>Marknad<br />{formatMoney(o.wage)}</button>
                                <button onClick={() => tryStaffWage(o, 1.15)} className="py-1.5 rounded-lg text-9 font-semibold" style={{ background: C.gold, color: C.turfDeep }}>Generöst<br />{formatMoney(Math.round(o.wage * 1.15))}</button>
                              </div>
                            ) : negoOutcome.result === "accept" ? (
                              <button onClick={() => { onHire(role, { ...o, wage: negoOutcome.offerWage }); setOffersFor(null); setNegotiatingId(null); }} className="mt-2 w-full py-1.5 rounded-lg text-9 font-semibold" style={{ background: C.turf, color: C.paper }}>Anställ för {formatMoney(negoOutcome.offerWage)}/omg</button>
                            ) : negoOutcome.result === "counter" ? (
                              <div className="flex gap-1.5 mt-2">
                                <button onClick={() => { onHire(role, { ...o, wage: negoOutcome.counterWage }); setOffersFor(null); setNegotiatingId(null); }} className="flex-1 py-1.5 rounded-lg text-9 font-semibold" style={{ background: C.turf, color: C.paper }}>Acceptera {formatMoney(negoOutcome.counterWage)}/omg</button>
                                <button onClick={() => setNegoOutcome(null)} className="flex-1 py-1.5 rounded-lg text-9 font-semibold" style={{ background: "transparent", border: `1px solid ${C.inkSoft}`, color: C.inkSoft }}>Nytt bud</button>
                              </div>
                            ) : (
                              <button onClick={() => setNegoOutcome(null)} className="mt-2 w-full py-1.5 rounded-lg text-9 font-semibold" style={{ background: C.turf, color: C.paper }}>Försök igen</button>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </PaperCard>
        );
      })}
    </div>
  );
}

function LoanDetail({ budget, loans, reputation, onTakeLoan, onBack }) {
  const offers = generateLoanOffers(reputation);
  const totalDebt = loans.reduce((s, l) => s + l.installment * l.seasonsLeft, 0);
  return (
    <div className="rise-in space-y-2.5">
      <button onClick={onBack} style={{ position: "fixed", bottom: 14, right: 14, display: "inline-block", color: "rgba(255,255,255,0.85)", background: "rgba(19,34,29,0.88)", padding: "6px 13px", borderRadius: 999, fontSize: 11, fontWeight: 600, zIndex: 50, backdropFilter: "blur(4px)", boxShadow: "0 2px 10px rgba(0,0,0,0.35)" }}>← Bakåt</button>
      <PaperCard>
        <div className="text-xs uppercase tracking-wide font-semibold" style={{ color: C.inkSoft }}>Nuvarande skuld</div>
        <div className="font-display text-xl mt-1" style={{ color: totalDebt > 0 ? C.loss : C.ink }}>{formatMoney(totalDebt)}</div>
        {loans.length === 0 && <div className="text-11 mt-1" style={{ color: C.inkSoft }}>Inga aktiva lån.</div>}
        <div className="space-y-1.5 mt-2">
          {loans.map(l => (
            <div key={l.id} className="text-11 font-mono flex justify-between" style={{ color: C.inkSoft }}>
              <span>{formatMoney(l.installment)}/säsong</span><span>{l.seasonsLeft} av {l.totalSeasons} år kvar</span>
            </div>
          ))}
        </div>
      </PaperCard>
      <div className="text-xs uppercase tracking-wide font-semibold px-1" style={{ color: C.paperDim }}>Nya lånealternativ</div>
      {loans.length >= 2 ? (
        <PaperCard><div className="text-sm text-center py-3" style={{ color: C.inkSoft }}>Max antal aktiva lån (2) är nått.</div></PaperCard>
      ) : offers.map(o => (
        <PaperCard key={o.id}>
          <div className="flex items-center justify-between">
            <div className="font-display text-lg">{formatMoney(o.amount)}</div>
            <div className="text-11 font-mono" style={{ color: C.inkSoft }}>{Math.round(o.rate * 100)}% ränta</div>
          </div>
          <div className="text-11 mt-1" style={{ color: C.inkSoft }}>{o.years} år · {formatMoney(loanInstallment(o))}/säsong · totalt {formatMoney(loanInstallment(o) * o.years)}</div>
          <button onClick={() => onTakeLoan(o)} className="mt-2 w-full py-2 rounded-xl text-xs font-semibold" style={{ background: C.turf, color: C.paper }}>Ta lånet</button>
        </PaperCard>
      ))}
      <div className="text-10 px-1" style={{ color: C.paperDim }}>Lån dras automatiskt från budgeten vid varje säsongsskifte tills de är avbetalda.</div>
    </div>
  );
}

function CashFlowDetail({ budget, squad, staff, sponsors, loans, transferInstallments, recentMatchFinances, seasonIncomeTotal, seasonWageTotal, round, transferHistory, userClubId, season, onBack }) {
  const wageBill = totalWageBill(squad);
  const staffWages = (staff?.assistant?.wage || 0) + (staff?.physio?.wage || 0) + (staff?.scout?.wage || 0) + (staff?.gkCoach?.wage || 0) + (staff?.analyst?.wage || 0) + (staff?.fitnessCoach?.wage || 0);
  const sponsorIncome = (sponsors?.main?.income || 0) + (sponsors?.stadium?.income || 0) + (sponsors?.local?.income || 0);
  const loanPayments = (loans || []).reduce((s, l) => s + l.installment, 0);
  const installmentOut = (transferInstallments || []).reduce((s, i) => s + i.monthlyPayment, 0);
  const lastMatchIncome = recentMatchFinances && recentMatchFinances.length ? recentMatchFinances[0].income : 0;
  const lastMatchIsHome = recentMatchFinances && recentMatchFinances.length ? recentMatchFinances[0].userIsHome : null;

  // Transfers are one-off, not a recurring per-round cost — shown as their own recent-activity list rather
  // than folded into the per-round averages above, so a big sale or signing is clearly visible on its own.
  const recentTransfers = (transferHistory || []).filter(t => t.season === season && round - t.round <= 5);
  const recentSales = recentTransfers.filter(t => t.fromClubId === userClubId);
  const recentBuys = recentTransfers.filter(t => t.toClubId === userClubId);
  const seasonSales = (transferHistory || []).filter(t => t.season === season && t.fromClubId === userClubId);
  const seasonBuys = (transferHistory || []).filter(t => t.season === season && t.toClubId === userClubId);
  const seasonTransferIncome = seasonSales.reduce((s, t) => s + t.fee, 0);
  const seasonTransferExpense = seasonBuys.reduce((s, t) => s + t.fee, 0);

  const incomeItems = [
    { label: "Matchdagsintäkt (senaste)", value: lastMatchIncome > 0 ? lastMatchIncome : 0, note: lastMatchIsHome === false ? "Bortamatch — ingen publikintäkt" : lastMatchIsHome === null ? "Ingen match spelad än" : "Biljetter, restaurang & butik" },
    { label: "Sponsoravtal", value: sponsorIncome, note: `${Object.values(sponsors || {}).filter(Boolean).length}/3 aktiva avtal` },
  ];
  const expenseItems = [
    { label: "Spelarlöner", value: wageBill, note: `${squad.length} spelare i truppen` },
    { label: "Personallöner", value: staffWages, note: "Assisterande, fys, scout m.fl." },
    { label: "Låneavbetalning", value: loanPayments, note: `${loans?.length || 0} aktiva lån` },
    { label: "Övergångsavbetalningar", value: installmentOut, note: `${transferInstallments?.length || 0} pågående` },
  ];
  const totalIncome = incomeItems.reduce((s, i) => s + i.value, 0);
  const totalExpense = expenseItems.reduce((s, i) => s + i.value, 0);
  const netThisRound = totalIncome - totalExpense;

  return (
    <div className="rise-in space-y-2.5">
      <PaperCard>
        <div className="flex items-center justify-between">
          <div className="font-display text-xl">Kassaflöde</div>
          <button onClick={onBack} className="text-9 font-semibold px-2.5 py-1.5 rounded-lg" style={{ background: C.paperDim, color: C.inkSoft }}>Tillbaka</button>
        </div>
        <div className="text-11 mt-0.5" style={{ color: C.inkSoft }}>En levande överblick över allt som påverkar er budget — omgång {round}.</div>
        <div className="flex items-center justify-between mt-3">
          <div>
            <div className="text-9 uppercase tracking-wide font-semibold" style={{ color: C.inkSoft }}>Tillgänglig budget just nu</div>
            <div className="font-display text-2xl mt-0.5" style={{ color: budget >= 0 ? C.ink : C.loss }}>{formatMoney(budget)}</div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-9 uppercase tracking-wide font-semibold" style={{ color: C.inkSoft }}>Netto denna period</div>
            <div className="font-mono text-lg font-bold mt-0.5" style={{ color: netThisRound >= 0 ? C.win : C.loss }}>{netThisRound >= 0 ? "+" : ""}{formatMoney(Math.round(netThisRound))}</div>
          </div>
        </div>
      </PaperCard>
      <PaperCard>
        <div className="text-10 uppercase tracking-wide font-semibold mb-2" style={{ color: C.win }}>▲ Inkomster</div>
        <div className="space-y-2">
          {incomeItems.map((item, i) => (
            <div key={i} className="flex items-center justify-between">
              <div className="min-w-0">
                <div className="text-11 font-semibold" style={{ color: C.ink }}>{item.label}</div>
                <div className="text-9" style={{ color: C.inkSoft }}>{item.note}</div>
              </div>
              <div className="font-mono text-sm font-bold shrink-0" style={{ color: C.win }}>+{formatMoney(item.value)}</div>
            </div>
          ))}
          <div className="flex items-center justify-between pt-2" style={{ borderTop: `1px dashed ${C.paperDim}` }}>
            <span className="text-11 font-semibold" style={{ color: C.ink }}>Totalt</span>
            <span className="font-mono text-sm font-bold" style={{ color: C.win }}>+{formatMoney(totalIncome)}</span>
          </div>
        </div>
      </PaperCard>
      <PaperCard>
        <div className="text-10 uppercase tracking-wide font-semibold mb-2" style={{ color: C.loss }}>▼ Utgifter</div>
        <div className="space-y-2">
          {expenseItems.map((item, i) => (
            <div key={i} className="flex items-center justify-between">
              <div className="min-w-0">
                <div className="text-11 font-semibold" style={{ color: C.ink }}>{item.label}</div>
                <div className="text-9" style={{ color: C.inkSoft }}>{item.note}</div>
              </div>
              <div className="font-mono text-sm font-bold shrink-0" style={{ color: C.loss }}>−{formatMoney(item.value)}</div>
            </div>
          ))}
          <div className="flex items-center justify-between pt-2" style={{ borderTop: `1px dashed ${C.paperDim}` }}>
            <span className="text-11 font-semibold" style={{ color: C.ink }}>Totalt</span>
            <span className="font-mono text-sm font-bold" style={{ color: C.loss }}>−{formatMoney(totalExpense)}</span>
          </div>
        </div>
      </PaperCard>
      {recentTransfers.length > 0 && (
        <PaperCard>
          <div className="text-10 uppercase tracking-wide font-semibold mb-2" style={{ color: C.inkSoft }}>💼 Senaste övergångar</div>
          <div className="space-y-2">
            {recentSales.map(t => (
              <div key={t.id} className="flex items-center justify-between">
                <div className="min-w-0">
                  <div className="text-11 font-semibold" style={{ color: C.ink }}>{t.playerName} — sålt</div>
                  <div className="text-9" style={{ color: C.inkSoft }}>Till {t.toClubName || "okänd köpare"} · omgång {t.round}</div>
                </div>
                <div className="font-mono text-sm font-bold shrink-0" style={{ color: C.win }}>+{formatMoney(t.fee)}</div>
              </div>
            ))}
            {recentBuys.map(t => (
              <div key={t.id} className="flex items-center justify-between">
                <div className="min-w-0">
                  <div className="text-11 font-semibold" style={{ color: C.ink }}>{t.playerName} — köpt</div>
                  <div className="text-9" style={{ color: C.inkSoft }}>Från {t.fromClubName || "fri agent"} · omgång {t.round}</div>
                </div>
                <div className="font-mono text-sm font-bold shrink-0" style={{ color: C.loss }}>−{formatMoney(t.fee)}</div>
              </div>
            ))}
          </div>
        </PaperCard>
      )}
      <PaperCard>
        <div className="text-10 uppercase tracking-wide font-semibold mb-2" style={{ color: C.inkSoft }}>Säsongen totalt hittills</div>
        <div className="flex items-center justify-between">
          <span className="text-11" style={{ color: C.ink }}>Total intäkt (matcher & sponsring)</span>
          <span className="font-mono text-sm font-bold" style={{ color: C.win }}>+{formatMoney(Math.round(seasonIncomeTotal))}</span>
        </div>
        <div className="flex items-center justify-between mt-1.5">
          <span className="text-11" style={{ color: C.ink }}>Total löneutgift</span>
          <span className="font-mono text-sm font-bold" style={{ color: C.loss }}>−{formatMoney(Math.round(seasonWageTotal))}</span>
        </div>
        <div className="flex items-center justify-between mt-1.5">
          <span className="text-11" style={{ color: C.ink }}>Övergångsintäkter (försäljningar)</span>
          <span className="font-mono text-sm font-bold" style={{ color: C.win }}>+{formatMoney(seasonTransferIncome)}</span>
        </div>
        <div className="flex items-center justify-between mt-1.5">
          <span className="text-11" style={{ color: C.ink }}>Övergångsutgifter (värvningar)</span>
          <span className="font-mono text-sm font-bold" style={{ color: C.loss }}>−{formatMoney(seasonTransferExpense)}</span>
        </div>
      </PaperCard>
    </div>
  );
}
function WagesDetail({ squad, reputation, division, sponsringLevel, onBack }) {
  const cap = wageBudgetCap(reputation, division, sponsringLevel);
  const total = totalWageBill(squad);
  const pct = Math.round((total / cap) * 100);
  const overCap = total > cap;
  const sorted = [...squad].sort((a, b) => b.wage - a.wage);
  return (
    <div className="rise-in space-y-2.5">
      <button onClick={onBack} style={{ position: "fixed", bottom: 14, right: 14, display: "inline-block", color: "rgba(255,255,255,0.85)", background: "rgba(19,34,29,0.88)", padding: "6px 13px", borderRadius: 999, fontSize: 11, fontWeight: 600, zIndex: 50, backdropFilter: "blur(4px)", boxShadow: "0 2px 10px rgba(0,0,0,0.35)" }}>← Bakåt</button>
      <PaperCard>
        <div className="text-xs uppercase tracking-wide font-semibold" style={{ color: C.inkSoft }}>Löneutrymme</div>
        <div className="flex items-center justify-between mt-1">
          <div className="font-display text-xl">{formatMoney(total)} <span className="text-sm" style={{ color: C.inkSoft }}>/ {formatMoney(cap)}</span></div>
          <div className="font-mono text-sm font-semibold" style={{ color: overCap ? C.loss : C.win }}>{pct}%</div>
        </div>
        <div className="h-2 rounded-full mt-2" style={{ background: "rgba(0,0,0,0.08)" }}><div className="h-full rounded-full" style={{ width: `${clamp(pct, 0, 100)}%`, background: overCap ? C.loss : C.gold }} /></div>
        {overCap ? (
          <div className="text-11 mt-2 font-semibold" style={{ color: C.loss }}>Ni överskrider löneutrymmet — Financial Fair Play blockerar nya värvningar och sänker styrelsens förtroende snabbare.</div>
        ) : (
          <div className="text-11 mt-2" style={{ color: C.inkSoft }}>Löneutrymmet styrs av rykte, division och er kommersiella avdelning.</div>
        )}
      </PaperCard>
      <div className="text-xs uppercase tracking-wide font-semibold px-1" style={{ color: C.paperDim }}>Spelarlöner</div>
      <div className="space-y-1.5">
        {sorted.map(p => (
          <PaperCard key={p.id} style={{ padding: 10 }}>
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold truncate">#{p.number} {p.name} <span className="font-normal text-10" style={{ color: C.inkSoft }}>{p.specificPosition}</span></div>
              <div className="font-mono text-sm font-semibold">{formatMoney(p.wage)}/omg</div>
            </div>
          </PaperCard>
        ))}
      </div>
    </div>
  );
}

function OwnerDetail({ owner, takeoverBid, budget, reputation, fanbase, shopLevel, division, tourOffers, onRespondTakeover, onOpenTours, onStartTour, onRequestOwner, onBack, merchandisePricing, onSetMerchandisePricing, manager }) {
  const type = OWNER_TYPES[owner.type] || OWNER_TYPES.talmodig;
  return (
    <div className="rise-in space-y-2.5">
      <button onClick={onBack} style={{ position: "fixed", bottom: 14, right: 14, display: "inline-block", color: "rgba(255,255,255,0.85)", background: "rgba(19,34,29,0.88)", padding: "6px 13px", borderRadius: 999, fontSize: 11, fontWeight: 600, zIndex: 50, backdropFilter: "blur(4px)", boxShadow: "0 2px 10px rgba(0,0,0,0.35)" }}>← Bakåt</button>
      <PaperCard>
        <div className="text-xs uppercase tracking-wide font-semibold" style={{ color: C.inkSoft }}>Klubbägare</div>
        <div className="flex items-center gap-2.5 mt-1.5">
          <PlayerAvatar player={{ id: owner.name, age: 55 }} size={40} />
          <div className="min-w-0">
            <div className="font-display text-lg truncate">{owner.name}</div>
            <div className="text-11" style={{ color: C.inkSoft }}>{nationalityLabel(owner.nationality)} · {type.label}</div>
          </div>
        </div>
        <div className="text-11 mt-1.5" style={{ color: C.inkSoft }}>{type.desc}</div>
        <div className="mt-2.5">
          <EconomyStatCard icon="🤝" label="Ägarens tålamod" value={`${Math.round(owner.patience)}%`} valueColor={owner.patience <= 30 ? C.loss : owner.patience >= 60 ? C.win : C.gold} barPct={owner.patience} barColor={owner.patience <= 30 ? C.loss : owner.patience >= 60 ? C.win : C.gold} />
        </div>
      </PaperCard>

      {onRequestOwner && (
        <>
          <div className="text-xs uppercase tracking-wide font-semibold px-1" style={{ color: C.paperDim }}>Begär något av ägaren</div>
          <div className="text-11 px-1" style={{ color: C.paperDim }}>Ju lägre tålamod ägaren har, desto större risk att förfrågan avvisas — och ett nej kostar ytterligare tålamod. Max en förfrågan var 6:e omgång.</div>
          <PaperCard>
            <div className="text-sm font-semibold">Extra transferbudget</div>
            <div className="text-11 mt-0.5" style={{ color: C.inkSoft }}>Be om ett kapitaltillskott för att förstärka truppen nu.</div>
            <button onClick={() => onRequestOwner("budget")} className="mt-2 w-full py-2 rounded-xl text-xs font-semibold" style={{ background: C.gold, color: C.turfDeep }}>Begär pengar</button>
          </PaperCard>
          <PaperCard>
            <div className="text-sm font-semibold">Mer tid att nå resultat</div>
            <div className="text-11 mt-0.5" style={{ color: C.inkSoft }}>Be ägaren tala för er inför styrelsen och köpa er mer tålamod.</div>
            <button onClick={() => onRequestOwner("patience")} className="mt-2 w-full py-2 rounded-xl text-xs font-semibold" style={{ background: "transparent", border: `1px solid ${C.inkSoft}`, color: C.inkSoft }}>Begär mer tid</button>
          </PaperCard>
          {manager && (
            <PaperCard>
              <div className="text-sm font-semibold">Förläng anställningsavtalet</div>
              <div className="text-11 mt-0.5" style={{ color: C.inkSoft }}>Nuvarande avtal: {manager.contractYears} {manager.contractYears === 1 ? "år" : "år"} kvar. Ett längre avtal ger er mer tid att lova framtidsvisioner till spelarna — ni kan aldrig sälja in en vision längre än ert eget avtal plus ett år.</div>
              <button onClick={() => onRequestOwner("contract")} className="mt-2 w-full py-2 rounded-xl text-xs font-semibold" style={{ background: "transparent", border: `1px solid ${C.gold}`, color: "#B8862E" }}>Begär förlängt avtal (+1 år)</button>
            </PaperCard>
          )}
        </>
      )}

      {takeoverBid && (
        <PaperCard style={{ background: "rgba(201,154,62,0.15)" }}>
          <div className="text-xs uppercase tracking-wide font-semibold" style={{ color: C.inkSoft }}>Övertagandebud</div>
          <div className="text-sm mt-1 font-semibold">{takeoverBid.name} ({nationalityLabel(takeoverBid.nationality)})</div>
          <div className="text-11 mt-1" style={{ color: C.inkSoft }}>{takeoverBid.type === "storsatsare" ? "Lovar stora investeringar i truppen." : "Vill sanera ekonomin och gå försiktigt fram."} Kapitaltillskott: {formatMoney(takeoverBid.capitalBoost)}.</div>
          <div className="flex gap-2 mt-2">
            <button onClick={() => onRespondTakeover("accept")} className="flex-1 py-2 rounded-xl text-xs font-semibold" style={{ background: C.turf, color: C.paper }}>Acceptera</button>
            <button onClick={() => onRespondTakeover("reject")} className="flex-1 py-2 rounded-xl text-xs font-semibold" style={{ background: "transparent", border: `1px solid ${C.loss}`, color: C.loss }}>Avvisa</button>
          </div>
        </PaperCard>
      )}

      <div className="text-xs uppercase tracking-wide font-semibold px-1" style={{ color: C.paperDim }}>Intäktsströmmar</div>
      <PaperCard>
        <div className="flex items-center justify-between"><span className="text-sm font-semibold">TV-avtal</span><span className="font-mono text-sm font-semibold" style={{ color: C.win }}>+{formatMoney(tvDealIncome(reputation, division))}/omg</span></div>
        <div className="text-10 mt-0.5" style={{ color: C.inkSoft }}>Skalar med rykte och division.</div>
      </PaperCard>
      <PaperCard>
        <div className="flex items-center justify-between"><span className="text-sm font-semibold">Merchandise</span><span className="font-mono text-sm font-semibold" style={{ color: C.win }}>+{formatMoney(merchandiseIncome(fanbase, shopLevel, merchandisePricing))}/omg</span></div>
        <div className="text-10 mt-0.5" style={{ color: C.inkSoft }}>Skalar med fanbase och klubbutikens nivå.</div>
        <div className="grid grid-cols-3 gap-1.5 mt-2.5">
          {Object.entries(MERCH_PRICING).map(([key, tier]) => (
            <button key={key} onClick={() => onSetMerchandisePricing(key)} className="py-1.5 rounded-xl text-10 font-semibold border"
              style={merchandisePricing === key ? { background: C.turf, color: C.paper, borderColor: C.turf } : { background: "transparent", color: C.inkSoft, borderColor: C.paperDim }}>{tier.label}</button>
          ))}
        </div>
        <div className="text-10 mt-1.5" style={{ color: C.inkSoft }}>{MERCH_PRICING[merchandisePricing || "standard"].desc}</div>
      </PaperCard>
    </div>
  );
}

function EconomyStatCard({ icon, label, value, valueColor, barPct, barColor, sub }) {
  return (
    <div className="rounded-xl p-2.5" style={{ background: "#fff", border: "1px solid rgba(30,42,34,0.08)" }}>
      <div className="flex items-center justify-between">
        <span className="w-6 h-6 rounded-full flex items-center justify-center text-11 shrink-0" style={{ background: `${barColor || C.gold}22` }}>{icon}</span>
        <span className="font-mono text-sm font-bold" style={{ color: valueColor || C.ink }}>{value}</span>
      </div>
      <div className="text-9 font-semibold mt-1" style={{ color: C.inkSoft }}>{label}</div>
      {barPct !== undefined && (
        <div className="h-1.5 rounded-full mt-1.5" style={{ background: "rgba(0,0,0,0.08)" }}>
          <div className="h-full rounded-full" style={{ width: `${clamp(barPct, 0, 100)}%`, background: barColor || C.gold, transition: "width .5s ease" }} />
        </div>
      )}
      {sub && <div className="text-9 mt-1" style={{ color: C.inkSoft }}>{sub}</div>}
    </div>
  );
}
function EconomyTab({ budget, reputation, division, sponsringLevel, squad, history, season, round, totalRounds, seasonIncomeTotal, seasonWageTotal, ticketPrice, onSetTicketPrice,
  loans, onTakeLoan, sponsors, dev, onUpgrade, onUpgradePart, onSignSponsor, onTerminateSponsor, club, arenaStands, arenaFacilities, arenaConstruction, onStartConstruction, recentMatchFinances, transferInstallments, onSubViewChange, customArenaName, onNameArena, staff, transferHistory, userClubId }) {
  const [selectedCategory, setSelectedCategory] = useState(null);
  useEffect(() => { onSubViewChange?.(!!selectedCategory); }, [selectedCategory]);
  if (selectedCategory === "loner") return <WagesDetail squad={squad} reputation={reputation} division={division} sponsringLevel={sponsringLevel} onBack={() => setSelectedCategory(null)} />;
  if (selectedCategory === "lan") return <LoanDetail budget={budget} loans={loans} reputation={reputation} onTakeLoan={onTakeLoan} onBack={() => setSelectedCategory(null)} />;
  if (selectedCategory === "sponsring") return <SponsorDetail dev={dev} budget={budget} reputation={reputation} sponsors={sponsors} customArenaName={customArenaName} onNameArena={onNameArena} onUpgrade={onUpgrade} onSignSponsor={onSignSponsor} onTerminateSponsor={onTerminateSponsor} onBack={() => setSelectedCategory(null)} />;
  if (selectedCategory === "arena") return <ArenaDetail club={club} dev={dev} budget={budget} arenaStands={arenaStands} arenaFacilities={arenaFacilities} arenaConstruction={arenaConstruction} onUpgrade={onUpgrade} onUpgradePart={onUpgradePart} onStartConstruction={onStartConstruction} ticketPrice={ticketPrice} onSetTicketPrice={onSetTicketPrice} recentMatchFinances={recentMatchFinances} onBack={() => setSelectedCategory(null)} />;
  if (selectedCategory === "kassaflode") return <CashFlowDetail budget={budget} squad={squad} staff={staff} sponsors={sponsors} loans={loans} transferInstallments={transferInstallments} recentMatchFinances={recentMatchFinances} seasonIncomeTotal={seasonIncomeTotal} seasonWageTotal={seasonWageTotal} round={round} transferHistory={transferHistory} userClubId={userClubId} season={season} onBack={() => setSelectedCategory(null)} />;

  const cap = wageBudgetCap(reputation, division, sponsringLevel);
  const wageBill = totalWageBill(squad);
  const wageRatio = clamp(wageBill / Math.max(1, cap), 0, 1.4);
  const roundsPlayed = Math.max(1, round);
  const roundsLeft = Math.max(0, totalRounds - round);
  const avgIncomePerRound = seasonIncomeTotal / roundsPlayed;
  const avgWagePerRound = seasonWageTotal / roundsPlayed;
  const avgNetPerRound = avgIncomePerRound - avgWagePerRound;
  const projectedEndBudget = budget + avgNetPerRound * roundsLeft;
  const seasonNetSoFar = seasonIncomeTotal - seasonWageTotal;

  return (
    <div className="rise-in space-y-2.5">
      <PaperCard>
        <div className="font-display text-xl">Ekonomi</div>
        <div className="text-11 mt-0.5" style={{ color: C.inkSoft }}>Budget, löner, sponsring och prognos för säsongen.</div>
        <div className="flex items-center justify-between mt-3">
          <div>
            <div className="text-9 uppercase tracking-wide font-semibold" style={{ color: C.inkSoft }}>Tillgänglig budget</div>
            <div className="font-display text-3xl mt-0.5" style={{ color: budget >= 0 ? C.ink : C.loss }}>{formatMoney(budget)}</div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-9 uppercase tracking-wide font-semibold" style={{ color: C.inkSoft }}>Säsongen hittills</div>
            <div className="font-mono text-lg font-bold mt-0.5" style={{ color: seasonNetSoFar >= 0 ? C.win : C.loss }}>{seasonNetSoFar >= 0 ? "▲ +" : "▼ "}{formatMoney(Math.round(seasonNetSoFar))}</div>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-1.5 mt-3">
          <EconomyStatCard icon="🎟️" label="Snittintäkt/omg" value={`+${formatMoney(Math.round(avgIncomePerRound))}`} valueColor={C.win} barColor={C.win} />
          <EconomyStatCard icon="💸" label="Snittlön/omg" value={`−${formatMoney(Math.round(avgWagePerRound))}`} valueColor={C.loss} barColor={C.loss} />
          <EconomyStatCard icon="🔮" label={`Prognos (${roundsLeft} omg kvar)`} value={formatMoney(Math.round(projectedEndBudget))} valueColor={projectedEndBudget >= 0 ? C.win : C.loss} barColor={projectedEndBudget >= 0 ? C.win : C.loss} />
        </div>
      </PaperCard>

      <PaperCard>
        <div className="text-10 uppercase tracking-wide font-semibold mb-2" style={{ color: C.inkSoft }}>Löneutrymme</div>
        <EconomyStatCard icon="⚖️" label={`${formatMoney(wageBill)} av ${formatMoney(cap)} lönetak`} value={`${Math.round(wageRatio * 100)}%`} valueColor={wageRatio >= 1 ? C.loss : C.ink} barPct={wageRatio * 100} barColor={wageRatio >= 1 ? C.loss : wageRatio >= 0.85 ? C.gold : C.win} />
        {wageRatio >= 0.95 && <div className="text-11 mt-2 font-semibold" style={{ color: C.loss }}>⚠️ Nära eller över lönetaket — Financial Fair Play kan blockera nya värvningar.</div>}
      </PaperCard>

      {transferInstallments && transferInstallments.length > 0 && (
        <PaperCard style={{ background: "rgba(180,68,59,0.06)" }}>
          <div className="text-10 uppercase tracking-wide font-semibold mb-2" style={{ color: C.loss }}>💳 Aktiva delbetalningar (övergångar)</div>
          <div className="space-y-2">
            {transferInstallments.map(inst => (
              <div key={inst.id} className="flex items-center justify-between text-11">
                <span style={{ color: C.ink }}>{inst.playerName}</span>
                <span className="font-mono font-semibold" style={{ color: C.loss }}>−{formatMoney(inst.monthlyPayment)}/mån · {inst.monthsLeft} mån kvar</span>
              </div>
            ))}
          </div>
        </PaperCard>
      )}

      <div className="text-xs uppercase tracking-wide font-semibold px-1" style={{ color: C.paperDim }}>Hantera</div>
      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => setSelectedCategory("loner")} className="p-3 rounded-xl text-left flex items-center gap-2.5" style={{ background: C.paper }}>
          <span className="w-8 h-8 rounded-full flex items-center justify-center text-sm shrink-0" style={{ background: `${C.loss}1c` }}>💸</span>
          <div className="min-w-0"><div className="font-semibold text-sm" style={{ color: C.ink }}>Löner</div><div className="text-10 truncate" style={{ color: C.inkSoft }}>{formatMoney(wageBill)}/omg</div></div>
        </button>
        <button onClick={() => setSelectedCategory("lan")} className="p-3 rounded-xl text-left flex items-center gap-2.5" style={{ background: C.paper }}>
          <span className="w-8 h-8 rounded-full flex items-center justify-center text-sm shrink-0" style={{ background: `${C.gold}22` }}>🏦</span>
          <div className="min-w-0"><div className="font-semibold text-sm" style={{ color: C.ink }}>Lån</div><div className="text-10 truncate" style={{ color: C.inkSoft }}>{loans?.length || 0} aktiva</div></div>
        </button>
        <button onClick={() => setSelectedCategory("sponsring")} className="p-3 rounded-xl text-left flex items-center gap-2.5" style={{ background: C.paper }}>
          <span className="w-8 h-8 rounded-full flex items-center justify-center text-sm shrink-0" style={{ background: `${C.win}22` }}>🤝</span>
          <div className="min-w-0"><div className="font-semibold text-sm" style={{ color: C.ink }}>Sponsring</div><div className="text-10 truncate" style={{ color: C.inkSoft }}>{Object.values(sponsors || {}).filter(Boolean).length}/3 avtal</div></div>
        </button>
        <button onClick={() => setSelectedCategory("arena")} className="p-3 rounded-xl text-left flex items-center gap-2.5" style={{ background: C.paper }}>
          <span className="w-8 h-8 rounded-full flex items-center justify-center text-sm shrink-0" style={{ background: "#3F74A822" }}>🏟️</span>
          <div className="min-w-0"><div className="font-semibold text-sm" style={{ color: C.ink }}>Arena</div><div className="text-10 truncate" style={{ color: C.inkSoft }}>Biljetter, restaurang & butik</div></div>
        </button>
        <button onClick={() => setSelectedCategory("kassaflode")} className="p-3 rounded-xl text-left flex items-center gap-2.5" style={{ background: C.paper }}>
          <span className="w-8 h-8 rounded-full flex items-center justify-center text-sm shrink-0" style={{ background: `${C.gold}22` }}>📊</span>
          <div className="min-w-0"><div className="font-semibold text-sm" style={{ color: C.ink }}>Kassaflöde</div><div className="text-10 truncate" style={{ color: C.inkSoft }}>Alla in- & utbetalningar</div></div>
        </button>
      </div>

      <PaperCard>
        <div className="text-10 uppercase tracking-wide font-semibold mb-2" style={{ color: C.inkSoft }}>Ekonomisk historik</div>
        <FinanceBarChart history={history} />
      </PaperCard>
    </div>
  );
}
function PersonalTab({ budget, staff, reputation, homeCountry, staffCandidates, onOpenStaffCandidates, onHireStaff, onRenegotiateStaff, dev, scoutingParts, onUpgrade, onUpgradePart, seasonStaffImpact, onSubViewChange }) {
  const [showDetail, setShowDetail] = useState(false);
  const [showScouting, setShowScouting] = useState(false);
  useEffect(() => { onSubViewChange?.(showDetail || showScouting); }, [showDetail, showScouting]);
  if (showDetail) return <StaffDetail budget={budget} staff={staff} reputation={reputation} homeCountry={homeCountry} staffCandidates={staffCandidates} onOpenCandidates={onOpenStaffCandidates} onHire={onHireStaff} onRenegotiate={onRenegotiateStaff} onBack={() => setShowDetail(false)} />;
  if (showScouting) return <ScoutingDetail dev={dev} budget={budget} scoutingParts={scoutingParts} onUpgrade={onUpgrade} onUpgradePart={onUpgradePart} onBack={() => setShowScouting(false)} />;

  const roles = [
    { key: "physio", label: "Fysioterapeut", impact: (m) => m ? `-${Math.round(m.level * 6)}% skadetid, lägre skaderisk i match och på träning.` : "Ingen anställd — högre skaderisk och längre läkningstid.",
      seasonText: (v) => `Har troligen förhindrat ca ${v.toFixed(1)} skador den här säsongen.` },
    { key: "assistant", label: "Assisterande tränare", impact: (m) => m ? `Sänker risken för gula och röda kort (nivå ${m.level}).` : "Ingen anställd — högre risk för kort i matcher.",
      seasonText: (v) => `Har troligen förhindrat ca ${v.toFixed(1)} kort den här säsongen.` },
    { key: "scout", label: "Scout", impact: (m) => m ? `Höjer scoutens träffsäkerhet med ca +${(m.level * 0.2).toFixed(1)} i scoutbetyg.` : "Ingen anställd — scoutuppdrag använder bara klubbens grundnivå." },
    { key: "gkCoach", label: "Målvaktstränare", impact: (m) => m ? `+${(m.level * 1.2).toFixed(1)}% i lagets försvarsstyrka i matcher.` : "Ingen anställd — inget extra tillskott till försvaret.",
      seasonText: (v) => `Har bidragit med totalt ca ${v.toFixed(0)} extra försvarspoäng över säsongens matcher.` },
    { key: "analyst", label: "Analytiker", impact: (m) => m ? `+${(m.level * 0.9).toFixed(1)}% i lagets anfallsstyrka i matcher.` : "Ingen anställd — inget extra tillskott till anfallet.",
      seasonText: (v) => `Har bidragit med totalt ca ${v.toFixed(0)} extra anfallspoäng över säsongens matcher.` },
    { key: "fitnessCoach", label: "Fystränare", impact: (m) => m ? `Snabbare orkåterhämtning, mindre uttröttning under match (nivå ${m.level}).` : "Ingen anställd — spelare återhämtar sig i normal takt.",
      seasonText: (v) => `Har gett laget totalt ca ${v.toFixed(0)} extra orkpoäng tillbaka den här säsongen.` },
  ];

  return (
    <div className="rise-in space-y-2.5">
      <PaperCard>
        <div className="font-display text-xl">Personal</div>
        <div className="text-11 mt-0.5" style={{ color: C.inkSoft }}>Er backroom-personal och vad de faktiskt bidrar med.</div>
      </PaperCard>
      <button onClick={() => setShowScouting(true)} className="w-full py-3 rounded-xl text-sm font-bold flex items-center justify-between px-4" style={{ background: C.gold, color: C.turfDeep, boxShadow: "0 2px 10px rgba(201,154,62,0.35)" }}>
        <span>Scoutnätverk — nivå {dev.scouting}/5</span>
        <ChevronRight size={18} />
      </button>
      {roles.map(r => {
        const member = staff[r.key];
        return (
          <PaperCard key={r.key}>
            <div className="flex items-center justify-between">
              <div className="text-xs uppercase tracking-wide font-semibold flex items-center gap-1.5" style={{ color: C.inkSoft }}>
                {r.label}
                {member?.needsRaise && <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#D9534F", display: "inline-block" }} />}
              </div>
              {member && <LevelDots level={member.level} />}
            </div>
            {member ? (
              <>
                <div className="flex items-center gap-2 mt-1.5">
                  <PlayerAvatar player={{ id: member.name, age: 42 }} size={28} />
                  <div className="min-w-0">
                    <div className="font-semibold text-sm truncate">{member.name} <span className="font-normal text-11" style={{ color: C.inkSoft }}>({nationalityLabel(member.nationality)})</span></div>
                    <div className="font-mono text-11" style={{ color: C.inkSoft }}>{formatMoney(member.wage)} / omgång · Kontrakt: {member.contractYears ?? "–"} år kvar</div>
                  </div>
                </div>
                <div className="mt-1.5">
                  <EconomyStatCard icon="😊" label="Trivsel" value={`${Math.round(member.satisfaction ?? 70)}%`} valueColor={(member.satisfaction ?? 70) <= 30 ? C.loss : C.ink} barPct={member.satisfaction ?? 70} barColor={(member.satisfaction ?? 70) <= 30 ? C.loss : (member.satisfaction ?? 70) >= 60 ? C.win : C.gold} />
                </div>
                {member.needsRaise && <div className="text-11 mt-1.5 font-semibold" style={{ color: C.loss }}>Vill omförhandla sin lön — trivseln sjunker tills detta löses.</div>}
                {r.seasonText && seasonStaffImpact?.[r.key] > 0.05 && <div className="text-10 mt-1.5" style={{ color: C.gold }}>{r.seasonText(seasonStaffImpact[r.key])}</div>}
              </>
            ) : <div className="text-sm mt-1" style={{ color: C.inkSoft }}>Tjänsten är obemannad.</div>}
            <div className="text-11 mt-1.5 font-semibold" style={{ color: member ? C.win : C.loss }}>{r.impact(member)}</div>
          </PaperCard>
        );
      })}
      <button onClick={() => setShowDetail(true)} className="w-full py-2.5 rounded-xl text-sm font-semibold" style={{ background: C.gold, color: C.turfDeep }}>Rekrytera / förhandla personal</button>
    </div>
  );
}
function PartnerClubDetail({ club, clubs, partnerClubId, onSign, onEnd, onBack }) {
  const [candidates] = useState(() => generatePartnerCandidates(clubs, club));
  const partner = partnerClubId ? clubs?.[partnerClubId] : null;
  return (
    <div className="rise-in space-y-2.5">
      <button onClick={onBack} style={{ position: "fixed", bottom: 14, right: 14, display: "inline-block", color: "rgba(255,255,255,0.85)", background: "rgba(19,34,29,0.88)", padding: "6px 13px", borderRadius: 999, fontSize: 11, fontWeight: 600, zIndex: 50, backdropFilter: "blur(4px)", boxShadow: "0 2px 10px rgba(0,0,0,0.35)" }}>← Bakåt</button>
      <PaperCard>
        <div className="font-display text-lg">Samarbetsklubb</div>
        <div className="text-11 mt-0.5" style={{ color: C.inkSoft }}>En mindre samarbetsklubb gör lån mellan er helt friktionsfria — inga förhandlingar, ingen väntan. Perfekt för att låna ut unga talanger för speltid, eller snabbt låna in en spelare vid skadekris.</div>
      </PaperCard>
      {partner ? (
        <PaperCard style={{ background: "rgba(201,154,62,0.15)" }}>
          <div className="flex items-center gap-2.5">
            <ClubJersey club={partner} size={30} />
            <div>
              <div className="font-semibold text-sm">{partner.name}</div>
              <div className="text-11" style={{ color: C.inkSoft }}>{divisionLabel(partner.league, partner.division)} · Er samarbetsklubb</div>
            </div>
          </div>
          <div className="text-11 mt-2" style={{ color: C.inkSoft }}>Gå till Övergångar → Bläddra klubbar & truppar → {partner.name} för att låna direkt i båda riktningar.</div>
          <button onClick={onEnd} className="mt-2 w-full py-2 rounded-xl text-xs font-semibold" style={{ background: "transparent", border: `1px solid ${C.loss}`, color: C.loss }}>Avsluta samarbetet</button>
        </PaperCard>
      ) : (
        <>
          <div className="text-xs uppercase tracking-wide font-semibold px-1" style={{ color: C.paperDim }}>Föreslagna klubbar</div>
          {candidates.length === 0 && <PaperCard><div className="text-sm text-center py-3" style={{ color: C.inkSoft }}>Inga lämpliga mindre klubbar hittades just nu.</div></PaperCard>}
          {candidates.map(id => {
            const c = clubs[id];
            if (!c) return null;
            const overall = squadOverallRating(c.squad);
            return (
              <PaperCard key={id}>
                <div className="flex items-center gap-2.5">
                  <ClubJersey club={c} size={28} />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm truncate">{c.name}</div>
                    <div className="text-10" style={{ color: C.inkSoft }}>{divisionLabel(c.league, c.division)}</div>
                    <div className="mt-0.5"><StarRating rating={overallToStars(overall)} size={8} /></div>
                  </div>
                </div>
                <button onClick={() => onSign(id)} className="mt-2 w-full py-2 rounded-xl text-xs font-semibold" style={{ background: C.gold, color: C.turfDeep }}>Skaffa samarbete</button>
              </PaperCard>
            );
          })}
        </>
      )}
    </div>
  );
}
function ClubTab({ club, dev, budget, history, reputation, fanbase,
  sponsors, staff, boardConfidence, boardTarget,
  squad, owner, takeoverBid, tourOffers, onRespondTakeover, onOpenTours, onStartTour, onRequestOwner, repHistory, fanHistory, shopLevel, division, merchandisePricing, onSetMerchandisePricing, onSubViewChange,
  clubs, partnerClubId, onSignPartnerClub, onEndPartnerClub, manager }) {
  const [selectedCategory, setSelectedCategory] = useState(null);
  useEffect(() => { onSubViewChange?.(!!selectedCategory); }, [selectedCategory]);
  const partnerClubName = partnerClubId ? clubs?.[partnerClubId]?.name : null;

  if (selectedCategory === "agare") return <OwnerDetail owner={owner} takeoverBid={takeoverBid} budget={budget} reputation={reputation} fanbase={fanbase} shopLevel={shopLevel} division={division} tourOffers={tourOffers} onRespondTakeover={onRespondTakeover} onOpenTours={onOpenTours} onStartTour={onStartTour} onRequestOwner={onRequestOwner} onBack={() => setSelectedCategory(null)} merchandisePricing={merchandisePricing} onSetMerchandisePricing={onSetMerchandisePricing} manager={manager} />;
  if (selectedCategory === "partner") return <PartnerClubDetail club={club} clubs={clubs} partnerClubId={partnerClubId} onSign={onSignPartnerClub} onEnd={onEndPartnerClub} onBack={() => setSelectedCategory(null)} />;

  const sponsorCount = Object.values(sponsors).filter(Boolean).length;
  const staffCount = Object.values(staff).filter(Boolean).length;
  const wageCap = wageBudgetCap(reputation, club.division, dev.sponsring);
  const wageTotal = totalWageBill(squad);
  const wageOverCap = wageTotal > wageCap;

  return (
    <div className="rise-in space-y-2.5">
      <PaperCard>
        <div className="text-xs uppercase tracking-wide font-semibold" style={{ color: C.inkSoft }}>Klubbtyp</div>
        <div className="font-display text-xl mt-1">{ARCHETYPE_LABEL[club.archetype]}</div>
        <div className="text-sm mt-1" style={{ color: C.inkSoft }}>{ARCHETYPE_DESC[club.archetype]}</div>
        <div className="mt-3 pt-3 grid grid-cols-2 gap-3" style={{ borderTop: `1px dashed ${C.paperDim}` }}>
          <div>
            <div className="text-9 uppercase tracking-wide font-semibold mb-1" style={{ color: C.win }}>Fördelar</div>
            <ul className="space-y-1">
              {ARCHETYPE_TRADEOFFS[club.archetype].pros.map((t, i) => <li key={i} className="text-10" style={{ color: C.inkSoft }}>+ {t}</li>)}
            </ul>
          </div>
          <div>
            <div className="text-9 uppercase tracking-wide font-semibold mb-1" style={{ color: C.loss }}>Nackdelar</div>
            <ul className="space-y-1">
              {ARCHETYPE_TRADEOFFS[club.archetype].cons.map((t, i) => <li key={i} className="text-10" style={{ color: C.inkSoft }}>− {t}</li>)}
            </ul>
          </div>
        </div>
      </PaperCard>

      <div className="text-11 px-1 py-1 text-center" style={{ color: C.inkSoft }}>Spelidén ställs numera in under <b>Trupp</b>, tillsammans med taktik och startelva.</div>

      <PaperCard>
        <div className="text-xs uppercase tracking-wide font-semibold mb-2" style={{ color: C.inkSoft }}>⭐ Rykte & Fanbase</div>
        <div className="flex items-center gap-3">
          <div className="flex-1 space-y-2"><StatBar label="Rykte" value={reputation} color={C.gold} /><StatBar label="Fanbase" value={fanbase} color={C.turf} /></div>
          <div className="shrink-0 space-y-1">
            <Sparkline data={repHistory} width={70} height={16} />
            <Sparkline data={fanHistory} width={70} height={16} />
          </div>
        </div>
        <div className="text-11 mt-2" style={{ color: C.inkSoft }}>Byggs sakta upp genom sportsliga resultat och cuptriumfer — går inte att köpa för pengar.</div>
      </PaperCard>

      <PaperCard>
        <div className="text-xs uppercase tracking-wide font-semibold mb-2" style={{ color: C.inkSoft }}>🏛️ Styrelsens förtroende</div>
        <StatBar label="" value={boardConfidence} color={boardConfidence <= 30 ? C.loss : C.gold} />
        <div className="text-11 mt-2" style={{ color: C.inkSoft }}>Säsongsmål: {boardTarget}</div>
      </PaperCard>

      <div className="text-11 px-1 py-1" style={{ color: C.inkSoft }}>Personal, löner, lån, sponsring, arena och akademi hittar du numera under Ekonomi, Trupp och Personal.</div>
      <div className="text-xs uppercase tracking-wide font-semibold px-1" style={{ color: C.paperDim }}>Klubbavdelningar</div>
      <button onClick={() => setSelectedCategory("agare")} className="w-full text-left">
        <PaperCard>
          <div className="flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-full flex items-center justify-center text-base shrink-0" style={{ background: `${C.gold}22` }}>👑</span>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm">Ägare & intäkter</div>
              <div className="text-11 mt-0.5 truncate" style={{ color: C.inkSoft }}>{owner.name} · Tålamod {Math.round(owner.patience)}%</div>
              {takeoverBid && <div className="text-10 mt-0.5 font-semibold" style={{ color: C.gold }}>⚠️ Övertagandebud väntar!</div>}
            </div>
            <span className="font-mono text-11 font-bold shrink-0" style={{ color: owner.patience >= 60 ? C.win : owner.patience >= 35 ? C.gold : C.loss }}>{Math.round(owner.patience)}%</span>
            <ChevronRight size={16} color={C.inkSoft} className="shrink-0" />
          </div>
        </PaperCard>
      </button>
      <button onClick={() => setSelectedCategory("partner")} className="w-full text-left">
        <PaperCard>
          <div className="flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-full flex items-center justify-center text-base shrink-0" style={{ background: `${C.win}22` }}>🤝</span>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm">Samarbetsklubb</div>
              <div className="text-11 mt-0.5 truncate" style={{ color: C.inkSoft }}>{partnerClubName ? `${partnerClubName} — lån utan förhandling` : "Ingen samarbetsklubb ännu"}</div>
            </div>
            {partnerClubName && <span className="text-9 font-bold px-2 py-0.5 rounded-full shrink-0" style={{ background: `${C.win}22`, color: C.win }}>AKTIV</span>}
            <ChevronRight size={16} color={C.inkSoft} className="shrink-0" />
          </div>
        </PaperCard>
      </button>

      {history && history.length > 0 && (
        <PaperCard>
          <div className="text-xs uppercase tracking-wide font-semibold mb-2" style={{ color: C.inkSoft }}>Klubbens historia</div>
          <div className="space-y-2">
            {[...history].reverse().slice(0, 6).map((h, i) => (
              <div key={i} className="text-xs font-mono" style={{ color: C.inkSoft }}>
                <div className="flex justify-between"><span>Säsong {h.season} · Div {h.division}</span><span>Plats {h.pos}</span></div>
                {(h.domesticCupResult || h.cup1Result || h.cup2Result) && <div className="text-10 mt-0.5 opacity-80">{[h.domesticCupResult, h.cup1Result, h.cup2Result].filter(Boolean).join(" · ")}</div>}
              </div>
            ))}
          </div>
        </PaperCard>
      )}
    </div>
  );
}
