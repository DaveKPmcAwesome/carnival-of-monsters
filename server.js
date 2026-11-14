// ============================================================================
// Carnival of Monsters – Online-Server (server.js)
// Community-Projekt, privat & nicht-kommerziell.
//
// Start:          npm install && npm start
// Lokaler Test:   http://localhost:3000
// Der Server verwaltet den Spielstand AUTORITATIV:
//   - Deck, Hände, Ziele und Würfel liegen NUR hier.
//   - Jeder Spieler erhält nur seine eigenen verdeckten Karten.
//   - Gefahrenprobe: EIN Wurf mit 3 Würfeln, gilt für ALLE gleich.
// ============================================================================

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { WebSocketServer } = require("ws");

const PORT = process.env.PORT || 3000;

// ---------------------------- Reiche ---------------------------------------

const REALMS = [
  { id: "wald", name: "Verwusch. Wald", short: "Wald", emoji: "🌲" },
  { id: "tiefsee", name: "Tiefsee", short: "Tiefsee", emoji: "🌊" },
  { id: "wolken", name: "Wolkenlande", short: "Wolken", emoji: "☁️" },
  { id: "hoehlen", name: "Höhlenlande", short: "Höhlen", emoji: "🕳️" },
  { id: "dunkel", name: "Dunkellande", short: "Dunkel", emoji: "🌑" },
];
const TRAUM = { id: "traum", name: "Traumlande", short: "Traum", emoji: "🌙" };
const ALL_REALMS = [...REALMS, TRAUM];
const realmInfo = (id) => ALL_REALMS.find((r) => r.id === id) || TRAUM;

const SEASON_NAMES = {
  wald: "Saison des Verwunschenen Waldes", tiefsee: "Tiefsee-Saison", wolken: "Wolkenlande-Saison",
  hoehlen: "Höhlenlande-Saison", dunkel: "Dunkellande-Saison", traum: "Traumsaison", gefahr: "Gefahrensaison",
};
const seasonHint = (sc) =>
  sc === "gefahr"
    ? "2 Kronen für das 1. Monster mit Gefahrensymbol, Trophäe für die meisten ⚠️."
    : `2 Kronen für das 1. ${sc === "traum" ? "Traum" : realmInfo(sc).name}-Monster, Trophäe für die meisten ⭐ darin.`;

// ------------------------- Echte Kartendaten --------------------------------

const MTYPES = [
  { lvl: 1, pts: 3, dg: 0, draw: 0, count: 4 },
  { lvl: 1, pts: 1, dg: 0, draw: 1, count: 1 },
  { lvl: 1, pts: 5, dg: 1, draw: 0, count: 1 },
  { lvl: 2, pts: 6, dg: 0, draw: 0, count: 2 },
  { lvl: 2, pts: 4, dg: 0, draw: 1, count: 1 },
  { lvl: 2, pts: 8, dg: 1, draw: 0, count: 1 },
  { lvl: 3, pts: 11, dg: 1, draw: 0, count: 2 },
  { lvl: 3, pts: 13, dg: 2, draw: 0, count: 1 },
  { lvl: 4, pts: 16, dg: 2, draw: 0, count: 1 },
];
const MONSTER_NAMES = {
  wald: ["Dryade", "Moosgnom", "Schluchtenspinne", "Schrat", "Zwielichtkatze", "Waldtroll", "Baumwandler", "Wyvern", "Wendigo"],
  tiefsee: ["Fischwesen", "Kelpie", "Tiefseespinne", "Schalenbeißer", "Mondhai", "Hydra", "Seeriese", "Riesenkrake", "Leviathan"],
  wolken: ["Cumuluskäfer", "Gewitterrochen", "Harpyie", "Schwertflügler", "Stiller Beobachter", "Phönix", "Greif", "Gipfelspinne", "Quetzalcoatl"],
  hoehlen: ["Niederer Wurm", "Fleischfressender Fungus", "Basilisk", "Gespensterwolf", "Schlammspinne", "Großer Wurm", "Höhlentroll", "Das Namenlose", "Magmaschrecken"],
  dunkel: ["Ghul", "Schattenkatze", "Nachttroll", "Wandelnder Schatten", "Flüsterer", "Dibbuk", "Flammenspinne", "Nephilim", "Nosferatu"],
};
const TRAUM_MONSTERS = [
  { name: "Kreischer", lvl: 3, pts: 4, dg: 0, draw: 0 },
  { name: "Succubus", lvl: 4, pts: 3, dg: 0, draw: 1 },
  { name: "Nachtmahr", lvl: 5, pts: 6, dg: 0, draw: 0 },
  { name: "Traumfänger", lvl: 6, pts: 5, dg: 0, draw: 1 },
  { name: "Mondbestie", lvl: 7, pts: 10, dg: 1, draw: 0 },
  { name: "Außerweltliche Spinne", lvl: 8, pts: 13, dg: 2, draw: 0 },
  { name: "Pazuzu", lvl: 9, pts: 10, dg: 2, draw: 2 },
  { name: "Uralter Feind", lvl: 10, pts: 13, dg: 3, draw: 2 },
];
const STAFF_CARDS = [
  { name: "Robin Goodall", cost: 3, kind: "realm", realm: "wald", text: "+2 Kronen je 🌲-Monster" },
  { name: "Katie Aronnax", cost: 3, kind: "realm", realm: "tiefsee", text: "+2 Kronen je 🌊-Monster" },
  { name: "Amelia Fogg", cost: 3, kind: "realm", realm: "wolken", text: "+2 Kronen je ☁️-Monster" },
  { name: "Johann Lidenbrock", cost: 3, kind: "realm", realm: "hoehlen", text: "+2 Kronen je 🕳️-Monster" },
  { name: "John Michael Dyer", cost: 3, kind: "realm", realm: "dunkel", text: "+2 Kronen je 🌑-Monster" },
  { name: "Henry W. Remington", cost: 2, kind: "cage", text: "Ignoriert 1 ⚠️ je Saison" },
  { name: "Michonne N. Fraser", cost: 2, kind: "cage", text: "Ignoriert 1 ⚠️ je Saison" },
  { name: "Isaac van Horn", cost: 2, kind: "dangerCoin", text: "+1 Krone je ⚠️ ausgespielter Monster" },
  { name: "Lara Oakley", cost: 2, kind: "land", text: "Unbekanntes Land: Typ beim Ausspielen bestimmen" },
  { name: "Roald Starbuck", cost: 2, kind: "land", text: "Unbekanntes Land: Typ beim Ausspielen bestimmen" },
  { name: "Selma Cardenas", cost: 2, kind: "land", text: "Unbekanntes Land: Typ beim Ausspielen bestimmen" },
  { name: "Mungo Boyle", cost: 2, kind: "land", text: "Unbekanntes Land: Typ beim Ausspielen bestimmen" },
  { name: "P. T. Martini", cost: 3, kind: "eventCoin", text: "Immer wenn du ein Event ausspielst, erhältst du eine Krone" },
];
const HUNTER_EVENTS = ["Herausragende Jagdtechniken", "Materialforschung", "Wissenschaftliche Erkenntnisse", "Sicherheitstraining", "Erfahrung ist der beste Schutz", "Verbesserte Sicherheitsvorkehrungen", "Fortschrittliche Ausrüstung"];
const COIN_EVENTS = ["Grandiose öffentliche Präsentation", "Akademische Exkursion", "Neuer Clubpräsident", "Sensationeller Vortrag", "Eine monströse Lesung", "Reicher Sponsor", "Entdeckung des Jahres"];
const TOUR_EVENTS = { wald: "Führung in den Verwunschenen Wald", tiefsee: "Führung in die Tiefsee", wolken: "Führung in die Wolkenlande", hoehlen: "Führung in die Höhlenlande", dunkel: "Führung in die Dunkellande" };

// 21 Geheime Ziele
const GOAL_DEFS = [
  { key: "sparsam", name: "Sparsamkeit ist eine Tugend", text: "6 SP ohne Kredit", fn: (p) => (p.credits === 0 ? 6 : 0) },
  { key: "entdecker", name: "Entdecker der letzten Grenzen", text: "2 SP je entferntem Land (2/3-Punkte, ohne 🌙)", fn: (p) => 2 * Object.values(p.distant).reduce((a, b) => a + b, 0) },
  { key: "gefahrSP", name: "Gefahrensucher", text: "1 SP je ⚠️ in der Menagerie", fn: (p) => p.monsters.reduce((s, m) => s + (m.danger || 0), 0) },
  { key: "traumExp", name: "Autorität für übernatürliche Kreaturen", text: "2 SP je Traum-Monster", fn: (p) => 2 * p.monsters.filter((m) => m.realm === "traum").length },
  { key: "verwalter", name: "Verwalter", text: "2 SP je anderem Ziel", fn: (p) => 2 * Math.max(0, p.goals.length - 1) },
  { key: "grosswild", name: "Großwildjäger", text: "2 SP je Level 3, 3 SP je Level 4+", fn: (p) => p.monsters.reduce((s, m) => s + (m.cost === 3 ? 2 : m.cost >= 4 ? 3 : 0), 0) },
  { key: "spezialist", name: "Spezialist", text: "7 SP bei ≤3 Regionen, 4 SP bei 4", fn: (p) => { const r = ALL_REALMS.filter((x) => (p.lands[x.id] || 0) > 0).length; return r <= 3 ? 7 : r === 4 ? 4 : 0; } },
  { key: "waldExp", name: "Autorität für waldbewohnende Kreaturen", text: "2 SP je 🌲-Monster", fn: (p) => 2 * p.monsters.filter((m) => m.realm === "wald").length },
  { key: "besessen", name: "Eine offensichtliche Besessenheit", text: "7 SP bei 7+ Landpunkten eines Typs (ohne 🌙)", fn: (p) => (REALMS.some((r) => (p.lands[r.id] || 0) >= 7) ? 7 : 0) },
  { key: "ehrenmann", name: "Ein wahrer Ehrenmann zahlt seine Schulden", text: "2 SP je Kredit", fn: (p) => 2 * p.credits },
  { key: "hoehlenExp", name: "Autorität für unterirdische Kreaturen", text: "2 SP je 🕳️-Monster", fn: (p) => 2 * p.monsters.filter((m) => m.realm === "hoehlen").length },
  { key: "wolkenExp", name: "Autorität für fliegende Kreaturen", text: "2 SP je ☁️-Monster", fn: (p) => 2 * p.monsters.filter((m) => m.realm === "wolken").length },
  { key: "tiefseeExp", name: "Autorität für schwimmende Kreaturen", text: "2 SP je 🌊-Monster", fn: (p) => 2 * p.monsters.filter((m) => m.realm === "tiefsee").length },
  { key: "dunkelExp", name: "Autorität für düstere Kreaturen", text: "2 SP je 🌑-Monster", fn: (p) => 2 * p.monsters.filter((m) => m.realm === "dunkel").length },
  { key: "silber", name: "Mit dem Silberlöffel im Mund geboren", text: "4 SP sofort", fn: () => 4 },
  { key: "arbeitgeber", name: "Arbeitgeber des Jahres", text: "3 SP je Mitarbeiter", fn: (p) => 3 * p.staff.length },
  { key: "traumland", name: "Suchender jenseits des Tores der Träume", text: "2 SP je Traumland-Karte", fn: (p) => 2 * (p.traumCards || 0) },
  { key: "tausendsassa", name: "Tausendsassa", text: "7 SP bei 2+ Punkten in allen 6 Regionen", fn: (p) => (ALL_REALMS.every((r) => (p.lands[r.id] || 0) >= 2) ? 7 : 0) },
  { key: "klein", name: "Freund kleiner Dinge", text: "1 SP je Level-1-Monster", fn: (p) => p.monsters.filter((m) => m.cost === 1).length },
  { key: "ausruestung", name: "Solide Ausrüstung", text: "2 SP je übrigem Jägermarker", fn: (p) => 2 * p.hunters },
  { key: "zweite", name: "Die zweite Reihe ist gut genug für mich", text: "7 SP bei Platz 2 oder punktgleich Führung", fn: null },
];

