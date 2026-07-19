import React, { useState, useMemo, useEffect, useRef } from "react";
import { Home, Trophy, CalendarDays, Users, ArrowLeftRight, Play, ChevronRight, TrendingUp, TrendingDown, Pencil, Check, X, Landmark, Building2, Star, Swords, Medal, Lock, GraduationCap, ArrowUpCircle, RotateCw, Layers, Trash2, Award, MessageCircle, Maximize, Minimize, Download, Upload } from "lucide-react";

// ---------------------------------------------------------------
// window.storage polyfill — this game was originally built for the
// claude.ai artifact sandbox, which provides window.storage out of
// the box. Outside that sandbox we back it with the browser's own
// localStorage, using the exact same {key, value} response shape so
// none of the game logic below needs to change.
// ---------------------------------------------------------------
if (typeof window !== "undefined" && !window.storage) {
  window.storage = {
    async get(key) {
      try { const v = localStorage.getItem(key); return v === null ? null : { key, value: v }; }
      catch (e) { return null; }
    },
    async set(key, value) {
      try { localStorage.setItem(key, value); return { key, value }; }
      catch (e) { return null; }
    },
    async delete(key) {
      try { localStorage.removeItem(key); return { key, deleted: true }; }
      catch (e) { return null; }
    },
    async list(prefix) {
      try { const keys = Object.keys(localStorage).filter(k => !prefix || k.startsWith(prefix)); return { keys, prefix }; }
      catch (e) { return null; }
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
function uid() { return Math.random().toString(36).slice(2, 10); }
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
    { code: "LB", label: "Vänsterback", col: 1, row: 0 },
    { code: "RB", label: "Högerback", col: 1, row: 4 },
    { code: "LWB", label: "Vänster wingback", col: 2, row: 0 },
    { code: "RWB", label: "Höger wingback", col: 2, row: 4 },
  ],
  MF: [
    { code: "CDM", label: "Defensiv mittfältare", col: 2, row: 2 },
    { code: "CM", label: "Central mittfältare", col: 3, row: 2 },
    { code: "CAM", label: "Offensiv mittfältare", col: 4, row: 2 },
    { code: "LM", label: "Vänster mittfältare", col: 3, row: 0 },
    { code: "RM", label: "Höger mittfältare", col: 3, row: 4 },
  ],
  AN: [
    { code: "ST", label: "Anfallare", col: 5, row: 2 },
    { code: "LW", label: "Vänsterytter", col: 4, row: 0 },
    { code: "RW", label: "Högerytter", col: 4, row: 4 },
  ],
};
const SPECIFIC_POSITION_LOOKUP = Object.values(SPECIFIC_POSITIONS).flat().reduce((acc, p) => { acc[p.code] = p; return acc; }, {});
function randomSpecificPosition(pos) {
  const options = SPECIFIC_POSITIONS[pos] || SPECIFIC_POSITIONS.MF;
  return pick(options).code;
}
function specificPositionLabel(code) { return SPECIFIC_POSITION_LOOKUP[code]?.label || code || ""; }
function positionFit(specificPos, col, row) {
  const anchor = SPECIFIC_POSITION_LOOKUP[specificPos];
  if (!anchor) return 0.6;
  const dist = Math.sqrt((col - anchor.col) ** 2 + (row - anchor.row) ** 2);
  return clamp(1 - dist / 4, 0.3, 1);
}
function nearestPositionForCell(col, row) {
  let best = null, bestDist = Infinity;
  Object.values(SPECIFIC_POSITION_LOOKUP).forEach(p => {
    const dist = Math.sqrt((col - p.col) ** 2 + (row - p.row) ** 2);
    if (dist < bestDist) { bestDist = dist; best = p; }
  });
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
    sum += positionFit(player.specificPosition, col, row);
    count++;
  });
  return count ? sum / count : 1;
}
function cellKey(col, row) { return `${col}-${row}`; }

