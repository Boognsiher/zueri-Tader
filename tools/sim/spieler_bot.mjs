// Ein einfacher Bot spielt das Spiel ohne Oberfläche und zeigt, wie schnell Vermögen und Rang wachsen.
// Er dient zum Abstimmen der Spielzeit bis zum Ziel (data/ziel.json), nicht als Gegner. Strategie:
// Schiffe kaufen und auf freien Handel stellen, die ertragreichsten Betriebe kaufen und ausbauen,
// Ratssitze kaufen, Seen erschliessen und dort ebenfalls Schiffe und Betriebe aufbauen.
// Der Bot erhält Kontore ohne Baumaterial (vereinfacht) und kennt keine Verbindungen.
//
// Aufruf:  node tools/sim/spieler_bot.mjs [Tage] [Seed]     (Standard 8000 Tage, Seed 1)
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { ladeDaten } from "../../game/src/daten.js";
import { Spiel } from "../../game/src/spiel.js";
import { starteFrei, aktiv } from "../../game/src/automatik.js";

const DATA = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "data");
const D = await ladeDaten(async (datei) => JSON.parse(await readFile(path.join(DATA, datei), "utf-8")));
const TAGE = Number(process.argv[2] ?? 8000);
const spiel = new Spiel(D, Number(process.argv[3] ?? 1));
const a = spiel.ausbau;
const f = (n) => Math.round(n).toLocaleString("de-CH");

// Bürgt vor Ort: ein Kontor ohne Baumaterial (der Bot lässt das Bauen aus)
function praesenz(stadt) {
  if (!a.vorOrt(stadt)) a.kontore[stadt.name] = { stufe: 1, lager: {}, regeln: {}, sperren: {} };
}

function kaufeSchiff(stadt) {
  praesenz(stadt);
  const schiff = spiel.werft.kaufeNeu(stadt, "nauen");
  if (!schiff) return false;
  const einsatz = Math.max(2000, Math.min(12000, Math.round(spiel.gulden / 3 / 500) * 500));
  starteFrei(spiel, schiff, einsatz);
  return true;
}

function investiere() {
  const reserve = 3000;
  for (let runde = 0; runde < 12; runde++) {
    const frei = spiel.gulden - reserve;
    if (frei < 2500) return;
    // Betriebe der Städte in offenen Zonen: bester Tagesgewinn je Gulden
    let beste = null;
    for (const b of a.betriebe) {
      const stadt = spiel.welt.stadt[b.stadt];
      if (b.besitzer === "spieler" || !spiel.zonen.offen(stadt.zone)) continue;
      const preis = a.kaufpreisBetrieb(b);
      if (preis > frei) continue;
      const rate = (a.tagesgewinn(b.typ, stadt) * (b.stufe ?? 1)) / preis;
      if (rate > 0 && (!beste || rate > beste.rate)) beste = { b, rate, preis };
    }
    // Betriebe ausbauen
    let ausbau = null;
    for (const b of a.eigene()) {
      if (a.pruefeBetriebsausbau(b)) continue;
      const stadt = spiel.welt.stadt[b.stadt];
      const k = a.baukosten(b.typ, stadt);
      const rate = a.tagesgewinn(b.typ, stadt) / Math.max(1, k.gulden);
      if (k.gulden <= frei && (!ausbau || rate > ausbau.rate)) ausbau = { b, rate };
    }
    // Schiff: nur, solange es sich lohnt (nicht mehr als 1 Schiff je 500 Einwohner einer offenen Zone)
    const einwohner = spiel.welt.staedte.filter((s) => spiel.zonen.offen(s.zone)).reduce((x, s) => x + s.einwohner, 0);
    const schiffeOk = spiel.schiffe.length < einwohner / 600 && frei >= 20000;
    const schiffRate = 90 / 20000;
    const wahl = [
      beste && { art: "betrieb", rate: beste.rate, tun: () => (praesenz(spiel.welt.stadt[beste.b.stadt]), a.kaufen(beste.b)) },
      ausbau && { art: "ausbau", rate: ausbau.rate, tun: () => a.betriebAusbauen(ausbau.b) },
      schiffeOk && { art: "schiff", rate: schiffRate, tun: () => kaufeSchiff(spiel.welt.stadt["Zürich"]) },
    ].filter(Boolean).sort((x, y) => y.rate - x.rate)[0];
    if (!wahl || !wahl.tun()) return;
  }
}

function sitzeUndSeen() {
  const z = spiel.ziel;
  // Ratssitze: den billigsten möglichen kaufen, wenn er höchstens einen Teil des Bargelds kostet
  const moeglich = spiel.welt.staedte.filter((s) => spiel.zonen.offen(s.zone)).map((s) => ({ s, preis: z.preis(s) })).sort((x, y) => x.preis - y.preis);
  for (const { s, preis } of moeglich) {
    if (!z.hatSitz(s) && preis < spiel.gulden * 0.4) {
      praesenz(s);
      if (z.kaufeRatssitz(s)) break;
    }
  }
  // Seen erschliessen
  for (const zone of D.zonen.zonen) {
    if (spiel.zonen.offen(zone.id)) continue;
    if (spiel.ziel.rangIndex < zone.rang || spiel.gulden < zone.erschliessung * 1.5) continue;
    if (spiel.zonen.zugaenge(zone.id).length === 0) {
      // Brückenkopf-Kontor am anderen Ende einer Verbindung einrichten (vereinfacht)
      for (const v of D.zonen.verbindungen) for (const n of [v.von, v.nach]) {
        const stadt = spiel.welt.stadt[n];
        if (spiel.zonen.offen(stadt.zone) && !a.kontor(stadt) && spiel.zonen.zone(spiel.welt.stadt[n === v.von ? v.nach : v.von].zone).id === zone.id) praesenz(stadt);
      }
    }
    if (spiel.gulden > zone.erschliessung * 1.5 && !spiel.zonen.pruefeErschliessen(zone.id)) {
      spiel.zonen.erschliesse(zone.id);
      const stadt = D.staedte.filter((s) => s.zone === zone.id).map((s) => spiel.welt.stadt[s.name]).find((s) => spiel.werft.istWerft(s));
      if (stadt) kaufeSchiff(stadt);
    }
  }
}

kaufeSchiff(spiel.welt.stadt["Zürich"]) || starteFrei(spiel, spiel.schiffe[0], 6000);
if (!aktiv(spiel.schiffe[0])) starteFrei(spiel, spiel.schiffe[0], 6000);
let letzterRang = -1;
const t0 = Date.now();
console.log("Tag  Jahr  Bargeld  Vermögen  Schiffe Betriebe Sitze Seen Rang");
for (let tag = 1; tag <= TAGE; tag++) {
  spiel.tagVoran();
  for (const s of spiel.schiffe) if (!aktiv(s) && spiel.imHafen(s)) starteFrei(spiel, s, 8000);
  if (tag % 10 === 0) {
    investiere();
    sitzeUndSeen();
  }
  const z = spiel.ziel;
  if (z.rangIndex !== letzterRang || tag % 250 === 0) {
    letzterRang = z.rangIndex;
    console.log(`${String(tag).padStart(5)} ${spiel.welt.jahr().toFixed(1)} ${f(spiel.gulden).padStart(10)} ${f(z.vermoegen()).padStart(11)} ${String(spiel.schiffe.length).padStart(5)} ${String(a.eigene().length).padStart(6)} ${String(z.sitze.length).padStart(5)} ${String(spiel.zonen.erschlossen.length).padStart(4)}  ${z.rang.name}`);
  }
}
console.log(`fertig in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