// --------------------------- Deck & Logik ----------------------------------

let cardId = 0;
const mkLand = (realm, level) => ({ id: ++cardId, type: "Land", realm, level });
const mkMonster = (name, realm, cost, points, danger, draw) => ({ id: ++cardId, type: "Monster", name, realm, cost, points, danger, draw: draw || 0 });

function makeDeck() {
  const deck = [];
  REALMS.forEach((r) => {
    for (let i = 0; i < 10; i++) deck.push(mkLand(r.id, 1));
    deck.push(mkLand(r.id, 2), mkLand(r.id, 2), mkLand(r.id, 3));
  });
  for (let i = 0; i < 7; i++) deck.push(mkLand("traum", 3)); // 72 Landkarten: 5×13 + 7 Traumland
  REALMS.forEach((r) => {
    MTYPES.forEach((t, i) => {
      for (let n = 0; n < t.count; n++) deck.push(mkMonster(MONSTER_NAMES[r.id][i], r.id, t.lvl, t.pts, t.dg, t.draw));
    });
  });
  TRAUM_MONSTERS.forEach((t) => deck.push(mkMonster(t.name, "traum", t.lvl, t.pts, t.dg, t.draw)));
  STAFF_CARDS.forEach((s) => deck.push({ id: ++cardId, type: "Mitarbeiter", ...s }));
  HUNTER_EVENTS.forEach((n) => deck.push({ id: ++cardId, type: "Event", name: n, kind: "hunter", text: "+1 Jägermarker" }));
  COIN_EVENTS.forEach((n) => deck.push({ id: ++cardId, type: "Event", name: n, kind: "coins2", text: "+2 Kronen" }));
  Object.entries(TOUR_EVENTS).forEach(([rid, n]) => deck.push({ id: ++cardId, type: "Event", name: n, kind: "tour", realm: rid, text: "+1 Krone je Landpunkt dieser Region" }));
  deck.push({ id: ++cardId, type: "Event", name: "Sommerfest", kind: "summer", text: "+2 Kronen je Mitarbeiter" });
  deck.push({ id: ++cardId, type: "Event", name: "Beratung für die Behörden", kind: "show", text: "+1 Krone je eingelagertem Monster" });
  deck.push({ id: ++cardId, type: "Event", name: "Pressevorführung", kind: "show", text: "+1 Krone je eingelagertem Monster" });
  GOAL_DEFS.forEach((g) => deck.push({ id: ++cardId, type: "Ziel", name: g.name, text: g.text, key: g.key }));
  return deck;
}