// ---------- Countries ----------
const LEAGUE_FLAG = { england: "🇬🇧", italy: "🇮🇹", spain: "🇪🇸", germany: "🇩🇪", france: "🇫🇷" };
const TICKET_TIERS = {
  lagt: { label: "Lågt", desc: "Fler i publiken, mindre per biljett.", fillMult: 1.14, incomeMult: 0.65, fanAdj: 0.4 },
  medel: { label: "Medel", desc: "Balanserat pris för en vanlig matchdag.", fillMult: 1.0, incomeMult: 1.0, fanAdj: 0 },
  hogt: { label: "Högt", desc: "Mer per biljett, men färre kommer.", fillMult: 0.85, incomeMult: 1.35, fanAdj: -0.2 },
  premium: { label: "Premium", desc: "Maximal intäkt per biljett — riskerar tomma läktare.", fillMult: 0.65, incomeMult: 1.75, fanAdj: -0.5 },
};
const LEAGUES = [
  { id: "england", name: "Albion Football League", blurb: "Fysisk intensitet och fullsatta arenor varje helg.", cupName: "Silverskölden" },
  { id: "italy", name: "Serie Aurea", blurb: "Taktisk skicklighet och stolta klubbtraditioner.", cupName: "Coppa Regina" },
  { id: "spain", name: "Liga Ibérica", blurb: "Teknisk finess och het rivalitet i solen.", cupName: "Copa Imperial" },
  { id: "germany", name: "Adlerliga", blurb: "Organisation, disciplin och lojala supportrar.", cupName: "Kaiserpokal" },
  { id: "france", name: "Ligue Gauloise", blurb: "Talangfabriker och snabb, ung fotboll.", cupName: "Coupe Impériale" },
];
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
  nyrik: { tierMin: 65, tierMax: 80, incomeMult: 1.55, growth: 0.38, startBudget: 19000, startDev: { arena: 2, akademi: 1, scouting: 2, sponsring: 2 }, repAdj: -22, fanAdj: -16 },
  akademiklubb: { tierMin: 55, tierMax: 68, incomeMult: 0.85, growth: 0.25, startBudget: 2000, startDev: { arena: 1, akademi: 3, scouting: 2, sponsring: 1 }, repAdj: -3, fanAdj: -6 },
  utmanare: { tierMin: 60, tierMax: 74, incomeMult: 1.08, growth: 0.32, startBudget: 4600, startDev: { arena: 1, akademi: 2, scouting: 2, sponsring: 1 }, repAdj: 7, fanAdj: 2 },
};
const ARCHETYPE_DESC = {
  storklubb: "Stor, anrik klubb med höga förväntningar och bra ekonomi.",
  medelklubb: "Stabil klubb i mitten av tabellen med jämn utveckling.",
  arbetarklubb: "Passionerade fans och stark hemmaplansstämning, men begränsad budget.",
  nyrik: "Nya, rika ägare — enorma resurser men lågt rykte att bygga vidare på.",
  akademiklubb: "Fokus på ungdomsutveckling — billiga men lovande talanger.",
  utmanare: "Ambitiös klubb på frammarsch med stark tillväxtpotential.",
};
const ARCHETYPE_LABEL = { storklubb: "Storklubb", medelklubb: "Medelklubb", arbetarklubb: "Arbetarklubb", nyrik: "Nyrik klubb", akademiklubb: "Akademiklubb", utmanare: "Utmanare" };
const ARCHETYPE_TRADEOFFS = {
  storklubb: {
    pros: ["Stor startbudget (£11M) och bra faciliteter direkt", "Högt rykte gör värvningar enklare", "Stor hemmapublik ger bra matchdagsintäkter"],
    cons: ["Höga förväntningar från styrelsen redan säsong 1", "Långsammare organisk tillväxt — redan nära toppen"],
  },
  medelklubb: {
    pros: ["Balanserad start utan svaga punkter", "Rimliga, uppnåeliga mål från styrelsen"],
    cons: ["Inget som sticker ut — måste byggas upp överallt", "Ingen tydlig fördel att luta sig mot tidigt"],
  },
  arbetarklubb: {
    pros: ["Bästa matchdagsintäkterna relativt storlek (+22%)", "Lojala fans redan från start"],
    cons: ["Mycket liten startbudget (£2,6M)", "Långsam organisk tillväxt", "Lågt inledande rykte"],
  },
  nyrik: {
    pros: ["Enorm startbudget (£19M) — värva fritt direkt", "Snabbast tillväxttakt av alla klubbtyper"],
    cons: ["Mycket lågt rykte — svårt att locka stjärnor trots pengarna", "Svag, skeptisk fanbase måste byggas upp", "Historielös identitet i ligan"],
  },
  akademiklubb: {
    pros: ["Bästa ungdomsakademin i ligan från start", "Billiga, lovande talanger att fostra"],
    cons: ["Minst startbudget av alla klubbtyper (£2M)", "Svagast matchdagsekonomi (-15%)", "Tar tid innan akademin ger utdelning"],
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
  direkt: { label: "Direkt spel", atkMult: 1.05, defMult: 0.98 },
  balanserat: { label: "Balanserat", atkMult: 1, defMult: 1 },
  bollinnehav: { label: "Bollinnehåll", atkMult: 0.97, defMult: 1.05 },
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
  { key: "possession", label: "Bollinnehav", options: POSSESSION_OPTIONS },
  { key: "tempo", label: "Omställningar", options: TEMPO_OPTIONS },
  { key: "risk", label: "Försiktighet", options: RISK_OPTIONS },
];
const DEFAULT_TACTICAL_SETTINGS = { press: "medel", possession: "balanserat", tempo: "balanserat", risk: "balanserat" };
function combinedTacticalMods(settings) {
  const s = settings || DEFAULT_TACTICAL_SETTINGS;
  const p = PRESS_OPTIONS[s.press] || PRESS_OPTIONS.medel;
  const po = POSSESSION_OPTIONS[s.possession] || POSSESSION_OPTIONS.balanserat;
  const t = TEMPO_OPTIONS[s.tempo] || TEMPO_OPTIONS.balanserat;
  const r = RISK_OPTIONS[s.risk] || RISK_OPTIONS.balanserat;
  return {
    atkMult: (po.atkMult ?? 1) * (t.atkMult ?? 1) * (r.atkMult ?? 1),
    defMult: (p.defMult ?? 1) * (po.defMult ?? 1) * (t.defMult ?? 1) * (r.defMult ?? 1),
    cardMult: (p.cardMult ?? 1) * (r.cardMult ?? 1),
  };
}

// ---------- Hand-authored flagship clubs (become Division 1 anchors) ----------
const CLUB_DATA = [
  { id: "eng1", league: "england", name: "Liverpool Athletic", short: "LIV", color: "#C8102E", archetype: "storklubb" },
  { id: "eng2", league: "england", name: "Manchester Rovers", short: "MAN", color: "#1C87C9", archetype: "storklubb" },
  { id: "eng3", league: "england", name: "Thames Ironworks F.C.", short: "TIW", color: "#7A1E33", archetype: "storklubb" },
  { id: "eng4", league: "england", name: "Swindon Athletic", short: "SWI", color: "#4FA8E0", archetype: "medelklubb" },
  { id: "eng5", league: "england", name: "Southampton Rovers", short: "SOU", color: "#D99A2B", archetype: "arbetarklubb" },
  { id: "eng6", league: "england", name: "Wigan Wanderers", short: "WIG", color: "#6C3FA0", archetype: "nyrik" },
  { id: "eng7", league: "england", name: "Portsmouth Albion", short: "POR", color: "#2F8F5B", archetype: "akademiklubb" },
  { id: "eng8", league: "england", name: "Peterborough United", short: "PET", color: "#D2601F", archetype: "utmanare" },
  { id: "eng9", league: "england", name: "Northampton City", short: "NOR", color: "#1B2A55", archetype: "medelklubb" },
  { id: "eng10", league: "england", name: "Huddersfield Town", short: "HUD", color: "#1E8A82", archetype: "medelklubb" },

  { id: "ita1", league: "italy", name: "Roma 1927", short: "ROM", color: "#A9182C", archetype: "storklubb" },
  { id: "ita2", league: "italy", name: "Milano 1899", short: "MIL", color: "#A2001D", archetype: "storklubb" },
  { id: "ita3", league: "italy", name: "Avellino Sportiva", short: "AVE", color: "#3FA6D9", archetype: "medelklubb" },
  { id: "ita4", league: "italy", name: "Cremona Unione", short: "CRE", color: "#7A1F2B", archetype: "medelklubb" },
  { id: "ita5", league: "italy", name: "Verona 1913", short: "VER", color: "#2E7D4F", archetype: "arbetarklubb" },
  { id: "ita6", league: "italy", name: "Pescara 1920", short: "PES", color: "#C21E2A", archetype: "nyrik" },
  { id: "ita7", league: "italy", name: "Empoli Calcio", short: "EMP", color: "#E0B02A", archetype: "akademiklubb" },
  { id: "ita8", league: "italy", name: "Forlì AC", short: "FOR", color: "#D4772B", archetype: "utmanare" },
  { id: "ita9", league: "italy", name: "Udine Sportiva", short: "UDI", color: "#6A4C93", archetype: "medelklubb" },
  { id: "ita10", league: "italy", name: "Lucca Unione", short: "LUC", color: "#555A66", archetype: "medelklubb" },

  { id: "esp1", league: "spain", name: "CF Madrid", short: "MAD", color: "#1A1A1A", archetype: "storklubb" },
  { id: "esp2", league: "spain", name: "Deportivo Barcelona", short: "BAR", color: "#004D98", archetype: "storklubb" },
  { id: "esp3", league: "spain", name: "Deportivo Pamplona", short: "PAM", color: "#E08A2B", archetype: "medelklubb" },
  { id: "esp4", league: "spain", name: "Unión Albacete", short: "ALB", color: "#2E8B57", archetype: "medelklubb" },
  { id: "esp5", league: "spain", name: "UD Santander", short: "SAN", color: "#B22222", archetype: "arbetarklubb" },
  { id: "esp6", league: "spain", name: "Balompié Girona", short: "GIR", color: "#E0C93A", archetype: "nyrik" },
  { id: "esp7", league: "spain", name: "CF Badajoz", short: "BAD", color: "#2A5CAA", archetype: "akademiklubb" },
  { id: "esp8", league: "spain", name: "Real Gijón", short: "GIJ", color: "#D6A419", archetype: "utmanare" },
  { id: "esp9", league: "spain", name: "Deportivo Valladolid", short: "VAL", color: "#1E7A46", archetype: "medelklubb" },
  { id: "esp10", league: "spain", name: "Unión Lleida", short: "LLE", color: "#1B7A72", archetype: "medelklubb" },

  { id: "ger1", league: "germany", name: "München 1900", short: "MUN", color: "#DC052D", archetype: "storklubb" },
  { id: "ger2", league: "germany", name: "Dortmund 1909", short: "DOR", color: "#F2C230", archetype: "storklubb" },
  { id: "ger3", league: "germany", name: "Essen SC", short: "ESS", color: "#6C3FA0", archetype: "medelklubb" },
  { id: "ger4", league: "germany", name: "Ulm TSV", short: "ULM", color: "#D9B310", archetype: "medelklubb" },
  { id: "ger5", league: "germany", name: "Freiburg VfL", short: "FRE", color: "#2C4E8A", archetype: "arbetarklubb" },
  { id: "ger6", league: "germany", name: "Karlsruhe Kickers", short: "KAR", color: "#9A2E2E", archetype: "nyrik" },
  { id: "ger7", league: "germany", name: "Dresden Sportfreunde", short: "DRE", color: "#2E8B57", archetype: "akademiklubb" },
  { id: "ger8", league: "germany", name: "Duisburg SV", short: "DUI", color: "#1F4A32", archetype: "utmanare" },
  { id: "ger9", league: "germany", name: "Offenbach FC", short: "OFF", color: "#1B4F8A", archetype: "medelklubb" },
  { id: "ger10", league: "germany", name: "Aachen SC", short: "AAC", color: "#4FA8E0", archetype: "medelklubb" },

  { id: "fra1", league: "france", name: "FC Paris", short: "PAR", color: "#004170", archetype: "storklubb" },
  { id: "fra2", league: "france", name: "Racing Marseille", short: "MAR", color: "#3FA6D9", archetype: "storklubb" },
  { id: "fra3", league: "france", name: "US Rouen", short: "ROU", color: "#2A5CAA", archetype: "medelklubb" },
  { id: "fra4", league: "france", name: "Racing Orléans", short: "ORL", color: "#274690", archetype: "medelklubb" },
  { id: "fra5", league: "france", name: "Stade Mulhouse", short: "MUL", color: "#1E8A82", archetype: "arbetarklubb" },
  { id: "fra6", league: "france", name: "Olympique Caen", short: "CAE", color: "#C1272D", archetype: "nyrik" },
  { id: "fra7", league: "france", name: "FC Pau", short: "PAU", color: "#E0B02A", archetype: "akademiklubb" },
  { id: "fra8", league: "france", name: "AS Le Mans", short: "LEX", color: "#D2601F", archetype: "utmanare" },
  { id: "fra9", league: "france", name: "US Valenciennes", short: "VAL", color: "#B22222", archetype: "medelklubb" },
  { id: "fra10", league: "france", name: "Racing Lorient", short: "LOR", color: "#2E7D4F", archetype: "medelklubb" },
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
      clubs[c.id] = { id: c.id, league: c.league, division: 1, name: c.name, short: c.short, color: c.color, archetype: c.archetype, strength: clamp(rndInt(arche.tierMin, arche.tierMax), 22, 96), manager: generateManager(country.id) };
    });
    for (let i = 0; i < 10; i++) {
      const archetype = pick(DIV1_EXTRA_ARCHETYPES);
      const arche = ARCHETYPES[archetype];
      const id = `${country.id}_d1_p${i}`;
      const name = makeProceduralName(country.id, usedNames);
      clubs[id] = { id, league: country.id, division: 1, name, short: shortCodeFrom(name), color: pick(COLOR_POOL), archetype, strength: clamp(rndInt(arche.tierMin, arche.tierMax), 22, 96), manager: generateManager(country.id) };
    }
    for (let i = 0; i < 20; i++) {
      const archetype = pick(DIV2_ARCHETYPES);
      const arche = ARCHETYPES[archetype];
      const id = `${country.id}_d2_p${i}`;
      const name = makeProceduralName(country.id, usedNames);
      clubs[id] = { id, league: country.id, division: 2, name, short: shortCodeFrom(name), color: pick(COLOR_POOL), archetype, strength: clamp(rndInt(arche.tierMin, arche.tierMax) - 14, 22, 90), manager: generateManager(country.id) };
    }
    for (let i = 0; i < 20; i++) {
      const archetype = pick(DIV3_ARCHETYPES);
      const arche = ARCHETYPES[archetype];
      const id = `${country.id}_d3_p${i}`;
      const name = makeProceduralName(country.id, usedNames);
      clubs[id] = { id, league: country.id, division: 3, name, short: shortCodeFrom(name), color: pick(COLOR_POOL), archetype, strength: clamp(rndInt(arche.tierMin, arche.tierMax) - 26, 20, 80), manager: generateManager(country.id) };
    }
  });
  assignRivals(clubs);
  return clubs;
}
function assignRivals(clubs) {
  LEAGUES.forEach(country => {
    [1, 2, 3].forEach(div => {
      const ids = shuffle(clubsInPool(country.id, div, clubs).map(c => c.id));
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

const NATIONALITY_POOLS = {
  england: { first: ENG_FIRST, last: ENG_LAST, label: "England" },
  italy: { first: ITA_FIRST, last: ITA_LAST, label: "Italien" },
  spain: { first: ESP_FIRST, last: ESP_LAST, label: "Spanien" },
  germany: { first: GER_FIRST, last: GER_LAST, label: "Tyskland" },
  france: { first: FRA_FIRST, last: FRA_LAST, label: "Frankrike" },
  sydamerika: { first: SA_FIRST, last: SA_LAST, label: "Sydamerika" },
  afrika: { first: AF_FIRST, last: AF_LAST, label: "Afrika" },
  asien: { first: AS_FIRST, last: AS_LAST, label: "Asien" },
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

const REGION_LABELS = { europa: "Europa", sydamerika: "Sydamerika", afrika: "Afrika", asien: "Asien" };
const REGION_UNLOCK = { europa: 1, sydamerika: 3, afrika: 3, asien: 5 };
const REGION_BIAS = {
  europa: { attack: 0, defense: 0, priceMult: 1.0 },
  sydamerika: { attack: 5, defense: -3, priceMult: 1.15, nationality: "sydamerika" },
  afrika: { attack: 2, defense: 2, priceMult: 1.1, nationality: "afrika" },
  asien: { attack: -2, defense: 4, priceMult: 1.05, nationality: "asien" },
};

function randomPlayerName(nationality) { return nameForNationality(nationality || pick(NATIONALITY_KEYS)); }
function generateManager(clubCountry) {
  const nationality = Math.random() < 0.78 ? clubCountry : pick(NATIONALITY_KEYS.filter(n => n !== clubCountry));
  return { name: nameForNationality(nationality), nationality };
}
function computeWage(value, attack, defense) {
  return Math.max(4, Math.round(value * 0.018 + ((attack + defense) / 2) * 0.15));
}
const PERSONALITIES = ["Balanserad", "Balanserad", "Balanserad", "Balanserad", "Balanserad", "Ledare", "Lojal", "Ambitiös", "Problemspelare"];
const PERSONALITY_DESC = {
  Balanserad: "Inga särskilda utmärkande drag.",
  Ledare: "Stabiliserar laget — trivseln svänger mindre, i med- och motgång.",
  Lojal: "Ber sällan om en övergång, även vid missnöje.",
  Ambitiös: "Vill vinna titlar och spela regelbundet — annars växer missnöjet snabbt.",
  Problemspelare: "Trivseln svänger kraftigt, med ökad risk för gula kort.",
};
function makePlayer(pos, homeCountry, forcedSpecificPosition, archetype, division) {
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
  const value = Math.round(((attack + defense) / 2) * 8 + rndInt(-25, 35));
  const nationality = homeCountry ? randomDomesticNationality(homeCountry) : pick(NATIONALITY_KEYS);
  const age = rndInt(18, 33);
  const finalValue = Math.max(40, value);
  return { id: uid(), name: randomPlayerName(nationality), nationality, age, pos, specificPosition: forcedSpecificPosition || randomSpecificPosition(pos), attack, defense, value: finalValue, wage: computeWage(finalValue, attack, defense), contractYears: rndInt(1, 4), injuryWeeks: 0, yellowCards: 0, suspendedMatches: 0, morale: 70, personality: pick(PERSONALITIES), apps: 0, goals: 0, assists: 0, seasonLog: [], ratingSum: 0 };
}
function distributeSpecificPositions(pos, count) {
  if (pos !== "FÖ" && pos !== "MF") return Array.from({ length: count }, () => randomSpecificPosition(pos));
  const leftOptions = pos === "FÖ" ? ["LB", "LWB"] : ["LM"];
  const rightOptions = pos === "FÖ" ? ["RB", "RWB"] : ["RM"];
  const centerOptions = pos === "FÖ" ? ["CB"] : ["CDM", "CM", "CAM"];
  const guaranteed = [pick(leftOptions), pick(rightOptions), pick(centerOptions), pick(centerOptions)];
  const allOptions = SPECIFIC_POSITIONS[pos].map(p => p.code);
  const result = guaranteed.slice(0, count);
  for (let i = result.length; i < count; i++) result.push(pick(allOptions));
  return shuffle(result);
}
function makeSquad(homeCountry, archetype, division) {
  const counts = { MV: 2, FÖ: 7, MF: 7, AN: 4 };
  const squad = [];
  Object.entries(counts).forEach(([pos, n]) => {
    const specificPositions = distributeSpecificPositions(pos, n);
    for (let i = 0; i < n; i++) squad.push(makePlayer(pos, homeCountry, specificPositions[i], archetype, division));
  });
  for (let i = 0; i < 2; i++) squad.push(makePlayer(pick(POS_ORDER), homeCountry, null, archetype, division));
  squad.forEach((p, i) => { p.number = i + 1; });
  return squad;
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
  const value = Math.max(60, Math.round(((attack + defense) / 2) * 8 * bias.priceMult + rndInt(-25, 35)));
  const nationality = bias.nationality || pick(EUROPEAN_NATIONALITIES);
  const age = rndInt(19, 31);
  const clubId = clubs ? pickOwningClub(clubs, (attack + defense) / 2) : null;
  return { id: uid(), name: randomPlayerName(nationality), nationality, age, pos, specificPosition: randomSpecificPosition(pos), attack, defense, value, wage: computeWage(value, attack, defense), clubId, contractYears: rndInt(2, 5), injuryWeeks: 0, yellowCards: 0, suspendedMatches: 0, morale: 70, apps: 0, goals: 0, ratingSum: 0 };
}
function effectiveScoutRating(dev, reputation, analysBonus = 0) { return clamp(dev.scouting + reputation / 25 + analysBonus * 0.4, 1, 9.5); }

// ---------- Scout missions (targeted search with filters) ----------
function scoutMissionDuration(scoutLevel) { return clamp(7 - (scoutLevel || 0) * 1.1, 2, 7); }
function scoutMissionCeiling(scoutLevel, division) {
  const divAdj = division === 1 ? 0 : division === 2 ? -8 : division === 3 ? -16 : 0;
  const base = scoutLevel ? clamp(58 + scoutLevel * 7, 58, 95) : 62;
  return clamp(base + divAdj, 38, 95);
}
function generateScoutCandidate(mission, scoutLevel, clubs, division) {
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
    let value = Math.max(60, Math.round(((attack + defense) / 2) * 8 + rndInt(-20, 30)));
    if (mission.maxValue && value > mission.maxValue) { if (tries < maxTries - 1) continue; value = mission.maxValue; }
    const wage = computeWage(value, attack, defense);
    if (mission.maxWage && wage > mission.maxWage) { if (tries < maxTries - 1) continue; }
    const nationality = pick(NATIONALITY_KEYS);
    const clubId = pickOwningClub(clubs, (attack + defense) / 2);
    const ageRoom = clamp((26 - age) * 2.2, 0, 22);
    const potential = clamp(Math.round((attack + defense) / 2 + ageRoom + rnd(-4, 8)), Math.round((attack + defense) / 2), 99);
    if (mission.minPotential && potential < mission.minPotential) { if (tries < maxTries - 1) continue; }
    const candidate = { id: uid(), name: randomPlayerName(nationality), nationality, age, pos, specificPosition: randomSpecificPosition(pos), attack, defense, potential, value, wage: mission.maxWage ? Math.min(wage, mission.maxWage) : wage, clubId, contractYears: rndInt(1, 4), injuryWeeks: 0, yellowCards: 0, suspendedMatches: 0, morale: 70, personality: pick(PERSONALITIES), apps: 0, goals: 0, assists: 0, seasonLog: [], ratingSum: 0 };
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
function scoutComment(candidate) {
  const attrs = getAttrs(candidate);
  const entries = Object.entries(attrs).filter(([k]) => k !== "physical" || candidate.pos !== "MV");
  entries.sort((a, b) => b[1] - a[1]);
  const strongest = entries[0], weakest = entries[entries.length - 1];
  const strongLine = { shooting: "farlig framför mål", passing: "skickligt passningsspel", dribbling: "trixig med bollen", pace: "explosiv fart", defending: "stark i det defensiva spelet", physical: "fysiskt dominant" }[strongest[0]] || "solid över lag";
  const weakLine = { shooting: "kan bli vassare i avslutet", passing: "något osäker i passningsspelet", dribbling: "begränsad i dribblingar", pace: "saknar toppfart", defending: "sårbar defensivt", physical: "kan bli fysiskt starkare" }[weakest[0]] || "";
  const potentialLine = candidate.potential && candidate.potential - overallOf(candidate) >= 8 ? " Scouten tror det finns mer att hämta med rätt utveckling." : "";
  return `Är ${strongLine}, men ${weakLine}.${potentialLine}`;
}
const SCOUT_PRESETS = [
  { key: "malfarlig", label: "Målfarlig anfallare", posFilter: "AN", attrs: { shooting: 68 } },
  { key: "bollforande", label: "Bollförande försvarare", posFilter: "FÖ", attrs: { passing: 62 } },
  { key: "box2box", label: "Box-to-box mittfältare", posFilter: "MF", attrs: { physical: 62, passing: 55 } },
  { key: "snabb", label: "Snabb kantspelare", posFilter: null, attrs: { pace: 70 } },
  { key: "lovande", label: "Ung talang med hög potential", posFilter: null, attrs: {}, minPotential: 78, ageMax: 21 },
];
const SELL_THRESHOLD = { storklubb: 1.28, nyrik: 1.32, medelklubb: 1.05, arbetarklubb: 0.92, akademiklubb: 0.88, utmanare: 1.0 };
function negotiateOffer(offerAmount, value, club, reputation, rivalBoost = 1) {
  const threshold = (SELL_THRESHOLD[club.archetype] || 1.1) * value * (1 - reputation / 500) * rivalBoost;
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
function generateIncomingOffers(squad, clubs, userClubId, reputation) {
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
  const eligible = squad.filter(p => !p.transferListed && p.contractYears <= 3 && overallOf(p) >= 52);
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
  return {
    shooting: clamp(Math.round((player.pos === "FÖ" || player.pos === "MV" ? d * 0.3 + a * 0.3 : a) + j()), 8, 96),
    passing: clamp(Math.round(a * 0.4 + d * 0.4 + j()), 8, 96),
    dribbling: clamp(Math.round(a * 0.9 + j()), 8, 96),
    pace: clamp(Math.round(a * 0.7 + d * 0.2 + j()), 8, 96),
    defending: clamp(Math.round(d * 0.95 + j()), 8, 96),
    physical: clamp(Math.round(((a + d) / 2) * 0.85 + j()), 8, 96),
  };
}
function weakFoot(player) {
  const roll = seededRandom(String(player.id) + "weakfoot")();
  if (roll < 0.08) return 5;
  if (roll < 0.22) return 4;
  if (roll < 0.55) return 3;
  if (roll < 0.85) return 2;
  return 1;
}
function headingAbility(player) {
  const rng = seededRandom(String(player.id) + "heading");
  const j = Math.floor(rng() * 21) - 10;
  const a = clamp(player.attack, 12, 96), d = clamp(player.defense, 12, 96);
  const base = player.pos === "FÖ" ? d * 0.55 + a * 0.2 : player.pos === "AN" ? a * 0.55 + d * 0.1 : player.pos === "MV" ? d * 0.3 : (a + d) / 2 * 0.4;
  return clamp(Math.round(base + j), 10, 96);
}
function injuryProneness(player) {
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
  const rng = seededRandom(String(player.id) + "clutch")();
  return Math.round((rng - 0.5) * 2 * 10) / 10;
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
  const outfield = fit.filter(p => p.pos !== "MV").sort(byOverall);
  return [...gks.slice(0, 1), ...outfield.slice(0, 10)];
}
function getXI(squad, startingXI) {
  if (startingXI && startingXI.length === 11) {
    const matched = startingXI.map(id => squad.find(p => p.id === id)).filter(p => p && !p.injuryWeeks && !p.suspendedMatches && !p.internationalDuty);
    if (matched.length === 11) return matched;
  }
  return pickBestXI(squad);
}

// ---------- Formations ----------
const FORMATION_CODES = ["4-4-2", "4-3-3", "4-2-3-1", "4-1-2-1-2", "3-5-2", "3-2-1-3-1", "5-2-2-1", "3-1-3-2-1", "4-5-1", "3-4-3"];
function parseFormation(code) {
  const lines = code.split("-").map(Number);
  const n = lines.length;
  const slots = [{ id: "gk", role: "MV", x: 6, y: 50 }];
  lines.forEach((count, li) => {
    const x = 22 + (n === 1 ? 0 : (li / (n - 1)) * 66);
    let role = "MF";
    if (li === 0) role = "FÖ";
    else if (li === n - 1) role = "AN";
    for (let i = 0; i < count; i++) {
      const y = count === 1 ? 50 : 10 + (i / (count - 1)) * 80;
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

// ---------- Club facility sub-parts (Arena/Akademi/Scouting details) ----------
const STAND_NAMES = { north: "Norra läktaren", south: "Södra läktaren", east: "Östra läktaren", west: "Västra läktaren" };
const STAND_TIER_NAMES = ["Ståplats", "Sittplatser", "Numrerade platser", "Läktartak", "VIP-loger"];
function standCapacity(level) { return 1200 + level * 1300; }
function arenaConstructionDuration(targetLevel) { return clamp(6 + (targetLevel - 1) * 9, 6, 50); }
function arenaCapacityOf(dev, stands) {
  const s = stands || { north: 1, south: 1, east: 1, west: 1 };
  return Math.round(4000 + dev.arena * 2000 + Object.values(s).reduce((sum, l) => sum + standCapacity(l), 0));
}
function partUpgradeCost(category, level) {
  const base = { arenaStands: 350, arenaFacilities: 300, akademiParts: 380, scoutingParts: 380 }[category];
  return Math.round(base * Math.pow(level, 1.55));
}
const PART_MAX = { arenaStands: 5, arenaFacilities: 3, akademiParts: 3, scoutingParts: 3 };

const SPONSOR_NAME_POOL = {
  main: ["Nordisk Bank", "Solar Energi AB", "TeknikVaruhuset", "Bryggeri Kronan", "Fraktbolaget Nord", "Försäkring Trygg", "Kristallteknik"],
  stadium: ["Kristallbanken Arena", "Solkraft Arena", "Hamnstaden Arena", "Silverfabriken Arena", "Nordluft Arena", "Vintergatan Arena"],
  local: ["Stadens Bageri", "Bilverkstaden", "Café Mötesplatsen", "Sportbutiken", "Byggvaruhuset", "Restaurang Hörnan"],
};
const SPONSOR_SLOT_LABEL = { main: "Huvudsponsor (matchtröja)", stadium: "Arenapartner (namnrätt)", local: "Lokala partners" };
function generateSponsorOffers(slotType, reputation) {
  const pool = SPONSOR_NAME_POOL[slotType];
  const baseIncome = slotType === "main" ? 60 : slotType === "stadium" ? 45 : 20;
  const repMult = 0.6 + reputation / 100;
  const used = new Set();
  return Array.from({ length: 3 }, () => {
    let name = pick(pool);
    let tries = 0; while (used.has(name) && tries < 8) { name = pick(pool); tries++; }
    used.add(name);
    const income = Math.round(baseIncome * repMult * rnd(0.8, 1.3));
    const bonus = Math.round(income * rnd(2, 5));
    return { id: uid(), name, income, bonus };
  });
}
function negotiateSponsor(offer, reputation) {
  const walkChance = clamp(0.14 - reputation / 800, 0.04, 0.14);
  if (Math.random() < walkChance) return { result: "walk" };
  const improveChance = clamp(0.35 + reputation / 300, 0.3, 0.6);
  if (Math.random() < improveChance) {
    return { result: "improved", offer: { ...offer, income: Math.round(offer.income * rnd(1.1, 1.25)), bonus: Math.round(offer.bonus * rnd(1.05, 1.15)) } };
  }
  return { result: "same" };
}

// ---------- Staff ----------
const STAFF_ROLE_LABEL = { assistant: "Assisterande tränare", physio: "Fysioterapeut", scout: "Huvudscout" };
const STAFF_ROLE_DESC = {
  assistant: "Bättre matchdagsdisciplin — färre gula/röda kort och en liten prestationsboost.",
  physio: "Minskar skaderisken i match och kortar återhämtningstiden vid skador.",
  scout: "Höjer kvalitetstaket på spelare ni hittar, både i A-laget och på ungdomsmarknaden.",
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
function totalWageBill(squad) { return squad.reduce((s, p) => s + (p.wage || 0), 0); }
function wageDemand(player) {
  const rng = seededRandom(String(player.id) + "wage" + player.contractYears);
  const avgRating = player.apps ? player.ratingSum / player.apps : 6.2;
  const formBonus = clamp((avgRating - 6) * 0.2, -0.2, 0.4);
  const overallish = (player.attack + player.defense) / 2;
  const target = Math.max(player.wage, Math.round(overallish * 0.55 * (1 + formBonus) + rng() * 8));
  return Math.round(target);
}
function negotiateWage(offerWage, targetWage, reputation) {
  const ratio = offerWage / targetWage;
  if (ratio >= 1) return { result: "accept" };
  if (ratio >= 0.82) return { result: "counter", counterWage: Math.round(targetWage * rnd(0.98, 1.05)) };
  return { result: "reject" };
}

// ---------- Ownership & governance ----------
const OWNER_TYPES = {
  talmodig: { label: "Tålmodig investerare", desc: "Skjuter till kapital utan att kräva mycket tillbaka, men tappar tålamod om ni misslyckas flera säsonger i rad.", patienceDecay: 0.6 },
  kravande: { label: "Krävande ägare", desc: "Ger stora resurser men vill se resultat direkt — förtroendet svänger snabbt åt båda hållen.", patienceDecay: 1.4 },
  sparsam: { label: "Sparsam ägare", desc: "Håller hårt i pengarna och kräver ibland utdelning, men är svår att reta upp.", patienceDecay: 0.4 },
};
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
function initialManager(name, nationality, division) {
  const base = { 1: 42, 2: 34, 3: 26 }[division] || 30;
  return {
    name: name || "Ny tränare", nationality: nationality || pick(NATIONALITY_KEYS),
    reputation: base, wage: Math.round(base * 2.2), contractYears: 3, yearsAsManager: 0,
    attributes: { taktik: rndInt(base - 8, base + 8), motivation: rndInt(base - 8, base + 8), forhandling: rndInt(base - 8, base + 8), utveckling: rndInt(base - 8, base + 8) },
    interestedClub: null,
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
function merchandiseIncome(fanbase, shopLevel) { return Math.round(fanbase * 0.6 + shopLevel * 15); }
function generateTourOffers(reputation) {
  return [
    { id: uid(), name: "Turné i Asien", cost: 250, incomeMin: 300, incomeMax: 700, repBonus: 3 },
    { id: uid(), name: "Turné i Nordamerika", cost: 180, incomeMin: 200, incomeMax: 500, repBonus: 2 },
    { id: uid(), name: "Lokal försäsongsturné", cost: 60, incomeMin: 60, incomeMax: 160, repBonus: 1 },
  ];
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
  let newYouth = youthSquad;
  let newSponsors = sponsors;
  let newOffers = incomingOffers;
  let newSquad = squad;
  let budgetDelta = 0;

  if (youthSquad.length && Math.random() < 0.05) {
    const idx = rndInt(0, youthSquad.length - 1);
    const boost = rnd(2, 5);
    newYouth = youthSquad.map((y, i) => i === idx ? { ...y, attack: clamp(y.attack + boost, 15, 99), defense: clamp(y.defense + boost * 0.6, 15, 99) } : y);
    messages.push(`${youthSquad[idx].name} gör ett genombrott på träningen!`);
  }

  const underpaid = squad.filter(p => p.wage < wageDemand(p) * 0.8 && overallOf(p) >= 68);
  if (underpaid.length && Math.random() < 0.08) {
    const p = pick(underpaid);
    const newWage = Math.round(wageDemand(p) * rnd(0.9, 1.05));
    newSquad = squad.map(pl => pl.id === p.id ? { ...pl, wage: newWage } : pl);
    messages.push(`${p.name}s agent förhandlar fram en löneförhöjning till ${formatMoney(newWage)}/omg.`);
  }

  const clausedPlayers = newSquad.filter(p => p.releaseClause);
  if (windowOpen && clausedPlayers.length && Math.random() < 0.1) {
    const p = pick(clausedPlayers);
    newSquad = newSquad.filter(pl => pl.id !== p.id);
    budgetDelta += p.releaseClause;
    messages.push(`En klubb löste ut ${p.name}s utköpsklausul för ${formatMoney(p.releaseClause)}!`);
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
  }

  const emptySlots = Object.entries(sponsors).filter(([, v]) => !v).map(([k]) => k);
  if (emptySlots.length && Math.random() < 0.06) {
    const slot = pick(emptySlots);
    const offer = generateSponsorOffers(slot, reputation)[0];
    newSponsors = { ...sponsors, [slot]: { name: offer.name, income: offer.income } };
    messages.push(`${offer.name} hör spontant av sig och blir ny sponsor (+${formatMoney(offer.income)}/omg)!`);
  }

  return { newYouth, newSponsors, newOffers, newSquad, messages, budgetDelta };
}

function generateYouthProspect(akademiLevel, intakeBonus = 0, homeCountry) {
  const potentialBase = 45 + akademiLevel * 8 + intakeBonus * 3;
  const variance = 25 - akademiLevel * 3;
  const potential = clamp(rndInt(potentialBase - variance, potentialBase + variance), 35, 99);
  const pos = pick(POS_ORDER);
  const startFactor = 0.35 + Math.random() * 0.15;
  const attack = clamp(Math.round(potential * startFactor * (pos === "AN" ? 1.15 : pos === "MF" ? 1.0 : pos === "FÖ" ? 0.7 : 0.4)), 15, 60);
  const defense = clamp(Math.round(potential * startFactor * (pos === "FÖ" || pos === "MV" ? 1.15 : pos === "MF" ? 0.9 : 0.5)), 15, 60);
  const value = Math.max(40, Math.round(potential * 4 + rndInt(-20, 20)));
  const foreignChance = clamp(0.05 + intakeBonus * 0.08, 0.05, 0.3);
  const nationality = homeCountry ? (Math.random() < foreignChance ? pick(NATIONALITY_KEYS.filter(n => n !== homeCountry)) : homeCountry) : pick(NATIONALITY_KEYS);
  const age = rndInt(15, 17);
  return { id: uid(), name: randomPlayerName(nationality), nationality, age, pos, specificPosition: randomSpecificPosition(pos), attack, defense, potential, yearsInAcademy: 0, value, apps: 0, goals: 0, ratingSum: 0 };
}
function growYouth(y, akademiLevel, spelide, coachBonus = 0) {
  const reliability = akademiLevel / 5;
  const gap = y.potential - (y.attack + y.defense) / 2;
  const bustChance = clamp(0.35 - akademiLevel * 0.06 - coachBonus * 0.04, 0.04, 0.35);
  let growth = Math.random() < bustChance ? rnd(-1.5, 0.5) : rnd(1, 4) * (0.4 + reliability * 0.8) * (gap > 0 ? 1 : 0.3);
  growth *= SPELIDE_MODS[spelide].akademiGrowth;
  const attackShare = y.pos === "AN" ? 0.6 : y.pos === "MF" ? 0.5 : y.pos === "FÖ" ? 0.35 : 0.25;
  const attack = clamp(y.attack + growth * attackShare * 2, 15, 99);
  const defense = clamp(y.defense + growth * (1 - attackShare) * 2, 15, 99);
  return { ...y, attack, defense, yearsInAcademy: y.yearsInAcademy + 1, value: Math.max(40, Math.round(((attack + defense) / 2) * 4 + y.potential * 3)) };
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
  return rounds;
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

function userStrength(xi, tactic, spelide, tacticalSettings, fitScore) {
  let attack = xi.reduce((s, p) => s + p.attack * (p.pos === "AN" ? 1.3 : p.pos === "MF" ? 1.1 : 0.5), 0) / xi.length;
  let defense = xi.reduce((s, p) => s + p.defense * (p.pos === "FÖ" || p.pos === "MV" ? 1.3 : p.pos === "MF" ? 0.9 : 0.5), 0) / xi.length;
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
  return { attack: clamp(attack, 20, 99), defense: clamp(defense, 20, 99) };
}
function pickScorerDetailed(squad, count, setPieceTakers) {
  const outfield = squad.filter(p => p.pos !== "MV");
  const openPlayWeighted = [];
  outfield.forEach(p => {
    const w = p.pos === "AN" ? 3 : p.pos === "MF" ? 1.6 : 0.5;
    const weight = Math.max(1, Math.round((p.attack / 10) * w));
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
      const setPieceWeighted = [];
      outfield.forEach(p => { const w = Math.max(1, Math.round(getAttrs(p).physical / 12)); for (let j = 0; j < w; j++) setPieceWeighted.push(p); });
      results.push({ player: pick(setPieceWeighted), method: "header" });
    } else {
      results.push({ player: openPlayWeighted.length ? pick(openPlayWeighted) : pick(squad), method: "openplay" });
    }
  }
  return results;
}
function pickScorer(squad, count, setPieceTakers) {
  return pickScorerDetailed(squad, count, setPieceTakers).map(r => r.player);
}
function pickAssist(squad, scorer, setPieceTakers) {
  if (Math.random() < 0.22) return null;
  const candidates = squad.filter(p => p.pos !== "MV" && p.id !== scorer.id);
  if (!candidates.length) return null;
  const cornerIds = new Set([setPieceTakers?.cornerLeft, setPieceTakers?.cornerRight].filter(Boolean));
  const weighted = [];
  candidates.forEach(p => {
    const w = (p.pos === "MF" ? 3 : p.pos === "AN" ? 1.5 : p.pos === "FÖ" ? 0.8 : 1) * (cornerIds.has(p.id) ? 1.8 : 1);
    const weight = Math.max(1, Math.round((p.attack / 12) * w));
    for (let i = 0; i < weight; i++) weighted.push(p);
  });
  return pick(weighted);
}
function ratingsForResult(squad, scorerNames, result) {
  const counts = {}; scorerNames.forEach(n => { counts[n] = (counts[n] || 0) + 1; });
  return squad.map(p => {
    const goals = counts[p.name] || 0;
    const rating = clamp(6.0 + rnd(-0.6, 0.6) + (result === "win" ? 0.35 : result === "loss" ? -0.25 : 0) + goals * 1.1, 3.5, 9.8);
    return { id: p.id, name: p.name, pos: p.pos, rating: Math.round(rating * 10) / 10, goals };
  }).sort((a, b) => b.rating - a.rating);
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
      const ratings = ratingsForResult(xi, scorers, userWon ? "win" : "loss");
      const winnerId = userWon ? userClubId : oppId;
      winners.push(winnerId);
      userReport = { oppName: opp.name, userGoals, oppGoals, penalties, result: userWon ? "win" : "loss", ratings };
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
  const ratings = ratingsForResult(xi, scorers, userWon ? "win" : "loss");
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
  return `Utslagna i ${cup.roundName.toLowerCase()}en`;
}
const CUP1_PRIZES = { participation: 300, quarterfinal: 550, semifinal: 1000, runnerup: 1800, winner: 3500 };
const CUP2_PRIZES = { participation: 150, quarterfinal: 280, semifinal: 500, runnerup: 850, winner: 1700 };
const DOMESTIC_PRIZES = { participation: 15, quarterfinal: 70, semifinal: 150, runnerup: 280, winner: 650 };

// ---------- Continental qualification ----------
function buildSeason1Qualifiers(clubs) {
  const cup1List = [];
  LEAGUES.forEach(l => {
    const div1 = Object.values(clubs).filter(c => c.league === l.id && c.division === 1).sort((a, b) => b.strength - a.strength);
    cup1List.push(...div1.slice(0, 3).map(c => c.id));
  });
  if (cup1List.length < 16) {
    const remaining = Object.values(clubs).filter(c => c.division === 1 && !cup1List.includes(c.id)).sort((a, b) => b.strength - a.strength);
    for (const c of remaining) { if (cup1List.length >= 16) break; cup1List.push(c.id); }
  }
  const cup1Set = new Set(cup1List.slice(0, 16));

  const cup2List = [];
  LEAGUES.forEach(l => {
    const div1 = Object.values(clubs).filter(c => c.league === l.id && c.division === 1 && !cup1Set.has(c.id)).sort((a, b) => b.strength - a.strength);
    cup2List.push(...div1.slice(0, 2).map(c => c.id));
  });
  if (cup2List.length < 16) {
    const remaining = Object.values(clubs).filter(c => c.division === 1 && !cup1Set.has(c.id) && !cup2List.includes(c.id)).sort((a, b) => b.strength - a.strength);
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
  const results = [];
  for (let r = 0; r < round; r++) {
    const f = schedule[r].find(x => x.home === userClubId || x.away === userClubId);
    if (!f || f.homeGoals === null) continue;
    const userIsHome = f.home === userClubId;
    const ug = userIsHome ? f.homeGoals : f.awayGoals, og = userIsHome ? f.awayGoals : f.homeGoals;
    results.push(ug > og ? "win" : ug < og ? "loss" : "draw");
  }
  return results.slice(-5);
}

// ---------- Root component ----------
export default function TranarbankenApp() {
  const [previewWorld] = useState(() => generateWorld());
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
      staff: parsed.staff || { assistant: null, physio: null, scout: null },
      boardConfidence: parsed.boardConfidence === undefined ? 60 : parsed.boardConfidence,
      plannedSub: parsed.plannedSub || null,
      incomingOffers: parsed.incomingOffers || [],
      loans: parsed.loans || [],
      formationCode: parsed.formationCode || "4-4-2",
      tacticalSettings: parsed.tacticalSettings || { ...DEFAULT_TACTICAL_SETTINGS },
      lineupCells: parsed.lineupCells || null,
      owner: parsed.owner || generateOwner(parsed.reputation),
      takeoverBid: parsed.takeoverBid || null,
      tourOffers: parsed.tourOffers || null,
      tourCompletedThisOffseason: parsed.tourCompletedThisOffseason || false,
      formationFamiliarity: parsed.formationFamiliarity || 0,
      teamTalk: parsed.teamTalk || "neutral",
      pendingLateGame: null,
      pendingMidGame: null,
      cupQueue: parsed.cupQueue || [],
      scoutMission: parsed.scoutMission || null,
      ticketPrice: parsed.ticketPrice || "medel",
      arenaConstruction: parsed.arenaConstruction || null,
      outgoingLoans: parsed.outgoingLoans || [],
      loanOffers: parsed.loanOffers || [],
      seasonIncomeTotal: parsed.seasonIncomeTotal || 0, seasonWageTotal: parsed.seasonWageTotal || 0,
      difficulty: parsed.difficulty || "normal",
      savedScoutProfiles: parsed.savedScoutProfiles || [],
      clubRecords: parsed.clubRecords || {},
      setPieceTakers: parsed.setPieceTakers || { penalties: [], freeKick: null, cornerLeft: null, cornerRight: null },
      chemistryPairs: parsed.chemistryPairs || {},
      sillySeasonWeeksLeft: parsed.sillySeasonWeeksLeft || 0,
      season1Qualifiers: parsed.season1Qualifiers || null,
      repHistory: parsed.repHistory && parsed.repHistory.length ? parsed.repHistory : [parsed.reputation],
      fanHistory: parsed.fanHistory && parsed.fanHistory.length ? parsed.fanHistory : [parsed.fanbase],
      manager: parsed.manager || initialManager("Din tränare", parsed.leagueId, parsed.clubs[parsed.userClubId]?.division || 2),
      assistantManager: parsed.assistantManager || null,
      startingXI: parsed.startingXI || pickBestXI(parsed.squad).map(p => p.id),
    };
  }

  function saveSummary(state) {
    const club = state.clubs[state.userClubId];
    return { clubName: club.name, countryName: LEAGUES.find(l => l.id === state.leagueId)?.name || "", division: club.division, season: state.season, lastPlayed: new Date().toISOString() };
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
    (async () => { try { await window.storage?.set(`tranarbanken-save-${activeSaveId}`, JSON.stringify(g)); } catch (e) {} })();
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

  const standings = useMemo(() => {
    if (!g.setupDone) return [];
    const club = g.clubs[g.userClubId];
    return computeStandings(g.schedule, clubsInPool(g.leagueId, club.division, g.clubs).map(c => c.id));
  }, [g.schedule, g.clubs, g.setupDone, g.leagueId, g.userClubId]);

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(null), 2400); }

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

  function handleConfirmSetup(countryId, division, clubId, managerName, pressChoice) {
    const clubs = previewWorld;
    const club = clubs[clubId];
    const initialCupQueue = ["domestic"];
    if (season1Qualifiers.cup1.includes(clubId)) initialCupQueue.push("cup1");
    else if (season1Qualifiers.cup2.includes(clubId)) initialCupQueue.push("cup2");
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
    const market = {
      europa: Array.from({ length: 8 }, () => makeScoutPlayer(pick(POS_ORDER), "europa", rating, clubs)),
      sydamerika: Array.from({ length: 6 }, () => makeScoutPlayer(pick(POS_ORDER), "sydamerika", rating, clubs)),
      afrika: Array.from({ length: 6 }, () => makeScoutPlayer(pick(POS_ORDER), "afrika", rating, clubs)),
      asien: Array.from({ length: 6 }, () => makeScoutPlayer(pick(POS_ORDER), "asien", rating, clubs)),
    };
    const userPoolIds = clubsInPool(countryId, division, clubs).map(c => c.id);
    const startSquad = makeSquad(countryId, club.archetype, division);
    const manager = initialManager(managerName, countryId, division);
    const pressOpt = presentationPressOptions(boardTargetLabel(club.archetype, division).label).find(o => o.key === pressChoice);
    const startFanbase = clamp(fanbase + (pressOpt?.fanbaseDelta || 0), 5, 95);
    const startBoardConfidence = clamp(60 + (pressOpt?.boardConfidenceDelta || 0), 10, 90);
    manager.reputation = clamp(manager.reputation + (pressOpt?.managerRepDelta || 0), 5, 99);
    const prestigeScore = (arche.tierMin + arche.tierMax) / 2 - (division - 1) * 10;
    const startPartLevel = (max) => clamp(prestigeScore >= 82 ? 3 : prestigeScore >= 70 ? 2 : 1, 1, max);
    const initial = {
      setupDone: true, leagueId: countryId, userClubId: clubId, season: 1, round: 0, tactic: "balanserad", spelide: "balanserad",
      budget: Math.round(arche.startBudget * divMult), lastDelta: 0, dev, reputation, fanbase: startFanbase, lastCup2ChampionId: null,
      clubs, schedule: generateSchedule(userPoolIds), squad: startSquad, startingXI: pickBestXI(startSquad).map(p => p.id), market,
      arenaStands: { north: startPartLevel(5), south: startPartLevel(5), east: startPartLevel(5), west: startPartLevel(5) }, arenaFacilities: { restaurant: startPartLevel(3), shop: startPartLevel(3) },
      akademiParts: { tranare: startPartLevel(3), intag: startPartLevel(3) }, scoutingParts: { analys: startPartLevel(3), kontakter: startPartLevel(3) },
      sponsors: { main: null, stadium: null, local: null },
      staff: { assistant: null, physio: null, scout: null }, boardConfidence: startBoardConfidence, plannedSub: null, incomingOffers: [], loans: [], loanOffers: [],
      seasonIncomeTotal: 0, seasonWageTotal: 0, difficulty: "normal", savedScoutProfiles: [], clubRecords: {},
      setPieceTakers: { penalties: [], freeKick: null, cornerLeft: null, cornerRight: null }, chemistryPairs: {},
      formationCode: "4-4-2", tacticalSettings: { ...DEFAULT_TACTICAL_SETTINGS }, lineupCells: null,
      owner: generateOwner(reputation), takeoverBid: null, tourOffers: null, tourCompletedThisOffseason: false,
      formationFamiliarity: 0, teamTalk: "neutral", pendingLateGame: null, pendingMidGame: null, restedForMatch: false,
      repHistory: [reputation], fanHistory: [startFanbase],
      manager, assistantManager: null,
      youthSquad: [generateYouthProspect(dev.akademi, 1, countryId)], youthMarket: Array.from({ length: 6 }, () => generateYouthProspect(clamp(dev.scouting, 1, 5), 1)),
      lastMatchReport: null, view: "home", activeTab: "home", pendingAfterResult: "home",
      cup: null, cupQueue: initialCupQueue, season1Qualifiers, lastSeasonSummary: null, seasonEndSnapshot: null, history: [], scoutMission: null, ticketPrice: "medel", arenaConstruction: null, outgoingLoans: [], sillySeasonWeeksLeft: 4,
    };
    const id = uid();
    const entry = { id, ...saveSummary(initial) };
    setSaveIndex(prev => { const updated = [...prev, entry]; persistIndex(updated); return updated; });
    (async () => { try { await window.storage?.set(`tranarbanken-save-${id}`, JSON.stringify(initial)); } catch (e) {} })();
    setActiveSaveId(id);
    setG(initial);
    setNameDraft(club.name);
    setScreen("game");
  }

  if (screen === "loading") return <div style={{ background: C.turfDeep, minHeight: "100vh" }} />;
  if (screen === "select") return <SaveSelectView saves={saveIndex} onSelect={switchToSave} onNew={goToNewCareer} onDelete={deleteSave} onExport={exportSave} onImport={importSaveFile} />;
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
  const hasOfferNotif = g.incomingOffers.length > 0;
  const hasContractNotif = g.squad.some(p => p.contractYears <= 1);
  const hasClubNotif = !!g.takeoverBid || Object.values(g.staff).some(m => m?.needsRaise);
  const NAV_NOTIFS = { transfers: hasOfferNotif, squad: hasContractNotif, club: hasClubNotif };

  function setupCup(type, base) {
    if (type === "domestic") {
      const field = domesticCupField(base.leagueId, base.clubs);
      return { type: "domestic", label: LEAGUES.find(l => l.id === base.leagueId).cupName, phase: "knockoutSimple", teams: field, roundName: field.length <= 4 ? bracketName(field.length) : `Omgång 1`, roundIndex: 1, userReport: null, pendingWinners: null, eliminated: false, champion: null };
    }
    const { cup1, cup2 } = base.season1Qualifiers || buildContinentalQualifiers(base.clubs, base.seasonEndSnapshot.worldStandings, base.seasonEndSnapshot.otherCupWinners, base.leagueId, base.lastSeasonSummary.domesticCupWinnerId, base.lastCup2ChampionId);
    if (type === "cup1") {
      const groups = drawCup1Groups(cup1, base.clubs);
      const userGroupIndex = groups.findIndex(gr => gr.includes(base.userClubId));
      const otherGroupsQualifiers = groups.filter((_, i) => i !== userGroupIndex).flatMap(gr => topTwoByStrengthNoise(gr, base.clubs));
      const groupSchedule = generateGroupSchedule(groups[userGroupIndex]);
      return { type: "cup1", label: "Kimby Mästerskapet", finalArena: pick(CUP1_ARENAS), phase: "groups", groups, userGroupIndex, groupSchedule, groupRound: 0, otherGroupsQualifiers, roundName: "Gruppspelet", pendingReport: null, eliminated: false, champion: null };
    }
    const { pendingOtherWinners, tie } = setupKnockoutRound(cup2, base.clubs, base.userClubId);
    return { type: "cup2", label: "Kimby Cupen", finalArena: pick(CUP2_ARENAS), phase: "knockout", teams: cup2, roundName: bracketName(16), pendingOtherWinners, tie, pendingReport: null, eliminated: false, champion: null };
  }

  function beginRound() {
    if (seasonOver) return;
    const newClubs = { ...g.clubs };
    const xi = getXI(g.squad, g.startingXI);

    const newSchedule = g.schedule.map((round, ri) => {
      if (ri !== g.round) return round;
      return round.map(f => {
        const isUser = f.home === g.userClubId || f.away === g.userClubId;
        if (isUser) return f; // resolved later in resolveSecondHalf
        const home = newClubs[f.home], away = newClubs[f.away];
        const hg = poisson(expectedGoals(home.strength, away.strength, true)), ag = poisson(expectedGoals(away.strength, home.strength, false));
        const drift = (id, res) => { newClubs[id] = { ...newClubs[id], strength: clamp(newClubs[id].strength + (res === "win" ? rnd(0.1, 0.35) : res === "loss" ? -rnd(0.1, 0.3) : rnd(-0.06, 0.06)) + rnd(-0.08, 0.08), 20, 97) }; };
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
    const { attack, defense } = userStrength(xi, g.tactic, g.spelide, g.tacticalSettings, teamPositionFit(g.lineupCells, g.squad));
    const talk = TEAM_TALK_OPTIONS[g.teamTalk] || TEAM_TALK_OPTIONS.neutral;
    const famBonus = 1 + familiarityBonus(g.formationFamiliarity);
    const weather = weatherForMatch(`weather${g.round}${g.userClubId}`);
    const lambdaUserHalf = (expectedGoals(attack * talk.atkMult * famBonus, opp.strength, userIsHome) * weather.mult) / 2;
    const lambdaOppHalf = (expectedGoals(opp.strength, defense * talk.defMult * famBonus, !userIsHome) * weather.mult) / 2;
    const h1User = poisson(lambdaUserHalf), h1Opp = poisson(lambdaOppHalf);

    setG(prev => ({
      ...prev, clubs: newClubs, view: "halftime",
      pendingRound: { newSchedule, oppId, oppName: opp.name, oppStrength: opp.strength, userIsHome, weather, lambdaUserHalf, lambdaOppHalf, h1User, h1Opp, xiIds: xi.map(p => p.id) },
    }));
  }

  function finalizeMatch(p, secondHalfXiIds, subText, userGoals, oppGoals, lateGameNote) {
    const newClubs = g.clubs;
    const staff = g.staff;
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
    const scorerDetails = pickScorerDetailed(unionXi, userGoals, g.setPieceTakers);
    const scorers = scorerDetails.map(d => d.player);
    const assistProviders = scorers.map(s => pickAssist(unionXi, s, g.setPieceTakers));

    // in-match injury roll (fysioterapeut lowers chance and shortens duration)
    const physioLevel = staff.physio ? staff.physio.level : 0;
    const difficultySettings = DIFFICULTY_SETTINGS[g.difficulty] || DIFFICULTY_SETTINGS.normal;
    let injuredPlayer = null;
    unionXi.forEach(pl => {
      if (injuredPlayer) return;
      const attrs = getAttrs(pl);
      const staminaRisk = clamp((70 - (pl.stamina ?? 100)) / 3000, 0, 0.015);
      const chance = clamp((0.045 - attrs.physical / 2200 - physioLevel * 0.003 + staminaRisk) * difficultySettings.injuryMult * injuryProneMult(pl), 0.005, 0.12);
      if (Math.random() < chance) injuredPlayer = pl;
    });
    // card rolls (assisterande tränare lowers chance, taktiska val kan höja/sänka)
    const assistantLevel = staff.assistant ? staff.assistant.level : 0;
    const talkCardMult = (TEAM_TALK_OPTIONS[g.teamTalk] || TEAM_TALK_OPTIONS.neutral).cardMult;
    const refereeStrictness = rnd(0.75, 1.3);
    const tacticCardMult = combinedTacticalMods(g.tacticalSettings).cardMult * talkCardMult * refereeStrictness;
    const cardEvents = {};
    unionXi.forEach(pl => {
      const personalityCardMult = pl.personality === "Problemspelare" ? 1.6 : 1;
      const yellowChance = clamp((0.09 - assistantLevel * 0.008) * tacticCardMult * personalityCardMult, 0.02, 0.2);
      const redChance = clamp((0.012 - assistantLevel * 0.001) * tacticCardMult * personalityCardMult, 0.002, 0.03);
      if (Math.random() < redChance) cardEvents[pl.id] = "red";
      else if (Math.random() < yellowChance) cardEvents[pl.id] = "yellow";
    });

    const isDerby = g.clubs[g.userClubId].rivalId === p.oppId;
    const xiForStats = getXI(g.squad, g.startingXI);
    const { attack: userAttackForStats } = userStrength(xiForStats, g.tactic, g.spelide, g.tacticalSettings, teamPositionFit(g.lineupCells, g.squad));
    const matchStats = generateMatchStats(userAttackForStats, g.clubs[p.oppId]?.strength || 50, userGoals, oppGoals);
    const matchReport = { oppId: p.oppId, oppName: p.oppName, userIsHome: p.userIsHome, userGoals, oppGoals, result, scorers: scorers.map(pl => pl.name), ratings: [], weather: p.weather, keyMoments: [], timeline: [], isDerby, stats: matchStats };
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
    let incomeShop = merchandiseIncome(g.fanbase, g.arenaFacilities.shop);
    let incomeTickets = 0, incomeRestaurant = 0;
    if (p.userIsHome) {
      const userArchetype = ARCHETYPES[g.clubs[g.userClubId].archetype];
      const ticketTier = TICKET_TIERS[g.ticketPrice] || TICKET_TIERS.medel;
      const derbyDraw = isDerby ? 0.3 : 0;
      const oppDraw = clamp((p.oppStrength - 50) / 200, 0, 0.25);
      const form5 = recentForm(g.schedule, g.round, g.userClubId);
      const formDraw = clamp(form5.filter(r => r === "win").length * 0.035, 0, 0.18);
      const leaguePoolIds = clubsInPool(g.leagueId, userClub.division, g.clubs).map(c => c.id);
      const posNow = computeStandings(g.schedule, leaguePoolIds).findIndex(r => r.id === g.userClubId) + 1;
      const positionDraw = posNow >= 1 && posNow <= 3 ? 0.15 : posNow >= 4 && posNow <= 6 ? 0.07 : 0;
      const crowdDraw = Math.min(derbyDraw + oppDraw + formDraw + positionDraw, 0.45);
      const attendance = Math.min(arenaCapacityOf(g.dev, g.arenaStands), Math.round((3000 + g.fanbase * 180) * ticketTier.fillMult * (1 + crowdDraw)));
      incomeTickets = Math.round(attendance * 0.018 * userArchetype.incomeMult * ticketTier.incomeMult) + Object.values(g.arenaStands).reduce((s, l) => s + l, 0) * 12;
      incomeRestaurant = g.arenaFacilities.restaurant * 18;
      incomeShop += g.arenaFacilities.shop * 18;
    }
    let income = incomeSponsring + incomeSponsorDeals + incomeTv + incomeShop + incomeTickets + incomeRestaurant;

    const counts = {}; matchReport.scorers.forEach(n => { counts[n] = (counts[n] || 0) + 1; });
    const assistCounts = {}; assistProviders.forEach(p => { if (p) assistCounts[p.name] = (assistCounts[p.name] || 0) + 1; });
    const trainingInjuryNames = [];
    const newSquad = g.squad.map(pl => {
      if (!unionIds.includes(pl.id)) {
        let updated = pl.injuryWeeks > 0 ? { ...pl, injuryWeeks: Math.max(0, pl.injuryWeeks - 1) } : pl;
        updated = updated.suspendedMatches > 0 ? { ...updated, suspendedMatches: Math.max(0, updated.suspendedMatches - 1) } : updated;
        if (updated.internationalDuty) updated = { ...updated, internationalDuty: false, fatigued: true };
        updated = { ...updated, stamina: clamp((updated.stamina ?? 100) + rndInt(6, 10), 0, 100) };
        if (!updated.injuryWeeks && !updated.suspendedMatches) {
          const physioLevel = staff.physio ? staff.physio.level : 0;
          const trainingRisk = clamp((0.006 - physioLevel * 0.0008 + ((70 - (updated.stamina ?? 100)) / 9000)) * difficultySettings.injuryMult * injuryProneMult(updated), 0.0003, 0.025);
          if (Math.random() < trainingRisk) {
            const weeks = pick([1, 1, 2]);
            updated = { ...updated, injuryWeeks: weeks };
            trainingInjuryNames.push(`${updated.name} (${weeks} omg)`);
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
      const chemBonus = chemistryBonusFor(pl.id);
      const rating = clamp(6.0 + rnd(-0.6, 0.6) + (result === "win" ? 0.35 : result === "loss" ? -0.25 : 0) + goals * 1.1 + moraleBonus + fatigueBonus + staminaBonus + clutchBonus + chemBonus, 3.5, 9.8);
      const attackDelta = rating >= 7.4 ? rnd(0.1, 0.4) : rating < 5.4 ? -rnd(0.05, 0.25) : 0;
      matchReport.ratings.push({ id: pl.id, name: pl.name, pos: pl.pos, rating: Math.round(rating * 10) / 10, goals });
      const gotInjured = injuredPlayer && injuredPlayer.id === pl.id;
      const baseInjuryWeeks = gotInjured ? pick([1, 1, 2, 2, 3, 5, 8]) : pl.injuryWeeks;
      const injuryWeeks = gotInjured ? Math.max(1, Math.round(baseInjuryWeeks * (1 - physioLevel * 0.06))) : baseInjuryWeeks;
      const card = cardEvents[pl.id];
      let yellowCards = pl.yellowCards, suspendedMatches = pl.suspendedMatches;
      if (card === "red") { suspendedMatches += rndInt(1, 2); }
      else if (card === "yellow") { yellowCards += 1; if (yellowCards >= 5) { suspendedMatches += 1; yellowCards -= 5; } }
      const newStamina = clamp(staminaNow - rndInt(4, 8), 0, 100);
      const outOfPos = (pl.personality === "Ambitiös" && (cellFitByPlayer[pl.id] ?? 1) < 0.6) ? 1 : 0;
      return { ...pl, apps: pl.apps + 1, goals: pl.goals + goals, assists: (pl.assists || 0) + assists, ratingSum: pl.ratingSum + rating, attack: clamp(pl.attack + attackDelta, 20, 99), injuryWeeks, yellowCards, suspendedMatches, fatigued: false, stamina: newStamina, outOfPositionApps: (pl.outOfPositionApps || 0) + outOfPos };
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
    const newRound = g.round + 1;
    const isSeasonEnd = newRound >= g.schedule.length;
    const windowJustOpened = TRANSFER_WINDOWS.some(([a]) => a === newRound);
    const newIncomingOffers = windowJustOpened ? generateIncomingOffers(newSquad, updatedClubs, g.userClubId, g.reputation) : g.incomingOffers;
    const newLoanOffers = windowJustOpened ? generatePlayerLoanOffers(updatedClubs, g.userClubId, userClub.division) : (g.loanOffers || []);

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

    const newFamiliarity = clamp((g.formationFamiliarity || 0) + 8, 0, 100);

    const eventResult = processRandomEvents(squadAfterBreak, g.youthSquad, g.sponsors, newIncomingOffers, updatedClubs, g.userClubId, g.reputation, transferWindowOpen(newRound));
    const finalSquad = eventResult.newSquad;
    const finalYouthSquad = eventResult.newYouth;
    const finalSponsors = eventResult.newSponsors;
    const finalIncomingOffers = eventResult.newOffers;
    const eventToast = eventResult.messages.length ? eventResult.messages.slice(0, 2).join(" ") : null;
    const eventBudgetDelta = eventResult.budgetDelta || 0;

    let cup = g.cup, cupQueue = g.cupQueue || [];
    let lastSeasonSummary = g.lastSeasonSummary, seasonEndSnapshot = g.seasonEndSnapshot;
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
      lastSeasonSummary = { season: g.season, pos: finalPos, division: userClub.division, leagueName: countryName, domesticCupResult: null, domesticCupWon: false, domesticCupWinnerId: null, cup1Result: null, cup2Result: null, prizeTotal: 0, boardTargetLabel: target.label, boardTargetMet: target.check(finalPos) };
      seasonEndSnapshot = { worldStandings, otherCupWinners };
    } else if (!cup && cupQueue.length > 0) {
      // A cup competition is due for its next step this round, interleaved with the league.
      const base = { ...g, clubs: updatedClubs, lastSeasonSummary, seasonEndSnapshot, season1Qualifiers: g.season === 1 ? g.season1Qualifiers : null };
      cup = setupCup(cupQueue[0], base);
      cupQueue = cupQueue.slice(1);
    }
    const hasCupBusiness = !isSeasonEnd && !!cup;

    let scoutMission = g.scoutMission;
    let scoutToast = null;
    if (scoutMission && !scoutMission.complete) {
      const roundsElapsed = scoutMission.roundsElapsed + 1;
      if (roundsElapsed >= scoutMission.roundsTotal) {
        const candidate = generateScoutCandidate(scoutMission, g.staff.scout?.level || 0, updatedClubs, userClub.division);
        scoutMission = { ...scoutMission, roundsElapsed, complete: true, result: candidate };
        scoutToast = candidate ? `Scoutuppdraget är klart — ${candidate.name} har hittats.` : "Scoutuppdraget är klart, men ingen spelare matchade kriterierna. Försök med bredare filter.";
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
      const newRep = clamp(prev.reputation + repFromBreak + derbyRep, 0, 100);
      const ticketFanAdj = p.userIsHome ? (TICKET_TIERS[prev.ticketPrice] || TICKET_TIERS.medel).fanAdj : 0;
      const newFan = clamp(prev.fanbase + derbyFan + ticketFanAdj, 0, 100);
      return {
        ...prev, clubs: updatedClubs, schedule: finalSchedule, squad: finalSquad,
        startingXI: prev.startingXI.filter(id => finalSquad.some(p => p.id === id)),
        youthSquad: finalYouthSquad, sponsors: finalSponsors,
        budget: prev.budget + delta + eventBudgetDelta, lastDelta: delta, round: newRound,
        seasonIncomeTotal: (prev.seasonIncomeTotal || 0) + income, seasonWageTotal: (prev.seasonWageTotal || 0) + wageBill,
        reputation: newRep, fanbase: newFan,
        repHistory: [...(prev.repHistory || []), newRep].slice(-12),
        fanHistory: [...(prev.fanHistory || []), newFan].slice(-12),
        formationFamiliarity: newFamiliarity, restedForMatch: false,
        lastMatchReport: matchReport, view: "result", pendingRound: null, pendingLateGame: null, pendingMidGame: null,
        pendingAfterResult: hasCupBusiness ? "cup" : "home",
        cup, cupQueue, lastSeasonSummary, seasonEndSnapshot, incomingOffers: finalIncomingOffers, scoutMission, loanOffers: newLoanOffers, chemistryPairs: newChemistryPairs,
        arenaConstruction, arenaStands, dev: { ...prev.dev, arena: devArena },
        _toast: [breakToast, eventToast, scoutToast, constructionToast, trainingInjuryNames.length ? `Skada på träning: ${trainingInjuryNames.join(", ")}.` : null, loanReturnHomeMsg].filter(Boolean).join(" ") || null,
      };
    });
  }

  function resolveSecondHalf(boost) {
    const p = g.pendingRound;
    const staff = g.staff;

    let secondHalfXiIds = p.xiIds;
    let subText = null;
    if (g.plannedSub && p.h1User < p.h1Opp) {
      const outPlayer = g.squad.find(pl => pl.id === g.plannedSub.outId);
      const inPlayer = g.squad.find(pl => pl.id === g.plannedSub.inId);
      if (outPlayer && inPlayer && p.xiIds.includes(outPlayer.id) && !inPlayer.injuryWeeks && !inPlayer.suspendedMatches && !inPlayer.internationalDuty) {
        secondHalfXiIds = p.xiIds.filter(id => id !== outPlayer.id).concat([inPlayer.id]);
        subText = `Byte i paus: ${outPlayer.name} → ${inPlayer.name}`;
      }
    }
    const secondHalfXi = g.squad.filter(pl => secondHalfXiIds.includes(pl.id));
    const assistantBonus = staff.assistant ? 1 + staff.assistant.level * 0.01 : 1;
    const talk = TEAM_TALK_OPTIONS[g.teamTalk] || TEAM_TALK_OPTIONS.neutral;
    const famBonus = 1 + familiarityBonus(g.formationFamiliarity);
    const strength2 = userStrength(secondHalfXi, g.tactic, g.spelide, g.tacticalSettings, teamPositionFit(g.lineupCells, g.squad));
    const lambdaUserFull = expectedGoals(strength2.attack * assistantBonus * talk.atkMult * famBonus, p.oppStrength, p.userIsHome) * p.weather.mult * (boost ? 1.35 : 1) / 2;
    const lambdaOppFull = expectedGoals(p.oppStrength, strength2.defense * assistantBonus * talk.defMult * famBonus, !p.userIsHome) * p.weather.mult * (boost ? 0.85 : 1) / 2;
    const lambdaUserEarly = lambdaUserFull * 14 / 45, lambdaOppEarly = lambdaOppFull * 14 / 45;
    const lambdaUserMid = lambdaUserFull * 14 / 45, lambdaOppMid = lambdaOppFull * 14 / 45;
    const lambdaUserLate = lambdaUserFull * 17 / 45, lambdaOppLate = lambdaOppFull * 17 / 45;
    const h2aUser = poisson(lambdaUserEarly), h2aOpp = poisson(lambdaOppEarly);
    const runningUser = p.h1User + h2aUser, runningOpp = p.h1Opp + h2aOpp;

    setG(prev => ({
      ...prev, view: "midgame",
      pendingMidGame: { p, secondHalfXiIds, subText, runningUser, runningOpp, lambdaUserMid, lambdaOppMid, lambdaUserLate, lambdaOppLate },
    }));
  }

  function resolveMidGame(choice) {
    const mg = g.pendingMidGame;
    if (!mg) return;
    const mods = {
      press: { atk: 1.16, def: 0.92, note: "Ni lade om till högre press efter timmen." },
      consolidate: { atk: 0.88, def: 1.15, note: "Ni stramade åt och byggde tryggare försvarsspel." },
      neutral: { atk: 1, def: 1, note: null },
    }[choice] || { atk: 1, def: 1, note: null };
    const h2bUser = poisson(mg.lambdaUserMid * mods.atk);
    const h2bOpp = poisson(mg.lambdaOppMid * mods.def);
    const runningUser2 = mg.runningUser + h2bUser, runningOpp2 = mg.runningOpp + h2bOpp;
    const closeGame = Math.abs(runningUser2 - runningOpp2) <= 1;

    if (closeGame) {
      setG(prev => ({
        ...prev, view: "lategame", pendingMidGame: null,
        pendingLateGame: { p: mg.p, secondHalfXiIds: mg.secondHalfXiIds, subText: mg.subText, runningUser: runningUser2, runningOpp: runningOpp2, lambdaUserLate: mg.lambdaUserLate, lambdaOppLate: mg.lambdaOppLate, midNote: mods.note },
      }));
      return;
    }
    const h2cUser = poisson(mg.lambdaUserLate), h2cOpp = poisson(mg.lambdaOppLate);
    finalizeMatch(mg.p, mg.secondHalfXiIds, mg.subText, runningUser2 + h2cUser, runningOpp2 + h2cOpp, mods.note);
  }

  function resolveLateGame(choice) {
    const lg = g.pendingLateGame;
    if (!lg) return;
    const mods = {
      push: { atk: 1.28, def: 0.82, note: "Ni gick all-in i slutminuterna." },
      park: { atk: 0.8, def: 1.22, note: "Ni parkerade bussen i slutminuterna." },
      neutral: { atk: 1, def: 1, note: null },
    }[choice] || { atk: 1, def: 1, note: null };
    const h2bUser = poisson(lg.lambdaUserLate * mods.atk);
    const h2bOpp = poisson(lg.lambdaOppLate * mods.def);
    const combinedNote = [lg.midNote, mods.note].filter(Boolean).join(" ") || null;
    finalizeMatch(lg.p, lg.secondHalfXiIds, lg.subText, lg.runningUser + h2bUser, lg.runningOpp + h2bOpp, combinedNote);
  }

  // --- domestic cup handlers ---
  function playDomesticCupRound() {
    const { winners, userReport } = processDomesticCupRound(g.cup.teams, g.clubs, g.userClubId, g.squad, g.tactic, g.spelide, g.startingXI, g.tacticalSettings);
    setG(prev => ({ ...prev, cup: { ...prev.cup, pendingWinners: winners, userReport } }));
  }
  function continueDomesticCupRound() {
    const cup = g.cup;
    if (!cup.userReport) return;
    if (cup.userReport.result !== "win") { setG(prev => ({ ...prev, cup: { ...prev.cup, eliminated: true, userReport: null } })); return; }
    const nextTeams = cup.pendingWinners;
    if (nextTeams.length === 1) { setG(prev => ({ ...prev, cup: { ...prev.cup, champion: nextTeams[0], userReport: null } })); return; }
    const newRoundIndex = (cup.roundIndex || 1) + 1;
    setG(prev => ({ ...prev, cup: { ...prev.cup, teams: nextTeams, roundIndex: newRoundIndex, roundName: nextTeams.length <= 4 ? bracketName(nextTeams.length) : `Omgång ${newRoundIndex}`, userReport: null, pendingWinners: null } }));
  }

  // --- cup1 group stage handlers ---
  function playGroupMatch() {
    const cup = g.cup;
    const xi = getXI(g.squad, g.startingXI);
    let capturedReport = null;
    const newGroupSchedule = cup.groupSchedule.map((r, ri) => {
      if (ri !== cup.groupRound) return r;
      return r.map(f => {
        const isUser = f.home === g.userClubId || f.away === g.userClubId;
        if (isUser) {
          const userIsHome = f.home === g.userClubId;
          const oppId2 = userIsHome ? f.away : f.home;
          const opp = g.clubs[oppId2];
          const { attack, defense } = userStrength(xi, g.tactic, g.spelide, g.tacticalSettings, teamPositionFit(g.lineupCells, g.squad));
          const userGoals = poisson(expectedGoals(attack, opp.strength, userIsHome)), oppGoals = poisson(expectedGoals(opp.strength, defense, !userIsHome));
          const result = userGoals > oppGoals ? "win" : userGoals < oppGoals ? "loss" : "draw";
          const scorers = pickScorer(xi, userGoals).map(p => p.name);
          const ratings = ratingsForResult(xi, scorers, result);
          capturedReport = { oppName: opp.name, userIsHome, userGoals, oppGoals, result, ratings };
          return { ...f, homeGoals: userIsHome ? userGoals : oppGoals, awayGoals: userIsHome ? oppGoals : userGoals };
        }
        const home = g.clubs[f.home], away = g.clubs[f.away];
        return { ...f, homeGoals: poisson(expectedGoals(home.strength, away.strength, true)), awayGoals: poisson(expectedGoals(away.strength, home.strength, false)) };
      });
    });
    setG(prev => ({ ...prev, cup: { ...prev.cup, groupSchedule: newGroupSchedule, pendingReport: capturedReport } }));
  }
  function continueGroupRound() {
    const cup = g.cup;
    const newGroupRound = cup.groupRound + 1;
    if (newGroupRound < 3) { setG(prev => ({ ...prev, cup: { ...prev.cup, groupRound: newGroupRound, pendingReport: null } })); return; }
    const standings = computeStandings(cup.groupSchedule, cup.groups[cup.userGroupIndex]);
    const userGroupPos = standings.findIndex(s => s.id === g.userClubId) + 1;
    if (userGroupPos > 2) { setG(prev => ({ ...prev, cup: { ...prev.cup, groupRound: newGroupRound, pendingReport: null, eliminated: true, roundName: "Gruppspelet" } })); return; }
    const advancing = standings.slice(0, 2).map(s => s.id);
    const eight = shuffle([...cup.otherGroupsQualifiers, ...advancing]);
    const { pendingOtherWinners, tie } = setupKnockoutRound(eight, g.clubs, g.userClubId);
    setG(prev => ({ ...prev, cup: { ...prev.cup, phase: "knockout", roundName: "Kvartsfinal", teams: eight, pendingOtherWinners, tie, pendingReport: null, groupRound: newGroupRound } }));
  }

  // --- two-legged knockout handlers (cup1 QF/SF, cup2 R16/QF/SF) ---
  function playCupLeg() {
    const cup = g.cup;
    const opp = g.clubs[cup.tie.oppId];
    const userIsHomeThisLeg = cup.tie.leg === 1 ? cup.tie.userHomeLeg1 : !cup.tie.userHomeLeg1;
    const legResult = simulateUserDecisiveLeg(opp.strength, g.squad, g.tactic, g.spelide, userIsHomeThisLeg, g.startingXI, g.tacticalSettings);
    const report = { oppName: opp.name, userIsHome: true, userGoals: legResult.userGoals, oppGoals: legResult.oppGoals, penalties: legResult.penalties, result: legResult.userWon ? "win" : "loss", ratings: legResult.ratings };
    const legKey = cup.tie.leg === 1 ? "leg1" : "leg2";
    setG(prev => ({ ...prev, cup: { ...prev.cup, tie: { ...prev.cup.tie, [legKey]: legResult }, pendingReport: report } }));
  }
  function continueCupLeg() {
    const cup = g.cup;
    if (cup.tie.leg === 1) { setG(prev => ({ ...prev, cup: { ...prev.cup, tie: { ...prev.cup.tie, leg: 2 }, pendingReport: null } })); return; }
    const { leg1, leg2 } = cup.tie;
    const userGoalsAgg = leg1.userGoals + leg2.userGoals, oppGoalsAgg = leg1.oppGoals + leg2.oppGoals;
    const userLegWins = (leg1.userWon ? 1 : 0) + (leg2.userWon ? 1 : 0);
    let advanced, shootoutNote = null;
    if (userLegWins === 2) advanced = true;
    else if (userLegWins === 0) advanced = false;
    else if (userGoalsAgg > oppGoalsAgg) advanced = true;
    else if (oppGoalsAgg > userGoalsAgg) advanced = false;
    else {
      const xi = getXI(g.squad, g.startingXI);
      const strength2 = userStrength(xi, g.tactic, g.spelide, g.tacticalSettings);
      const oppStrength = g.clubs[cup.tie.oppId].strength;
      const winProb = clamp(0.5 + (strength2.attack - oppStrength) / 200, 0.3, 0.7);
      advanced = Math.random() < winProb;
      const pen = advanced ? `${rndInt(4, 6)}-${rndInt(2, 4)}` : `${rndInt(2, 4)}-${rndInt(4, 6)}`;
      shootoutNote = `Lika efter båda matcherna (${userGoalsAgg}-${oppGoalsAgg} sammanlagt) — straffar avgjorde: ${pen}.`;
    }

    if (shootoutNote) showToast(shootoutNote);
    if (!advanced) { setG(prev => ({ ...prev, cup: { ...prev.cup, eliminated: true, pendingReport: null } })); return; }
    const nextTeams = [...cup.pendingOtherWinners, g.userClubId];
    if (nextTeams.length === 2) {
      const finalOpponentId = nextTeams.find(id => id !== g.userClubId);
      setG(prev => ({ ...prev, cup: { ...prev.cup, phase: "final", finalOpponentId, tie: null, pendingReport: null, roundName: "Final" } }));
      return;
    }
    const { pendingOtherWinners, tie } = setupKnockoutRound(nextTeams, g.clubs, g.userClubId);
    setG(prev => ({ ...prev, cup: { ...prev.cup, teams: nextTeams, pendingOtherWinners, tie, pendingReport: null, roundName: bracketName(nextTeams.length) } }));
  }
  function playCupFinal() {
    const cup = g.cup;
    const opp = g.clubs[cup.finalOpponentId];
    const result = simulateUserDecisiveLeg(opp.strength, g.squad, g.tactic, g.spelide, Math.random() < 0.5, g.startingXI, g.tacticalSettings);
    const report = { oppName: opp.name, userIsHome: true, userGoals: result.userGoals, oppGoals: result.oppGoals, penalties: result.penalties, result: result.userWon ? "win" : "loss", ratings: result.ratings };
    setG(prev => ({ ...prev, cup: { ...prev.cup, pendingReport: report, finalWon: result.userWon } }));
  }
  function continueCupFinal() {
    const cup = g.cup;
    if (cup.finalWon) setG(prev => ({ ...prev, cup: { ...prev.cup, champion: prev.userClubId, pendingReport: null } }));
    else setG(prev => ({ ...prev, cup: { ...prev.cup, eliminated: true, pendingReport: null } }));
  }

  function finishCup() {
    const cup = g.cup;
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

      let newQueue = prev.cupQueue || [];
      if (cup.type === "domestic" && summary.domesticCupWon && summary.cup2Result == null && !newQueue.includes("cup2")) {
        newQueue = [...newQueue, "cup2"];
      }

      return { ...prev, budget: prev.budget + prize, view: "home", activeTab: "home", pendingAfterResult: "home", lastSeasonSummary: summary, cup: null, cupQueue: newQueue, lastCup2ChampionId };
    });
  }

  function finalizeTransfer(region, player, agreedPrice, agreedWage) {
    if (!transferWindowOpen(g.round)) { showToast("Transferfönstret är stängt just nu."); return; }
    const hasSellOn = Math.random() < 0.25;
    const sellOnPct = hasSellOn ? pick([10, 15, 20]) : 0;
    const discount = (1 - (g.scoutingParts.kontakter - 1) * 0.04) * (hasSellOn ? 1 - sellOnPct * 0.006 : 1);
    const price = Math.round(agreedPrice * discount);
    if (g.budget < price) { showToast("Inte tillräcklig budget."); return; }
    if (g.boardConfidence < 40 && price > g.budget * 0.4) { showToast("Styrelsen blockerar värvningen — för dyr given det svaga förtroendet just nu."); return; }
    const wage = agreedWage || player.wage;
    const cap = wageBudgetCap(g.reputation, g.clubs[g.userClubId].division, g.dev.sponsring);
    if (totalWageBill(g.squad) + wage > cap * 1.15) { showToast("Löneutrymmet räcker inte — Financial Fair Play stoppar värvningen."); return; }
    const fromClubName = g.clubs[player.clubId]?.name || "en annan klubb";
    const signedPlayer = { ...player, clubId: null, contractYears: rndInt(3, 5), wage, number: assignSquadNumber(g.squad), sellOnPct, sellOnClubName: hasSellOn ? (g.clubs[player.clubId]?.name || "säljande klubb") : null, joinedInfo: { text: `Värvades från ${fromClubName} för ${formatMoney(price)} i säsong ${g.season}.` } };
    setG(prev => ({
      ...prev, budget: prev.budget - price, squad: [...prev.squad, signedPlayer],
      market: { ...prev.market, [region]: prev.market[region].filter(p => p.id !== player.id).concat([makeScoutPlayer(pick(POS_ORDER), region, effectiveScoutRating(prev.dev, prev.reputation, prev.scoutingParts.analys + (prev.staff.scout?.level || 0) * 0.5), prev.clubs)]) },
    }));
    showToast(hasSellOn ? `${player.name} skrev på för ${formatMoney(price)} — ${sellOnPct}% billigare mot att ${signedPlayer.sellOnClubName} får ${sellOnPct}% vid en framtida vidareförsäljning.` : `${player.name} skrev på för ${formatMoney(price)} (${formatMoney(wage)}/omg i lön)!`);
  }
  function startScoutMission(filters) {
    if (g.scoutMission && !g.scoutMission.complete) { showToast("Scouten är redan ute på uppdrag."); return; }
    const level = g.staff.scout?.level || 0;
    const roundsTotal = Math.round(scoutMissionDuration(level));
    setG(prev => ({ ...prev, scoutMission: { ...filters, roundsTotal, roundsElapsed: 0, complete: false, result: null } }));
    showToast(`Scouten skickas ut — klart om ca ${roundsTotal} omgångar.`);
  }
  function dismissScoutMission() {
    setG(prev => ({ ...prev, scoutMission: null }));
  }
  function finalizeScoutSignee(agreedPrice, agreedWage) {
    const player = g.scoutMission?.result;
    if (!player) return;
    if (!transferWindowOpen(g.round)) { showToast("Transferfönstret är stängt just nu."); return; }
    if (g.budget < agreedPrice) { showToast("Inte tillräcklig budget."); return; }
    if (g.boardConfidence < 40 && agreedPrice > g.budget * 0.4) { showToast("Styrelsen blockerar värvningen — för dyr given det svaga förtroendet just nu."); return; }
    const wage = agreedWage || player.wage;
    const cap = wageBudgetCap(g.reputation, g.clubs[g.userClubId].division, g.dev.sponsring);
    if (totalWageBill(g.squad) + wage > cap * 1.15) { showToast("Löneutrymmet räcker inte — Financial Fair Play stoppar värvningen."); return; }
    const fromClubName = g.clubs[player.clubId]?.name || "en annan klubb";
    const signedPlayer = { ...player, clubId: null, contractYears: rndInt(3, 5), wage, number: assignSquadNumber(g.squad), joinedInfo: { text: `Värvades från ${fromClubName} för ${formatMoney(agreedPrice)} i säsong ${g.season}, efter att ha upptäckts av scouten.` }, scoutReports: [{ season: g.season, comment: scoutComment(player), source: "scout" }] };
    setG(prev => ({ ...prev, budget: prev.budget - agreedPrice, squad: [...prev.squad, signedPlayer], scoutMission: null }));
    showToast(`${player.name} skrev på för ${formatMoney(agreedPrice)} (${formatMoney(wage)}/omg i lön)!`);
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
      setG(prev => ({ ...prev, budget: prev.budget + net, squad: prev.squad.filter(p => p.id !== offer.playerId), startingXI: prev.startingXI.filter(id => id !== offer.playerId), incomingOffers: prev.incomingOffers.filter(o => o.id !== offerId) }));
      showToast(sellOnCut ? `${offer.playerName} såldes till ${offer.buyerName} för ${formatMoney(net)} (efter klausul till ${soldPlayer.sellOnClubName})!` : `${offer.playerName} såldes till ${offer.buyerName} för ${formatMoney(offer.offer)}!`);
      return;
    }
    // counter
    const higher = Math.round(offer.offer * 1.3);
    const accepted = Math.random() < clamp(0.35 + g.reputation / 300, 0.2, 0.6);
    if (accepted) {
      setG(prev => ({ ...prev, budget: prev.budget + higher, squad: prev.squad.filter(p => p.id !== offer.playerId), startingXI: prev.startingXI.filter(id => id !== offer.playerId), incomingOffers: prev.incomingOffers.filter(o => o.id !== offerId) }));
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
    setG(prev => ({ ...prev, budget: prev.budget + refund, squad: prev.squad.filter(p => p.id !== player.id), startingXI: prev.startingXI.filter(id => id !== player.id) }));
    setConfirmSell(null);
    showToast(sellOnCut ? `${player.name} lämnade klubben (+${formatMoney(refund)}, efter att ${formatMoney(sellOnCut)} gått till ${player.sellOnClubName} enligt klausul).` : `${player.name} lämnade klubben (+${formatMoney(refund)}).`);
  }
  function toggleTransferListed(playerId) {
    const player = g.squad.find(p => p.id === playerId);
    if (!player) return;
    if (player.loanWeeksLeft) { showToast(`${player.name} är bara på lån hos er — kan inte transferlistas.`); return; }
    const nowListed = !player.transferListed;
    setG(prev => ({ ...prev, squad: prev.squad.map(p => p.id === playerId ? { ...p, transferListed: nowListed } : p) }));
    showToast(nowListed ? `${player.name} är nu transferlistad — andra klubbar kan höra av sig med bud.` : `${player.name} är borttagen från transferlistan.`);
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
  function acceptLoanOffer(offerId) {
    const offer = (g.loanOffers || []).find(o => o.id === offerId);
    if (!offer) return;
    if (!transferWindowOpen(g.round)) { showToast("Transferfönstret är stängt just nu."); return; }
    const loanedPlayer = { ...offer.player, number: assignSquadNumber(g.squad), loanWeeksLeft: offer.weeksLeft, loanFromClubName: offer.fromClubName };
    setG(prev => ({ ...prev, squad: [...prev.squad, loanedPlayer], loanOffers: (prev.loanOffers || []).filter(o => o.id !== offerId) }));
    showToast(`${offer.player.name} ansluter på lån från ${offer.fromClubName}!`);
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
      if (opt.moraleTarget && report.ratings.length) {
        if (opt.moraleTarget === "all") {
          newSquad = prev.squad.map(p => p.apps > 0 ? { ...p, morale: clamp(p.morale + opt.moraleDelta, 0, 100) } : p);
        } else {
          const sorted = [...report.ratings].sort((a, b) => opt.moraleTarget === "best" ? b.rating - a.rating : a.rating - b.rating);
          const targetId = sorted[0]?.id;
          newSquad = prev.squad.map(p => p.id === targetId ? { ...p, morale: clamp(p.morale + opt.moraleDelta, 0, 100) } : p);
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
      squad: [...prev.squad, { id: prospect.id, name: prospect.name, nationality: prospect.nationality, age: prospect.age, pos: prospect.pos, specificPosition: prospect.specificPosition || randomSpecificPosition(prospect.pos), attack: prospect.attack, defense: prospect.defense, value: Math.round(prospect.value * 1.3), wage: computeWage(Math.round(prospect.value * 1.3), prospect.attack, prospect.defense) * 0.6, contractYears: 3, injuryWeeks: 0, yellowCards: 0, suspendedMatches: 0, morale: 75, personality: pick(PERSONALITIES), apps: 0, goals: 0, assists: 0, seasonLog: [], ratingSum: 0, number: assignSquadNumber(prev.squad), joinedInfo: { text: `Fostrad i klubbens akademi, flyttades upp till A-laget säsong ${prev.season}.` } }],
    }));
    showToast(`${prospect.name} flyttas upp till A-laget!`);
  }
  function renewContract(playerId, negotiatedWage, includeClause) {
    setG(prev => {
      const player = prev.squad.find(p => p.id === playerId);
      if (!player) return prev;
      const demand = contractDemand(player);
      const newWage = negotiatedWage || wageDemand(player);
      const releaseClause = includeClause ? Math.round(demand.newValue * 1.6) : null;
      return { ...prev, squad: prev.squad.map(p => p.id === playerId ? { ...p, contractYears: demand.years, value: demand.newValue, wage: newWage, releaseClause } : p) };
    });
    showToast(includeClause ? "Nytt kontrakt med utköpsklausul signerat!" : "Nytt kontrakt signerat!");
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
  function hireAssistantManager(offer) {
    setG(prev => ({ ...prev, assistantManager: { name: offer.name, nationality: offer.nationality, level: offer.level, wage: offer.wage } }));
    showToast(`${offer.name} är nu er assisterande manager!`);
  }
  function startTour(offer) {
    if (g.budget < offer.cost) { showToast("Inte tillräcklig budget."); return; }
    const income = rndInt(offer.incomeMin, offer.incomeMax);
    setG(prev => ({ ...prev, budget: prev.budget - offer.cost + income, reputation: clamp(prev.reputation + offer.repBonus, 0, 100), tourOffers: null, tourCompletedThisOffseason: true }));
    showToast(`${offer.name} genomförd! Nettoresultat: ${formatMoney(income - offer.cost)}. Turnén fungerar också som försäsongsträning.`);
  }
  function openTourOffers() {
    setG(prev => ({ ...prev, tourOffers: generateTourOffers(prev.reputation) }));
  }
  function upgradeDev(key) {
    const level = g.dev[key];
    if (level >= 5) return;
    const cost = Math.round({ arena: 900, akademi: 600, scouting: 750, sponsring: 450 }[key] * Math.pow(level, 1.6));
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
    setG(prev => ({ ...prev, budget: prev.budget + offer.bonus, sponsors: { ...prev.sponsors, [slot]: { name: offer.name, income: offer.income } } }));
    showToast(`${offer.name} är nu er sponsor! (+${formatMoney(offer.bonus)} signeringsbonus)`);
  }
  function hireStaff(role, candidate) {
    setG(prev => ({ ...prev, staff: { ...prev.staff, [role]: { name: candidate.name, nationality: candidate.nationality, level: candidate.level, wage: candidate.wage } } }));
    showToast(`${candidate.name} är nu er ${STAFF_ROLE_LABEL[role].toLowerCase()}!`);
  }
  function renegotiateStaffWage(role, accept) {
    const member = g.staff[role];
    if (!member) return;
    const fair = staffFairWage(member.level);
    setG(prev => ({ ...prev, staff: { ...prev.staff, [role]: { ...prev.staff[role], wage: accept ? fair : prev.staff[role].wage, needsRaise: false } } }));
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
  function saveClubName() {
    const name = nameDraft.trim() || userClub.name;
    setG(prev => ({ ...prev, clubs: { ...prev.clubs, [prev.userClubId]: { ...prev.clubs[prev.userClubId], name } } }));
    setEditingName(false);
  }
  function saveClubColor(hex) {
    setG(prev => ({ ...prev, clubs: { ...prev.clubs, [prev.userClubId]: { ...prev.clubs[prev.userClubId], color: hex } } }));
    setEditingColor(false);
  }

  function newSeason() {
    setG(prev => {
      const snapshot = prev.seasonEndSnapshot;
      const newClubs = { ...prev.clubs };
      LEAGUES.forEach(country => {
        [1, 2, 3].forEach(div => {
          const standingsArr = snapshot.worldStandings[country.id][div];
          const n = standingsArr.length;
          standingsArr.forEach((s, idx) => {
            const c = newClubs[s.id];
            const arche = ARCHETYPES[c.archetype];
            const posFactor = ((n - (idx + 1)) / (n - 1) - 0.5) * 2.2;
            const delta = posFactor + arche.growth * rnd(-0.3, 0.9) + rnd(-0.25, 0.25);
            newClubs[s.id] = { ...c, strength: clamp(c.strength + delta, 20, 97) };
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
      if (newDivision < oldDivision) promoMsg = `${newClubs[prev.userClubId].name} flyttas upp till Division ${newDivision}!`;
      else if (newDivision > oldDivision) promoMsg = `${newClubs[prev.userClubId].name} flyttas ned till Division ${newDivision}.`;

      const oldDivisionSize = snapshot.worldStandings[prev.leagueId][oldDivision].length;
      const posRatio = 1 - (s.pos - 1) / (oldDivisionSize - 1);
      const cupBoost = (s.cup1Result?.startsWith("Mästare") ? 25 : s.cup1Result ? 8 : 0) + (s.cup2Result?.startsWith("Mästare") ? 12 : s.cup2Result ? 4 : 0) + (s.domesticCupWon ? 10 : 0);
      const divisionBase = { 1: 70, 2: 45, 3: 20 }[oldDivision];
      const repTarget = clamp(divisionBase * 0.4 + posRatio * 40 + cupBoost, 0, 100);
      const newReputation = prev.reputation + (repTarget - prev.reputation) * 0.15;
      const fanTarget = clamp(divisionBase * 0.5 + posRatio * 35 + cupBoost * 0.6, 0, 100);
      const newFanbase = prev.fanbase + (fanTarget - prev.fanbase) * 0.1;

      const boardDiffSettings = DIFFICULTY_SETTINGS[prev.difficulty] || DIFFICULTY_SETTINGS.normal;
      const boardDelta = (s.boardTargetMet ? rnd(8, 16) : -rnd(10, 20) * boardDiffSettings.boardMult) + cupBoost * 0.3;
      const newBoardConfidence = clamp((prev.boardConfidence ?? 60) + boardDelta, 0, 100);
      const boardMsg = s.boardTargetMet ? "Styrelsen är nöjd med säsongen." : `Styrelsen är missnöjd — målet var "${s.boardTargetLabel}".`;
      const boardCrisis = newBoardConfidence <= 15;

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
      prev.squad.forEach(p => {
        const age = p.age + 1;
        const seasonRecordForRecords = { season: prev.season, apps: p.apps, goals: p.goals, assists: p.assists || 0, avgRating: p.apps ? Math.round((p.ratingSum / p.apps) * 10) / 10 : null };
        checkClubRecords(p, seasonRecordForRecords);
        if (age >= 36) { departures.push(`${p.name} har avslutat sin karriär.`); return; }
        const contractYears = p.contractYears - 1;
        if (contractYears <= 0) { departures.push(`${p.name} lämnade klubben som free agent.`); return; }
        let attack = p.attack, defense = p.defense;
        if (age < 24) { attack = clamp(attack + rnd(0.3, 1.2), 15, 99); defense = clamp(defense + rnd(0.3, 1.2), 15, 99); }
        else if (age >= 30) { const decline = (age - 29) * rnd(0.5, 1.1); attack = clamp(attack - decline, 15, 99); defense = clamp(defense - decline, 15, 99); }
        const playTimeRatio = p.apps / totalRoundsLastSeason;
        const outOfPosRatio = p.apps ? (p.outOfPositionApps || 0) / p.apps : 0;
        const outOfPosPenalty = p.personality === "Ambitiös" ? outOfPosRatio * 12 : 0;
        const moraleTarget = clamp(45 + playTimeRatio * 45 + (contractYears <= 1 ? -15 : 0) + (s.boardTargetMet ? 5 : -3) - outOfPosPenalty, 5, 95);
        const morale = clamp((p.morale ?? 70) + (moraleTarget - (p.morale ?? 70)) * 0.35, 5, 95);
        const seasonRecord = { season: prev.season, apps: p.apps, goals: p.goals, assists: p.assists || 0, avgRating: p.apps ? Math.round((p.ratingSum / p.apps) * 10) / 10 : null, attack: Math.round(p.attack), defense: Math.round(p.defense) };
        const seasonLog = [...(p.seasonLog || []), seasonRecord];
        aged.push({ ...p, age, attack, defense, contractYears, morale, yellowCards: 0, apps: 0, goals: 0, assists: 0, outOfPositionApps: 0, ratingSum: 0, seasonLog });
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
      const newTakeoverBid = (!prev.takeoverBid && newOwner.patience >= 60 && Math.random() < 0.12) ? generateTakeoverBid(newReputation) : prev.takeoverBid;

      const trophyCount = (s.domesticCupResult?.startsWith("Mästare") ? 1 : 0) + (s.cup1Result?.startsWith("Mästare") ? 1 : 0) + (s.cup2Result?.startsWith("Mästare") ? 1 : 0);
      const mgGrowth = managerSeasonGrowth(prev.manager, s.boardTargetMet, trophyCount);
      let newManager = { ...prev.manager, reputation: mgGrowth.newReputation, attributes: mgGrowth.newAttributes, yearsAsManager: prev.manager.yearsAsManager + 1, contractYears: Math.max(0, prev.manager.contractYears - 1) };
      let managerMsg = null;
      if (!newManager.interestedClub && newManager.reputation >= 45 && Math.random() < 0.18) {
        const interested = generateInterestedClub(newManager.reputation, newClubs, prev.userClubId);
        if (interested) { newManager = { ...newManager, interestedClub: interested }; managerMsg = `${interested.clubName} har visat intresse för dig som tränare.`; }
      }

      // Staff can grow in ability over time; if their wage falls behind their new level, they'll ask for a raise.
      const newStaff = { ...prev.staff };
      const raiseRequests = [];
      Object.keys(newStaff).forEach(role => {
        const member = newStaff[role];
        if (!member) return;
        let updated = { ...member };
        if (updated.level < 5 && Math.random() < 0.16) updated.level += 1;
        const fair = staffFairWage(updated.level);
        if (updated.wage < fair * 0.85) { updated.needsRaise = true; raiseRequests.push(STAFF_ROLE_LABEL[role] || role); }
        newStaff[role] = updated;
      });
      const staffMsg = raiseRequests.length ? `${raiseRequests.join(", ")} vill omförhandla sin lön.` : null;

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
        schedule: generateSchedule(userPoolIds), squad: newSquad, youthSquad: newYouth,
        startingXI: prev.startingXI.filter(id => !departedIds.has(id)),
        reputation: newReputation, fanbase: newFanbase, boardConfidence: newBoardConfidence, plannedSub: null,
        budget: prev.budget - loanPayment + ownerEvent.cashDelta, loans: newLoans,
        owner: newOwner, takeoverBid: newTakeoverBid, tourOffers: null, manager: newManager, staff: newStaff,
        lastMatchReport: null, view: boardCrisis ? "boardcrisis" : "home", activeTab: "home", pendingAfterResult: "home",
        cup: null, cupQueue, lastCup2ChampionId: newCup2ChampionId, outgoingLoans: [], formationFamiliarity: offSeasonFamiliarity, sillySeasonWeeksLeft: 4,
        seasonIncomeTotal: 0, seasonWageTotal: 0, clubRecords,
        lastSeasonSummary: s, seasonEndSnapshot: prev.seasonEndSnapshot, history,
        _toast: boardCrisis ? null : (combinedToast || null),
      };
    });
  }
  function advanceSillySeasonWeek() {
    setG(prev => {
      let scoutMission = prev.scoutMission;
      let scoutToast = null;
      if (scoutMission && !scoutMission.complete) {
        const roundsElapsed = scoutMission.roundsElapsed + 1;
        if (roundsElapsed >= scoutMission.roundsTotal) {
          const candidate = generateScoutCandidate(scoutMission, prev.staff.scout?.level || 0, prev.clubs, prev.clubs[prev.userClubId].division);
          scoutMission = { ...scoutMission, roundsElapsed, complete: true, result: candidate };
          scoutToast = candidate ? `Scoutuppdraget är klart — ${candidate.name} har hittats.` : "Scoutuppdraget är klart, men ingen spelare matchade kriterierna.";
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
      const tourBoost = prev.tourCompletedThisOffseason ? 1.3 : 1;
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
      const preSeasonFamiliarity = clamp((prev.formationFamiliarity || 0) + 4 * (9 + (prev.tourCompletedThisOffseason ? 3 : 0)), 0, 100);
      const preSeasonMsg = friendlyXI.size >= 7 ? `Försäsongen (4 träningsmatcher) är avklarad — laget går in i säsongen med ${Math.round(preSeasonFamiliarity)}% taktisk vana${developedNames.length ? `, och ${developedNames.slice(0, 3).join(", ")}${developedNames.length > 3 ? " m.fl." : ""} utvecklades av speltiden ihop` : ""}.` : null;
      return { ...prev, squad: newSquad, formationFamiliarity: preSeasonFamiliarity, sillySeasonWeeksLeft: 0, tourCompletedThisOffseason: false, _toast: preSeasonMsg };
    });
  }

  const NAV_TABS = [
    { key: "home", label: "Hem", icon: Home }, { key: "table", label: "Tabell", icon: Trophy },
    { key: "fixtures", label: "Matcher", icon: CalendarDays }, { key: "squad", label: "Trupp", icon: Users },
    { key: "transfers", label: "Övergångar", icon: ArrowLeftRight }, { key: "club", label: "Klubb", icon: Building2 },
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
        .rise-in { animation: riseIn .35s ease both; }
        @keyframes confettiFall { 0% { transform: translateY(0) rotate(0deg); opacity: 1; } 100% { transform: translateY(240px) rotate(340deg); opacity: 0; } }
        @keyframes pulseCta { 0%, 100% { box-shadow: 0 0 0 0 rgba(201,154,62,0.45); } 50% { box-shadow: 0 0 0 8px rgba(201,154,62,0); } }
        @keyframes constructionScroll { from { background-position: 0 0; } to { background-position: 32px 0; } }
        @keyframes craneSway { 0%, 100% { transform: rotate(-4deg); } 50% { transform: rotate(4deg); } }
        @keyframes craneBlink { 0%, 100% { opacity: 1; } 50% { opacity: 0.25; } }
        .pulse-cta { animation: pulseCta 2.2s ease-in-out infinite; }
        .notif-dot { position: absolute; top: 4px; right: 14px; width: 8px; height: 8px; border-radius: 999px; background: #D9534F; border: 1.5px solid ${C.turfDeep}; }
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
        <div style={{ width: 92, flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 14, paddingBottom: 10, borderRight: `1px solid ${C.turfLine}`, background: C.turfDeep, overflowY: "auto" }}>
          <button onClick={() => setEditingColor(v => !v)} className="w-10 h-10 shrink-0 mb-4" style={{ position: "relative" }} title="Byt klubbfärg">
            <ClubJersey club={userClub} size={40} />
            <span style={{ position: "absolute", bottom: -2, right: -2, width: 14, height: 14, borderRadius: "50%", background: C.turfDeep, border: `1px solid ${C.gold}`, display: "flex", alignItems: "center", justifyContent: "center" }}><Pencil size={7} color={C.goldSoft} /></span>
          </button>
          {NAV_TABS.map(({ key, label, icon: Icon }) => {
            const active = g.activeTab === key && !["result", "cup", "press", "trophies", "manager", "matchprep", "halftime", "midgame", "lategame", "boardcrisis"].includes(g.view);
            return (
              <button key={key} onClick={() => setG(prev => ({ ...prev, activeTab: key, view: "tab" }))} className="tabbtn flex flex-col items-center gap-1 py-2.5 w-full"
                style={{ background: active ? "rgba(201,154,62,0.14)" : "transparent", position: "relative" }}>
                {NAV_NOTIFS[key] && <div className="notif-dot" />}
                <Icon size={18} color={active ? C.goldSoft : C.paperDim} strokeWidth={active ? 2.4 : 2} />
                <span className="text-9" style={{ color: active ? C.goldSoft : C.paperDim, fontWeight: active ? 600 : 400 }}>{label}</span>
              </button>
            );
          })}
          <div style={{ flex: 1 }} />
          <button onClick={() => setG(prev => ({ ...prev, view: "manager" }))} className="tabbtn flex flex-col items-center gap-1 py-2.5 w-full" style={{ position: "relative" }}>
            {g.manager?.interestedClub && <div className="notif-dot" />}
            <Award size={17} color={C.paperDim} />
            <span className="text-9" style={{ color: C.paperDim }}>Manager</span>
          </button>
          <button onClick={() => setG(prev => ({ ...prev, view: "trophies" }))} className="tabbtn flex flex-col items-center gap-1 py-2.5 w-full">
            <Medal size={17} color={C.paperDim} />
            <span className="text-9" style={{ color: C.paperDim }}>Meriter</span>
          </button>
          <button onClick={goToSaveSelect} className="tabbtn flex flex-col items-center gap-1 py-2.5 w-full">
            <Layers size={17} color={C.paperDim} />
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
                  {countryName} · D{userClub.division} · S{g.season} · {seasonOver ? "Säsongen avslutad" : `Omg ${g.round + 1}/${totalRounds}`} · Plats {userPos || "–"}
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
                <div className="text-9 uppercase tracking-wide mb-1.5" style={{ color: C.paperDim }}>Välj klubbfärg</div>
                <div className="flex flex-wrap gap-2">
                  {COLOR_POOL.map(hex => (
                    <button key={hex} onClick={() => saveClubColor(hex)} style={{ width: 24, height: 24, borderRadius: "50%", background: hex, border: hex === userClub.color ? `2px solid ${C.gold}` : "2px solid transparent" }} />
                  ))}
                  <label style={{ width: 24, height: 24, borderRadius: "50%", border: `1px dashed ${C.paperDim}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", position: "relative", overflow: "hidden" }}>
                    <Pencil size={10} color={C.paperDim} />
                    <input type="color" value={userClub.color} onChange={e => saveClubColor(e.target.value)} style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer" }} />
                  </label>
                </div>
              </div>
            )}
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: "14px 20px 24px" }}>
            <div style={{ maxWidth: "min(94vw, 1040px)", margin: "0 auto" }}>
              {toast && <div className="rise-in mb-3 text-sm px-3 py-2 rounded-lg" style={{ background: "rgba(201,154,62,0.18)", border: `1px solid ${C.gold}`, color: C.goldSoft }}>{toast}</div>}

              {g.view === "boardcrisis" ? (
                <BoardCrisisView clubName={userClub.name} onAcknowledge={acknowledgeBoardCrisis} />
              ) : g.view === "halftime" && g.pendingRound ? (
                <HalftimeView pending={g.pendingRound} userClub={userClub} oppClub={g.clubs[g.pendingRound.oppId]} onContinue={boost => resolveSecondHalf(boost)} />
              ) : g.view === "midgame" && g.pendingMidGame ? (
                <MidGameView pending={g.pendingMidGame} userClub={userClub} oppClub={g.clubs[g.pendingMidGame.p.oppId]} onChoose={choice => resolveMidGame(choice)} />
              ) : g.view === "lategame" && g.pendingLateGame ? (
                <LateGameView pending={g.pendingLateGame} userClub={userClub} oppClub={g.clubs[g.pendingLateGame.p.oppId]} onChoose={choice => resolveLateGame(choice)} />
              ) : g.view === "result" && g.lastMatchReport ? (
                <MatchResultView report={g.lastMatchReport} userTeamName={userClub.name} competitionLabel="Ligamatch"
                  onContinue={() => setG(prev => ({ ...prev, view: "press" }))} />
              ) : g.view === "press" && g.lastMatchReport ? (
                <PressConferenceView report={g.lastMatchReport} onRespond={respondPress} />
              ) : g.view === "trophies" ? (
                <TrophyCabinetView history={g.history} club={userClub} season={g.season} clubRecords={g.clubRecords} onBack={() => setG(prev => ({ ...prev, view: prev.activeTab === "home" ? "home" : "tab" }))} />
              ) : g.view === "manager" ? (
                <ManagerProfileView manager={g.manager} assistantManager={g.assistantManager} staff={g.staff} g={g} userClub={userClub}
                  onRespondInterest={respondManagerInterest} onHireAssistant={hireAssistantManager} onSetDifficulty={setDifficulty}
                  onBack={() => setG(prev => ({ ...prev, view: prev.activeTab === "home" ? "home" : "tab" }))} />
              ) : g.view === "matchprep" ? (
                <MatchPrepView g={g} userClub={userClub} oppClub={oppClub} countryName={countryName} isHome={nextFixture ? nextFixture.home === g.userClubId : true}
                  onBack={() => setG(prev => ({ ...prev, view: "home" }))}
                  onTactic={t => setG(prev => ({ ...prev, tactic: t }))} onSetPlannedSub={setPlannedSub} onSetTactical={setTacticalOption}
                  onSetTeamTalk={setTeamTalk} onRestStars={restStars} onSetTicketPrice={setTicketPrice}
                  onGotoSquad={() => setG(prev => ({ ...prev, activeTab: "squad", view: "tab" }))} onPlay={beginRound} />
              ) : g.view === "cup" && g.cup ? (
                <CupView cup={g.cup} clubs={g.clubs} userClubId={g.userClubId} userTeamName={userClub.name}
                  onPlayDomestic={playDomesticCupRound} onContinueDomestic={continueDomesticCupRound}
                  onPlayGroup={playGroupMatch} onContinueGroup={continueGroupRound}
                  onPlayLeg={playCupLeg} onContinueLeg={continueCupLeg}
                  onPlayFinal={playCupFinal} onContinueFinal={continueCupFinal}
                  onFinish={finishCup} />
              ) : g.activeTab === "home" ? (
                <HomeTab g={g} userClub={userClub} oppClub={oppClub} countryName={countryName} standings={standings} userPos={userPos} userRow={userRow}
                  nextFixture={nextFixture} seasonOver={seasonOver}
                  onTactic={t => setG(prev => ({ ...prev, tactic: t }))} onPlay={beginRound} onNewSeason={newSeason}
                  onGotoCup={() => setG(prev => ({ ...prev, view: "cup" }))} onSetPlannedSub={setPlannedSub} onSetTactical={setTacticalOption}
                  onSetTeamTalk={setTeamTalk} onRestStars={restStars} onGotoPrep={() => setG(prev => ({ ...prev, view: "matchprep" }))}
                  onAdvanceSillySeason={advanceSillySeasonWeek} onFinishSillySeason={finishSillySeason} />
              ) : g.activeTab === "table" ? (
                <TableTab standings={standings} clubs={g.clubs} userClubId={g.userClubId} division={userClub.division} cup={g.cup} nextFixture={nextFixture} />
              ) : g.activeTab === "fixtures" ? (
                <FixturesTab schedule={g.schedule} clubs={g.clubs} currentRound={g.round} userClubId={g.userClubId} cup={g.cup} />
              ) : g.activeTab === "squad" ? (
                <SquadTab squad={g.squad} startingXI={g.startingXI} onToggleStarter={toggleStarter} confirmSell={confirmSell} setConfirmSell={setConfirmSell} onSell={sellPlayer} onToggleListed={toggleTransferListed} onRenew={renewContract}
                  formationCode={g.formationCode} lineupCells={g.lineupCells} onSaveFormation={saveFormation} onChat={chatWithPlayer}
                  clubs={g.clubs} round={g.round} onSendLoan={sendPlayerOnLoan} outgoingLoans={g.outgoingLoans}
                  setPieceTakers={g.setPieceTakers} onSetSetPieceTakers={setSetPieceTakers} chemistryPairs={g.chemistryPairs} onAssessPlayer={assessPlayer} />
              ) : g.activeTab === "club" ? (
                <ClubTab club={userClub} dev={g.dev} budget={g.budget} history={g.history} reputation={g.reputation} fanbase={g.fanbase}
                  spelide={g.spelide} onSetSpelide={setSpelide} youthSquad={g.youthSquad} onUpgrade={upgradeDev} onSellYouth={sellYouth} onPromoteYouth={promoteYouth}
                  arenaStands={g.arenaStands} arenaFacilities={g.arenaFacilities} arenaConstruction={g.arenaConstruction} onStartConstruction={startArenaConstruction} akademiParts={g.akademiParts} scoutingParts={g.scoutingParts}
                  sponsors={g.sponsors} onUpgradePart={upgradePart} onSignSponsor={signSponsor}
                  staff={g.staff} onHireStaff={hireStaff} onRenegotiateStaff={renegotiateStaffWage} boardConfidence={g.boardConfidence} boardTarget={boardTargetLabel(userClub.archetype, userClub.division).label}
                  loans={g.loans} onTakeLoan={takeLoan}
                  squad={g.squad} owner={g.owner} takeoverBid={g.takeoverBid} tourOffers={g.tourOffers}
                  onRespondTakeover={respondTakeoverBid} onOpenTours={openTourOffers} onStartTour={startTour}
                  repHistory={g.repHistory} fanHistory={g.fanHistory} />
              ) : (
                <TransfersTab market={g.market} budget={g.budget} scoutingLevel={g.dev.scouting} kontakterLevel={g.scoutingParts.kontakter} youthSquad={g.youthSquad} youthMarket={g.youthMarket} round={g.round}
                  clubs={g.clubs} reputation={g.reputation} incomingOffers={g.incomingOffers}
                  onFinalizeTransfer={finalizeTransfer} onBuyYouth={buyYouth} onRespondOffer={respondIncomingOffer}
                  scoutMission={g.scoutMission} scoutLevel={g.staff.scout?.level || 0}
                  onStartScoutMission={startScoutMission} onDismissScoutMission={dismissScoutMission} onFinalizeScoutSignee={finalizeScoutSignee}
                  loanOffers={g.loanOffers} onAcceptLoan={acceptLoanOffer} onDeclineLoan={declineLoanOffer} difficulty={g.difficulty}
                  squad={g.squad} savedScoutProfiles={g.savedScoutProfiles} onSaveScoutProfile={saveScoutProfile} onDeleteScoutProfile={deleteScoutProfile} />
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function PaperCard({ children, style }) { return <div className="rounded-2xl p-3" style={{ background: C.paper, color: C.ink, border: `1px solid rgba(30,42,34,0.1)`, ...style }}>{children}</div>; }
function ResultChip({ result }) {
  const map = { win: { l: "V", c: C.win }, draw: { l: "O", c: C.draw }, loss: { l: "F", c: C.loss } };
  const m = map[result];
  return <span className="w-6 h-6 rounded-full inline-flex items-center justify-center text-11 font-bold text-white" style={{ background: m.c }}>{m.l}</span>;
}
function StatBar({ label, value, color }) {
  return (
    <div className="flex-1">
      <div className="flex justify-between text-10 mb-0.5" style={{ color: C.inkSoft }}><span>{label}</span><span className="font-mono"><AnimatedNumber value={value} /></span></div>
      <div className="h-1.5 rounded-full" style={{ background: "rgba(0,0,0,0.08)" }}><div className="h-full rounded-full" style={{ width: `${clamp(value, 0, 100)}%`, background: color, transition: "width .5s ease" }} /></div>
    </div>
  );
}

function SaveSelectView({ saves, onSelect, onNew, onDelete, onExport, onImport }) {
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
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
            <button onClick={() => onSelect(s.id)} className="flex-1 text-left min-w-0">
              <div className="font-semibold text-sm truncate">{s.clubName}</div>
              <div className="text-11 mt-0.5" style={{ color: C.inkSoft }}>{s.countryName} · Division {s.division} · Säsong {s.season}</div>
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
    </div>
  );
}

const ONBOARDING_FONT_STYLE = `@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700&family=Inter:wght@400;500;600;700&display=swap'); .font-display{font-family:'Fraunces','Inter',serif;font-weight:700;letter-spacing:-0.005em;} ::-webkit-scrollbar{display:none;}`;
function OnboardingWrap({ children }) {
  return (
    <div style={{ background: C.turfDeep, minHeight: "100vh", color: C.paper }} className="flex flex-col">
      <style>{ONBOARDING_FONT_STYLE}</style>
      {children}
    </div>
  );
}
function Onboarding({ world, onConfirm, onCancel }) {
  const [leagueId, setLeagueId] = useState(null);
  const [division, setDivision] = useState(null);
  const [clubId, setClubId] = useState(null);
  const [step, setStep] = useState(null); // null | "name" | "press"
  const [managerName, setManagerName] = useState("");
  const season1Qualifiers = useMemo(() => buildSeason1Qualifiers(world), [world]);

  if (!leagueId) {
    return (
      <OnboardingWrap>
        <div className="max-w-md mx-auto w-full px-5 pt-10 pb-6">
          {onCancel && <button onClick={onCancel} style={{ position: "sticky", bottom: 6, display: "inline-block", color: "rgba(255,255,255,0.32)", background: "rgba(19,34,29,0.6)", padding: "3px 9px", borderRadius: 999, fontSize: 10, zIndex: 5, backdropFilter: "blur(3px)" }}>← Tillbaka till dina karriärer</button>}
          <div className="font-display text-3xl" style={{ color: C.goldSoft }}>TRÄNARBÄNKEN</div>
          <div className="text-sm mt-1" style={{ color: C.paperDim }}>Välj land att starta din managerkarriär i.</div>
        </div>
        <div className="max-w-md mx-auto w-full px-5 space-y-3 pb-10">
          {LEAGUES.map(l => (
            <button key={l.id} onClick={() => setLeagueId(l.id)} className="w-full text-left rounded-2xl p-4" style={{ background: C.paper, color: C.ink }}>
              <div className="font-display text-xl">{l.name}</div>
              <div className="text-xs mt-1" style={{ color: C.inkSoft }}>{l.blurb}</div>
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
              <div className="font-display text-xl">Division {d}</div>
              <div className="text-xs mt-1" style={{ color: C.inkSoft }}>{DIVISION_BLURB[d]}</div>
            </button>
          ))}
        </div>
      </OnboardingWrap>
    );
  }

  const clubs = Object.values(world).filter(c => c.league === leagueId && c.division === division);
  const selectedClub = clubId ? world[clubId] : null;

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
            <button key={opt.key} onClick={() => onConfirm(leagueId, division, clubId, managerName.trim(), opt.key)} className="w-full text-left rounded-2xl p-4" style={{ background: C.paper, color: C.ink }}>
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
        <div><div className="font-display text-2xl" style={{ color: C.goldSoft }}>VÄLJ KLUBB</div><div className="text-xs mt-0.5" style={{ color: C.paperDim }}>{LEAGUES.find(l => l.id === leagueId).name} · Division {division}</div></div>
        <button onClick={() => { setDivision(null); setClubId(null); }} className="text-xs" style={{ color: C.paperDim }}>Byt division</button>
      </div>
      <div className="max-w-md mx-auto w-full px-5 pb-2">
        <ul className="text-9 leading-snug space-y-0.5" style={{ color: C.paperDim, listStyle: "disc", paddingLeft: 14 }}>
          <li><span style={{ color: C.paperDim }}>Kimby Mästerskapet</span>: 16 bästa lagen per land, gruppspel + slutspel.</li>
          <li><span style={{ color: C.paperDim }}>Kimby Cupen</span>: 16 topplag per land, rakt slutspelsträd.</li>
        </ul>
      </div>
      <div className="max-w-md mx-auto w-full px-5 space-y-2.5 pb-28">
        {clubs.map(c => {
          const arche = ARCHETYPES[c.archetype];
          const stars = Math.max(1, Math.min(5, Math.round((c.strength) / 20)));
          const divMult = { 1: 1, 2: 0.5, 3: 0.28 }[division];
          const selected = clubId === c.id;
          return (
            <button key={c.id} onClick={() => setClubId(c.id)} className="w-full text-left rounded-2xl p-4" style={{ background: C.paper, color: C.ink, boxShadow: selected ? `0 0 0 2px ${C.gold}` : "none" }}>
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
                <div className="flex gap-0.5">{[1, 2, 3, 4, 5].map(n => <Star key={n} size={12} fill={n <= stars ? C.gold : "none"} color={n <= stars ? C.gold : C.paperDim} />)}</div>
                <span className="font-mono text-11" style={{ color: C.inkSoft }}>Startbudget: {formatMoney(Math.round(arche.startBudget * divMult))}</span>
              </div>
              {selected && (
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
              )}
            </button>
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
  if (cup.phase === "groups") return `Gruppspel · Omgång ${cup.groupRound + 1}/3`;
  if (cup.phase === "final") return "Final";
  return cup.roundName;
}

function HomeTab({ g, userClub, oppClub, countryName, standings, userPos, userRow, nextFixture, seasonOver, onTactic, onPlay, onNewSeason, onGotoCup, onSetPlannedSub, onSetTactical, onSetTeamTalk, onRestStars, onGotoPrep, onAdvanceSillySeason, onFinishSillySeason }) {
  const form = recentForm(g.schedule, g.round, g.userClubId);
  const isHome = nextFixture ? nextFixture.home === g.userClubId : true;
  const n = standings.length;

  if (g.sillySeasonWeeksLeft > 0) {
    return (
      <div className="rise-in space-y-2.5">
        <PaperCard>
          <div className="text-center py-3">
            <Landmark size={30} color={C.gold} className="mx-auto mb-2" />
            <div className="font-display text-xl">SILLY SEASON</div>
            <div className="text-sm mt-1" style={{ color: C.inkSoft }}>Transferfönstret är öppet inför den nya säsongen. Scouta spelare, värva, förhandla kontrakt och bygg upp arena, akademi och organisation innan försäsongen drar igång.</div>
          </div>
        </PaperCard>
        <PaperCard>
          <div className="text-xs uppercase tracking-wide font-semibold" style={{ color: C.inkSoft }}>Tid kvar</div>
          <div className="font-display text-2xl mt-1">{g.sillySeasonWeeksLeft} {g.sillySeasonWeeksLeft === 1 ? "vecka" : "veckor"}</div>
        </PaperCard>
        {g.sillySeasonWeeksLeft > 1 ? (
          <button onClick={onAdvanceSillySeason} className="w-full py-2.5 rounded-xl font-display text-sm tracking-wide" style={{ background: C.gold, color: C.turfDeep }}>NÄSTA VECKA</button>
        ) : (
          <button onClick={onFinishSillySeason} className="pulse-cta w-full py-2.5 rounded-xl font-display text-sm tracking-wide" style={{ background: C.gold, color: C.turfDeep }}>STARTA FÖRSÄSONGEN</button>
        )}
      </div>
    );
  }

  if (g.cup && !g.cup.champion && !g.cup.eliminated) {
    return (
      <div className="rise-in space-y-2.5">
        <PaperCard>
          <div className="text-center py-3">
            <Swords size={30} color={C.gold} className="mx-auto mb-2" />
            <div className="font-display text-xl">{g.cup.label.toUpperCase()} PÅGÅR</div>
            <div className="text-sm mt-1" style={{ color: C.inkSoft }}>{cupStatusText(g.cup)}</div>
          </div>
        </PaperCard>
        <button onClick={onGotoCup} className="w-full py-2.5 rounded-xl font-display text-sm tracking-wide" style={{ background: C.gold, color: C.turfDeep }}>FORTSÄTT I CUPEN</button>
      </div>
    );
  }

  if (seasonOver) {
    const s = g.lastSeasonSummary;

    const wonTrophy = s?.domesticCupResult?.startsWith("Mästare") || s?.cup1Result?.startsWith("Mästare") || s?.cup2Result?.startsWith("Mästare");
    const celebrate = wonTrophy || (s && s.pos <= 3 && s.division > 1);
    return (
      <div className="rise-in space-y-2.5">
        <PaperCard style={{ position: "relative", overflow: "hidden" }}>
          {celebrate && <Confetti />}
          <div className="text-center py-3">
            <Trophy size={34} color={C.gold} className="mx-auto mb-2" />
            <div className="font-display text-2xl">SÄSONGEN ÄR SLUT</div>
            <div className="text-sm mt-1" style={{ color: C.inkSoft }}>Slutplacering: <span className="font-semibold">{s?.pos}</span> i Division {s?.division} · {countryName}</div>
          </div>
          <div className="space-y-1 mt-1 text-xs font-mono" style={{ color: C.inkSoft }}>
            {s?.domesticCupResult && <div>Inhemsk cup: {s.domesticCupResult}</div>}
            {s?.cup1Result && <div>Kimby Mästerskapet: {s.cup1Result}</div>}
            {s?.cup2Result && <div>Kimby Cupen: {s.cup2Result}</div>}
            {s?.prizeTotal > 0 && <div style={{ color: C.win }}>Cupintäkter: +{formatMoney(s.prizeTotal)}</div>}
          </div>
        </PaperCard>
        <button onClick={onNewSeason} className="pulse-cta w-full py-2.5 rounded-xl font-display text-sm tracking-wide" style={{ background: C.gold, color: C.turfDeep }}>STARTA NY SÄSONG</button>
      </div>
    );
  }

  const xiPreview = getXI(g.squad, g.startingXI);
  const strengthPreview = userStrength(xiPreview, g.tactic, g.spelide, g.tacticalSettings, teamPositionFit(g.lineupCells, g.squad));
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
            <span className="text-9 uppercase tracking-wide font-bold" style={{ color: C.gold }}>Seriematch · {countryName}</span>
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
            {foreignOpp && <span style={{ fontSize: 17 }}>{LEAGUE_FLAG[oppClub.league]}</span>}
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
        <PaperCard style={{ minHeight: 92 }}>
          <div className="text-xs uppercase tracking-wide font-semibold" style={{ color: C.inkSoft }}>Tabellplacering</div>
          <div className="font-display text-2xl mt-1">{userPos}<span className="text-sm align-top" style={{ color: C.inkSoft }}>/{n}</span></div>
          <div className="font-mono text-xs mt-1" style={{ color: C.inkSoft }}>
            {userPos <= 3 ? <span style={{ color: C.win }}>Uppflyttningszon</span> : userPos > n - 3 && userClub.division < 3 ? <span style={{ color: C.loss }}>Nedflyttningszon</span> : `${userRow?.pts ?? 0} poäng`}
          </div>
        </PaperCard>
        <PaperCard style={{ minHeight: 92 }}>
          <div className="text-xs uppercase tracking-wide font-semibold" style={{ color: C.inkSoft }}>Senaste ekonomi</div>
          <div className="font-display text-xl mt-1 flex items-center gap-1" style={{ color: g.lastDelta >= 0 ? C.win : C.loss }}>
            {g.lastDelta >= 0 ? <TrendingUp size={16} /> : <TrendingDown size={16} />}<AnimatedNumber value={g.lastDelta} format={formatMoney} />
          </div>
          <div className="font-mono text-xs mt-1" style={{ color: C.inkSoft }}>senaste omgången</div>
        </PaperCard>
        <PaperCard style={{ minHeight: 92, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <div className="text-xs uppercase tracking-wide font-semibold mb-1" style={{ color: C.inkSoft }}>Rykte</div>
          <StatBar label="" value={g.reputation} color={C.gold} />
        </PaperCard>
        <PaperCard style={{ minHeight: 92, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <div className="text-xs uppercase tracking-wide font-semibold mb-1" style={{ color: C.inkSoft }}>Fanbase</div>
          <StatBar label="" value={g.fanbase} color={C.turf} />
        </PaperCard>
        <PaperCard style={{ gridColumn: "span 2" }}>
          <div className="text-xs uppercase tracking-wide font-semibold mb-1" style={{ color: C.inkSoft }}>Styrelsens förtroende</div>
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

function MatchPrepView({ g, userClub, oppClub, countryName, isHome, onBack, onTactic, onSetPlannedSub, onSetTactical, onSetTeamTalk, onRestStars, onSetTicketPrice, onGotoSquad, onPlay }) {
  const xiPreview = getXI(g.squad, g.startingXI);
  const strengthPreview = userStrength(xiPreview, g.tactic, g.spelide, g.tacticalSettings, teamPositionFit(g.lineupCells, g.squad));
  const report = oppClub ? scoutingReport(strengthPreview.attack, strengthPreview.defense, oppClub) : null;
  const weatherPreview = weatherForMatch(`weather${g.round}${g.userClubId}`);
  const benchOptions = g.squad.filter(p => !xiPreview.some(x => x.id === p.id) && !p.injuryWeeks && !p.suspendedMatches && !p.internationalDuty);
  const foreignOpp = oppClub && oppClub.league !== userClub.league;
  const xiReady = g.startingXI.length === 11;
  const currentTier = TICKET_TIERS[g.ticketPrice] || TICKET_TIERS.medel;
  const isDerbyPrep = oppClub && userClub.rivalId === oppClub.id;
  const form5Prep = recentForm(g.schedule, g.round, g.userClubId);
  const onForm = form5Prep.filter(r => r === "win").length >= 3;
  const bigDraw = isHome && (isDerbyPrep || (oppClub && oppClub.strength >= 75) || onForm);
  const unavailablePlayers = g.squad.filter(p => p.injuryWeeks > 0 || p.suspendedMatches > 0 || p.internationalDuty);
  const oppNewsNote = oppClub ? oppTeamNewsNote(oppClub, g.round) : "";

  return (
    <div className="rise-in space-y-2.5">
      <button onClick={onBack} style={{ position: "sticky", bottom: 6, display: "inline-block", color: "rgba(255,255,255,0.32)", background: "rgba(19,34,29,0.6)", padding: "3px 9px", borderRadius: 999, fontSize: 10, zIndex: 5, backdropFilter: "blur(3px)" }}>← Tillbaka</button>

      <PaperCard>
        <div className="flex items-center gap-1.5 mb-2">
          <Swords size={12} color={C.gold} />
          <span className="text-9 uppercase tracking-wide font-bold" style={{ color: C.gold }}>Seriematch · {countryName}</span>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ClubJersey club={userClub} size={36} />
            <span className="text-sm font-medium">{isHome ? "Hemma" : "Borta"}</span>
          </div>
          <span className="font-display text-xl" style={{ color: C.inkSoft }}>VS</span>
          <div className="flex items-center gap-2">
            {foreignOpp && <span style={{ fontSize: 17 }}>{LEAGUE_FLAG[oppClub.league]}</span>}
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

      <PaperCard>
        <div className="text-xs uppercase tracking-wide font-semibold mb-1.5" style={{ color: C.inkSoft }}>Taktik</div>
        <div className="grid grid-cols-3 gap-2">
          {[["anfall", "Anfall"], ["balanserad", "Balanserad"], ["forsvar", "Försvar"]].map(([key, label]) => (
            <button key={key} onClick={() => onTactic(key)} className="py-2 rounded-xl text-xs font-semibold border"
              style={g.tactic === key ? { background: C.turf, color: C.paper, borderColor: C.turf } : { background: "transparent", color: C.inkSoft, borderColor: C.paperDim }}>{label}</button>
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
                      style={g.tacticalSettings?.[dial.key] === key ? { background: C.turf, color: C.paper, borderColor: C.turf } : { background: "transparent", color: C.inkSoft, borderColor: C.paperDim }}>{opt.label}</button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </PaperCard>

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

      {isHome && (
        <PaperCard>
          <div className="text-xs uppercase tracking-wide font-semibold mb-1.5" style={{ color: C.inkSoft }}>Biljettpriser</div>
          {bigDraw && (
            <div className="text-11 mb-2 px-2.5 py-1.5 rounded-lg font-semibold" style={{ background: "rgba(201,154,62,0.15)", color: C.gold }}>
              🎟️ Storpublik väntas — {isDerbyPrep ? "lokal rivalmatch!" : oppClub && oppClub.strength >= 75 ? "starkt motstånd drar folk!" : "formstarkt lag lockar publik!"}
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(TICKET_TIERS).map(([key, tier]) => (
              <button key={key} onClick={() => onSetTicketPrice(key)} className="py-2 rounded-xl text-xs font-semibold border text-left px-3"
                style={g.ticketPrice === key ? { background: C.turf, color: C.paper, borderColor: C.turf } : { background: "transparent", color: C.inkSoft, borderColor: C.paperDim }}>{tier.label}</button>
            ))}
          </div>
          <div className="text-11 mt-2" style={{ color: C.inkSoft }}>{currentTier.desc}</div>
        </PaperCard>
      )}

      <button onClick={onPlay} className="pulse-cta w-full py-2.5 rounded-xl font-display text-sm tracking-wide flex items-center justify-center gap-2" style={{ background: C.gold, color: C.turfDeep }}>
        <Play size={16} fill={C.turfDeep} /> SPELA MATCH
      </button>
    </div>
  );
}

function MatchResultView({ report, userTeamName, competitionLabel, onContinue }) {
  const { oppName, userIsHome, userGoals, oppGoals, result, ratings, penalties, weather, keyMoments, isDerby, timeline, stats, motm } = report;
  const hasTicker = timeline && timeline.length > 0;
  const [revealCount, setRevealCount] = useState(0);
  const [skipped, setSkipped] = useState(!hasTicker);

  useEffect(() => {
    if (!hasTicker || skipped || revealCount >= timeline.length) return;
    const t = setTimeout(() => setRevealCount(c => c + 1), 1250);
    return () => clearTimeout(t);
  }, [revealCount, hasTicker, skipped, timeline]);

  const showingFinal = !hasTicker || skipped || revealCount >= timeline.length;
  const revealed = hasTicker ? timeline.slice(0, revealCount) : [];
  const runningUser = revealed.filter(e => e.type === "goal-user").length;
  const runningOpp = revealed.filter(e => e.type === "goal-opp").length;

  const resultLabel = { win: "SEGER", draw: "OAVGJORT", loss: "FÖRLUST" }[result];
  const resultColor = { win: C.win, draw: C.draw, loss: C.loss }[result];
  const homeIsUser = userIsHome === undefined ? true : userIsHome;
  const homeScore = showingFinal ? (homeIsUser ? userGoals : oppGoals) : (homeIsUser ? runningUser : runningOpp);
  const awayScore = showingFinal ? (homeIsUser ? oppGoals : userGoals) : (homeIsUser ? runningOpp : runningUser);
  const homeName = homeIsUser ? userTeamName : oppName;
  const awayName = homeIsUser ? oppName : userTeamName;
  const lastEvent = revealed.length ? revealed[revealed.length - 1] : null;

  return (
    <div className="rise-in space-y-2.5">
      <div className="ticket rounded-2xl overflow-hidden" style={{ background: C.paper, color: C.ink }}>
        <div className="px-4 pt-4 pb-3 text-center">
          {isDerby && <div className="text-9 font-bold uppercase tracking-wide inline-block px-2 py-0.5 rounded-full mb-1.5" style={{ background: C.gold, color: C.turfDeep }}>Lokal derby</div>}
          <div className="text-10 tracking-20 uppercase font-semibold" style={{ color: C.inkSoft }}>
            {competitionLabel || "Matchbiljett"} · {showingFinal ? "Slutresultat" : `${lastEvent ? lastEvent.minute : 0}'`}{weather ? ` · ${weather.icon} ${weather.name}` : ""}
          </div>
          {showingFinal && <div className="font-display text-sm mt-2" style={{ color: resultColor }}>{resultLabel}</div>}
          <div className="flex items-center justify-center gap-4 mt-2">
            <span className="text-sm font-medium w-24 text-right truncate">{homeName}</span>
            <span className="font-display text-4xl tabular-nums"><AnimatedNumber value={homeScore} duration={300} /> – <AnimatedNumber value={awayScore} duration={300} /></span>
            <span className="text-sm font-medium w-24 text-left truncate">{awayName}</span>
          </div>
          {showingFinal && penalties && <div className="text-xs mt-1.5 font-mono" style={{ color: C.inkSoft }}>Straffar: {penalties}</div>}
          {!showingFinal && lastEvent && (
            <div className="text-11 mt-2 rise-in" key={revealCount} style={{ color: C.ink }}>{lastEvent.text}</div>
          )}
        </div>
        {showingFinal && keyMoments && keyMoments.length > 0 && (
          <>
            <div className="border-t border-dashed mx-4" style={{ borderColor: C.paperDim }} />
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
      {showingFinal ? (
        <button onClick={onContinue} className="pulse-cta w-full py-2.5 rounded-xl font-display text-sm tracking-wide flex items-center justify-center gap-1" style={{ background: C.gold, color: C.turfDeep }}>
          FORTSÄTT <ChevronRight size={16} />
        </button>
      ) : (
        <button onClick={() => setSkipped(true)} className="w-full py-2.5 rounded-2xl text-sm font-semibold" style={{ background: "transparent", border: `1px solid ${C.turfLine}`, color: C.paperDim }}>
          Hoppa till resultat
        </button>
      )}
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

function ManagerProfileView({ manager, assistantManager, staff, g, userClub, onRespondInterest, onHireAssistant, onSetDifficulty, onBack }) {
  const [hiringOpen, setHiringOpen] = useState(false);
  const [assistOffers, setAssistOffers] = useState([]);
  const orgReady = assistantManagerUnlockedViaOrg(staff);
  const managerStars = overallToStars(manager.reputation);
  function openHiring() { setAssistOffers(generateAssistantManagerOffers(userClub.league, orgReady)); setHiringOpen(true); }
  const tips = assistantManager ? generateManagerTips(g, userClub) : [];

  return (
    <div className="rise-in space-y-2.5">
      <button onClick={onBack} style={{ position: "sticky", bottom: 6, display: "inline-block", color: "rgba(255,255,255,0.32)", background: "rgba(19,34,29,0.6)", padding: "3px 9px", borderRadius: 999, fontSize: 10, zIndex: 5, backdropFilter: "blur(3px)" }}>← Tillbaka</button>
      <PaperCard>
        <div className="flex items-center gap-3">
          <div className="w-14 h-14 rounded-full flex items-center justify-center font-display text-xl shrink-0" style={{ background: C.gold, color: C.turfDeep }}>
            {playerInitials(manager.name)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-display text-xl truncate">{manager.name}</div>
            <div className="text-11" style={{ color: C.inkSoft }}>{nationalityLabel(manager.nationality)} · {manager.yearsAsManager} år som tränare</div>
            <div className="mt-1"><StarRating rating={managerStars} size={11} /></div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 mt-3">
          <div><div className="text-10 uppercase tracking-wide font-semibold" style={{ color: C.inkSoft }}>Kontraktslön</div><div className="font-mono text-sm font-semibold mt-0.5">{formatMoney(manager.wage)}/omg</div></div>
          <div><div className="text-10 uppercase tracking-wide font-semibold" style={{ color: C.inkSoft }}>Kontrakt</div><div className="font-mono text-sm font-semibold mt-0.5">{manager.contractYears} år kvar</div></div>
        </div>
      </PaperCard>

      <PaperCard>
        <div className="text-xs uppercase tracking-wide font-semibold mb-3" style={{ color: C.inkSoft }}>Egenskaper</div>
        <div className="space-y-2.5">
          {Object.entries(manager.attributes).map(([key, val]) => (
            <StatBar key={key} label={MANAGER_ATTR_LABELS[key]} value={val} color={C.gold} />
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
      <button onClick={onBack} style={{ position: "sticky", bottom: 6, display: "inline-block", color: "rgba(255,255,255,0.32)", background: "rgba(19,34,29,0.6)", padding: "3px 9px", borderRadius: 999, fontSize: 10, zIndex: 5, backdropFilter: "blur(3px)" }}>← Tillbaka</button>
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
          return (
            <PaperCard key={i}>
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold">Säsong {h.season} · {h.leagueName} · Div {h.division}</div>
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

function BoardCrisisView({ clubName, onAcknowledge }) {
  return (
    <div className="rise-in space-y-2.5">
      <PaperCard style={{ background: "rgba(180,68,59,0.12)" }}>
        <div className="text-center py-3">
          <Swords size={30} color={C.loss} className="mx-auto mb-2" />
          <div className="font-display text-xl" style={{ color: C.loss }}>STYRELSEN ÄR UPPRÖRD</div>
          <div className="text-sm mt-2" style={{ color: C.paper }}>Flera säsonger av missade mål har fått styrelsen att överväga ett tränarbyte. Ni får en sista chans att vända utvecklingen på {clubName}.</div>
        </div>
      </PaperCard>
      <button onClick={onAcknowledge} className="w-full py-2.5 rounded-xl font-display text-sm tracking-wide" style={{ background: C.gold, color: C.turfDeep }}>TA EMOT UTMANINGEN</button>
    </div>
  );
}

function HalftimeView({ pending, userClub, oppClub, onContinue }) {
  const homeIsUser = pending.userIsHome;
  const homeScore = homeIsUser ? pending.h1User : pending.h1Opp;
  const awayScore = homeIsUser ? pending.h1Opp : pending.h1User;
  const homeName = homeIsUser ? userClub.name : oppClub.name;
  const awayName = homeIsUser ? oppClub.name : userClub.name;
  const userBehindOrLevel = pending.h1User <= pending.h1Opp;
  return (
    <div className="rise-in space-y-2.5">
      <div className="ticket rounded-2xl overflow-hidden" style={{ background: C.paper, color: C.ink }}>
        <div className="px-4 pt-4 pb-4 text-center">
          <div className="text-10 tracking-20 uppercase font-semibold" style={{ color: C.inkSoft }}>Halvtid · {pending.weather.icon} {pending.weather.name}</div>
          <div className="flex items-center justify-center gap-4 mt-2">
            <span className="text-sm font-medium w-24 text-right truncate">{homeName}</span>
            <span className="font-display text-4xl tabular-nums">{homeScore} – {awayScore}</span>
            <span className="text-sm font-medium w-24 text-left truncate">{awayName}</span>
          </div>
        </div>
      </div>
      {userBehindOrLevel ? (
        <div className="space-y-2">
          <div className="text-11 text-center" style={{ color: C.paperDim }}>Ni ligger inte över — byt till en mer offensiv inställning för andra halvlek?</div>
          <button onClick={() => onContinue(true)} className="w-full py-2.5 rounded-xl font-display text-sm tracking-wide flex items-center justify-center gap-2" style={{ background: C.gold, color: C.turfDeep }}>
            <Play size={16} fill={C.turfDeep} /> KÖR PÅ OFFENSIVT
          </button>
          <button onClick={() => onContinue(false)} className="w-full py-2.5 rounded-2xl text-sm font-semibold" style={{ background: "transparent", border: `1px solid ${C.turfLine}`, color: C.paperDim }}>Behåll taktiken</button>
        </div>
      ) : (
        <button onClick={() => onContinue(false)} className="w-full py-2.5 rounded-xl font-display text-sm tracking-wide flex items-center justify-center gap-2" style={{ background: C.gold, color: C.turfDeep }}>
          <Play size={16} fill={C.turfDeep} /> SPELA ANDRA HALVLEK
        </button>
      )}
    </div>
  );
}

function MidGameView({ pending, userClub, oppClub, onChoose }) {
  const homeIsUser = pending.p.userIsHome;
  const homeScore = homeIsUser ? pending.runningUser : pending.runningOpp;
  const awayScore = homeIsUser ? pending.runningOpp : pending.runningUser;
  const homeName = homeIsUser ? userClub.name : oppClub.name;
  const awayName = homeIsUser ? oppClub.name : userClub.name;
  return (
    <div className="rise-in space-y-2.5">
      <div className="ticket rounded-2xl overflow-hidden" style={{ background: C.paper, color: C.ink }}>
        <div className="px-4 pt-4 pb-4 text-center">
          <div className="text-10 tracking-20 uppercase font-semibold" style={{ color: C.inkSoft }}>60:e minuten · Läget just nu</div>
          <div className="flex items-center justify-center gap-4 mt-2">
            <span className="text-sm font-medium w-24 text-right truncate">{homeName}</span>
            <span className="font-display text-4xl tabular-nums">{homeScore} – {awayScore}</span>
            <span className="text-sm font-medium w-24 text-left truncate">{awayName}</span>
          </div>
        </div>
      </div>
      <div className="text-11 text-center" style={{ color: C.paperDim }}>Matchen går in i sin avgörande fas — hur vill ni angripa de kommande 15 minuterna?</div>
      <div className="space-y-2">
        <button onClick={() => onChoose("press")} className="w-full py-2.5 rounded-xl font-display text-sm tracking-wide" style={{ background: C.gold, color: C.turfDeep }}>SÄTT PRESS</button>
        <button onClick={() => onChoose("neutral")} className="w-full py-2.5 rounded-2xl text-sm font-semibold" style={{ background: "transparent", border: `1px solid ${C.turfLine}`, color: C.paperDim }}>Håll linjen</button>
        <button onClick={() => onChoose("consolidate")} className="w-full py-2.5 rounded-2xl text-sm font-semibold" style={{ background: "transparent", border: `1px solid ${C.turfLine}`, color: C.paperDim }}>Konsolidera</button>
      </div>
    </div>
  );
}

function LateGameView({ pending, userClub, oppClub, onChoose }) {
  const homeIsUser = pending.p.userIsHome;
  const homeScore = homeIsUser ? pending.runningUser : pending.runningOpp;
  const awayScore = homeIsUser ? pending.runningOpp : pending.runningUser;
  const homeName = homeIsUser ? userClub.name : oppClub.name;
  const awayName = homeIsUser ? oppClub.name : userClub.name;
  return (
    <div className="rise-in space-y-2.5">
      <div className="ticket rounded-2xl overflow-hidden" style={{ background: C.paper, color: C.ink }}>
        <div className="px-4 pt-4 pb-4 text-center">
          <div className="text-10 tracking-20 uppercase font-semibold" style={{ color: C.inkSoft }}>75:e minuten · Jämnt läge</div>
          <div className="flex items-center justify-center gap-4 mt-2">
            <span className="text-sm font-medium w-24 text-right truncate">{homeName}</span>
            <span className="font-display text-4xl tabular-nums">{homeScore} – {awayScore}</span>
            <span className="text-sm font-medium w-24 text-left truncate">{awayName}</span>
          </div>
        </div>
      </div>
      <div className="text-11 text-center" style={{ color: C.paperDim }}>Matchen är fortfarande öppen — hur vill ni spela de sista minuterna?</div>
      <div className="space-y-2">
        <button onClick={() => onChoose("push")} className="w-full py-2.5 rounded-xl font-display text-sm tracking-wide flex items-center justify-center gap-2" style={{ background: C.gold, color: C.turfDeep }}>
          <Play size={16} fill={C.turfDeep} /> TRYCK FRAMÅT
        </button>
        <button onClick={() => onChoose("neutral")} className="w-full py-2.5 rounded-2xl text-sm font-semibold" style={{ background: "transparent", border: `1px solid ${C.turfLine}`, color: C.paperDim }}>Fortsätt som vanligt</button>
        <button onClick={() => onChoose("park")} className="w-full py-2.5 rounded-2xl text-sm font-semibold" style={{ background: "transparent", border: `1px solid ${C.turfLine}`, color: C.paperDim }}>Håll ställningen</button>
      </div>
    </div>
  );
}

function CupView({ cup, clubs, userClubId, userTeamName, onPlayDomestic, onContinueDomestic, onPlayGroup, onContinueGroup, onPlayLeg, onContinueLeg, onPlayFinal, onContinueFinal, onFinish }) {
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
            <div className="text-sm mt-1" style={{ color: C.inkSoft }}>Er resa i {cup.label} slutade {cup.roundName === "Gruppspelet" ? "i gruppspelet" : `i ${cup.roundName.toLowerCase()}en`}.</div>
          </div>
        </PaperCard>
        <button onClick={onFinish} className="w-full py-2.5 rounded-xl font-display text-sm tracking-wide" style={{ background: C.gold, color: C.turfDeep }}>FORTSÄTT</button>
      </div>
    );
  }

  // domestic cup: single-match knockout
  if (cup.type === "domestic") {
    if (cup.userReport) return <MatchResultView report={{ ...cup.userReport, userIsHome: true }} userTeamName={userTeamName} competitionLabel={`${cup.label} · ${cup.roundName}`} onContinue={onContinueDomestic} />;
    let oppName = "";
    for (let i = 0; i < cup.teams.length; i += 2) {
      if (cup.teams[i] === userClubId) { oppName = clubs[cup.teams[i + 1]]?.name || "Ledigt lag"; break; }
      if (cup.teams[i + 1] === userClubId) { oppName = clubs[cup.teams[i]].name; break; }
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
    const nextFixture = cup.groupRound < 3 ? cup.groupSchedule[cup.groupRound].find(f => f.home === userClubId || f.away === userClubId) : null;
    const oppId = nextFixture ? (nextFixture.home === userClubId ? nextFixture.away : nextFixture.home) : null;
    return (
      <div className="rise-in space-y-2.5">
        <PaperCard>
          <div className="text-xs uppercase tracking-wide font-semibold" style={{ color: C.inkSoft }}>{cup.label} · Gruppspel · Omgång {cup.groupRound + 1}/3</div>
          {oppId && <div className="flex items-center justify-center gap-3 mt-3"><span className="text-sm font-medium">{userTeamName}</span><span className="font-display text-xl" style={{ color: C.inkSoft }}>VS</span><span className="text-sm font-medium">{clubs[oppId].name}</span></div>}
          <button onClick={onPlayGroup} className="mt-4 w-full py-2.5 rounded-xl font-display text-sm tracking-wide flex items-center justify-center gap-2" style={{ background: C.gold, color: C.turfDeep }}><Play size={16} fill={C.turfDeep} /> SPELA MATCH</button>
        </PaperCard>
        <PaperCard style={{ padding: 0 }}>
          <div className="px-3 pt-3 pb-2 text-xs uppercase tracking-wide font-semibold" style={{ color: C.inkSoft }}>Gruppställning (topp 2 går vidare)</div>
          {groupStandings.map((row, i) => {
            const t = clubs[row.id]; const isUser = row.id === userClubId;
            return (
              <div key={row.id} className="flex items-center justify-between px-3 py-1.5 text-sm font-mono" style={{ background: isUser ? "rgba(201,154,62,0.18)" : "transparent", fontWeight: isUser ? 700 : 400, borderLeft: i < 2 ? `3px solid ${C.win}` : "3px solid transparent" }}>
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
  if (cup.tie.leg1 && cup.tie.leg === 2 && !cup.tie.leg2 && !cup.pendingReport) {
    const opp = clubs[cup.tie.oppId];
    const leg1Score = cup.tie.userHomeLeg1 ? `${cup.tie.leg1.userGoals}–${cup.tie.leg1.oppGoals}` : `${cup.tie.leg1.oppGoals}–${cup.tie.leg1.userGoals}`;
    return (
      <div className="rise-in space-y-2.5">
        <PaperCard>
          <div className="text-xs uppercase tracking-wide font-semibold" style={{ color: C.inkSoft }}>{cup.label} · {cup.roundName} · Match 2 av 2</div>
          <div className="text-center text-sm mt-2" style={{ color: C.inkSoft }}>Efter första mötet: {leg1Score}</div>
          <div className="flex items-center justify-center gap-3 mt-3"><span className="text-sm font-medium">{userTeamName}</span><span className="font-display text-xl" style={{ color: C.inkSoft }}>VS</span><span className="text-sm font-medium">{opp.name}</span></div>
          <button onClick={onPlayLeg} className="mt-4 w-full py-2.5 rounded-xl font-display text-sm tracking-wide flex items-center justify-center gap-2" style={{ background: C.gold, color: C.turfDeep }}><Play size={16} fill={C.turfDeep} /> SPELA MATCH 2</button>
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

const TABLE_COLS = "1.6rem minmax(0,1fr) 1.7rem 1.7rem 1.7rem 1.7rem 2.3rem 2.5rem";
function CupStandingsPanel({ cup, clubs, userClubId }) {
  if (cup.champion) return <PaperCard><div className="text-sm font-semibold text-center py-2" style={{ color: C.gold }}>🏆 Mästare i {cup.label}!</div></PaperCard>;
  if (cup.eliminated) return <PaperCard><div className="text-sm text-center py-2" style={{ color: C.inkSoft }}>Utslagna ur {cup.label} — {cup.roundName}</div></PaperCard>;

  if (cup.type === "domestic") {
    let oppName = null;
    for (let i = 0; i < cup.teams.length; i += 2) {
      if (cup.teams[i] === userClubId) { oppName = clubs[cup.teams[i + 1]]?.name || "Ledigt lag"; break; }
      if (cup.teams[i + 1] === userClubId) { oppName = clubs[cup.teams[i]].name; break; }
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
        <div className="px-3 pt-3 pb-2 text-xs uppercase tracking-wide font-semibold" style={{ color: C.inkSoft }}>{cup.label} · Gruppställning · Omgång {cup.groupRound + 1}/3</div>
        {groupStandings.map((row, i) => {
          const t = clubs[row.id]; const isUser = row.id === userClubId;
          return (
            <div key={row.id} className="flex items-center justify-between px-3 py-1.5 text-sm font-mono" style={{ background: isUser ? "rgba(201,154,62,0.18)" : "transparent", fontWeight: isUser ? 700 : 400, borderLeft: i < 2 ? `3px solid ${C.win}` : "3px solid transparent" }}>
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
                <span className="flex-1 truncate px-1">{userIsHome ? "vs" : "@"} {clubs[oppId].name}</span>
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

function TableTab({ standings, clubs, userClubId, division, cup, nextFixture }) {
  const [subView, setSubView] = useState("league");
  const n = standings.length;
  const nextOppId = nextFixture ? (nextFixture.home === userClubId ? nextFixture.away : nextFixture.home) : null;
  const showCupTab = cup && !cup.champion && !cup.eliminated;
  return (
    <div className="rise-in">
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
            <span className="text-xs uppercase tracking-wide font-semibold" style={{ color: C.paperDim }}>Division {division}</span>
            {nextOppId && <span className="text-11" style={{ color: C.paperDim }}>Nästa: <b style={{ color: C.goldSoft }}>{clubs[nextOppId].name}</b></span>}
          </div>
          <PaperCard style={{ padding: 0 }}>
            <div style={{ display: "grid", gridTemplateColumns: TABLE_COLS, columnGap: 4 }} className="px-3 pt-3 pb-2 text-9 uppercase font-semibold">
              <span style={{ color: C.inkSoft }}>#</span>
              <span style={{ color: C.inkSoft }}>Lag</span>
              <span className="text-center" style={{ color: C.inkSoft }}>S</span>
              <span className="text-center" style={{ color: C.inkSoft }}>V</span>
              <span className="text-center" style={{ color: C.inkSoft }}>O</span>
              <span className="text-center" style={{ color: C.inkSoft }}>F</span>
              <span className="text-center" style={{ color: C.inkSoft }}>+/-</span>
              <span className="text-right" style={{ color: C.inkSoft }}>P</span>
            </div>
            {standings.map((row, i) => {
              const t = clubs[row.id];
              const isUser = row.id === userClubId;
              const isNextOpp = row.id === nextOppId;
              const promoZone = i < 3 && division > 1;
              const relZone = i >= n - 3 && division < 3;
              const diff = row.gf - row.ga;
              return (
                <div key={row.id} style={{ display: "grid", gridTemplateColumns: TABLE_COLS, columnGap: 4, background: isUser ? "rgba(201,154,62,0.18)" : isNextOpp ? "rgba(201,154,62,0.08)" : i % 2 ? "rgba(0,0,0,0.03)" : "transparent", borderLeft: promoZone ? `3px solid ${C.win}` : relZone ? `3px solid ${C.loss}` : "3px solid transparent" }}
                  className="px-3 py-2 items-center text-sm font-mono">
                  <span style={{ color: C.inkSoft }}>{i + 1}</span>
                  <span className="flex items-center gap-1.5 font-sans font-medium truncate min-w-0" style={{ fontWeight: isUser || isNextOpp ? 700 : 500 }}>
                    <ClubJersey club={t} size={16} /><span className="truncate">{t.name}</span>
                  </span>
                  <span className="text-center">{row.played}</span>
                  <span className="text-center">{row.won}</span>
                  <span className="text-center">{row.drawn}</span>
                  <span className="text-center">{row.lost}</span>
                  <span className="text-center">{diff > 0 ? "+" : ""}{diff}</span>
                  <span className="text-right font-semibold">{row.pts}</span>
                </div>
              );
            })}
          </PaperCard>
          {division > 1 && <div className="text-10 mt-2 px-1" style={{ color: C.paperDim }}><span style={{ color: C.win }}>■</span> Uppflyttning till Division {division - 1}</div>}
          {division < 3 && <div className="text-10 mt-1 px-1" style={{ color: C.paperDim }}><span style={{ color: C.loss }}>■</span> Nedflyttning till Division {division + 1}</div>}
        </>
      )}
    </div>
  );
}

function FixturesTab({ schedule, clubs, currentRound, userClubId, cup }) {
  const [subView, setSubView] = useState("league");
  const rivalId = clubs[userClubId]?.rivalId;
  const showCupTab = cup && !cup.champion && !cup.eliminated;
  return (
    <div className="rise-in">
      {showCupTab && (
        <div className="flex gap-2 mb-3">
          {[["league", "Liga"], ["cup", cup.label]].map(([key, label]) => (
            <button key={key} onClick={() => setSubView(key)} className="flex-1 py-2 rounded-xl text-11 font-semibold" style={subView === key ? { background: C.gold, color: C.turfDeep } : { background: "rgba(255,255,255,0.08)", color: C.paperDim }}>{label}</button>
          ))}
        </div>
      )}
      {subView === "cup" && showCupTab ? <CupFixturesPanel cup={cup} clubs={clubs} userClubId={userClubId} /> : (
        <PaperCard style={{ padding: 0 }}>
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
                  <span className="font-mono text-xs w-16 shrink-0" style={{ color: C.inkSoft }}>Omg {ri + 1}</span>
                  <span className="flex-1 truncate px-1">{isRival && <Star size={11} fill={C.gold} color={C.gold} className="inline mr-1 mb-0.5" />}{userIsHome ? "vs" : "@"} {clubs[oppId].name}</span>
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
  eng3: { pattern: "solid", trim: "#1C87C9" },       // Thames Ironworks (claret + blue trim)
  ita1: { pattern: "solid", trim: "#F2C230" },       // Roma 1927 (red + gold)
  ita2: { pattern: "stripes", secondary: "#111111" }, // Milano 1899 (red/black stripes)
  esp1: { pattern: "solid", trim: "#ffffff" },        // CF Madrid
  esp2: { pattern: "stripes", secondary: "#A50044" }, // Deportivo Barcelona (blue/garnet)
  ger1: { pattern: "solid", trim: "#ffffff" },        // München 1900
  ger2: { pattern: "solid", trim: "#111111" },        // Dortmund 1909 (yellow + black trim)
  fra1: { pattern: "solid", trim: "#ffffff" },        // FC Paris
  fra2: { pattern: "solid", trim: "#ffffff" },        // Racing Marseille
};
function kitPatternFor(club) {
  if (!club) return { pattern: "solid", secondary: null, trim: "#ffffff" };
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

function Confetti() {
  const pieces = useMemo(() => Array.from({ length: 24 }, (_, i) => ({
    id: i, left: Math.random() * 100, delay: Math.random() * 0.6, duration: 1.6 + Math.random() * 1.2,
    color: pick([C.gold, C.goldSoft, C.win, "#fff"]), size: 5 + Math.random() * 5,
  })), []);
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

function PitchMarkings() {
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
    Object.entries(savedCells).forEach(([k, id]) => { if (squad.some(p => p.id === id)) valid[k] = id; });
    if (Object.keys(valid).length) return valid;
  }
  return formationPresetToCells(formationCode || "4-4-2", squad, startingXI);
}

function FormationView({ squad, startingXI, formationCode, lineupCells, onBack, onSave, onToggleStarter, confirmSell, setConfirmSell, onSell, onToggleListed, onRenew, onChat, clubs, round, onSendLoan, chemistryPairs, onAssessPlayer }) {
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
      onSell={p2 => { onSell(p2); setViewingProfileId(null); }} onToggleListed={onToggleListed} onRenew={onRenew} onChat={onChat}
      clubs={clubs} round={round} onSendLoan={onSendLoan ? (toId, toName) => { onSendLoan(toId, toName); setViewingProfileId(null); } : null} squadSize={squad.length} squad={squad} chemistryPairs={chemistryPairs} onAssessPlayer={onAssessPlayer} />;
  }

  if (pickingCell) {
    const [pCol, pRow] = pickingCell.split("-").map(Number);
    const candidates = [...bench].sort((a, b) => positionFit(b.specificPosition, pCol, pRow) - positionFit(a.specificPosition, pCol, pRow));
    return (
      <div className="rise-in space-y-3">
        <button onClick={() => setPickingCell(null)} style={{ position: "sticky", bottom: 6, display: "inline-block", color: "rgba(255,255,255,0.32)", background: "rgba(19,34,29,0.6)", padding: "3px 9px", borderRadius: 999, fontSize: 10, zIndex: 5, backdropFilter: "blur(3px)" }}>← Tillbaka till planen</button>
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
      <button onClick={onBack} style={{ position: "sticky", bottom: 6, display: "inline-block", color: "rgba(255,255,255,0.32)", background: "rgba(19,34,29,0.6)", padding: "3px 9px", borderRadius: 999, fontSize: 10, zIndex: 5, backdropFilter: "blur(3px)" }}>← Tillbaka till truppen</button>
      <button onClick={() => { setLineup({}); setSelectedCell(null); }} className="text-11 self-start" style={{ color: C.loss }}>Rensa startelva</button>
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {FORMATION_CODES.map(fc => (
          <button key={fc} onClick={() => applyPreset(fc)} className="px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap" style={fc === code ? { background: C.gold, color: C.turfDeep } : { background: "rgba(255,255,255,0.08)", color: C.paperDim }}>{fc}</button>
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
function SetPieceTakersPanel({ squad, setPieceTakers, onSave, onBack }) {
  const [penalties, setPenalties] = useState(setPieceTakers.penalties || []);
  const [freeKick, setFreeKick] = useState(setPieceTakers.freeKick || null);
  const [cornerLeft, setCornerLeft] = useState(setPieceTakers.cornerLeft || null);
  const [cornerRight, setCornerRight] = useState(setPieceTakers.cornerRight || null);
  const outfield = squad.filter(p => p.pos !== "MV").sort((a, b) => overallOf(b) - overallOf(a));
  function togglePenalty(id) {
    setPenalties(prev => prev.includes(id) ? prev.filter(x => x !== id) : prev.length < 5 ? [...prev, id] : prev);
  }
  function movePenalty(id, dir) {
    setPenalties(prev => {
      const i = prev.indexOf(id);
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }
  function singleSelectButton(playerId, current, setter) {
    return (
      <button onClick={() => setter(current === playerId ? null : playerId)} className="px-2.5 py-1 rounded-full text-9 font-semibold shrink-0"
        style={current === playerId ? { background: C.gold, color: C.turfDeep } : { background: "rgba(255,255,255,0.08)", color: C.paperDim }}>
        {current === playerId ? "Vald" : "Välj"}
      </button>
    );
  }
  return (
    <div className="rise-in space-y-2.5">
      <button onClick={onBack} style={{ position: "sticky", bottom: 6, display: "inline-block", color: "rgba(255,255,255,0.32)", background: "rgba(19,34,29,0.6)", padding: "3px 9px", borderRadius: 999, fontSize: 10, zIndex: 5, backdropFilter: "blur(3px)" }}>← Tillbaka till truppen</button>
      <PaperCard>
        <div className="font-display text-lg">Standardsituationer</div>
        <div className="text-11 mt-1" style={{ color: C.inkSoft }}>Utses spelare inte i startelvan tas nästa tillgängliga i prioritetsordning automatiskt över.</div>
      </PaperCard>
      <PaperCard>
        <div className="text-xs uppercase tracking-wide font-semibold mb-1.5" style={{ color: C.inkSoft }}>Straffskyttar (prioritetsordning, max 5)</div>
        {penalties.length > 0 && (
          <div className="space-y-1.5 mb-2">
            {penalties.map((id, i) => {
              const p = squad.find(x => x.id === id);
              if (!p) return null;
              return (
                <div key={id} className="flex items-center gap-2 text-11">
                  <span className="font-display w-4" style={{ color: C.gold }}>{i + 1}</span>
                  <span className="flex-1">{p.name}</span>
                  <button onClick={() => movePenalty(id, -1)} disabled={i === 0} className="px-1.5" style={{ color: i === 0 ? C.paperDim : C.inkSoft }}>↑</button>
                  <button onClick={() => movePenalty(id, 1)} disabled={i === penalties.length - 1} className="px-1.5" style={{ color: i === penalties.length - 1 ? C.paperDim : C.inkSoft }}>↓</button>
                  <button onClick={() => togglePenalty(id)} className="px-1.5" style={{ color: C.loss }}>×</button>
                </div>
              );
            })}
          </div>
        )}
        <div className="space-y-1.5">
          {outfield.filter(p => !penalties.includes(p.id)).map(p => (
            <div key={p.id} className="flex items-center justify-between text-11">
              <span>{p.name} <span style={{ color: C.inkSoft }}>({POS_LABEL[p.pos]})</span></span>
              <button onClick={() => togglePenalty(p.id)} disabled={penalties.length >= 5} className="px-2.5 py-1 rounded-full text-9 font-semibold" style={penalties.length >= 5 ? { background: "rgba(255,255,255,0.05)", color: C.paperDim } : { background: "rgba(255,255,255,0.08)", color: C.paperDim }}>Lägg till</button>
            </div>
          ))}
        </div>
      </PaperCard>
      <PaperCard>
        <div className="text-xs uppercase tracking-wide font-semibold mb-1.5" style={{ color: C.inkSoft }}>Frisparksskytt</div>
        <div className="space-y-1.5">
          {outfield.map(p => (
            <div key={p.id} className="flex items-center justify-between text-11">
              <span>{p.name}</span>
              {singleSelectButton(p.id, freeKick, setFreeKick)}
            </div>
          ))}
        </div>
      </PaperCard>
      <PaperCard>
        <div className="text-xs uppercase tracking-wide font-semibold mb-1.5" style={{ color: C.inkSoft }}>Hörnläggare vänster</div>
        <div className="space-y-1.5">
          {outfield.map(p => (
            <div key={p.id} className="flex items-center justify-between text-11">
              <span>{p.name}</span>
              {singleSelectButton(p.id, cornerLeft, setCornerLeft)}
            </div>
          ))}
        </div>
      </PaperCard>
      <PaperCard>
        <div className="text-xs uppercase tracking-wide font-semibold mb-1.5" style={{ color: C.inkSoft }}>Hörnläggare höger</div>
        <div className="space-y-1.5">
          {outfield.map(p => (
            <div key={p.id} className="flex items-center justify-between text-11">
              <span>{p.name}</span>
              {singleSelectButton(p.id, cornerRight, setCornerRight)}
            </div>
          ))}
        </div>
      </PaperCard>
      <button onClick={() => onSave({ penalties, freeKick, cornerLeft, cornerRight })} className="w-full py-2.5 rounded-xl font-display text-sm tracking-wide" style={{ background: C.gold, color: C.turfDeep }}>SPARA STANDARDSITUATIONER</button>
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
      <button onClick={onBack} style={{ position: "sticky", bottom: 6, display: "inline-block", color: "rgba(255,255,255,0.32)", background: "rgba(19,34,29,0.6)", padding: "3px 9px", borderRadius: 999, fontSize: 10, zIndex: 5, backdropFilter: "blur(3px)" }}>← Tillbaka till truppen</button>
      <div>
        <div className="text-xs uppercase tracking-wide font-semibold mb-2 px-1" style={{ color: C.paperDim }}>Sortera efter</div>
        <div className="flex flex-wrap gap-2">
          {CONTRACT_SORT_OPTIONS.map(opt => {
            const active = sortBy === opt.key;
            return (
              <button key={opt.key} onClick={() => toggleSort(opt.key)} className="px-3 py-1.5 rounded-full text-11 font-semibold flex items-center gap-1"
                style={active ? { background: C.gold, color: C.turfDeep } : { background: "rgba(255,255,255,0.08)", color: C.paperDim }}>
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
                <span className="font-sans font-medium truncate min-w-0" style={{ color: C.ink }}><span style={{ color: C.inkSoft }}>#{p.number}</span> {p.name} <span className="text-9" style={{ color: C.inkSoft }}>{p.specificPosition}</span></span>
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


function SquadTab({ squad, startingXI, onToggleStarter, confirmSell, setConfirmSell, onSell, onToggleListed, onRenew, formationCode, lineupCells, onSaveFormation, onChat, clubs, round, onSendLoan, outgoingLoans, setPieceTakers, onSetSetPieceTakers, chemistryPairs, onAssessPlayer }) {
  const [selectedId, setSelectedId] = useState(null);
  const [showFormation, setShowFormation] = useState(false);
  const [showContracts, setShowContracts] = useState(false);
  const [showSetPieces, setShowSetPieces] = useState(false);

  if (showFormation) {
    return <FormationView squad={squad} startingXI={startingXI} formationCode={formationCode} lineupCells={lineupCells}
      onBack={() => setShowFormation(false)}
      onSave={(code, ids, cells) => { onSaveFormation(code, ids, cells); setShowFormation(false); }}
      onToggleStarter={onToggleStarter} confirmSell={confirmSell} setConfirmSell={setConfirmSell} onSell={onSell} onToggleListed={onToggleListed} onRenew={onRenew} onChat={onChat}
      clubs={clubs} round={round} onSendLoan={onSendLoan} chemistryPairs={chemistryPairs} onAssessPlayer={onAssessPlayer} />;
  }

  if (showContracts) {
    return <ContractsView squad={squad} onBack={() => setShowContracts(false)} onSelectPlayer={id => { setShowContracts(false); setSelectedId(id); }} />;
  }

  if (showSetPieces) {
    return <SetPieceTakersPanel squad={squad} setPieceTakers={setPieceTakers} onSave={next => { onSetSetPieceTakers(next); setShowSetPieces(false); }} onBack={() => setShowSetPieces(false)} />;
  }

  if (selectedId) {
    const p = squad.find(x => x.id === selectedId);
    if (!p) { setSelectedId(null); return null; }
    return <PlayerProfile player={p} isStarter={startingXI.includes(p.id)} onToggleStarter={() => onToggleStarter(p.id)}
      onBack={() => setSelectedId(null)} confirmSell={confirmSell} setConfirmSell={setConfirmSell} onSell={p2 => { onSell(p2); setSelectedId(null); }} onToggleListed={onToggleListed} onRenew={onRenew} onChat={onChat}
      clubs={clubs} round={round} onSendLoan={onSendLoan ? (toId, toName) => { onSendLoan(toId, toName); setSelectedId(null); } : null} squadSize={squad.length} squad={squad} chemistryPairs={chemistryPairs} onAssessPlayer={onAssessPlayer} />;
  }

  const grouped = POS_ORDER.map(pos => ({ pos, players: squad.filter(p => p.pos === pos) }));
  return (
    <div className="rise-in space-y-2.5">
      <PaperCard>
        <div className="flex items-center justify-between">
          <div className="text-xs uppercase tracking-wide font-semibold" style={{ color: C.inkSoft }}>Startelva · {formationCode}</div>
          <div className="font-mono text-sm font-semibold" style={{ color: startingXI.length === 11 ? C.win : C.loss }}>{startingXI.length}/11</div>
        </div>
        <div className="text-11 mt-1" style={{ color: C.inkSoft }}>Tryck på en spelare för att se profilen, eller ställ upp laget visuellt på planen.</div>
        <button onClick={() => setShowFormation(true)} className="mt-2.5 w-full py-2.5 rounded-xl text-xs font-semibold" style={{ background: C.gold, color: C.turfDeep }}>Ställ upp laget på planen</button>
        <button onClick={() => setShowContracts(true)} className="mt-2 w-full py-2.5 rounded-xl text-xs font-semibold" style={{ background: "transparent", border: `1px solid ${C.inkSoft}`, color: C.inkSoft }}>Kontrakt</button>
        <button onClick={() => setShowSetPieces(true)} className="mt-2 w-full py-2.5 rounded-xl text-xs font-semibold" style={{ background: "transparent", border: `1px solid ${C.inkSoft}`, color: C.inkSoft }}>Standardsituationer</button>
      </PaperCard>
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
      {grouped.map(({ pos, players }) => (
        <div key={pos}>
          <div className="text-xs uppercase tracking-wide font-semibold mb-2 px-1" style={{ color: C.paperDim }}>{POS_LABEL[pos]}</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {players.map(p => {
              const isStarter = startingXI.includes(p.id);
              const injured = p.injuryWeeks > 0;
              const suspended = p.suspendedMatches > 0;
              const unavailable = injured || suspended || p.internationalDuty;
              const overall = overallOf(p);
              const best = bestAttribute(p);
              const otherGood = [], otherLesser = [];
              Object.keys(SPECIFIC_POSITION_LOOKUP).forEach(code => {
                if (code === p.specificPosition) return;
                const anchor = SPECIFIC_POSITION_LOOKUP[code];
                const fit = positionFit(p.specificPosition, anchor.col, anchor.row);
                if (fit >= 0.75) otherGood.push(code);
                else if (fit >= 0.55) otherLesser.push(code);
              });
              return (
                <PaperCard key={p.id} style={{ boxShadow: isStarter ? `0 0 0 2px ${C.gold}` : "none", opacity: unavailable ? 0.7 : 1, padding: 10 }}>
                  <button onClick={() => setSelectedId(p.id)} className="w-full flex items-center gap-2.5 text-left player-row">
                    <div className="flex flex-col items-center gap-0.5 shrink-0">
                      <OverallBadge overall={overall} size={30} />
                      <span title="Ork" style={{ width: 7, height: 7, borderRadius: "50%", background: (p.stamina ?? 100) >= 60 ? C.win : (p.stamina ?? 100) >= 35 ? C.gold : C.loss }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-xs truncate"><span className="font-mono" style={{ color: C.inkSoft }}>#{p.number}</span> {p.name}</div>
                      <div className="text-9" style={{ color: C.inkSoft }}>{p.specificPosition} · {nationalityLabel(p.nationality)}, {p.age}</div>
                      <div className="font-mono text-9" style={{ color: unavailable ? C.loss : p.loanWeeksLeft ? C.gold : p.transferListed ? C.gold : C.inkSoft }}>{injured ? `Skadad · ${p.injuryWeeks} omg` : suspended ? `Avstängd · ${p.suspendedMatches} omg` : p.internationalDuty ? "Landslagsuppdrag" : p.loanWeeksLeft ? `På lån från ${p.loanFromClubName} · ${p.loanWeeksLeft} omg` : p.transferListed ? "Transferlistad" : `${formatMoney(p.value)} · ${best.label} ${best.value}`}</div>
                      {(otherGood.length > 0 || otherLesser.length > 0) && (
                        <div className="text-9 truncate" style={{ color: C.inkSoft }}>Även: {otherGood.join(", ")}{otherGood.length && otherLesser.length ? ", " : ""}{otherLesser.map(c => `(${c})`).join(", ")}</div>
                      )}
                      <div className="mt-0.5"><StarRating rating={overallToStars(overall)} size={7} /></div>
                    </div>
                    <div onClick={e => { e.stopPropagation(); if (!unavailable) onToggleStarter(p.id); }} role="button"
                      className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 font-mono text-11 font-bold"
                      style={unavailable ? { background: "rgba(180,68,59,0.18)", color: C.loss } : isStarter ? { background: C.gold, color: C.turfDeep } : { background: "rgba(0,0,0,0.08)", color: C.inkSoft }}>
                      {unavailable ? "+" : isStarter ? <Check size={13} /> : "+"}
                    </div>
                  </button>
                </PaperCard>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function PlayerProfile({ player, isStarter, onToggleStarter, onBack, confirmSell, setConfirmSell, onSell, onToggleListed, onRenew, onChat, clubs, round, onSendLoan, squadSize, squad, chemistryPairs, onAssessPlayer }) {
  const attrs = getAttrs(player);
  const labels = attrLabels(player.pos);
  const overall = overallOf(player);
  const tier = overallTier(overall);
  const avgRating = player.apps ? (player.ratingSum / player.apps).toFixed(1) : "–";
  const seasonLog = player.seasonLog || [];
  const careerApps = seasonLog.reduce((s, r) => s + r.apps, 0) + player.apps;
  const careerGoals = seasonLog.reduce((s, r) => s + r.goals, 0) + player.goals;
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
  const target = wageDemand(player);
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
      <button onClick={onBack} style={{ position: "sticky", bottom: 6, display: "inline-block", color: "rgba(255,255,255,0.32)", background: "rgba(19,34,29,0.6)", padding: "3px 9px", borderRadius: 999, fontSize: 10, zIndex: 5, backdropFilter: "blur(3px)" }}>← Tillbaka till truppen</button>
      <PaperCard>
        <div className="flex items-center gap-3">
          <OverallBadge overall={overall} size={52} />
          <div className="flex-1 min-w-0">
            <div className="font-display text-xl truncate">{player.name}</div>
            <div className="text-11" style={{ color: C.inkSoft }}>{POS_LABEL[player.pos]} ({specificPositionLabel(player.specificPosition)}) · {nationalityLabel(player.nationality)} · {player.age} år · <span style={{ color: tier.color === C.gold ? "#B8862E" : tier.color }}>{tier.label}</span></div>
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
        <div className="grid grid-cols-4 gap-2 mt-3 text-center">
          <div><div className="font-display text-lg">{careerApps}</div><div className="text-9 uppercase" style={{ color: C.inkSoft }}>Matcher</div></div>
          <div><div className="font-display text-lg">{careerGoals}</div><div className="text-9 uppercase" style={{ color: C.inkSoft }}>Mål</div></div>
          <div><div className="font-display text-lg">{careerAssists}</div><div className="text-9 uppercase" style={{ color: C.inkSoft }}>Assist</div></div>
          <div><div className="font-display text-lg">{avgRating}</div><div className="text-9 uppercase" style={{ color: C.inkSoft }}>Snittbetyg</div></div>
        </div>
        <div className="mt-3 flex items-center justify-between text-11" style={{ color: C.inkSoft }}>
          <span>Gula kort denna säsong: {player.yellowCards}/5</span>
        </div>
        {milestones.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {milestones.map((m, i) => <span key={i} className="text-9 font-semibold px-2 py-1 rounded-full" style={{ background: "rgba(201,154,62,0.18)", color: C.gold }}>{m}</span>)}
          </div>
        )}
      </PaperCard>

      <div className="grid grid-cols-3 gap-2">
        {[["oversikt", "Översikt"], ["scoutrapport", "Scoutrapport"], ["historia", "Historia"]].map(([key, label]) => (
          <button key={key} onClick={() => setProfileTab(key)} className="py-2 rounded-xl text-11 font-semibold border"
            style={profileTab === key ? { background: C.turf, color: C.paper, borderColor: C.turf } : { background: "transparent", color: C.inkSoft, borderColor: C.paperDim }}>{label}</button>
        ))}
      </div>

      {profileTab === "oversikt" && otherPositions.length > 0 && (
        <PaperCard>
          <div className="text-xs uppercase tracking-wide font-semibold mb-1.5" style={{ color: C.inkSoft }}>Kan även spela</div>
          <div className="flex flex-wrap gap-1.5">
            {otherPositions.map(code => <span key={code} className="text-11 font-mono px-2 py-1 rounded-lg" style={{ background: C.paperDim }}>{code}</span>)}
          </div>
        </PaperCard>
      )}

      {profileTab === "historia" && (
        <>
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

      <PaperCard>
        <div className="text-xs uppercase tracking-wide font-semibold mb-2" style={{ color: C.inkSoft }}>Ytterligare egenskaper</div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-11" style={{ color: C.inkSoft }}>Svag fot</span>
            <div className="flex gap-0.5">{[1, 2, 3, 4, 5].map(n => <Star key={n} size={11} fill={n <= weakFoot(player) ? C.gold : "none"} color={n <= weakFoot(player) ? C.gold : C.paperDim} />)}</div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-11" style={{ color: C.inkSoft }}>Huvudspel</span>
            <span className="text-11 font-mono font-semibold">{headingAbility(player)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-11" style={{ color: C.inkSoft }}>Skaderisk</span>
            <span className="text-11 font-semibold" style={{ color: injuryProneness(player) === "Skör" ? C.loss : injuryProneness(player) === "Robust" ? C.win : C.inkSoft }}>{injuryProneness(player)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-11" style={{ color: C.inkSoft }}>Storform</span>
            <span className="text-11 font-semibold" style={{ color: clutchFactor(player) >= 0.6 ? C.win : clutchFactor(player) <= -0.6 ? C.loss : C.inkSoft }}>{clutchLabel(clutchFactor(player))}</span>
          </div>
        </div>
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
        <div className="text-xs uppercase tracking-wide font-semibold mb-3" style={{ color: C.inkSoft }}>Egenskaper</div>
        <div className="space-y-2.5">
          {Object.entries(labels).map(([key, label]) => <StatBar key={key} label={label} value={attrs[key]} color={key === "defending" ? C.turf : C.gold} />)}
        </div>
        <div className="text-9 mt-2" style={{ color: C.inkSoft }}>Skala 1–95, där 95 är yttersta världsklass.</div>
      </PaperCard>

      <PaperCard>
        <div className="flex items-center justify-between">
          <div className="text-xs uppercase tracking-wide font-semibold" style={{ color: C.inkSoft }}>Kontrakt & lön</div>
          <div className="font-mono text-sm font-semibold" style={{ color: player.contractYears <= 1 ? C.loss : C.ink }}>{player.contractYears} {player.contractYears === 1 ? "år" : "år"} kvar</div>
        </div>
        <div className="text-11 mt-1" style={{ color: C.inkSoft }}>Nuvarande lön: <span className="font-mono font-semibold">{formatMoney(player.wage)}</span>/omgång</div>
        {player.releaseClause && <div className="text-11 mt-1" style={{ color: C.gold }}>Utköpsklausul: {formatMoney(player.releaseClause)}</div>}
        {player.contractYears <= 2 ? (
          !wageOutcome ? (
            <>
              <div className="text-11 mt-1" style={{ color: C.inkSoft }}>{player.name.split(" ")[0]} vill ha ett {demand.years}-årskontrakt. Löneanspråk: ca {formatMoney(target)}/omgång.</div>
              <button onClick={() => setIncludeClause(v => !v)} className="flex items-center gap-2 mt-2 text-11">
                <span style={{ width: 16, height: 16, borderRadius: 4, border: `1.5px solid ${C.gold}`, background: includeClause ? C.gold : "transparent" }} />
                Inkludera utköpsklausul (ca {formatMoney(Math.round(demand.newValue * 1.6))}, sänker löneanspråket ~8%)
              </button>
              <div className="space-y-2 mt-2">
                <button onClick={() => tryRenewWage(includeClause ? 0.83 : 0.9)} className="w-full py-2 rounded-xl text-xs font-semibold" style={{ background: C.paperDim, color: C.ink }}>Erbjud lågt ({formatMoney(Math.round(target * (includeClause ? 0.83 : 0.9)))}/omg)</button>
                <button onClick={() => tryRenewWage(includeClause ? 0.92 : 1.0)} className="w-full py-2 rounded-xl text-xs font-semibold" style={{ background: C.turf, color: C.paper }}>Erbjud marknadsmässigt ({formatMoney(Math.round(target * (includeClause ? 0.92 : 1.0)))}/omg)</button>
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
        {player.transferListed ? (
          <div>
            <div className="text-11 text-center mb-2 px-2.5 py-1.5 rounded-lg" style={{ background: "rgba(201,154,62,0.15)", color: C.gold }}>Transferlistad — andra klubbar kan höra av sig med bud</div>
            <button onClick={() => onToggleListed(player.id)} className="w-full py-2 rounded-xl text-sm font-semibold" style={{ background: "transparent", border: `1px solid ${C.inkSoft}`, color: C.inkSoft }}>Ta bort från transferlistan</button>
          </div>
        ) : (
          <button onClick={() => onToggleListed(player.id)} className="w-full py-2 rounded-xl text-sm font-semibold" style={{ background: "transparent", border: `1px solid ${C.loss}`, color: C.loss }}>Transferlista spelare</button>
        )}
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

function NegotiationView({ player, club, region, budget, reputation, onBack, onFinalize, difficulty }) {
  const [outcome, setOutcome] = useState(null);
  const [agreedPrice, setAgreedPrice] = useState(null);
  const [wageOutcome, setWageOutcome] = useState(null);
  const rivalMult = (DIFFICULTY_SETTINGS[difficulty] || DIFFICULTY_SETTINGS.normal).rivalMult;
  const [hasRival] = useState(() => region !== "scout" && seededRandom(`rival${player.id}${region}`)() < 0.3 * rivalMult);
  function tryOffer(mult, label) {
    const offerAmount = Math.round(player.value * mult);
    const result = negotiateOffer(offerAmount, player.value, club, reputation, hasRival ? 1.12 : 1);
    setOutcome({ ...result, offerAmount, label });
  }
  function tryWage(mult) {
    const target = wageDemand(player);
    const offerWage = Math.round(target * mult);
    const result = negotiateWage(offerWage, target, reputation);
    setWageOutcome({ ...result, offerWage });
  }
  const overall = overallOf(player);

  if (agreedPrice !== null) {
    return (
      <div className="rise-in space-y-2.5">
        <button onClick={onBack} style={{ position: "sticky", bottom: 6, display: "inline-block", color: "rgba(255,255,255,0.32)", background: "rgba(19,34,29,0.6)", padding: "3px 9px", borderRadius: 999, fontSize: 10, zIndex: 5, backdropFilter: "blur(3px)" }}>← Tillbaka till marknaden</button>
        <PaperCard>
          <div className="flex items-center gap-3">
            <OverallBadge overall={overall} size={44} />
            <div className="flex-1 min-w-0">
              <div className="font-display text-lg truncate">{player.name}</div>
              <div className="text-11" style={{ color: C.win }}>Övergångssumma klar: {formatMoney(agreedPrice)}</div>
            </div>
          </div>
        </PaperCard>
        {!wageOutcome ? (
          <PaperCard>
            <div className="text-xs uppercase tracking-wide font-semibold mb-2" style={{ color: C.inkSoft }}>Nu återstår lönen — vad erbjuder ni?</div>
            <div className="text-11 mb-2" style={{ color: C.inkSoft }}>Spelarens löneanspråk: ca {formatMoney(wageDemand(player))}/omgång</div>
            <div className="space-y-2">
              <button onClick={() => tryWage(0.85)} className="w-full py-2.5 rounded-xl text-sm font-semibold" style={{ background: C.paperDim, color: C.ink }}>Lågt bud ({formatMoney(Math.round(wageDemand(player) * 0.85))}/omg)</button>
              <button onClick={() => tryWage(1.0)} className="w-full py-2.5 rounded-xl text-sm font-semibold" style={{ background: C.turf, color: C.paper }}>Marknadsmässigt ({formatMoney(wageDemand(player))}/omg)</button>
              <button onClick={() => tryWage(1.2)} className="w-full py-2.5 rounded-xl text-sm font-semibold" style={{ background: C.gold, color: C.turfDeep }}>Generöst ({formatMoney(Math.round(wageDemand(player) * 1.2))}/omg)</button>
            </div>
          </PaperCard>
        ) : wageOutcome.result === "accept" ? (
          <PaperCard>
            <div className="text-sm font-semibold" style={{ color: C.win }}>{player.name.split(" ")[0]} accepterar {formatMoney(wageOutcome.offerWage)}/omg!</div>
            <button onClick={() => onFinalize(region, player, agreedPrice, wageOutcome.offerWage)} className="mt-2 w-full py-2.5 rounded-xl text-sm font-semibold" style={{ background: C.turf, color: C.paper }}>Slutför övergången</button>
          </PaperCard>
        ) : wageOutcome.result === "counter" ? (
          <PaperCard>
            <div className="text-sm font-semibold" style={{ color: C.ink }}>{player.name.split(" ")[0]} vill ha {formatMoney(wageOutcome.counterWage)}/omg istället.</div>
            <div className="flex gap-2 mt-2">
              <button onClick={() => onFinalize(region, player, agreedPrice, wageOutcome.counterWage)} className="flex-1 py-2.5 rounded-xl text-sm font-semibold" style={{ background: C.turf, color: C.paper }}>Acceptera</button>
              <button onClick={() => setWageOutcome(null)} className="flex-1 py-2.5 rounded-xl text-sm font-semibold" style={{ background: "transparent", border: `1px solid ${C.inkSoft}`, color: C.inkSoft }}>Avbryt</button>
            </div>
          </PaperCard>
        ) : (
          <PaperCard>
            <div className="text-sm font-semibold" style={{ color: C.loss }}>{player.name.split(" ")[0]} tackar nej till lönebudet.</div>
            <button onClick={() => setWageOutcome(null)} className="mt-2 w-full py-2.5 rounded-xl text-sm font-semibold" style={{ background: C.turf, color: C.paper }}>Försök igen</button>
          </PaperCard>
        )}
      </div>
    );
  }

  return (
    <div className="rise-in space-y-2.5">
      <button onClick={onBack} style={{ position: "sticky", bottom: 6, display: "inline-block", color: "rgba(255,255,255,0.32)", background: "rgba(19,34,29,0.6)", padding: "3px 9px", borderRadius: 999, fontSize: 10, zIndex: 5, backdropFilter: "blur(3px)" }}>← Tillbaka till marknaden</button>
      <PaperCard>
        <div className="flex items-center gap-3">
          <OverallBadge overall={overall} size={48} />
          <div className="flex-1 min-w-0">
            <div className="font-display text-lg truncate">{player.name}</div>
            <div className="text-11" style={{ color: C.inkSoft }}>{POS_LABEL[player.pos]} ({specificPositionLabel(player.specificPosition)}) · {nationalityLabel(player.nationality)} · {player.age} år</div>
          </div>
        </div>
        <div className="mt-3 p-2.5 rounded-xl" style={{ background: "rgba(0,0,0,0.04)" }}>
          <div className="text-10 uppercase tracking-wide font-semibold" style={{ color: C.inkSoft }}>Nuvarande klubb</div>
          <div className="text-sm font-semibold mt-0.5">{club.name}</div>
          <div className="text-11" style={{ color: C.inkSoft }}>{ARCHETYPE_LABEL[club.archetype]} · Uppskattat värde {formatMoney(player.value)}</div>
        </div>
        <div className="flex gap-3 mt-3"><StatBar label="Anfall" value={player.attack} color={C.gold} /><StatBar label="Försvar" value={player.defense} color={C.turf} /></div>
      </PaperCard>

      {hasRival && (
        <div className="text-11 px-3 py-2 rounded-xl font-semibold text-center" style={{ background: "rgba(180,68,59,0.15)", color: C.loss }}>
          ⚔️ En annan klubb bevakar samma spelare — låga bud riskerar att avvisas.
        </div>
      )}

      {!outcome ? (
        <PaperCard>
          <div className="text-xs uppercase tracking-wide font-semibold mb-2" style={{ color: C.inkSoft }}>Lägg ett bud</div>
          <div className="space-y-2">
            <button onClick={() => tryOffer(0.85, "Lågt bud")} className="w-full py-2.5 rounded-xl text-sm font-semibold" style={{ background: C.paperDim, color: C.ink }}>Lågt bud ({formatMoney(Math.round(player.value * 0.85))})</button>
            <button onClick={() => tryOffer(1.05, "Rimligt bud")} className="w-full py-2.5 rounded-xl text-sm font-semibold" style={{ background: C.turf, color: C.paper }}>Rimligt bud ({formatMoney(Math.round(player.value * 1.05))})</button>
            <button onClick={() => tryOffer(1.3, "Högt bud")} className="w-full py-2.5 rounded-xl text-sm font-semibold" style={{ background: C.gold, color: C.turfDeep }}>Högt bud ({formatMoney(Math.round(player.value * 1.3))})</button>
          </div>
        </PaperCard>
      ) : outcome.result === "accept" ? (
        <PaperCard>
          <div className="text-sm font-semibold" style={{ color: C.win }}>{club.name} accepterar budet på {formatMoney(outcome.offerAmount)}!</div>
          <button onClick={() => setAgreedPrice(outcome.offerAmount)} disabled={budget < outcome.offerAmount} className="mt-2 w-full py-2.5 rounded-xl text-sm font-semibold" style={budget >= outcome.offerAmount ? { background: C.turf, color: C.paper } : { background: C.paperDim, color: C.inkSoft, opacity: 0.6 }}>{budget >= outcome.offerAmount ? "Gå vidare till löneförhandling" : "Otillräcklig budget"}</button>
        </PaperCard>
      ) : outcome.result === "counter" ? (
        <PaperCard>
          <div className="text-sm font-semibold" style={{ color: C.ink }}>{club.name} vill ha {formatMoney(outcome.counterPrice)} istället.</div>
          <div className="flex gap-2 mt-2">
            <button onClick={() => setAgreedPrice(outcome.counterPrice)} disabled={budget < outcome.counterPrice} className="flex-1 py-2.5 rounded-xl text-sm font-semibold" style={budget >= outcome.counterPrice ? { background: C.turf, color: C.paper } : { background: C.paperDim, color: C.inkSoft, opacity: 0.6 }}>Acceptera</button>
            <button onClick={() => setOutcome(null)} className="flex-1 py-2.5 rounded-xl text-sm font-semibold" style={{ background: "transparent", border: `1px solid ${C.inkSoft}`, color: C.inkSoft }}>Avbryt</button>
          </div>
        </PaperCard>
      ) : (
        <PaperCard>
          <div className="text-sm font-semibold" style={{ color: C.loss }}>{club.name} tackar nej till budet.</div>
          <button onClick={() => setOutcome(null)} className="mt-2 w-full py-2.5 rounded-xl text-sm font-semibold" style={{ background: C.turf, color: C.paper }}>Försök igen</button>
        </PaperCard>
      )}
    </div>
  );
}

function ScoutMissionPanel({ scoutMission, scoutLevel, budget, squad, savedProfiles, onStart, onDismiss, onNegotiate, onSaveProfile, onDeleteProfile }) {
  const [posFilter, setPosFilter] = useState(null);
  const [ageMin, setAgeMin] = useState("");
  const [ageMax, setAgeMax] = useState("");
  const [activeAttrs, setActiveAttrs] = useState({});
  const [attrMins, setAttrMins] = useState({});
  const [maxValue, setMaxValue] = useState("");
  const [maxWage, setMaxWage] = useState("");
  const [wantPotential, setWantPotential] = useState(false);
  const [savingProfileName, setSavingProfileName] = useState(null);
  const inputStyle = { background: "transparent", border: `1px solid ${C.paperDim}`, borderRadius: 10, padding: "8px 10px", color: C.ink, fontSize: 13, width: "100%" };
  function applyPreset(preset) {
    setPosFilter(preset.posFilter);
    setActiveAttrs(Object.fromEntries(Object.keys(preset.attrs).map(k => [k, true])));
    setAttrMins(Object.fromEntries(Object.entries(preset.attrs).map(([k, v]) => [k, String(v)])));
    setAgeMax(preset.ageMax ? String(preset.ageMax) : "");
    setWantPotential(!!preset.minPotential);
  }
  function currentFilters() {
    return {
      posFilter,
      ageMin: ageMin ? parseInt(ageMin) : null, ageMax: ageMax ? parseInt(ageMax) : null,
      attributeFilters: Object.fromEntries(Object.keys(activeAttrs).filter(k => activeAttrs[k] && attrMins[k]).map(k => [k, parseInt(attrMins[k])])),
      maxValue: maxValue ? parseInt(maxValue) : null, maxWage: maxWage ? parseInt(maxWage) : null,
      minPotential: wantPotential ? 76 : null,
    };
  }

  if (scoutMission && !scoutMission.complete) {
    const pct = clamp(Math.round((scoutMission.roundsElapsed / scoutMission.roundsTotal) * 100), 0, 100);
    const parts = [];
    if (scoutMission.posFilter) parts.push(POS_LABEL[scoutMission.posFilter]);
    if (scoutMission.ageMin || scoutMission.ageMax) parts.push(`${scoutMission.ageMin || "?"}–${scoutMission.ageMax || "?"} år`);
    Object.entries(scoutMission.attributeFilters || {}).forEach(([key, minVal]) => parts.push(`${ATTR_LABELS_OUTFIELD[key] || key} ≥${minVal}`));
    if (scoutMission.maxValue) parts.push(`Max ${formatMoney(scoutMission.maxValue)}`);
    if (scoutMission.maxWage) parts.push(`Max ${formatMoney(scoutMission.maxWage)}/omg`);
    if (scoutMission.minPotential) parts.push(`Hög potential (≥${scoutMission.minPotential})`);
    return (
      <PaperCard>
        <div className="text-xs uppercase tracking-wide font-semibold" style={{ color: C.inkSoft }}>Scouten är ute på uppdrag</div>
        <div className="text-sm mt-1 font-semibold">{scoutMission.roundsElapsed} av {scoutMission.roundsTotal} omgångar</div>
        <div className="h-2 rounded-full mt-2" style={{ background: "rgba(0,0,0,0.08)" }}><div style={{ width: `${pct}%`, background: C.gold, height: "100%", borderRadius: 999, transition: "width .5s ease" }} /></div>
        <div className="text-11 mt-2" style={{ color: C.inkSoft }}>{parts.length ? `Kriterier: ${parts.join(" · ")}` : "Fri sökning, inga specifika kriterier."}</div>
      </PaperCard>
    );
  }

  if (scoutMission?.complete) {
    const p = scoutMission.result;
    if (!p) {
      return (
        <PaperCard>
          <div className="text-sm text-center py-2" style={{ color: C.inkSoft }}>Scouten hittade ingen spelare som matchade kriterierna. Försök med bredare filter.</div>
          <button onClick={onDismiss} className="mt-2 w-full py-2.5 rounded-xl text-xs font-semibold" style={{ background: C.turf, color: C.paper }}>Sök igen</button>
        </PaperCard>
      );
    }
    const overall = overallOf(p);
    const uncertain = scoutUncertainty(scoutLevel) > 0;
    const comparable = (squad || []).filter(s => s.pos === p.pos).sort((a, b) => overallOf(b) - overallOf(a)).slice(0, 2);
    return (
      <PaperCard>
        <div className="text-xs uppercase tracking-wide font-semibold" style={{ color: C.inkSoft }}>Scouten har hittat en spelare</div>
        <div className="flex items-center gap-3 mt-2">
          <OverallBadge overall={overall} size={42} />
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-sm truncate">{p.name}</div>
            <div className="text-11" style={{ color: C.inkSoft }}>{POS_LABEL[p.pos]} ({specificPositionLabel(p.specificPosition)}) · {nationalityLabel(p.nationality)}, {p.age} år</div>
            <div className="mt-1"><StarRating rating={overallToStars(overall)} size={9} /></div>
          </div>
        </div>
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
          <button onClick={onNegotiate} className="flex-1 py-2.5 rounded-xl text-xs font-semibold" style={{ background: C.turf, color: C.paper }}>Förhandla</button>
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
                <div key={sp.id} className="flex items-center gap-1 pl-3 pr-1 py-1 rounded-full" style={{ background: "rgba(255,255,255,0.08)" }}>
                  <button onClick={() => applyPreset({ posFilter: sp.posFilter, attrs: sp.attributeFilters || {}, ageMax: sp.ageMax, minPotential: sp.minPotential })} className="text-11 font-semibold" style={{ color: C.paperDim }}>{sp.name}</button>
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
            <button key={label} onClick={() => setPosFilter(key)} className="px-3 py-1.5 rounded-full text-11 font-semibold" style={posFilter === key ? { background: C.gold, color: C.turfDeep } : { background: "rgba(255,255,255,0.08)", color: C.paperDim }}>{label}</button>
          ))}
        </div>
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
                style={active ? { background: C.gold, color: C.turfDeep } : { background: "rgba(255,255,255,0.08)", color: C.paperDim }}>{label}</button>
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


function TransfersTab({ market, budget, scoutingLevel, kontakterLevel, youthSquad, youthMarket, round, clubs, reputation, incomingOffers, onFinalizeTransfer, onBuyYouth, onRespondOffer, scoutMission, scoutLevel, onStartScoutMission, onDismissScoutMission, onFinalizeScoutSignee, loanOffers, onAcceptLoan, onDeclineLoan, difficulty, squad, savedScoutProfiles, onSaveScoutProfile, onDeleteScoutProfile }) {
  const [subView, setSubView] = useState("spelare");
  const [region, setRegion] = useState("europa");
  const [negotiatingId, setNegotiatingId] = useState(null);
  const [negotiatingScout, setNegotiatingScout] = useState(false);
  const list = market[region];
  const locked = scoutingLevel < REGION_UNLOCK[region];
  const discount = 1 - (kontakterLevel - 1) * 0.04;
  const windowOpen = transferWindowOpen(round);
  const closesIn = roundsUntilWindowCloses(round);
  const opensIn = roundsUntilWindowOpens(round);

  if (negotiatingScout && scoutMission?.result) {
    return <NegotiationView player={scoutMission.result} club={clubs[scoutMission.result.clubId]} region="scout" budget={budget} reputation={reputation} difficulty={difficulty}
      onBack={() => setNegotiatingScout(false)} onFinalize={(r, p, price, wage) => { onFinalizeScoutSignee(price, wage); setNegotiatingScout(false); }} />;
  }

  const negotiatingPlayer = negotiatingId ? list.find(p => p.id === negotiatingId) : null;
  if (negotiatingPlayer) {
    return <NegotiationView player={negotiatingPlayer} club={clubs[negotiatingPlayer.clubId]} region={region} budget={budget} reputation={reputation} difficulty={difficulty}
      onBack={() => setNegotiatingId(null)} onFinalize={(r, p, price, wage) => { onFinalizeTransfer(r, p, price, wage); setNegotiatingId(null); }} />;
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
      <div className="flex gap-2">
        {[["spelare", "Spelare"], ["ungdom", "Ungdom"], ["scout", "Scout"], ["bud", `Bud${(incomingOffers.length + (loanOffers?.length || 0)) ? ` (${incomingOffers.length + (loanOffers?.length || 0)})` : ""}`]].map(([key, label]) => (
          <button key={key} onClick={() => setSubView(key)} className="flex-1 py-2 rounded-xl text-11 font-semibold" style={subView === key ? { background: C.gold, color: C.turfDeep } : { background: "rgba(255,255,255,0.08)", color: C.paperDim }}>{label}</button>
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
                return (
                  <PaperCard key={p.id} style={{ padding: 10 }}>
                    <div className="flex items-center gap-2.5">
                      <OverallBadge overall={pOverall} size={30} />
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-xs truncate">{p.name}</div>
                        <div className="font-mono text-9 mt-0.5 truncate" style={{ color: C.inkSoft }}>{POS_LABEL[p.pos]} ({specificPositionLabel(p.specificPosition)})</div>
                        <div className="font-mono text-9 truncate" style={{ color: C.inkSoft }}>{owningClub ? owningClub.name : "Fri agent"}</div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between mt-1.5">
                      <StarRating rating={overallToStars(pOverall)} size={7} />
                      <div className="font-mono text-11 font-semibold shrink-0">{formatMoney(p.value)}</div>
                    </div>
                    <div className="flex gap-2 mt-1.5"><StatBar label="Anfall" value={p.attack} color={C.gold} /><StatBar label="Försvar" value={p.defense} color={C.turf} /></div>
                    <button onClick={() => setNegotiatingId(p.id)} disabled={!windowOpen} className="mt-2 w-full py-1.5 rounded-xl text-9 font-semibold" style={windowOpen ? { background: C.turf, color: C.paper } : { background: C.paperDim, color: C.inkSoft, opacity: 0.6 }}>{windowOpen ? "Förhandla" : "Fönstret är stängt"}</button>
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
                    <OverallBadge overall={overall} size={30} />
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-xs truncate">{p.name}</div>
                      <div className="font-mono text-9 mt-0.5" style={{ color: C.inkSoft }}>{POS_LABEL[p.pos]} ({specificPositionLabel(p.specificPosition)})</div>
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
          onStart={onStartScoutMission} onDismiss={onDismissScoutMission} onNegotiate={() => setNegotiatingScout(true)} onSaveProfile={onSaveScoutProfile} onDeleteProfile={onDeleteScoutProfile} />
      ) : (
        <>
          {loanOffers && loanOffers.length > 0 && (
            <>
              <div className="text-xs uppercase tracking-wide font-semibold px-1" style={{ color: C.paperDim }}>Inkommande lån</div>
              <div className="space-y-2 mb-3">
                {loanOffers.map(o => {
                  const overall = overallOf(o.player);
                  return (
                    <PaperCard key={o.id}>
                      <div className="flex items-center gap-3">
                        <OverallBadge overall={overall} size={36} />
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-sm truncate">{o.player.name}</div>
                          <div className="text-11" style={{ color: C.inkSoft }}>{POS_LABEL[o.player.pos]} · Lån från {o.fromClubName} · {o.weeksLeft} omgångar</div>
                        </div>
                      </div>
                      <div className="flex gap-2 mt-2">
                        <button onClick={() => onAcceptLoan(o.id)} className="flex-1 py-2 rounded-xl text-xs font-semibold" style={{ background: C.turf, color: C.paper }}>Ta emot på lån</button>
                        <button onClick={() => onDeclineLoan(o.id)} className="flex-1 py-2 rounded-xl text-xs font-semibold" style={{ background: "transparent", border: `1px solid ${C.inkSoft}`, color: C.inkSoft }}>Tacka nej</button>
                      </div>
                    </PaperCard>
                  );
                })}
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
        </>
      )}
    </div>
  );
}

const CATEGORY_META = {
  arena: { label: "Arena", desc: "Läktare, publikservice och kapacitet." },
  akademi: { label: "Ungdomsakademi", desc: "Träningsmiljö och talangintag." },
  scouting: { label: "Scoutnätverk", desc: "Övergångsmarknadens räckvidd och kvalitet." },
  sponsring: { label: "Sponsring", desc: "Avtal och partnerskap som ger löpande intäkter." },
};

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
function BlueprintStand({ id, style, level, selected, onSelect, building, buildPct }) {
  return (
    <button onClick={() => onSelect(id)} style={{ ...style, position: "relative", border: `1.4px solid ${selected ? C.gold : BP.line}`, borderRadius: 4, background: "rgba(111,168,220,0.05)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4 }}>
      <span className="text-9 font-semibold" style={{ color: BP.ink, letterSpacing: "0.03em" }}>{STAND_NAMES[id].split(" ")[0]}</span>
      <div className="flex gap-0.5">
        {Array.from({ length: 5 }, (_, i) => {
          const filled = i < level;
          const isBuilding = building && i === level;
          return <div key={i} style={{ width: 8, height: 6, border: `1px solid ${isBuilding ? C.gold : BP.line}`, background: filled ? BP.line : isBuilding ? "transparent" : "transparent", position: "relative", overflow: "hidden" }}>
            {isBuilding && <div style={{ position: "absolute", inset: 0, background: C.gold, opacity: 0.7, width: `${buildPct}%`, transition: "width .5s ease" }} />}
          </div>;
        })}
      </div>
      {building && <span className="font-mono" style={{ fontSize: 8, color: C.gold }}>{Math.round(buildPct)}%</span>}
    </button>
  );
}
function BlueprintPitch({ style }) {
  return (
    <div style={{ ...style, position: "relative", border: `1.4px solid ${BP.line}`, borderRadius: 4, background: "rgba(111,168,220,0.03)" }}>
      <svg viewBox="0 0 100 60" width="100%" height="100%" preserveAspectRatio="none">
        <rect x="3" y="3" width="94" height="54" fill="none" stroke={BP.line} strokeWidth="0.8" />
        <line x1="50" y1="3" x2="50" y2="57" stroke={BP.line} strokeWidth="0.8" />
        <circle cx="50" cy="30" r="8" fill="none" stroke={BP.line} strokeWidth="0.8" />
        <circle cx="50" cy="30" r="0.8" fill={BP.line} />
        <rect x="3" y="16" width="10" height="28" fill="none" stroke={BP.line} strokeWidth="0.8" />
        <rect x="87" y="16" width="10" height="28" fill="none" stroke={BP.line} strokeWidth="0.8" />
      </svg>
    </div>
  );
}
function ArenaDetail({ club, dev, budget, arenaStands, arenaFacilities, arenaConstruction, onUpgrade, onUpgradePart, onStartConstruction, onBack }) {
  const [selectedStand, setSelectedStand] = useState(null);
  const capacity = arenaCapacityOf(dev, arenaStands);
  const buildingStand = arenaConstruction?.stand;
  const buildPct = arenaConstruction ? (arenaConstruction.roundsElapsed / arenaConstruction.roundsTotal) * 100 : 0;
  return (
    <div className="rise-in space-y-2.5">
      <button onClick={onBack} style={{ position: "sticky", bottom: 6, display: "inline-block", color: "rgba(255,255,255,0.32)", background: "rgba(19,34,29,0.6)", padding: "3px 9px", borderRadius: 999, fontSize: 10, zIndex: 5, backdropFilter: "blur(3px)" }}>← Tillbaka till klubben</button>
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
            </div>
          )}
        </div>
        <div className="mt-4 relative rounded-2xl p-4" style={{ background: BP.bg, backgroundImage: `linear-gradient(${BP.grid} 1px, transparent 1px), linear-gradient(90deg, ${BP.grid} 1px, transparent 1px)`, backgroundSize: "14px 14px", border: `1px solid ${BP.lineDim}` }}>
          <div className="font-mono" style={{ position: "absolute", top: 8, left: 12, fontSize: 8, letterSpacing: "0.08em", color: BP.lineDim }}>ARENAPLAN · SKALA 1:500</div>
          <div className="grid mt-3" style={{ gridTemplateColumns: "1fr 2.2fr 1fr", gridTemplateRows: "42px 84px 42px", gap: 5 }}>
            <div />
            <BlueprintStand id="north" style={{ gridColumn: 2, gridRow: 1 }} level={arenaStands.north} selected={selectedStand === "north"} onSelect={setSelectedStand} building={buildingStand === "north"} buildPct={buildPct} />
            <div />
            <BlueprintStand id="west" style={{ gridColumn: 1, gridRow: 2 }} level={arenaStands.west} selected={selectedStand === "west"} onSelect={setSelectedStand} building={buildingStand === "west"} buildPct={buildPct} />
            <BlueprintPitch style={{ gridColumn: 2, gridRow: 2 }} />
            <BlueprintStand id="east" style={{ gridColumn: 3, gridRow: 2 }} level={arenaStands.east} selected={selectedStand === "east"} onSelect={setSelectedStand} building={buildingStand === "east"} buildPct={buildPct} />
            <div />
            <BlueprintStand id="south" style={{ gridColumn: 2, gridRow: 3 }} level={arenaStands.south} selected={selectedStand === "south"} onSelect={setSelectedStand} building={buildingStand === "south"} buildPct={buildPct} />
            <div />
          </div>
        </div>
        <div className="text-11 mt-3 text-center" style={{ color: C.inkSoft }}>Tryck på en läktare för att bygga ut den.</div>
      </PaperCard>

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

      <div className="text-xs uppercase tracking-wide font-semibold px-1" style={{ color: C.paperDim }}>Publikservice</div>
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
      <button onClick={onBack} style={{ position: "sticky", bottom: 6, display: "inline-block", color: "rgba(255,255,255,0.32)", background: "rgba(19,34,29,0.6)", padding: "3px 9px", borderRadius: 999, fontSize: 10, zIndex: 5, backdropFilter: "blur(3px)" }}>← Tillbaka till klubben</button>
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
          const refund = Math.round(((y.attack + y.defense) / 2) * 4 + y.potential * 3);
          return (
            <PaperCard key={y.id}>
              <div className="flex items-center gap-3">
                <OverallBadge overall={overall} size={36} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <div><div className="font-semibold text-sm">{y.name}</div><div className="font-mono text-11 mt-0.5" style={{ color: C.inkSoft }}>{POS_LABEL[y.pos]} ({specificPositionLabel(y.specificPosition)}) · {y.yearsInAcademy} år i akademin</div></div>
                    <div className="flex gap-0.5">{[1,2,3,4,5].map(n=><Star key={n} size={11} fill={n<=potentialStars(y.potential)?C.gold:"none"} color={n<=potentialStars(y.potential)?C.gold:C.paperDim}/>)}</div>
                  </div>
                  <div className="mt-1"><StarRating rating={overallToStars(overall)} size={7} /></div>
                </div>
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
      <button onClick={onBack} style={{ position: "sticky", bottom: 6, display: "inline-block", color: "rgba(255,255,255,0.32)", background: "rgba(19,34,29,0.6)", padding: "3px 9px", borderRadius: 999, fontSize: 10, zIndex: 5, backdropFilter: "blur(3px)" }}>← Tillbaka till klubben</button>
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
        level={dev.scouting} cost={Math.round(750 * Math.pow(dev.scouting, 1.6))} canAfford={budget >= Math.round(750 * Math.pow(dev.scouting, 1.6))} onUpgrade={() => onUpgrade("scouting")} />
    </div>
  );
}

function SponsorDetail({ dev, budget, reputation, sponsors, onUpgrade, onSignSponsor, onBack }) {
  const [offersFor, setOffersFor] = useState(null);
  const [offers, setOffers] = useState([]);
  const [selectedOfferId, setSelectedOfferId] = useState(null);
  const [negotiated, setNegotiated] = useState({});
  function openOffers(slot) { setOffersFor(slot); setOffers(generateSponsorOffers(slot, reputation)); setSelectedOfferId(null); setNegotiated({}); }
  function tryNegotiate(offer) {
    const result = negotiateSponsor(offer, reputation);
    if (result.result === "walk") setNegotiated(prev => ({ ...prev, [offer.id]: { done: true, walked: true } }));
    else if (result.result === "improved") setNegotiated(prev => ({ ...prev, [offer.id]: { done: true, offer: result.offer, improved: true } }));
    else setNegotiated(prev => ({ ...prev, [offer.id]: { done: true, offer } }));
  }
  return (
    <div className="rise-in space-y-2.5">
      <button onClick={onBack} style={{ position: "sticky", bottom: 6, display: "inline-block", color: "rgba(255,255,255,0.32)", background: "rgba(19,34,29,0.6)", padding: "3px 9px", borderRadius: 999, fontSize: 10, zIndex: 5, backdropFilter: "blur(3px)" }}>← Tillbaka till klubben</button>
      <div className="text-xs uppercase tracking-wide font-semibold px-1" style={{ color: C.paperDim }}>Sponsoravtal</div>
      {Object.entries(SPONSOR_SLOT_LABEL).map(([slot, label]) => {
        const current = sponsors[slot];
        return (
          <PaperCard key={slot}>
            <div className="text-xs uppercase tracking-wide font-semibold" style={{ color: C.inkSoft }}>{label}</div>
            {current ? (
              <>
                <div className="font-semibold text-sm mt-1">{current.name}</div>
                <div className="font-mono text-11 mt-0.5" style={{ color: C.win }}>+{formatMoney(current.income)} / matchomgång</div>
              </>
            ) : <div className="text-sm mt-1" style={{ color: C.inkSoft }}>Inget avtal just nu.</div>}
            <button onClick={() => openOffers(slot)} className="mt-2 w-full py-2 rounded-xl text-xs font-semibold" style={{ background: C.turf, color: C.paper }}>{current ? "Hitta ny sponsor" : "Sök sponsorer"}</button>
            {offersFor === slot && (
              <div className="mt-2 space-y-1.5">
                {offers.map(o => {
                  const neg = negotiated[o.id];
                  if (neg?.walked) return <div key={o.id} className="text-11 p-2.5 rounded-xl" style={{ background: "rgba(180,68,59,0.1)", color: C.loss }}>{o.name} drog sig ur förhandlingen.</div>;
                  const finalOffer = neg?.offer || o;
                  const isSelected = selectedOfferId === o.id;
                  return (
                    <div key={o.id} className="rounded-xl p-2.5" style={{ background: C.paperDim }}>
                      <button onClick={() => setSelectedOfferId(o.id)} className="w-full text-left">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold">{finalOffer.name}{neg?.improved && <span style={{ color: C.win }}> (förbättrat!)</span>}</span>
                          <span className="font-mono text-11">+{formatMoney(finalOffer.income)}/omg</span>
                        </div>
                        <div className="text-10" style={{ color: C.inkSoft }}>Signeringsbonus: {formatMoney(finalOffer.bonus)}</div>
                      </button>
                      {isSelected && (
                        <div className="flex gap-2 mt-2">
                          <button onClick={() => { onSignSponsor(slot, finalOffer); setOffersFor(null); }} className="flex-1 py-1.5 rounded-lg text-11 font-semibold" style={{ background: C.turf, color: C.paper }}>Acceptera</button>
                          {!neg && <button onClick={() => tryNegotiate(o)} className="flex-1 py-1.5 rounded-lg text-11 font-semibold" style={{ background: C.gold, color: C.turfDeep }}>Förhandla</button>}
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

function StaffDetail({ budget, staff, reputation, homeCountry, onHire, onRenegotiate, onBack }) {
  const [offersFor, setOffersFor] = useState(null);
  const [offers, setOffers] = useState([]);
  function openOffers(role) { setOffersFor(role); setOffers(generateStaffOffers(role, homeCountry)); }
  return (
    <div className="rise-in space-y-2.5">
      <button onClick={onBack} style={{ position: "sticky", bottom: 6, display: "inline-block", color: "rgba(255,255,255,0.32)", background: "rgba(19,34,29,0.6)", padding: "3px 9px", borderRadius: 999, fontSize: 10, zIndex: 5, backdropFilter: "blur(3px)" }}>← Tillbaka till klubben</button>
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
                <div className="font-semibold text-sm mt-1">{current.name} <span className="font-normal text-11" style={{ color: C.inkSoft }}>({nationalityLabel(current.nationality)})</span></div>
                <div className="font-mono text-11 mt-0.5" style={{ color: C.inkSoft }}>Lön: {formatMoney(current.wage)} / matchomgång</div>
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
                {offers.map(o => (
                  <button key={o.id} onClick={() => { onHire(role, o); setOffersFor(null); }} className="w-full text-left p-2.5 rounded-xl" style={{ background: C.paperDim }}>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold">{o.name} <span className="font-normal" style={{ color: C.inkSoft }}>({nationalityLabel(o.nationality)})</span></span>
                      <LevelDots level={o.level} />
                    </div>
                    <div className="text-10 mt-0.5" style={{ color: C.inkSoft }}>Lön: {formatMoney(o.wage)} / matchomgång</div>
                  </button>
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
      <button onClick={onBack} style={{ position: "sticky", bottom: 6, display: "inline-block", color: "rgba(255,255,255,0.32)", background: "rgba(19,34,29,0.6)", padding: "3px 9px", borderRadius: 999, fontSize: 10, zIndex: 5, backdropFilter: "blur(3px)" }}>← Tillbaka till klubben</button>
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

function WagesDetail({ squad, reputation, division, sponsringLevel, onBack }) {
  const cap = wageBudgetCap(reputation, division, sponsringLevel);
  const total = totalWageBill(squad);
  const pct = Math.round((total / cap) * 100);
  const overCap = total > cap;
  const sorted = [...squad].sort((a, b) => b.wage - a.wage);
  return (
    <div className="rise-in space-y-2.5">
      <button onClick={onBack} style={{ position: "sticky", bottom: 6, display: "inline-block", color: "rgba(255,255,255,0.32)", background: "rgba(19,34,29,0.6)", padding: "3px 9px", borderRadius: 999, fontSize: 10, zIndex: 5, backdropFilter: "blur(3px)" }}>← Tillbaka till klubben</button>
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

function OwnerDetail({ owner, takeoverBid, budget, reputation, fanbase, shopLevel, division, tourOffers, onRespondTakeover, onOpenTours, onStartTour, onBack }) {
  const type = OWNER_TYPES[owner.type] || OWNER_TYPES.talmodig;
  return (
    <div className="rise-in space-y-2.5">
      <button onClick={onBack} style={{ position: "sticky", bottom: 6, display: "inline-block", color: "rgba(255,255,255,0.32)", background: "rgba(19,34,29,0.6)", padding: "3px 9px", borderRadius: 999, fontSize: 10, zIndex: 5, backdropFilter: "blur(3px)" }}>← Tillbaka till klubben</button>
      <PaperCard>
        <div className="text-xs uppercase tracking-wide font-semibold" style={{ color: C.inkSoft }}>Klubbägare</div>
        <div className="font-display text-lg mt-1">{owner.name}</div>
        <div className="text-11" style={{ color: C.inkSoft }}>{nationalityLabel(owner.nationality)} · {type.label}</div>
        <div className="text-11 mt-1.5" style={{ color: C.inkSoft }}>{type.desc}</div>
        <div className="mt-2.5">
          <div className="text-10 mb-1" style={{ color: C.inkSoft }}>Tålamod</div>
          <StatBar label="" value={owner.patience} color={owner.patience <= 30 ? C.loss : C.gold} />
        </div>
      </PaperCard>

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
        <div className="flex items-center justify-between"><span className="text-sm font-semibold">Merchandise</span><span className="font-mono text-sm font-semibold" style={{ color: C.win }}>+{formatMoney(merchandiseIncome(fanbase, shopLevel))}/omg</span></div>
        <div className="text-10 mt-0.5" style={{ color: C.inkSoft }}>Skalar med fanbase och klubbutikens nivå.</div>
      </PaperCard>

      <div className="text-xs uppercase tracking-wide font-semibold px-1" style={{ color: C.paperDim }}>Försäsongsturné</div>
      <div className="text-11 px-1" style={{ color: C.paperDim }}>En genomförd turné skärper också effekten av försäsongens fyra träningsmatcher.</div>
      {!tourOffers ? (
        <button onClick={onOpenTours} className="w-full py-2.5 rounded-xl text-sm font-semibold" style={{ background: C.turf, color: C.paper }}>Planera turné</button>
      ) : (
        <div className="space-y-2">
          {tourOffers.map(o => {
            const affordable = budget >= o.cost;
            return (
              <PaperCard key={o.id}>
                <div className="text-sm font-semibold">{o.name}</div>
                <div className="text-11 mt-0.5" style={{ color: C.inkSoft }}>Kostnad {formatMoney(o.cost)} · Möjlig intäkt {formatMoney(o.incomeMin)}–{formatMoney(o.incomeMax)} · +{o.repBonus} rykte</div>
                <button onClick={() => onStartTour(o)} disabled={!affordable} className="mt-2 w-full py-2 rounded-xl text-xs font-semibold" style={affordable ? { background: C.gold, color: C.turfDeep } : { background: C.paperDim, color: C.inkSoft, opacity: 0.6 }}>{affordable ? "Genomför turné" : "Otillräcklig budget"}</button>
              </PaperCard>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ClubTab({ club, dev, budget, history, reputation, fanbase, spelide, onSetSpelide, youthSquad, onUpgrade, onSellYouth, onPromoteYouth,
  arenaStands, arenaFacilities, arenaConstruction, onStartConstruction, akademiParts, scoutingParts, sponsors, onUpgradePart, onSignSponsor, staff, onHireStaff, onRenegotiateStaff, boardConfidence, boardTarget, loans, onTakeLoan,
  squad, owner, takeoverBid, tourOffers, onRespondTakeover, onOpenTours, onStartTour, repHistory, fanHistory }) {
  const [selectedCategory, setSelectedCategory] = useState(null);

  if (selectedCategory === "arena") return <ArenaDetail club={club} dev={dev} budget={budget} arenaStands={arenaStands} arenaFacilities={arenaFacilities} arenaConstruction={arenaConstruction} onUpgrade={onUpgrade} onUpgradePart={onUpgradePart} onStartConstruction={onStartConstruction} onBack={() => setSelectedCategory(null)} />;
  if (selectedCategory === "akademi") return <AkademiDetail dev={dev} budget={budget} akademiParts={akademiParts} youthSquad={youthSquad} onUpgrade={onUpgrade} onUpgradePart={onUpgradePart} onSellYouth={onSellYouth} onPromoteYouth={onPromoteYouth} onBack={() => setSelectedCategory(null)} />;
  if (selectedCategory === "scouting") return <ScoutingDetail dev={dev} budget={budget} scoutingParts={scoutingParts} onUpgrade={onUpgrade} onUpgradePart={onUpgradePart} onBack={() => setSelectedCategory(null)} />;
  if (selectedCategory === "sponsring") return <SponsorDetail dev={dev} budget={budget} reputation={reputation} sponsors={sponsors} onUpgrade={onUpgrade} onSignSponsor={onSignSponsor} onBack={() => setSelectedCategory(null)} />;
  if (selectedCategory === "personal") return <StaffDetail budget={budget} staff={staff} reputation={reputation} homeCountry={club.league} onHire={onHireStaff} onRenegotiate={onRenegotiateStaff} onBack={() => setSelectedCategory(null)} />;
  if (selectedCategory === "lan") return <LoanDetail budget={budget} loans={loans} reputation={reputation} onTakeLoan={onTakeLoan} onBack={() => setSelectedCategory(null)} />;
  if (selectedCategory === "loner") return <WagesDetail squad={squad} reputation={reputation} division={club.division} sponsringLevel={dev.sponsring} onBack={() => setSelectedCategory(null)} />;
  if (selectedCategory === "agare") return <OwnerDetail owner={owner} takeoverBid={takeoverBid} budget={budget} reputation={reputation} fanbase={fanbase} shopLevel={arenaFacilities.shop} division={club.division} tourOffers={tourOffers} onRespondTakeover={onRespondTakeover} onOpenTours={onOpenTours} onStartTour={onStartTour} onBack={() => setSelectedCategory(null)} />;

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
        <div className="text-xs uppercase tracking-wide font-semibold mb-2" style={{ color: C.inkSoft }}>Rykte & Fanbase</div>
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
        <div className="text-xs uppercase tracking-wide font-semibold mb-2" style={{ color: C.inkSoft }}>Styrelsens förtroende</div>
        <StatBar label="" value={boardConfidence} color={boardConfidence <= 30 ? C.loss : C.gold} />
        <div className="text-11 mt-2" style={{ color: C.inkSoft }}>Säsongsmål: {boardTarget}</div>
      </PaperCard>

      <div className="text-xs uppercase tracking-wide font-semibold px-1" style={{ color: C.paperDim }}>Klubbavdelningar</div>
      <button onClick={() => setSelectedCategory("personal")} className="w-full text-left">
        <PaperCard>
          <div className="flex items-center justify-between">
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm">Personal</div>
              <div className="text-11 mt-0.5" style={{ color: C.inkSoft }}>Assisterande tränare, fysioterapeut och huvudscout.</div>
              <div className="text-10 mt-1" style={{ color: C.win }}>{staffCount}/3 tjänster tillsatta</div>
            </div>
            <ChevronRight size={16} color={C.inkSoft} className="shrink-0" />
          </div>
        </PaperCard>
      </button>
      <button onClick={() => setSelectedCategory("lan")} className="w-full text-left">
        <PaperCard>
          <div className="flex items-center justify-between">
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm">Lån</div>
              <div className="text-11 mt-0.5" style={{ color: C.inkSoft }}>Snabbare utbyggnad mot ränta över flera säsonger.</div>
              {loans.length > 0 && <div className="text-10 mt-1" style={{ color: C.loss }}>{loans.length} aktiva lån</div>}
            </div>
            <ChevronRight size={16} color={C.inkSoft} className="shrink-0" />
          </div>
        </PaperCard>
      </button>
      <button onClick={() => setSelectedCategory("loner")} className="w-full text-left">
        <PaperCard>
          <div className="flex items-center justify-between">
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm">Löner</div>
              <div className="text-11 mt-0.5" style={{ color: C.inkSoft }}>Löneutrymme och individuella löneförhandlingar.</div>
              <div className="text-10 mt-1" style={{ color: wageOverCap ? C.loss : C.win }}>{formatMoney(wageTotal)} / {formatMoney(wageCap)}{wageOverCap ? " — över taket!" : ""}</div>
            </div>
            <ChevronRight size={16} color={C.inkSoft} className="shrink-0" />
          </div>
        </PaperCard>
      </button>
      <button onClick={() => setSelectedCategory("agare")} className="w-full text-left">
        <PaperCard>
          <div className="flex items-center justify-between">
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm">Ägare & intäkter</div>
              <div className="text-11 mt-0.5" style={{ color: C.inkSoft }}>Klubbägare, övertagandebud, TV-avtal, merchandise och turnéer.</div>
              {takeoverBid && <div className="text-10 mt-1 font-semibold" style={{ color: C.gold }}>Övertagandebud väntar!</div>}
            </div>
            <ChevronRight size={16} color={C.inkSoft} className="shrink-0" />
          </div>
        </PaperCard>
      </button>
      {Object.entries(CATEGORY_META).map(([key, meta]) => (
        <button key={key} onClick={() => setSelectedCategory(key)} className="w-full text-left">
          <PaperCard>
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm">{meta.label}</div>
                <div className="text-11 mt-0.5" style={{ color: C.inkSoft }}>{meta.desc}</div>
                {key === "sponsring" && <div className="text-10 mt-1" style={{ color: C.win }}>{sponsorCount}/3 avtal aktiva</div>}
                {key === "arena" && arenaConstruction && <div className="text-10 mt-1 font-semibold" style={{ color: C.gold }}>🏗️ Ombyggnad pågår — {arenaConstruction.roundsTotal - arenaConstruction.roundsElapsed} omgångar kvar</div>}
              </div>
              <div className="flex items-center gap-2 shrink-0"><LevelDots level={dev[key]} /><ChevronRight size={16} color={C.inkSoft} /></div>
            </div>
          </PaperCard>
        </button>
      ))}

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