function shuffle(a) {
  const arr = [...a];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

const emptyLands = () => { const l = {}; ALL_REALMS.forEach((r) => (l[r.id] = 0)); return l; };
const emptyDistant = () => { const d = {}; REALMS.forEach((r) => (d[r.id] = 0)); return d; };
// Start-Länder wie im echten Spiel: genau 10 Start-Landkarten (je Standard-Reich 2×)
// werden gemischt und an alle Spieler verteilt – 2 je Spieler, ohne Zurücklegen.
const dealStartLands = (playerCount) => {
  const startDeck = shuffle([...REALMS, ...REALMS].map((r) => r.id));
  const hands = Array.from({ length: playerCount }, () => emptyLands());
  startDeck.slice(0, playerCount * 2).forEach((realmId, i) => {
    hands[i % playerCount][realmId] += 1;
  });
  return hands;
};

const occupied = (seasonMonsters) => {
  const occ = {};
  seasonMonsters.forEach((m) => {
    if (m.realm === "traum") {
      occ.traum = (occ.traum || 0) + (m.paidTraum || 0);
      if (m.helperRealm) occ[m.helperRealm] = (occ[m.helperRealm] || 0) + (m.helperCount || 0);
    } else occ[m.realm] = (occ[m.realm] || 0) + m.cost;
  });
  return occ;
};
const freeLandsOf = (lands, seasonMonsters) => {
  const occ = occupied(seasonMonsters);
  const f = {};
  ALL_REALMS.forEach((r) => { f[r.id] = (lands[r.id] || 0) - (occ[r.id] || 0); });
  return f;
};

// Traum-Monster: nur 🌙 oder 🌙 + GENAU EIN Hilfsreich (Regel der Spielrunde).
// chosenRealm: der Spieler darf das Hilfsreich SELBER aussuchen (Nutzer-Wunsch) –
// ohne Wahl wird automatisch das Reich mit den meisten freien Punkten genommen.
function traumPlacement(cost, lands, seasonMonsters, chosenRealm) {
  const free = freeLandsOf(lands, seasonMonsters);
  if (chosenRealm && chosenRealm !== "traum") {
    const helper = free[chosenRealm] || 0;
    if (helper <= 0 || free.traum + helper < cost) return null;
    const paidTraum = Math.min(free.traum, cost);
    return { paidTraum, helperRealm: chosenRealm, helperCount: cost - paidTraum };
  }
  if (free.traum >= cost) return { paidTraum: cost, helperRealm: null, helperCount: 0 };
  let best = null;
  REALMS.forEach((r) => {
    if (free[r.id] + free.traum >= cost && (!best || free[r.id] > free[best])) best = r.id;
  });
  if (!best) return null;
  return { paidTraum: free.traum, helperRealm: best, helperCount: cost - free.traum };
}

const canPlayMonster = (m, p) =>
  m.realm === "traum" ? !!traumPlacement(m.cost, p.lands, p.seasonMonsters)
    : (freeLandsOf(p.lands, p.seasonMonsters)[m.realm] || 0) >= m.cost;

const canPlayLand = (card, p) =>
  card.realm === "traum" ? true :
  card.level === 1 ? true :
  card.level === 2 ? (p.lands[card.realm] || 0) >= 1 :
  (p.lands[card.realm] || 0) >= 2;

const dangerSum = (seasonMonsters) => seasonMonsters.reduce((s, m) => s + (m.danger || 0), 0);
const rollDice = () => [0, 1, 2].map(() => [0, 0, 0, 1, 1, 2][Math.floor(Math.random() * 6)]);
const staffCount = (p, kind, realm) => p.staff.filter((s) => s.kind === kind && (!realm || s.realm === realm)).length;

function takeCredits(p, shortfall) {
  const n = Math.ceil((shortfall - p.coins) / 3);
  if (n > 0) { p.coins += 3 * n; p.credits += n; return `🏦 ${n} Kredit(e) aufgenommen (+${3 * n}👑, je −5 SP)`; }
  return "";
}

function applySeasonBonus(g, pIdx, card) {
  const sc = g.seasonCard;
  if (!sc || g.bonusGiven[pIdx]) return null;
  const matches = sc === "gefahr" ? (card.danger || 0) > 0 : card.realm === sc;
  if (matches) {
    g.bonusGiven[pIdx] = true;
    g.players[pIdx].coins += 2;
    return `${g.players[pIdx].name} erhält 2 Kronen (Saison-Bonus)!`;
  }
  return null;
}

function onMonsterPlayed(g, pIdx, card) {
  const p = g.players[pIdx];
  const msgs = [];
  const experts = staffCount(p, "realm", card.realm);
  if (experts > 0) { p.coins += 2 * experts; msgs.push(`+${2 * experts}👑 (Experten)`); }
  const baendiger = staffCount(p, "dangerCoin");
  if (baendiger > 0 && card.danger > 0) { p.coins += baendiger * card.danger; msgs.push(`+${baendiger * card.danger}👑 (Bändiger)`); }
  if (card.draw > 0 && g.deckIdx < g.deck.length) {
    const drawnCards = [];
    for (let i = 0; i < card.draw && g.deckIdx < g.deck.length; i++) {
      const drawn = g.deck[g.deckIdx++];
      if (drawn.type === "Ziel") { p.goals.push(drawn); } // gezogene Ziele direkt annehmen (gratis) – Name bleibt geheim
      else { p.stored.push(drawn); } // liegt schon sicher eingelagert – die Entscheidung folgt in der Zieh-Schlange
      drawnCards.push(drawn);
    }
    if (drawnCards.length) {
      // Zieh-Schlange: neue Karten hinten an – noch offene Entscheidungen bleiben vorne.
      p.freshDraw = [...(p.freshDraw || []), ...drawnCards];
      msgs.push(`🃏 ${card.draw} Karte(n) gezogen – entscheidet in Ruhe!`); // keine Kartennamen: was gezogen wurde, weiß nur der Besitzer
    }
  }
  const bonus = applySeasonBonus(g, pIdx, card);
  if (bonus) msgs.push(bonus);
  return msgs;
}

function onEvent(p, card) {
  let msg = "";
  if (card.kind === "hunter") { p.hunters += 1; msg = "+1 Jägermarker"; }
  else if (card.kind === "coins2") { p.coins += 2; msg = "+2 Kronen"; }
  else if (card.kind === "tour") { const c = p.lands[card.realm] || 0; p.coins += c; msg = `+${c} Kronen (${realmInfo(card.realm).name})`; }
  else if (card.kind === "summer") { const c = 2 * p.staff.length; p.coins += c; msg = `+${c} Kronen (Sommerfest)`; }
  else if (card.kind === "show") { const c = p.stored.filter((x) => x.type === "Monster").length; p.coins += c; msg = `+${c} Kronen (Monster gezeigt)`; }
  const martini = staffCount(p, "eventCoin");
  if (martini > 0) { p.coins += martini; msg += ` +${martini}👑 (P. T. Martini)`; }
  return msg;
}

function playIntoPlayer(g, pIdx, card, chosenRealm) {
  const p = g.players[pIdx];
  if (card.type === "Monster") {
    if (card.realm === "traum") {
      const pl = traumPlacement(card.cost, p.lands, p.seasonMonsters, chosenRealm);
      if (!pl) return null;
      p.seasonMonsters.push({ ...card, ...pl });
      bigFanfare(g, pIdx, card);
      const extra = onMonsterPlayed(g, pIdx, card);
      return { ok: true, msg: [`✅ „${card.name}": ${pl.paidTraum} 🌙${pl.helperRealm ? ` + ${pl.helperCount} ${realmInfo(pl.helperRealm).emoji} (Hilfsreich)` : ""}.`, ...extra].join(" ") };
    }
    if (!canPlayMonster(card, p)) return null;
    p.seasonMonsters.push(card);
    bigFanfare(g, pIdx, card);
    const extra = onMonsterPlayed(g, pIdx, card);
    return { ok: true, msg: [`✅ „${card.name}" ausgespielt (belegt ${card.cost} ${realmInfo(card.realm).emoji}).`, ...extra].join(" ") };
  }
  if (card.type === "Land") {
    if (!canPlayLand(card, p)) return null;
    p.lands[card.realm] = (p.lands[card.realm] || 0) + card.level;
    if (card.realm !== "traum" && card.level >= 2) p.distant[card.realm] += 1;
    if (card.realm === "traum") {
      p.traumCards += 1;
      let freed = 0;
      p.seasonMonsters.forEach((m) => {
        if (m.realm === "traum" && m.helperCount > 0) {
          const shift = Math.min(card.level, m.helperCount);
          m.helperCount -= shift; m.paidTraum += shift; freed += shift;
        }
      });
      if (freed > 0) return { ok: true, msg: `✅ +${card.level} 🌙 Traumland – ${freed} Hilfs-Punkt(e) wieder frei!` };
    }
    return { ok: true, msg: `✅ +${card.level} ${realmInfo(card.realm).emoji} Landpunkte.` };
  }
  if (card.type === "Mitarbeiter") {
    if (card.kind === "land" && !chosenRealm) return { needRealm: true };
    const cMsg = p.coins < card.cost ? takeCredits(p, card.cost) : "";
    p.coins -= card.cost;
    if (card.kind === "land") {
      p.lands[chosenRealm] = (p.lands[chosenRealm] || 0) + 1;
      return { ok: true, msg: `✅ ${card.name} als Landpunkt ${realmInfo(chosenRealm).emoji} festgelegt (−${card.cost} 👑)${cMsg}.` };
    }
    p.staff.push(card);
    return { ok: true, msg: `✅ ${card.name} angestellt (−${card.cost} 👑)${cMsg}.` };
  }
  if (card.type === "Event") return { ok: true, msg: `✅ Event „${card.name}": ${onEvent(p, card)}.` };
  return null; // Ziele sind nicht spielbar
}

const cardPlayable = (card, p) => {
  if (card.type === "Monster") return canPlayMonster(card, p);
  if (card.type === "Land") return canPlayLand(card, p);
  return true;
};

const rotateHands = (g) => {
  const n = g.players.length;
  const dirLeft = g.season % 2 === 0;
  const old = g.hands;
  g.hands = g.players.map((_, j) => old[dirLeft ? (j - 1 + n) % n : (j + 1) % n]);
};

// ------------------------------ Spiel-Flow ----------------------------------

function mkPlayerState(name, startLands) {
  return {
    name, lands: startLands, distant: emptyDistant(), traumCards: 0,
    seasonMonsters: [], monsters: [], stored: [], staff: [], goals: [],
    coins: 4, hunters: 0, credits: 0, trophies: 0,
    freshDraw: null, // Zieh-Schlange: gratis gezogene Karte(n) mit offener Entscheidung – nur für den Besitzer sichtbar
  };
}

// 🚨 TAMTAM (Nutzer-Wunsch): Ein FETTES Monster – Level 4 aus den Standard-Reichen
// oder das Level-10-Monster aus den Traumlanden – löst bei ALLEN eine große
// Fanfare aus: Vollbild-Banner mit Name + Spieler + Dreifach-Gong im Client.
let gameIdCounter = 0;
const isBigMonster = (c) => c.type === "Monster" && (c.realm === "traum" ? c.cost === 10 : c.cost === 4);
function bigFanfare(g, pIdx, card) {
  if (!isBigMonster(card)) return;
  g.fanfareId = (g.fanfareId || 0) + 1;
  g.fanfare = { id: g.fanfareId, name: card.name, realm: card.realm, points: card.points || 0, danger: card.danger || 0, player: g.players[pIdx].name };
  g.log.unshift(`🚨 TAMTAM: ${g.players[pIdx].name} spielt „${card.name}" – ein FETTES Monster!`);
}

function mkGame(playerNames, totalSeasons, mode) {
  cardId = 0;
  totalSeasons = totalSeasons === 5 ? 5 : 4; // Original 4, Hausregel 5
  // Spieltempo: "langsam" (nacheinander wie bisher), "schnell" (alle wählen
  // gleichzeitig), "turbo" (jeder spielt im eigenen Tempo weiter)
  mode = mode === "schnell" ? "schnell" : mode === "turbo" ? "turbo" : "langsam";
  const startLands = dealStartLands(playerNames.length);
  const g = {
    mode,
    players: playerNames.map((n, i) => mkPlayerState(n, startLands[i])),
    deck: shuffle(makeDeck()), deckIdx: 0,
    seasonPool: shuffle(["wald", "tiefsee", "wolken", "hoehlen", "dunkel", "traum", "gefahr"]).slice(0, totalSeasons),
    totalSeasons,
    stack: [], openDiscards: [], awaitDiscard: null, awaitFresh: null,
    hands: [], seasonCard: null, bonusGiven: [],
    turn: 0, roundIdx: 0, roundNo: 0, seTurn: 0,
    season: -1, phase: "draft", dice: null, reveal: null, show: null,
    gameId: ++gameIdCounter, fanfareId: 0, fanfare: null,
    log: [],
  };
  dealSeason(g, 0);
  g.log.unshift(`🎡 Saison 1: ${SEASON_NAMES[g.seasonCard]}! ${seasonHint(g.seasonCard)}`);
  return g;
}

function dealSeason(g, season) {
  g.season = season;
  g.roundIdx = 0;
  g.roundNo = 0;
  g.hands = g.players.map(() => []);
  g.seasonCard = g.seasonPool[season];
  g.bonusGiven = g.players.map(() => false);
  g.turn = 0;
  g.seTurn = 0;
  g.dice = null;
  g.players.forEach((p) => (p.seasonMonsters = []));
  g.players.forEach((_, pi) => {
    for (let i = 0; i < 8 && g.deckIdx < g.deck.length; i++) g.hands[pi].push(g.deck[g.deckIdx++]);
  });
  // 2-Spieler-Variante (Hausregeln der Spielrunde): gemeinsamer verdeckter Nachziehstapel
  // (14 Karten) + offene Ablage. Rechnung: 8 Picks + 7 offene Ablagen pro Spieler; die
  // letzte Karte der Saison kommt immer zufällig vom Stapel statt vom Mitspieler.
  g.stack = [];
  g.openDiscards = [];
  g.awaitDiscard = null;
  g.awaitFresh = null;
  g.show = null; // 🐢 Langsam: Aufdeck-Runde (wer ist gerade dran)
  g.sim = mkSimState(g); // ⚡ Schnell: verdeckte Wahlen der laufenden Runde
  g.incoming = g.players.map(() => []); // 🚀 Turbo: wartende Stapel der Nachbarn
  g.turboDiscard = g.players.map(() => false); // 🚀 Turbo: 2er-Ablage-Schritt je Spieler
  g.passed = g.players.map(() => false); // 2er: Stapel bereits weitergegeben?
  g.players.forEach((p) => { p.freshDraw = null; });
  if (g.players.length === 2) {
    for (let i = 0; i < 14 && g.deckIdx < g.deck.length; i++) g.stack.push(g.deck[g.deckIdx++]);
  }
  if (season > 0) g.log.unshift(`🎡 Saison ${season + 1}: ${SEASON_NAMES[g.seasonCard]}! ${seasonHint(g.seasonCard)}`);
}

// Zug weitergeben – 2-Spieler-Variante: Rotation erst nach ABLAGE + Nachziehen,
// damit der offen abgelegte Zug sauber abgeschlossen wird.
function advanceDuo(g) {
  g.roundIdx += 1;
  if (g.roundIdx >= g.players.length) {
    g.roundIdx = 0;
    g.roundNo += 1;
    rotateHands(g);
    g.passed = g.players.map(() => false); // beide haben übergeben – neue Runde
  }
  g.log = g.log.slice(0, 40);
  if (g.hands.every((h) => h.length === 0)) {
    g.log.unshift("📐 Alle Karten gewählt – jetzt darf noch Eingelagertes ausgespielt werden, dann wird gewürfelt!");
    g.seTurn = 0;
    g.phase = "seasonEnd";
    return;
  }
  g.turn = (g.turn + 1) % g.players.length;
}

// 2-Spieler-Variante: nach dem Nehmen 1 Karte OFFEN aus dem Spiel ablegen
// (für alle sichtbar), dann 1 Karte verdeckt vom gemeinsamen Stapel nachziehen.
function applyDuoDiscard(g, pIdx, cardId) {
  const card = g.hands[pIdx].find((c) => c.id === cardId);
  if (!card) return { err: "Karte nicht gefunden." };
  g.hands[pIdx] = g.hands[pIdx].filter((c) => c.id !== cardId);
  g.openDiscards.push({
    by: pIdx, card: {
      type: card.type, name: card.name || realmInfo(card.realm).name, realm: card.realm,
      level: card.level, cost: card.cost, points: card.points, danger: card.danger || 0,
    },
  });
  g.log.unshift(`🗑️ ${g.players[pIdx].name} legt „${card.name || realmInfo(card.realm).name}" offen aus dem Spiel.`);
  if (g.stack.length > 0) g.hands[pIdx].push(g.stack.pop());
  return { ok: true };
}

function handleDiscard(g, pIdx, msg) {
  // 🚀 Turbo: Ablegen ist ein persönlicher Schritt, kein globaler Wartezustand
  if (g.mode === "turbo") return handleTurboDiscard(g, pIdx, msg);
  if (g.phase !== "draft" || g.awaitDiscard !== pIdx) return { err: "Du bist gerade nicht am offenen Ablegen." };
  const res = applyDuoDiscard(g, pIdx, msg.cardId);
  if (res && res.err) return res;
  g.awaitDiscard = null;
  // 🐢 Langsam: Die offene Ablage gehört zum eigenen Aufdecken – danach ist der Nächste dran.
  if (g.show) {
    if ((g.players[pIdx].freshDraw || []).some((c) => c.type !== "Ziel")) return { ok: true };
    showStep(g);
    return { ok: true };
  }
  g.passed[pIdx] = true; // Stapel ist abgegeben – der Besitzer sieht ihn nicht mehr
  advanceDuo(g);
  return { ok: true };
}

// ⚡ Schnell-Modus & 🐢 Langsam-Modus: verdeckte Wahl eines Spielers für die laufende Runde.
// Schnell: alles wird gleichzeitig ausgeführt. Langsam (2er): die Karte für die OFFENE
// Ablage kommt erst NACH dem eigenen Aufdecken (siehe handleReveal/handleDiscard).
function handleSimPick(g, pIdx, msg) {
  if ((g.mode !== "schnell" && g.mode !== "langsam") || g.phase !== "draft") return { err: "Gerade nicht möglich." };
  if (g.show) return { err: "Gerade wird aufgedeckt – gleich dürft ihr wieder neu wählen!" };
  const p = g.players[pIdx];
  // Erst die Zieh-Karten entscheiden, dann neu wählen
  if ((p.freshDraw || []).some((c) => c.type !== "Ziel")) return { err: "Entscheide erst über deine gezogenen Karten – danach siehst du dein neues Blatt!" };
  const card = g.hands[pIdx].find((c) => c.id === msg.cardId);
  if (!card) return { err: "Karte nicht gefunden." };
  if (g.hands[pIdx].length === 0) return { err: "Du hast keine Karten mehr." };
  const pick = { cardId: card.id, action: msg.action === "keep" ? "keep" : "play", realm: msg.realm || null, discardId: null };
  // Spielbarkeit schon BEIM Wählen prüfen (verdeckte Wahl darf nicht ins Leere laufen)
  if (pick.action === "play") {
    if (card.type === "Ziel") return { err: "Ziele kannst du nur annehmen (einlagern), nicht ausspielen." };
    if ((card.type === "Monster" || card.type === "Land") && !cardPlayable(card, p))
      return { err: `„${card.name || realmInfo(card.realm).name}" passt gerade nicht – wähle eine andere Karte oder lagere ein.` };
    if (card.type === "Mitarbeiter" && card.kind === "land" && !pick.realm)
      return { err: "Bitte ein Reich wählen." };
  }
  // ⚡ Schnell (2er): Abwurfkarte gleich mitwählen. 🐢 Langsam (2er): erst beim eigenen Aufdecken.
  if (g.mode === "schnell" && g.players.length === 2 && g.hands[pIdx].length > 1) {
    const d = g.hands[pIdx].find((c) => c.id === msg.discardId);
    if (!d || d.id === card.id) return { err: "Wähle auch 1 Karte für die offene Ablage." };
    pick.discardId = d.id;
  }
  const wasReady = g.sim.ready[pIdx];
  g.sim.picks[pIdx] = pick;
  g.sim.ready[pIdx] = true;
  if (!wasReady) g.log.unshift(`✅ ${p.name} hat gewählt.`);
  g.log = g.log.slice(0, 40);
  // Erst wenn ALLE bestätigt haben (leere Hand zählt automatisch als fertig),
  // wird gleichzeitig aufgedeckt und ausgeführt
  const allDone = g.players.every((_, i) => g.sim.ready[i] || g.hands[i].length === 0);
  if (allDone) { if (g.mode === "schnell") executeSimRound(g); else startShow(g); }
  return { ok: true };
}

const mkSimState = (g) => ({ picks: g.players.map(() => null), ready: g.players.map(() => false) });

// ⚡ Simultan-Runde ausführen: alle Wahlen gleichzeitig aufdecken (Sitzreihenfolge),
// dann 2er-Ablagen + Stapel-Nachziehen, dann Hände weitergeben.
function executeSimRound(g) {
  const n = g.players.length;
  for (let i = 0; i < n; i++) {
    const pick = g.sim.picks[i];
    if (pick) {
      const res = applyHandPick(g, i, pick);
      if (res && res.err) g.log.unshift(`⚠️ ${g.players[i].name}: ${res.err}`);
    }
  }
  if (n === 2) {
    for (let i = 0; i < 2; i++) {
      const pick = g.sim.picks[i];
      if (pick && pick.discardId != null) applyDuoDiscard(g, i, pick.discardId);
    }
  }
  rotateHands(g);
  g.log.unshift("⚡ Alle haben gleichzeitig aufgedeckt!");
  g.sim = mkSimState(g);
  if (g.hands.every((h) => h.length === 0)) {
    g.log.unshift("📐 Alle Karten gewählt – jetzt darf noch Eingelagertes ausgespielt werden, dann wird gewürfelt!");
    g.seTurn = 0;
    g.phase = "seasonEnd";
  }
  g.log = g.log.slice(0, 40);
}

// 🐢 Langsam wie am Tisch: alle haben VERDECKT gewählt – jetzt deckt jeder
// NACHEINANDER seine Karte selbst auf („Jetzt aufdecken!"). Reihenfolge = Sitzfolge,
// Start wechselt fair je Runde. Der Spielverlauf oben moderiert mit.
function startShow(g) {
  const n = g.players.length;
  g.show = { cur: g.roundNo % n, done: 0 };
  g.log.unshift("🔍 Alle haben verdeckt gewählt – jetzt wird nacheinander aufgedeckt!");
  showStep(g);
  g.log = g.log.slice(0, 40);
}

// Kette weitergeben: Spieler ohne Wahl (leere Hand) werden übersprungen.
function showStep(g) {
  const n = g.players.length;
  while (g.show && !g.sim.picks[g.show.cur]) {
    g.show.done += 1;
    if (g.show.done >= n) return endShowRound(g);
    g.show.cur = (g.show.cur + 1) % n;
  }
}

function endShowRound(g) {
  rotateHands(g);
  g.sim = mkSimState(g);
  g.show = null;
  g.roundNo += 1;
  if (g.hands.every((h) => h.length === 0)) {
    g.log.unshift("📐 Alle Karten gewählt – jetzt darf noch Eingelagertes ausgespielt werden, dann wird gewürfelt!");
    g.seTurn = 0;
    g.phase = "seasonEnd";
  } else g.log.unshift("🔄 Neue Wahlrunde – alle wählen wieder verdeckt!");
  g.log = g.log.slice(0, 40);
}

// 🐢 „Jetzt aufdecken!": die verdeckte Wahl wird ausgeführt und für alle sichtbar.
// Gezogene Karten („zieht X") entscheidet der Aufdeckende sofort – erst dann ist der
// Nächste dran. Bei 2 Spielern folgt danach noch die offene Ablage (außer letzte Karte).
function handleReveal(g, pIdx) {
  if (g.mode !== "langsam" || g.phase !== "draft" || !g.show || g.show.cur !== pIdx) return { err: "Du bist gerade nicht am Aufdecken." };
  const p = g.players[pIdx];
  if ((p.freshDraw || []).some((c) => c.type !== "Ziel")) return { err: "Entscheide erst über deine gezogenen Karten – dann geht es weiter!" };
  const pick = g.sim.picks[pIdx];
  if (!pick) { showStep(g); return { ok: true }; }
  g.log.unshift(`🔍 ${p.name} deckt auf!`);
  const res = applyHandPick(g, pIdx, pick);
  if (res && res.err) g.log.unshift(`⚠️ ${p.name}: ${res.err}`);
  g.sim.picks[pIdx] = null;
  g.log = g.log.slice(0, 40);
  // 🃏 Zieh-Karten: erst entscheiden (wie bisherige Reihenfolge), dann Ablage/Weiter
  if ((p.freshDraw || []).some((c) => c.type !== "Ziel")) return { ok: true };
  if (g.players.length === 2 && g.hands[pIdx].length > 0) {
    g.awaitDiscard = pIdx; // offene Ablage – der Aufdeckende klickt seine Abwurfkarte an
    return { ok: true };
  }
  showStep(g);
  return { ok: true };
}

// 🚀 Turbo: Reststapel an den Nachbarn weitergeben (Richtung wie im langsamen
// Modus, wechselt je Saison), selbst weitermachen, sobald neue Karten da sind.
function turboAdvance(g, pIdx) {
  const n = g.players.length;
  if (g.hands[pIdx].length > 0) {
    const dirLeft = g.season % 2 === 0;
    const next = dirLeft ? (pIdx + 1) % n : (pIdx - 1 + n) % n;
    g.incoming[next] = [...g.incoming[next], ...g.hands[pIdx]];
    g.hands[pIdx] = [];
    g.log.unshift(`📤 ${g.players[pIdx].name} gibt den Stapel weiter.`);
    // Empfänger mit leerer Hand bekommt den Stapel SOFORT (sonst Stau ohne eigene Aktion)
    if (g.hands[next].length === 0) {
      g.hands[next] = g.incoming[next];
      g.incoming[next] = [];
    }
  }
  if (g.hands[pIdx].length === 0 && (g.incoming[pIdx] || []).length > 0) {
    g.hands[pIdx] = g.incoming[pIdx];
    g.incoming[pIdx] = [];
  }
  // Saisonende erst, wenn wirklich niemand mehr Karten hat (auch keine wartenden)
  if (g.phase === "draft" && g.hands.every((h) => h.length === 0) && g.incoming.every((a) => a.length === 0)) {
    g.log.unshift("📐 Alle Karten gewählt – jetzt darf noch Eingelagertes ausgespielt werden, dann wird gewürfelt!");
    g.seTurn = 0;
    g.phase = "seasonEnd";
  }
  g.log = g.log.slice(0, 40);
}

// 🚀 Turbo nach einem Hand-Zug: bei 2 Spielern erst offen ablegen + nachziehen,
// dann erst weitergeben. Sonst geht der Reststapel sofort zum Nachbarn.
function afterTurboPick(g, pIdx) {
  if (g.players.length === 2 && g.hands[pIdx].length > 0) {
    g.turboDiscard[pIdx] = true;
    return;
  }
  turboAdvance(g, pIdx);
}

function handleTurboDiscard(g, pIdx, msg) {
  if (!g.turboDiscard || !g.turboDiscard[pIdx]) return { err: "Du bist gerade nicht am offenen Ablegen." };
  const res = applyDuoDiscard(g, pIdx, msg.cardId);
  if (res && res.err) return res;
  g.turboDiscard[pIdx] = false;
  turboAdvance(g, pIdx);
  return { ok: true };
}

// Kern jedes Hand-Zugs: die gewählte Karte ausspielen oder einlagern.
// Wird vom langsamen Modus UND von der Simultan-Ausführung benutzt.
function applyHandPick(g, pIdx, pick) {
  const p = g.players[pIdx];
  const card = g.hands[pIdx].find((c) => c.id === pick.cardId);
  if (!card) return { err: "Karte nicht gefunden." };
  if (pick.action === "keep") {
    let cMsg = "";
    if (p.coins < 1) { p.coins += 3; p.credits += 1; cMsg = " · 🏦 Kredit (+3👑, −5 SP)"; }
    p.coins -= 1;
    // Datenschutz: Eingelagertes und Ziele sind GEHEIM – der Log ist für alle sichtbar, also OHNE Kartennamen!
    if (card.type === "Ziel") { p.goals.push(card); g.log.unshift(`📥 ${p.name} nimmt ein Ziel an (−1👑)${cMsg}.`); }
    else { p.stored.push(card); g.log.unshift(`📥 ${p.name} lagert eine Karte ein (−1👑)${cMsg}.`); }
    g.hands[pIdx] = g.hands[pIdx].filter((c) => c.id !== card.id);
    return { ok: true };
  }
  const res = playIntoPlayer(g, pIdx, card, pick.realm);
  if (!res) return { err: `„${card.name || realmInfo(card.realm).name}" ist gerade nicht spielbar.` };
  if (res.needRealm) return { err: "Bitte ein Reich wählen." };
  g.hands[pIdx] = g.hands[pIdx].filter((c) => c.id !== card.id);
  g.log.unshift(`${p.name}: ${res.msg}`);
  return { ok: true };
}

// Ein Zug: Karte wählen (aus Hand oder Aufbewahrung)
// 🐢 Langsam: klassisch nacheinander (g.turn) ·
// 🚀 Turbo: Hand-Karten jederzeit, solange du welche hast ·
// ⚡ Schnell: Hand-Wahl läuft über simPick – hier nur Eingelagertes (jederzeit spielbar).
function handlePick(g, pIdx, msg) {
  const phase = g.phase;
  const p = g.players[pIdx];
  if (g.awaitDiscard !== null && g.awaitDiscard !== undefined) return { err: "Lege erst deine Karte offen ab!" };
  // 🃏 Zieh-Schlange: nur im langsamen Modus blockiert sie den Zug
  if (g.mode === "langsam" && (p.freshDraw || []).some((c) => c.type !== "Ziel")) return { err: "Entscheide erst über deine gratis gezogenen Karten!" };

  const inHand = g.hands[pIdx].some((c) => c.id === msg.cardId);
  const card = inHand ? g.hands[pIdx].find((c) => c.id === msg.cardId) : p.stored.find((c) => c.id === msg.cardId);
  if (!card) return { err: "Karte nicht gefunden." };

  if (phase === "draft") {
    if (inHand) {
      // ⚡/🐢: Handkarten werden oben VERDECKT gewählt – ausgeführt wird bei ⚡ automatisch,
      // bei 🐢 über den „Jetzt aufdecken!“-Button des Spielers.
      if (g.mode === "langsam" || g.mode === "schnell") return { err: "Wähle deine Handkarte oben verdeckt und bestätige mit „Fertig“." };
      if (g.turboDiscard[pIdx]) return { err: "Lege erst deine Karte offen ab!" };
      if (g.hands[pIdx].length === 0) return { err: "Du hast gerade keine Karten." };
    }
    // Eingelagertes darf jederzeit gespielt werden – in allen Tempos
  } else if (phase === "seasonEnd") {
    if (g.seTurn !== pIdx) return { err: "Du bist gerade nicht dran." };
  } else return { err: "Gerade nicht möglich." };

  if (!inHand) { // aus der Aufbewahrung (Draft ODER Saisonende)
    p.stored = p.stored.filter((c) => c.id !== card.id);
    const res = playIntoPlayer(g, pIdx, card, msg.realm);
    if (!res) {
      p.stored.push(card);
      return { err: `„${card.name || realmInfo(card.realm).name}" passt gerade nicht.` };
    }
    if (res.needRealm) { p.stored.push(card); return { err: "Bitte ein Reich wählen." }; }
    g.log.unshift(`${p.name}: ${res.msg}`);
    return { ok: true };
  }

  // Karte aus der Hand – nur während der Draft-Phase
  if (phase !== "draft") return { err: "Die Hand ist leer – nur Eingelagertes ist noch spielbar." };
  const res = applyHandPick(g, pIdx, { cardId: msg.cardId, action: msg.action, realm: msg.realm });
  if (res && res.err) return res;

  if (g.mode === "turbo") { afterTurboPick(g, pIdx); return { ok: true }; }

  // 🃏 Zieh-Schlange: erst wenn ALLE gezogenen Nicht-Ziel-Karten entschieden sind,
  // geht der Zug weiter – so kann jeder in Ruhe ausspielen/einlagern (Wunsch der Spielrunde).
  if ((p.freshDraw || []).some((c) => c.type !== "Ziel")) {
    g.awaitFresh = pIdx;
    g.log = g.log.slice(0, 40);
    return { ok: true };
  }
  finishPick(g, pIdx);
  return { ok: true };
}

// Zug abschließen – 2-Spieler-Variante: nach dem Nehmen erst offen ablegen
// (msg t:"discard"), dann erst Rotation/Weitergabe. Letzte Karte der Saison:
// direkt genommen, kein Ablegen/Nachziehen mehr (Stapel ist dann ohnehin leer).
function finishPick(g, pIdx) {
  if (g.players.length === 2) {
    if (g.hands[pIdx].length > 0) {
      g.awaitDiscard = pIdx;
      g.log = g.log.slice(0, 40);
      return;
    }
    g.passed[pIdx] = true; // letzte Karte genommen – Hand abgegeben
    advanceDuo(g);
    return;
  }

  // Zug weitergeben
  g.roundIdx += 1;
  if (g.roundIdx >= g.players.length) {
    g.roundIdx = 0;
    g.roundNo += 1;
    rotateHands(g);
  }
  g.log = g.log.slice(0, 40);

  // Saisonende erst, wenn ALLE Hände leer sind
  if (g.hands.every((h) => h.length === 0)) {
    g.log.unshift("📐 Alle Karten gewählt – jetzt darf noch Eingelagertes ausgespielt werden, dann wird gewürfelt!");
    g.seTurn = 0;
    g.phase = "seasonEnd";
    return;
  }
  g.turn = (g.turn + 1) % g.players.length;
}

// 🃏 Zieh-Schlange: über JEDE gezogene Nicht-Ziel-Karte wird EINZELN entschieden –
// ausspielen (gratis) oder einlagern. Erst wenn die Schlange leer ist, geht der Zug weiter.
function handleFreshDecide(g, pIdx, msg) {
  const p = g.players[pIdx];
  const idx = (p.freshDraw || []).findIndex((c) => c.id === msg.cardId);
  if (idx < 0) return { err: "Diese Karte wartet nicht auf deine Entscheidung." };
  const card = p.freshDraw[idx];
  if (card.type === "Ziel") return { err: "Ziele liegen schon bei deinen Zielen – tippe auf „Alles klar“." };
  if (msg.action === "keep") {
    p.freshDraw.splice(idx, 1); // bleibt gratis eingelagert
  } else if (msg.action === "play") {
    if (!p.stored.some((c) => c.id === card.id)) return { err: "Diese Karte liegt nicht bei dir." }; // Anti-Cheating
    const res = playIntoPlayer(g, pIdx, card, msg.realm);
    if (!res) return { err: `„${card.name || realmInfo(card.realm).name}“ passt gerade nicht.` };
    if (res.needRealm) return { err: "Bitte ein Reich wählen." };
    p.stored = p.stored.filter((c) => c.id !== card.id);
    p.freshDraw.splice(idx, 1);
    g.log.unshift(`${p.name}: ${res.msg}`);
  } else return { err: "Ungültige Entscheidung." };
  g.log = g.log.slice(0, 40);
  // Zug erst weitergeben, wenn die Schlange leer ist (verkettete Züge: neue Karten kommen hinten dran)
  if (!(p.freshDraw || []).some((c) => c.type !== "Ziel")) {
    if (g.awaitFresh === pIdx) { g.awaitFresh = null; finishPick(g, pIdx); }
    // 🐢 Langsam: Zieh-Karten beim eigenen Aufdecken entschieden → 2er-Ablage oder Nächster
    else if (g.show && g.show.cur === pIdx) {
      if (g.players.length === 2 && g.hands[pIdx].length > 0) g.awaitDiscard = pIdx;
      else showStep(g);
    }
  }
  return { ok: true };
}

// „Fertig" im Saisonende → nächster Spieler; der LETZTE löst den Wurf für alle aus.
function handleSeasonDone(g, pIdx) {
  if (g.phase !== "seasonEnd" || g.seTurn !== pIdx) return { err: "Du bist gerade nicht dran." };
  if (g.seTurn + 1 < g.players.length) {
    g.seTurn += 1;
    return { ok: true };
  }
  endSeason(g);
  return { ok: true };
}

// EIN Wurf für alle + Trophäe
function endSeason(g) {
  const roll = rollDice();
  const rollSum = roll.reduce((a, b) => a + b, 0);
  const results = g.players.map((p) => {
    const d = dangerSum(p.seasonMonsters);
    let rest = Math.max(0, d - rollSum);
    const cages = Math.min(rest, staffCount(p, "cage")); rest -= cages;
    const markers = Math.min(rest, p.hunters); p.hunters -= markers; rest -= markers;
    const payCoins = Math.min(rest, Math.floor(p.coins / 3)); p.coins -= payCoins * 3; rest -= payCoins;
    // Erst mit 3 Kronen je offenes Symbol zahlen (oben) – und nur wenn das Geld
    // nicht reicht: ganz normal 1 Kredit je Rest-Symbol (+3 👑, −5 SP). Das
    // Kreditgeld (+3 👑) fließt direkt in die Bezahlung (−3 👑 je Symbol),
    // die restlichen Kronen bleiben unverändert.
    const newCredits = rest; p.credits += newCredits;
    const snapshot = [...p.seasonMonsters];
    p.monsters.push(...p.seasonMonsters);
    p.seasonMonsters = [];
    return { name: p.name, danger: d, snapshot, roll, cages, markers, payCoins, newCredits };
  });
  const sc = g.seasonCard;
  const metric = (ms) => sc === "gefahr" ? dangerSum(ms) : ms.filter((m) => m.realm === sc).reduce((s, m) => s + m.points, 0);
  const scores = results.map((r) => metric(r.snapshot));
  const max = Math.max(...scores);
  const lines = [`🎲 Ein Wurf für alle: ${roll.join(" + ")} = ${rollSum} Käfige.`];
  // Nutzer-Regel (13.11.2026): Trophäe NUR für den ALLEINIGEN Sieger – bei Gleichstand bekommt sie NIEMAND.
  const winners = scores.map((s, i) => [s, i]).filter((x) => x[0] === max);
  if (max > 0 && winners.length === 1) {
    const wi = winners[0][1];
    g.players[wi].trophies += 1;
    lines.push(`🏆 ${g.players[wi].name} gewinnt die ${SEASON_NAMES[sc]}-Karte (+3 SP)!`);
  } else if (max > 0) {
    lines.push(`🤝 Gleichstand bei der ${SEASON_NAMES[sc]}-Karte – die Trophäe verfällt, niemand bekommt sie!`);
  } else lines.push("🏆 Saisonkarte verfällt (niemand hat gepunktet).");
  lines.push("🏁 Saison beendet – Länder wieder frei.");
  g.dice = { roll, rollSum, results: results.map((r) => ({ name: r.name, danger: r.danger, cages: r.cages, markers: r.markers, payCoins: r.payCoins, newCredits: r.newCredits })) };
  g.log = [...lines.slice().reverse(), ...g.log].slice(0, 40);
  g.phase = "danger";
}

// Nach den Gefahrenproben: nächste Saison oder Schlusswertung
function handleNext(g) {
  if (g.phase !== "danger") return { err: "Ungültiger Zeitpunkt." };
  if (g.season >= (g.totalSeasons || 4) - 1) {
    g.reveal = computeReveal(g);
    g.phase = "reveal";
    g.log.unshift("🏁 Schlusswertung – die Ziele werden aufgedeckt!");
  } else {
    dealSeason(g, g.season + 1);
    g.phase = "draft";
  }
  g.log = g.log.slice(0, 40);
  return { ok: true };
}

function computeReveal(g) {
  const result = g.players.map((p) => {
    const monPts = p.monsters.reduce((s, m) => s + m.points, 0);
    const trophyPts = p.trophies * 3;
    const coinsPts = p.coins;         // 1 übrig gebliebene Krone = 1 SP
    const hunterPts = p.hunters;      // 1 übrig gebliebener Jägermarker = 1 SP
    const creditPts = -p.credits * 5; // −5 SP je Kredit (bestätigt)
    const goalResults = p.goals.map((gz) => {
      const def = GOAL_DEFS.find((d) => d.key === gz.key);
      const pts = def && def.fn ? def.fn(p) : 0;
      return { name: gz.name, text: gz.text, pts };
    });
    const goalPts = goalResults.reduce((s, r) => s + r.pts, 0);
    return {
      name: p.name, monPts, trophyPts, coinsPts, hunterPts, creditPts,
      goalResults, goalPts, trophies: p.trophies, credits: p.credits, coins: p.coins,
      hunters: p.hunters, monsterCount: p.monsters.length,
      zweiteReihe: p.goals.some((gz) => gz.key === "zweite"),
    };
  });
  const pre = result.map((r) => r.monPts + r.trophyPts + r.coinsPts + r.hunterPts + r.creditPts + r.goalPts);
  result.forEach((r, i) => {
    r.zweiteBonus = 0;
    if (!r.zweiteReihe) return;
    const maxV = Math.max(...pre);
    const above = pre.filter((v, j) => j !== i && v > pre[i]).length;
    const tiedAtMax = pre[i] === maxV && pre.filter((v) => v === maxV).length > 1;
    if (tiedAtMax || above === 1) { r.zweiteBonus = 7; r.goalPts += 7; }
  });
  result.forEach((r, i) => { r.total = pre[i] + r.zweiteBonus; });
  const ranked = [...result].sort((a, b) => b.total - a.total);
  return { players: result, ranked };
}

// ------------------------------ 🤖 Bots --------------------------------------
// Bots sind echte Mitspieler im Raum (connected: true, ohne WebSocket). Der Host
// fügt sie in der Lobby hinzu/entfernt sie – so könnt ihr zu zweit (oder sogar
// allein) trotzdem eine 3er-, 4er- oder 5er-Runde spielen. botApply() macht genau
// EINEN Bot-Zug; der Server plant ihn mit kleiner Pause, damit es lebendig wirkt.

const BOT_NAMES = ["🤖 Robbi", "🤖 Berta", "🤖 Ziko", "🤖 Mona", "🤖 Karl", "🤖 Fritzi"];

function nextBotName(room) {
  const used = new Set(room.players.map((p) => p.name));
  return BOT_NAMES.find((n) => !used.has(n)) || `🤖 Bot ${room.players.length}`;
}

function addBotToRoom(room) {
  if (!room.game || room.game.phase !== "lobby") return "Bots lassen sich nur in der Lobby hinzufügen.";
  if (room.players.length >= 5) return "Mehr als 5 Spieler passen nicht an den Tisch.";
  room.players.push({ name: nextBotName(room), ws: null, token: null, connected: true, isBot: true });
  return null;
}

function removeBotFromRoom(room, name) {
  if (!room.game || room.game.phase !== "lobby") return "Bots lassen sich nur in der Lobby entfernen.";
  const k = room.players.findIndex((p) => p.isBot && p.name === String(name || ""));
  if (k < 0) return "Dieser Bot ist nicht im Raum.";
  room.players.splice(k, 1);
  return null;
}

// Grobe, faire Heuristik: wie viel ist diese Karte dem Spieler gerade wert?
function botScoreCard(g, i, card) {
  const p = g.players[i];
  if (card.type === "Ziel") return 30; // Ziele bringen am Ende oft viele Punkte
  if (card.type === "Monster") {
    const base = 18 + 2 * (card.points || 0) + (card.realm === g.seasonCard ? 12 : 0)
      + (card.draw > 0 ? 3 : 0) - 2 * (card.danger || 0) + (isBigMonster(card) ? 4 : 0);
    if (cardPlayable(card, p)) return base;
    return 8 + 0.8 * (card.points || 0); // unspielbar: für später einlagern kann sich lohnen
  }
  if (card.type === "Land") {
    if (!cardPlayable(card, p)) return 1 + (card.level || 1);
    let s = 6 + 3 * (card.level || 1) + (card.realm === g.seasonCard ? 5 : 0) + (card.realm === "traum" ? 4 : 0);
    if (card.realm !== "traum" && (p.lands[card.realm] || 0) < 2) s += 4; // schaltet größere Monster frei
    return s;
  }
  if (card.type === "Mitarbeiter") {
    if ((p.coins || 0) < card.cost) return 4;
    if (card.kind === "realm" || card.kind === "cage") return 13;
    if (card.kind === "dangerCoin" || card.kind === "eventCoin") return 12;
    return 10;
  }
  if (card.type === "Event") {
    if (card.kind === "coins2" || card.kind === "summer" || card.kind === "show") return 11;
    if (card.kind === "tour") return 8 + 2 * (p.lands[card.realm] || 0);
    return 9;
  }
  return 5;
}

// Landpunkt-Mitarbeiter: Reich mit den meisten freien Punkten (ermöglicht neue Monster)
function botLandRealm(g, p) {
  const free = freeLandsOf(p.lands, p.seasonMonsters);
  let best = "wald", bestV = -1;
  REALMS.forEach((r) => { const v = free[r.id] || 0; if (v > bestV) { bestV = v; best = r.id; } });
  return best;
}

// Wahl aus einem Kartenstapel: beste spielbare Karte ausspielen, sonst Sinnvolles einlagern.
// needDiscard (⚡ 2er): gleich die Karte für die offene Ablage mitwählen.
function botPickFrom(g, i, cards, needDiscard) {
  const p = g.players[i];
  const sc = (c) => botScoreCard(g, i, c);
  let bestPlay = null, bestCard = null;
  cards.forEach((c) => {
    if (!bestCard || sc(c) > sc(bestCard)) bestCard = c;
    const playable = c.type !== "Ziel" && cardPlayable(c, p);
    if (playable && (!bestPlay || sc(c) > sc(bestPlay))) bestPlay = c;
  });
  const ziel = cards.find((c) => c.type === "Ziel") || null;
  let pick = null;
  if (ziel && (!bestPlay || sc(bestPlay) < 14)) pick = { card: ziel, action: "keep" };      // Ziel annehmen
  else if (bestPlay && sc(bestPlay) >= 10) pick = { card: bestPlay, action: "play" };        // gern ausspielen
  else if (bestCard && sc(bestCard) >= 18 && cards.length > 1) pick = { card: bestCard, action: "keep" }; // Fettes für später einlagern
  else if (bestPlay) pick = { card: bestPlay, action: "play" };
  else pick = { card: bestCard, action: "keep" };                                           // muss ja eine Karte nehmen
  const realm = pick.card.type === "Mitarbeiter" && pick.card.kind === "land" ? botLandRealm(g, p) : null;
  const msg = { cardId: pick.card.id, action: pick.action, realm, discardId: null };
  if (needDiscard) {
    const rest = cards.filter((c) => c.id !== pick.card.id);
    let worst = rest[0] || null;
    rest.forEach((c) => { if (sc(c) < sc(worst)) worst = c; });
    msg.discardId = worst ? worst.id : null;
  }
  return msg;
}

// Beste Karte aus der Aufbewahrung, falls sich das Ausspielen gerade lohnt
function botBestStoredPlay(g, i, minScore) {
  const p = g.players[i];
  let best = null, bestSc = minScore - 1;
  p.stored.forEach((c) => {
    if (c.type === "Ziel") return;
    if (!cardPlayable(c, p)) return;
    const s = botScoreCard(g, i, c);
    if (s > bestSc) { bestSc = s; best = c; }
  });
  if (!best) return null;
  return { card: best, realm: best.type === "Mitarbeiter" && best.kind === "land" ? botLandRealm(g, p) : null };
}

// Schlechteste Karte (für die offene Ablage)
function botWorstCardId(g, i, cards) {
  let worst = cards[0] || null;
  cards.forEach((c) => { if (botScoreCard(g, i, c) < botScoreCard(g, i, worst)) worst = c; });
  return worst ? worst.id : null;
}

const isBotIdx = (room, i) => !!(room.players[i] && room.players[i].isBot);

// Welcher Bot muss gerade handeln? (Genau EIN Zug pro Aufruf – die Kette treibt sich
// über broadcast() → scheduleBots() von selbst weiter, mit natürlichen Pausen.)
function botPendingAction(room) {
  const g = room.game;
  if (!g || !g.phase || g.phase === "lobby" || room.botStuck) return null;
  for (let i = 0; i < g.players.length; i++) {
    if (!isBotIdx(room, i)) continue;
    const p = g.players[i];
    // 1) Zieh-Schlange zuerst: gezogene Karten entscheiden, sonst geht nichts weiter
    if ((p.freshDraw || []).some((c) => c.type !== "Ziel") && (g.phase === "draft" || g.phase === "seasonEnd")) return { i, kind: "fresh" };
    // 2) Saisonende: erst Aufbewahrung ausspielen, dann „Fertig“
    if (g.phase === "seasonEnd" && g.seTurn === i) return { i, kind: "seasonEnd" };
    if (g.phase !== "draft") continue;
    // 3) Draft je nach Modus
    if (g.mode === "turbo") {
      if (g.turboDiscard && g.turboDiscard[i]) return { i, kind: "discard" };
      if ((g.hands[i] || []).length > 0) return { i, kind: "turboPick" };
      const st = botBestStoredPlay(g, i, 16);
      if (st) return { i, kind: "storedPlay" };
    } else {
      if (g.awaitDiscard === i) return { i, kind: "discard" };
      if (g.show && g.show.cur === i) return { i, kind: "reveal" };
      if (g.show) continue; // gerade deckt jemand anderes auf – abwarten
      if ((g.hands[i] || []).length > 0 && !g.sim.ready[i]) return { i, kind: "simPick" };
      const st = botBestStoredPlay(g, i, 16);
      if (st) return { i, kind: "storedPlay" };
    }
  }
  return null;
}

// EINEN Bot-Zug ausführen. Liefert true, wenn gehandelt wurde.
function botApply(room) {
  const act = botPendingAction(room);
  if (!act) return false;
  const g = room.game;
  const i = act.i;
  let res = null;
  try {
    if (act.kind === "fresh") {
      const p = g.players[i];
      const card = (p.freshDraw || []).find((c) => c.type !== "Ziel");
      const realm = card.type === "Mitarbeiter" && card.kind === "land" ? botLandRealm(g, p) : null;
      const wantPlay = cardPlayable(card, p) && botScoreCard(g, i, card) >= 12;
      res = wantPlay
        ? handleFreshDecide(g, i, { cardId: card.id, action: "play", realm })
        : handleFreshDecide(g, i, { cardId: card.id, action: "keep" });
    } else if (act.kind === "simPick") {
      res = handleSimPick(g, i, botPickFrom(g, i, g.hands[i], g.mode === "schnell" && g.players.length === 2));
    } else if (act.kind === "reveal") {
      res = handleReveal(g, i);
    } else if (act.kind === "discard") {
      res = handleDiscard(g, i, { cardId: botWorstCardId(g, i, g.hands[i]) });
    } else if (act.kind === "turboPick") {
      res = handlePick(g, i, botPickFrom(g, i, g.hands[i], false));
    } else if (act.kind === "storedPlay") {
      const st = botBestStoredPlay(g, i, 16);
      res = st ? handlePick(g, i, { cardId: st.card.id, action: "play", realm: st.realm }) : { ok: true };
    } else if (act.kind === "seasonEnd") {
      const st = botBestStoredPlay(g, i, 10);
      res = st ? handlePick(g, i, { cardId: st.card.id, action: "play", realm: st.realm }) : handleSeasonDone(g, i);
    }
  } catch (e) {
    res = { err: String((e && e.message) || e) };
  }
  if (res && res.err) {
    room.botErr = (room.botErr || 0) + 1;
    if (room.botErr > 30) {
      room.botStuck = true;
      addLog(g, ["⚠️ Ein Bot ist durcheinander geraten – ihr könnt ohne ihn weiterspielen (bitte kurz melden)."]);
    }
  } else room.botErr = 0;
  return true;
}

// Bot-Zug mit kleiner Pause einplanen (fühlt sich an wie ein echter Mitspieler)
function scheduleBots(room) {
  if (room.botTimer || room.botStuck) return;
  if (!botPendingAction(room)) return;
  room.botTimer = setTimeout(() => {
    room.botTimer = null;
    botApply(room);
    broadcast(room);
  }, 700 + Math.floor(Math.random() * 900));
}

// ------------------------------- Räume -------------------------------------

const rooms = new Map();   // code → room
const tokenMap = new Map(); // token → { code, playerIdx }

const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
function makeCode() {
  let code;
  do {
    code = Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join("");
  } while (rooms.has(code));
  return code;
}

function mkRoom() {
  return { code: makeCode(), players: [], game: null, lastActivity: Date.now() };
}

const addLog = (g, lines) => { g.log = [...lines.slice().reverse(), ...g.log].slice(0, 40); };

// Öffentliche Spieleransicht (alles, was auf dem Tisch für alle sichtbar ist)
// Ziel-Anzahl und Menagerie sind PRIVAT – sie gehen nur an den Besitzer (siehe viewFor).
function publicPlayer(p, connected) {
  return {
    name: p.name, connected,
    coins: p.coins, hunters: p.hunters, credits: p.credits, trophies: p.trophies,
    lands: p.lands, distant: p.distant,
    seasonMonsters: p.seasonMonsters.map((m) => ({
      name: m.name, realm: m.realm, cost: m.cost, points: m.points, danger: m.danger || 0,
      paidTraum: m.paidTraum || 0, helperRealm: m.helperRealm || null, helperCount: m.helperCount || 0,
    })),
    staff: p.staff.map((s) => ({ name: s.name, text: s.text, cost: s.cost })),
  };
}

// Persönliche Sicht: NUR eigene Hand, Aufbewahrung und Ziele!
function viewFor(room, idx) {
  const g = room.game;
  const me = room.players[idx];
  const base = {
    t: "state",
    room: room.code,
    you: idx,
    isHost: idx === 0,
    phase: g ? g.phase : "lobby",
    gameId: (g && g.gameId) || 0,
    fanfare: (g && g.fanfare) || null,
    names: room.players.map((p) => ({ name: p.name, connected: p.connected, isBot: !!p.isBot })),
    seasons: room.seasons || (g && g.totalSeasons) || 4,
    mode: room.mode || "langsam",
  };
  if (!g || g.phase === "lobby") return base;
  const p = g.players[idx];
  return {
    ...base,
    season: g.season, seasonCard: g.seasonCard, totalSeasons: g.totalSeasons || 4,
    seasonName: SEASON_NAMES[g.seasonCard], seasonHint: seasonHint(g.seasonCard),
    bonusGiven: g.bonusGiven[idx],
    turn: g.turn, seTurn: g.seTurn,
    isYourTurn: g.phase === "draft" && g.turn === idx && me.connected,
    isYourSeasonTurn: g.phase === "seasonEnd" && g.seTurn === idx,
    awaitDiscard: g.awaitDiscard === null || g.awaitDiscard === undefined ? -1 : g.awaitDiscard,
    stackCount: (g.stack || []).length,
    openDiscards: g.openDiscards || [],
    // ⚡ Schnell & 🐢 Langsam: wer hat schon bestätigt? (nur ja/nein, keine Kartendetails)
    simReady: (g.mode === "schnell" || g.mode === "langsam") ? g.sim.ready.slice() : null,
    // ⚡/🐢: wer muss noch wählen? (für „Alle warten auf …“, sobald nur noch EINER überlegt)
    simWaiting: ((g.mode === "schnell" || g.mode === "langsam") && g.phase === "draft" && !g.show)
      ? g.players.map((_, i) => i).filter((i) => (g.hands[i] || []).length > 0 && !g.sim.ready[i])
      : [],
    mySimPick: (g.mode === "schnell" || g.mode === "langsam") ? g.sim.picks[idx] : null,
    // 🐢 Langsam: wer deckt gerade auf? (-1 = es wird noch verdeckt gewählt)
    showTurn: (g.mode === "langsam" && g.show) ? g.show.cur : -1,
    // 🚀 Turbo: persönlicher Ablage-Schritt + wartende Stapel
    turboDiscard: g.mode === "turbo" ? !!g.turboDiscard[idx] : false,
    incomingCount: g.mode === "turbo" ? (g.incoming[idx] || []).length : 0,
    players: g.players.map((pp, i) => publicPlayer(pp, room.players[i].connected)),
    // 2er-Regeln: Nach dem Weitergeben sieht man seinen alten Stapel NICHT mehr
    // (der Mitspieler wählt daraus noch). Erst nach der Rotation kommt die neue Hand.
    // ⚡ Schnell + offene Zieh-Karten: das neue Blatt bleibt verdeckt, bis entschieden!
    hand: (g.mode === "schnell" && (p.freshDraw || []).some((c) => c.type !== "Ziel"))
      ? []
      : (g.players.length === 2 && g.mode === "langsam" && g.passed && g.passed[idx] ? [] : g.hands[idx]),
    freshDraw: p.freshDraw || null,
    // Private Menagerie (abgeschlossene Saisons) – nur der Besitzer sieht sie,
    // Anzahl & Punkte-Summe kommen erst in der Schlusswertung raus.
    menagerie: p.monsters.map((m) => ({
      name: m.name, realm: m.realm, cost: m.cost, points: m.points, danger: m.danger || 0,
    })),
    stored: p.stored,
    goals: p.goals,
    log: g.log,
    dice: g.dice,
    reveal: g.reveal,
  };
}

function sendTo(ws, obj) {
  if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
}

function broadcast(room) {
  room.players.forEach((p, i) => sendTo(p.ws, viewFor(room, i)));
  scheduleBots(room); // 🤖 Bots handeln kurz danach von selbst
}

// ------------------------------ HTTP-Server ---------------------------------

const server = http.createServer((req, res) => {
  if (req.method === "GET" && (req.url === "/" || req.url === "/index.html")) {
    const file = path.join(__dirname, "public", "index.html");
    fs.readFile(file, (err, data) => {
      if (err) {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end("<h1>Carnival of Monsters Server</h1><p>Die Spielseite (public/index.html) wurde nicht gefunden.</p>");
        return;
      }
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(data);
    });
    return;
  }
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("ok");
    return;
  }
  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("not found");
});

// ---------------------------- WebSocket-Server -------------------------------

const wss = new WebSocketServer({ server });

wss.on("connection", (ws) => {
  ws.isAlive = true;
  ws.on("pong", () => { ws.isAlive = true; });
  let joined = null; // {room, idx}

  const reply = (obj) => sendTo(ws, obj);

  ws.on("message", (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    const room = joined ? joined.room : (msg.room ? rooms.get(String(msg.room).toUpperCase()) : null);
    if (joined && room) room.lastActivity = Date.now();

    try {
      switch (msg.t) {
        case "create": {
          const name = String(msg.name || "").trim().slice(0, 14) || "Spieler";
          const room0 = mkRoom();
          const token = crypto.randomBytes(16).toString("hex");
          room0.players.push({ name, ws, token, connected: true });
          room0.game = { phase: "lobby", log: [] };
          rooms.set(room0.code, room0);
          tokenMap.set(token, { code: room0.code, playerIdx: 0 });
          joined = { room: room0, idx: 0 };
          reply({ t: "token", token });
          broadcast(room0);
          break;
        }
        case "join": {
          const r = rooms.get(String(msg.room || "").toUpperCase());
          if (!r) return reply({ t: "error", msg: "Raum nicht gefunden. Code prüfen!" });
          if (r.game && r.game.phase !== "lobby") return reply({ t: "error", msg: "In diesem Raum läuft schon eine Partie." });
          if (r.players.length >= 5) return reply({ t: "error", msg: "Der Raum ist voll (max. 5)." });
          const name = String(msg.name || "").trim().slice(0, 14) || `Spieler ${r.players.length + 1}`;
          const token = crypto.randomBytes(16).toString("hex");
          r.players.push({ name, ws, token, connected: true });
          tokenMap.set(token, { code: r.code, playerIdx: r.players.length - 1 });
          joined = { room: r, idx: r.players.length - 1 };
          reply({ t: "token", token });
          broadcast(r);
          break;
        }
        case "resume": {
          const info = tokenMap.get(String(msg.token || ""));
          if (!info || !rooms.has(info.code)) return reply({ t: "error", msg: "Partie nicht mehr gefunden." });
          const r = rooms.get(info.code);
          if (r.players[info.playerIdx]) {
            r.players[info.playerIdx].ws = ws;
            r.players[info.playerIdx].connected = true;
          }
          joined = { room: r, idx: info.playerIdx };
          reply({ t: "token", token: msg.token });
          broadcast(r);
          break;
        }
        case "start": {
          if (!room || !joined || joined.idx !== 0 || !room.game) return;
          if (room.game.phase !== "lobby") return;
          const active = room.players.filter((p) => p.connected).length;
          if (active < 2) return reply({ t: "error", msg: "Es müssen mindestens 2 Spieler verbunden sein." });
          room.game = mkGame(room.players.map((p) => p.name), room.seasons || 4, room.mode || "langsam");
          addLog(room.game, [`🚀 Partie gestartet: ${room.players.map((p) => p.name).join(", ")} · ${room.seasons || 4} Saisons`]);
          broadcast(room);
          break;
        }
        case "setSeasons": {
          if (!room || !joined || joined.idx !== 0 || !room.game || room.game.phase !== "lobby") return;
          room.seasons = msg.seasons === 5 ? 5 : 4;
          broadcast(room);
          break;
        }
        // Spieltempo für die Partie (Host, vor dem Start): langsam | schnell | turbo
        case "setMode": {
          if (!room || !joined || joined.idx !== 0 || !room.game || room.game.phase !== "lobby") return;
          room.mode = ["langsam", "schnell", "turbo"].includes(msg.mode) ? msg.mode : "langsam";
          broadcast(room);
          break;
        }
        // 🤖 Bot hinzufügen / entfernen (nur Host, nur in der Lobby)
        case "addBot": {
          if (!room || !joined || joined.idx !== 0) return;
          const err = addBotToRoom(room);
          if (err) reply({ t: "error", msg: err });
          else broadcast(room);
          break;
        }
        case "removeBot": {
          if (!room || !joined || joined.idx !== 0) return;
          const err = removeBotFromRoom(room, msg.name);
          if (err) reply({ t: "error", msg: err });
          else broadcast(room);
          break;
        }
        // ⚡ Schnell: verdeckte Wahl abgeben – Ausführung erst, wenn alle bestätigt haben
        case "simPick": {
          if (!room || !room.game || !joined) return;
          const res = handleSimPick(room.game, joined.idx, msg);
          if (res && res.err) reply({ t: "error", msg: res.err });
          else broadcast(room);
          break;
        }
        // 🐢 Langsam: die eigene verdeckte Wahl selbst aufdecken (nacheinander, wie am Tisch)
        case "reveal": {
          if (!room || !room.game || !joined) return;
          const res = handleReveal(room.game, joined.idx);
          if (res && res.err) reply({ t: "error", msg: res.err });
          else broadcast(room);
          break;
        }
        case "discard": {
          if (!room || !room.game || !joined) return;
          const res = handleDiscard(room.game, joined.idx, msg);
          if (res && res.err) reply({ t: "error", msg: res.err });
          else broadcast(room);
          break;
        }
        case "pick": {
          if (!room || !room.game || !joined) return;
          const res = handlePick(room.game, joined.idx, msg);
          if (res && res.err) reply({ t: "error", msg: res.err });
          else broadcast(room);
          break;
        }
        // 🃏 Zieh-Schlange: einzeln über jede gezogene Karte entscheiden
        case "freshDecide": {
          if (!room || !room.game || !joined) return;
          const res = handleFreshDecide(room.game, joined.idx, msg);
          if (res && res.err) reply({ t: "error", msg: res.err });
          else broadcast(room);
          break;
        }
        // Gezogene Ziele zur Kenntnis nehmen (aus der Anzeige entfernen)
        case "freshClear": {
          if (!room || !room.game || !joined) return;
          const p = room.game.players[joined.idx];
          if (p && p.freshDraw) p.freshDraw = p.freshDraw.filter((c) => c.type !== "Ziel");
          broadcast(room);
          break;
        }
        case "seasonDone": {
          if (!room || !room.game || !joined) return;
          const res = handleSeasonDone(room.game, joined.idx);
          if (res && res.err) reply({ t: "error", msg: res.err });
          else broadcast(room);
          break;
        }
        case "next": {
          if (!room || !room.game || !joined) return;
          const res = handleNext(room.game);
          if (res && res.err) reply({ t: "error", msg: res.err });
          else broadcast(room);
          break;
        }
        // 🔄 Host: laufende Partie abbrechen und zurück in die Lobby (ohne sie zu Ende zu spielen)
        case "newGame": {
          if (!room || !joined || joined.idx !== 0 || !room.game) return;
          if (room.game.phase === "lobby") return;
          room.game = { phase: "lobby", log: [] };
          broadcast(room);
          break;
        }
        case "rematch": {
          if (!room || !joined || joined.idx !== 0) return;
          if (!room.game || (room.game.phase !== "reveal" && room.game.phase !== "lobby")) return;
          room.game = mkGame(room.players.map((p) => p.name), room.seasons || (room.game.totalSeasons || 4), room.mode || room.game.mode || "langsam");
          broadcast(room);
          break;
        }
        case "chat": {
          if (!room || !joined) return;
          const text = String(msg.text || "").slice(0, 200);
          if (!text.trim() || !room.game) return;
          addLog(room.game, [`💬 ${room.players[joined.idx].name}: ${text}`]);
          broadcast(room);
          break;
        }
      }
    } catch (e) {
      console.error("Fehler bei Nachricht:", e);
      reply({ t: "error", msg: "Interner Fehler – versuch es nochmal." });
    }
  });

  ws.on("close", () => {
    if (joined) {
      joined.room.players[joined.idx].connected = false;
      joined.room.players[joined.idx].ws = null;
      if (joined.room.game) addLog(joined.room.game, [`❌ ${joined.room.players[joined.idx].name} hat die Verbindung verloren – wartet auf Rückkehr…`]);
      broadcast(joined.room);
    }
  });
});

// Herzschlag (hält Verbindungen z. B. hinter Proxys am Leben)
setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

// Aufräumen: Räume ohne Verbindung nach 2 Stunden entfernen
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (now - room.lastActivity > 2 * 60 * 60 * 1000) {
      if (room.botTimer) clearTimeout(room.botTimer);
      room.players.forEach((p) => p.token && tokenMap.delete(p.token));
      rooms.delete(code);
    }
  }
}, 5 * 60 * 1000);

server.listen(PORT, () => {
  console.log(`🎡 Carnival of Monsters Server läuft auf Port ${PORT}`);
});
