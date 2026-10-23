// Seekarte des Zürichsees als SVG: Ufer, Flüsse, Städte, Schiffe.
// Alle Formen kommen aus data/karte.json und data/cities.json, hier steht nur die Darstellung.
// Klicks auf den See, auf Städte und auf eigene Schiffe gehen an die Oberfläche.

import { punktAufWeg, weglaenge } from "./navigation.js";
import { Kamera } from "./kamera.js";

const NS = "http://www.w3.org/2000/svg";
const BOOT_MASSSTAB = 0.6; // Symbolgrösse der eigenen Schiffe, mal der Grösse des Schiffstyps
const HAENDLER_MASSSTAB = 0.5; // Symbolgrösse der KI-Händler (alle fahren als Nauen)

function el(name, attrs = {}, eltern = null) {
  const e = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (eltern) eltern.appendChild(e);
  return e;
}

// Glatte, geschlossene Kurve durch die Punkte (Catmull-Rom als Bézier)
function glatt(punkte, geschlossen = true) {
  const n = punkte.length;
  const p = (i) => punkte[geschlossen ? (i + n) % n : Math.max(0, Math.min(n - 1, i))];
  let d = `M${p(0)[0]},${p(0)[1]}`;
  const ende = geschlossen ? n : n - 1;
  for (let i = 0; i < ende; i++) {
    const [p0, p1, p2, p3] = [p(i - 1), p(i), p(i + 1), p(i + 2)];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0].toFixed(2)},${c1[1].toFixed(2)} ${c2[0].toFixed(2)},${c2[1].toFixed(2)} ${p2[0]},${p2[1]}`;
  }
  return geschlossen ? d + "Z" : d;
}

// Eigene, schlichte Schiffssymbole, nach Schiffstyp verschieden (Bug rechts, Wasserlinie bei y = 0).
// Jeder Typ ist an Umriss und Takelage erkennbar, auch wenn er nur wenige Pixel gross ist.
const SYMBOLE = {
  // Kleiner, flacher Kahn mit einem Dreieckssegel
  weidling: (g) => {
    el("path", { d: "M-1.4,-0.2 Q0,0.15 1.4,-0.2 L0.9,0.6 L-0.9,0.6 Z", class: "rumpf" }, g);
    el("path", { d: "M-0.06,0 L-0.06,-1.9 L0.06,-1.9 L0.06,0 Z", class: "mast" }, g);
    el("path", { d: "M0.1,-1.85 L1.15,-0.3 L0.1,-0.3 Z", class: "segel" }, g);
  },
  // Das übliche Lastschiff mit Rahsegel
  nauen: (g) => {
    el("path", { d: "M-1.5,0 L1.5,0 L1.1,0.75 L-1.1,0.75 Z", class: "rumpf" }, g);
    el("path", { d: "M-0.08,0 L-0.08,-2.3 L0.08,-2.3 L0.08,0 Z", class: "mast" }, g);
    el("path", { d: "M-0.95,-2.0 Q0,-1.75 0.95,-2.0 L0.85,-0.45 Q0,-0.25 -0.85,-0.45 Z", class: "segel" }, g);
    el("path", { d: "M0.08,-2.3 L0.9,-2.55 L0.08,-2.75 Z", class: "wimpel" }, g);
  },
  // Langes, flaches Lastschiff mit Ladung an Deck und zwei kleineren Rahsegeln
  ledischiff: (g) => {
    el("path", { d: "M-2.1,0 L2.1,0 L1.7,0.8 L-1.7,0.8 Z", class: "rumpf" }, g);
    el("rect", { x: -0.6, y: -0.55, width: 1.2, height: 0.55, class: "kiste" }, g);
    el("rect", { x: -1.9, y: -0.7, width: 0.9, height: 0.7, class: "kajuete" }, g);
    el("path", { d: "M-0.05,0 L-0.05,-1.9 L0.05,-1.9 L0.05,0 Z M1.1,0 L1.1,-1.6 L1.2,-1.6 L1.2,0 Z", class: "mast" }, g);
    el("path", { d: "M-0.7,-1.7 Q0.05,-1.5 0.8,-1.7 L0.7,-0.75 Q0.05,-0.6 -0.7,-0.75 Z", class: "segel" }, g);
    el("path", { d: "M0.65,-1.4 Q1.15,-1.25 1.65,-1.4 L1.6,-0.75 Q1.15,-0.65 0.7,-0.75 Z", class: "segel" }, g);
  },
  // Schlankes Ruder- und Segelboot mit Schilden an der Bordwand und Dreieckssegel
  wachtschiff: (g) => {
    el("path", { d: "M-1.9,-0.25 L-1.5,0 L1.5,0 L2.0,-0.3 L1.3,0.65 L-1.3,0.65 Z", class: "rumpf" }, g);
    el("path", { d: "M-1.2,0.3 L-1.7,1.2 M-0.4,0.35 L-0.8,1.3 M0.4,0.35 L0.1,1.3 M1.1,0.3 L0.8,1.2", class: "ruder" }, g);
    for (const x of [-0.9, -0.3, 0.3, 0.9]) el("circle", { cx: x, cy: 0.18, r: 0.2, class: "schild" }, g);
    el("path", { d: "M-0.06,-0.2 L-0.06,-2.1 L0.06,-2.1 L0.06,-0.2 Z", class: "mast" }, g);
    el("path", { d: "M0.1,-2.05 L1.5,-0.4 L0.1,-0.4 Z", class: "segel" }, g);
    el("path", { d: "M0.06,-2.1 L0.8,-2.3 L0.06,-2.5 Z", class: "wimpel" }, g);
  },
  // Nauen mit Brustwehr, Geschützpforten und zwei Masten
  kriegsnauen: (g) => {
    el("path", { d: "M-1.7,-0.45 L1.8,-0.45 L1.2,0.85 L-1.3,0.85 Z", class: "rumpf" }, g);
    el("path", { d: "M-1.7,-0.45 L-1.7,-0.75 L-1.35,-0.75 L-1.35,-0.45 M-0.9,-0.45 L-0.9,-0.75 L-0.55,-0.75 L-0.55,-0.45 M-0.1,-0.45 L-0.1,-0.75 L0.25,-0.75 L0.25,-0.45 M0.7,-0.45 L0.7,-0.75 L1.05,-0.75 L1.05,-0.45", class: "brustwehr" }, g);
    for (const x of [-0.8, -0.1, 0.6]) el("rect", { x: x - 0.17, y: 0.1, width: 0.34, height: 0.28, class: "pforte" }, g);
    el("path", { d: "M-0.5,-0.45 L-0.5,-2.6 L-0.38,-2.6 L-0.38,-0.45 Z M0.85,-0.45 L0.85,-2.0 L0.97,-2.0 L0.97,-0.45 Z", class: "mast" }, g);
    el("path", { d: "M-1.15,-2.35 Q-0.44,-2.1 0.27,-2.35 L0.2,-0.95 Q-0.44,-0.8 -1.08,-0.95 Z", class: "segel" }, g);
    el("path", { d: "M0.4,-1.85 Q0.91,-1.7 1.42,-1.85 L1.37,-0.95 Q0.91,-0.85 0.45,-0.95 Z", class: "segel" }, g);
    el("path", { d: "M-0.38,-2.6 L0.4,-2.85 L-0.38,-3.05 Z", class: "wimpel" }, g);
  },
};

// Dampf- und Motorschiffe: Rumpf, Aufbauten und Schlot (Bug rechts)
Object.assign(SYMBOLE, {
  // Raddampfer: hoher Schlot mit Rauch, Radkasten an der Seite
  raddampfer: (g) => {
    el("path", { d: "M-2.0,0 L2.0,0 L1.6,0.8 L-1.6,0.8 Z", class: "rumpf" }, g);
    el("rect", { x: -1.0, y: -0.9, width: 1.8, height: 0.9, class: "kajuete" }, g);
    el("path", { d: "M-0.35,-0.9 L-0.35,-2.4 L0.15,-2.4 L0.15,-0.9 Z", class: "schlot" }, g);
    el("path", { d: "M-0.1,-2.5 q0.5,-0.6 1.2,-0.3 q0.6,0.2 1.1,-0.4", class: "rauch" }, g);
    el("circle", { cx: -0.2, cy: 0.35, r: 0.55, class: "rad" }, g);
  },
  schraubendampfer: (g) => {
    el("path", { d: "M-2.3,0 L2.3,0 L1.9,0.85 L-1.9,0.85 Z", class: "rumpf" }, g);
    el("rect", { x: -0.2, y: -0.85, width: 1.6, height: 0.85, class: "kajuete" }, g);
    el("path", { d: "M0.1,-0.85 L0.1,-2.2 L0.6,-2.2 L0.6,-0.85 Z", class: "schlot" }, g);
    el("path", { d: "M0.35,-2.3 q0.5,-0.6 1.2,-0.3", class: "rauch" }, g);
    el("rect", { x: -1.7, y: -0.5, width: 1.1, height: 0.5, class: "kiste" }, g);
  },
  motorschiff: (g) => {
    el("path", { d: "M-2.4,0 L2.5,0 L2.0,0.85 L-2.0,0.85 Z", class: "rumpf" }, g);
    el("rect", { x: -2.0, y: -1.15, width: 1.1, height: 1.15, class: "kajuete" }, g);
    el("rect", { x: -1.8, y: -1.7, width: 0.7, height: 0.55, class: "kajuete" }, g);
    el("rect", { x: -0.6, y: -0.6, width: 2.4, height: 0.6, class: "kiste" }, g);
    el("path", { d: "M-1.55,-1.7 L-1.55,-2.3", class: "mast" }, g);
  },
  containerschiff: (g) => {
    el("path", { d: "M-2.6,0 L2.7,0 L2.2,0.85 L-2.2,0.85 Z", class: "rumpf" }, g);
    el("rect", { x: -2.2, y: -1.3, width: 0.9, height: 1.3, class: "kajuete" }, g);
    for (const [x, y, w] of [[-0.9, -0.55, 0.8], [0, -0.55, 0.8], [0.9, -0.55, 0.8], [1.8, -0.55, 0.5], [-0.45, -1.1, 0.8], [0.45, -1.1, 0.8]]) el("rect", { x, y, width: w, height: 0.55, class: "kiste" }, g);
  },
  dampfwachboot: (g) => {
    el("path", { d: "M-1.8,0 L1.9,-0.1 L1.4,0.65 L-1.4,0.65 Z", class: "rumpf" }, g);
    el("rect", { x: -0.6, y: -0.7, width: 1.0, height: 0.7, class: "kajuete" }, g);
    el("path", { d: "M-0.1,-0.7 L-0.1,-1.7 L0.3,-1.7 L0.3,-0.7 Z", class: "schlot" }, g);
    el("path", { d: "M0.1,-1.8 q0.4,-0.5 1.0,-0.2", class: "rauch" }, g);
    el("path", { d: "M0.9,-0.1 L1.5,-0.5", class: "ruder" }, g);
  },
  patrouillenboot: (g) => {
    el("path", { d: "M-1.7,0 L2.1,-0.15 L1.6,0.6 L-1.3,0.6 Z", class: "rumpf" }, g);
    el("rect", { x: -0.7, y: -0.65, width: 1.1, height: 0.65, class: "kajuete" }, g);
    el("path", { d: "M-0.2,-0.65 L-0.2,-1.5", class: "mast" }, g);
    el("path", { d: "M1.0,-0.1 L1.7,-0.55", class: "ruder" }, g);
  },
  kanonenboot: (g) => {
    el("path", { d: "M-2.2,-0.1 L2.3,-0.1 L1.8,0.85 L-1.8,0.85 Z", class: "rumpf" }, g);
    el("path", { d: "M-1.5,-0.1 L-1.5,-0.6 L1.5,-0.6 L1.5,-0.1", class: "brustwehr" }, g);
    el("path", { d: "M-0.3,-0.6 L-0.3,-1.9 L0.2,-1.9 L0.2,-0.6 Z", class: "schlot" }, g);
    el("path", { d: "M0.0,-2.0 q0.5,-0.6 1.2,-0.3", class: "rauch" }, g);
    el("path", { d: "M1.0,-0.6 L2.0,-0.9", class: "ruder" }, g);
    el("rect", { x: -1.1, y: 0.15, width: 0.34, height: 0.28, class: "pforte" }, g);
    el("rect", { x: 0.7, y: 0.15, width: 0.34, height: 0.28, class: "pforte" }, g);
  },
});

// Landfahrzeuge (Bug rechts, Standlinie bei y = 0.8)
Object.assign(SYMBOLE, {
  fuhrwerk: (g) => {
    el("path", { d: "M-1.6,-0.2 L1.4,-0.2 L1.2,0.45 L-1.6,0.45 Z", class: "rumpf" }, g);
    el("path", { d: "M-1.3,-0.2 Q0,-1.7 1.2,-0.2 Z", class: "segel" }, g);
    el("circle", { cx: -0.9, cy: 0.55, r: 0.45, class: "rad" }, g);
    el("circle", { cx: 0.7, cy: 0.55, r: 0.45, class: "rad" }, g);
    el("path", { d: "M1.4,0.1 L2.3,0.0 L2.5,-0.4", class: "ruder" }, g);
  },
  frachtwagen: (g) => {
    el("path", { d: "M-1.9,-0.3 L1.5,-0.3 L1.3,0.45 L-1.9,0.45 Z", class: "rumpf" }, g);
    el("path", { d: "M-1.6,-0.3 Q-0.2,-1.9 1.3,-0.3 Z", class: "segel" }, g);
    for (const x of [-1.1, 0.8]) el("circle", { cx: x, cy: 0.55, r: 0.5, class: "rad" }, g);
    el("path", { d: "M1.5,0.1 L2.6,0.0 L2.9,-0.5", class: "ruder" }, g);
  },
  gueterzug: (g) => {
    el("rect", { x: -2.8, y: -0.5, width: 1.3, height: 1.0, class: "kiste" }, g);
    el("rect", { x: -1.4, y: -0.5, width: 1.3, height: 1.0, class: "kiste" }, g);
    el("path", { d: "M0.0,0.5 L0.0,-0.9 L1.6,-0.9 L1.6,0.5 Z", class: "rumpf" }, g);
    el("path", { d: "M1.0,-0.9 L1.0,-1.6 L1.4,-1.6 L1.4,-0.9 Z", class: "schlot" }, g);
    el("path", { d: "M1.2,-1.7 q0.5,-0.5 1.1,-0.2", class: "rauch" }, g);
    for (const x of [-2.2, -0.8, 0.3, 1.2]) el("circle", { cx: x, cy: 0.62, r: 0.3, class: "rad" }, g);
  },
  lkw: (g) => {
    el("rect", { x: -2.0, y: -0.9, width: 2.6, height: 1.2, class: "kiste" }, g);
    el("path", { d: "M0.7,0.3 L0.7,-0.6 L1.5,-0.6 L1.9,-0.1 L1.9,0.3 Z", class: "kajuete" }, g);
    for (const x of [-1.3, 0.2, 1.2]) el("circle", { cx: x, cy: 0.5, r: 0.38, class: "rad" }, g);
  },
  sattelzug: (g) => {
    el("rect", { x: -3.0, y: -1.0, width: 3.5, height: 1.3, class: "kiste" }, g);
    el("path", { d: "M0.7,0.3 L0.7,-0.7 L1.6,-0.7 L2.1,-0.1 L2.1,0.3 Z", class: "kajuete" }, g);
    for (const x of [-2.3, -1.6, 0.0, 1.5]) el("circle", { cx: x, cy: 0.5, r: 0.38, class: "rad" }, g);
  },
});

// Schiffssymbol des Typs typ (Standard: Nauen) in einer eigenen Gruppe
export function bootSymbol(eltern, klasse, typ = "nauen") {
  const g = el("g", { class: klasse }, eltern);
  const inhalt = el("g", { class: "boot-koerper" }, g);
  (SYMBOLE[typ] ?? SYMBOLE.nauen)(inhalt);
  return g;
}

export class Karte {
  constructor(svg, spiel, rueckrufe) {
    this.svg = svg;
    this.spiel = spiel;
    this.D = spiel.D;
    this.rueckrufe = rueckrufe; // { stadt(stadt), schiff(schiff), see([x, y]) }
    this.auswahl = { stadt: null, schiff: null };
    this.baue();
    this.baueKamera();
  }

  // Kamera mit Knöpfen: heran, weg, ganze Karte, Schiff verfolgen
  baueKamera() {
    const knoepfe = document.createElement("div");
    knoepfe.className = "kamerakasten";
    const knopf = (text, titel, tat) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = text;
      b.title = titel;
      b.setAttribute("aria-label", titel);
      b.addEventListener("click", tat);
      knoepfe.appendChild(b);
      return b;
    };
    this.kamera = new Kamera(this.svg, this.D.zonen.welt, (an) => {
      this.verfolgenKnopf.classList.toggle("an", an);
      this.verfolgenKnopf.setAttribute("aria-pressed", String(an));
    });
    knopf("+", "Karte vergrössern", () => this.kamera.zoomeUm(1.6));
    knopf("−", "Karte verkleinern", () => this.kamera.zoomeUm(1 / 1.6));
    knopf("⤢", "Ganzen See zeigen", () => this.zeigeZone(this.sichtZone));
    this.verfolgenKnopf = knopf("◎", "Gewähltes Schiff verfolgen", () => {
      const s = this.auswahl.schiff;
      if (s) this.kamera.fokussiere(...this.schiffspunkt(s));
    });
    this.verfolgenKnopf.setAttribute("aria-pressed", "false");
    this.svg.parentElement.appendChild(knoepfe);

    // Zonenwahl: springt zu einem See (die Seen liegen schematisch nebeneinander)
    const wahl = document.createElement("select");
    wahl.className = "zonenwahl";
    wahl.setAttribute("aria-label", "See wählen");
    wahl.addEventListener("change", () => this.zeigeZone(wahl.value));
    this.zonenwahl = wahl;
    this.svg.parentElement.appendChild(wahl);
    this.fuelleZonenwahl();
    const start = this.spiel.schiffe[0];
    this.sichtZone = null;
    this.zeigeZone((start.ort ?? this.spiel.naechsteStadt(start.pos)).zone);
  }

  // Alle Seen in der Auswahl; noch nicht erschlossene mit Schloss
  fuelleZonenwahl() {
    const z = this.spiel.zonen;
    const bisher = this.zonenwahl.value;
    this.zonenwahl.innerHTML = this.D.zonen.zonen
      .map((zone) => `<option value="${zone.id}">${z.offen(zone.id) ? "" : "🔒 "}${zone.name}</option>`)
      .join("");
    if (bisher) this.zonenwahl.value = bisher;
  }

  zeigeZone(id) {
    const zone = this.D.zonen.zonen.find((x) => x.id === id) ?? this.D.zonen.zonen[0];
    this.sichtZone = zone.id;
    this.zonenwahl.value = zone.id;
    this.kamera.zeige(zone.mitte[0], zone.mitte[1], zone.breite, zone.hoehe);
  }

  // Ungefähre Lage eines Schiffs (im Hafen: die Stadt)
  schiffspunkt(schiff) {
    if (this.spiel.imHafen(schiff)) return schiff.ort.pos;
    const { x, y } = this.spiel.position(schiff);
    return [x, y];
  }

  baue() {
    const svg = this.svg;
    const D = this.D;
    const W = D.zonen.welt;
    if (!this.kamera) svg.setAttribute("viewBox", `${W.x} ${W.y} ${W.b} ${W.h}`);
    svg.innerHTML = "";
    if (!this.klickBereit) {
      // Klick auf die Karte (nicht auf Stadt oder Schiff): Ziel auf dem See
      svg.addEventListener("click", (e) => {
        const pt = svg.createSVGPoint();
        pt.x = e.clientX;
        pt.y = e.clientY;
        const p = pt.matrixTransform(svg.getScreenCTM().inverse());
        this.rueckrufe.see([p.x, p.y]);
      });
      this.klickBereit = true;
    }

    const defs = el("defs", {}, svg);
    const wellen = el("pattern", { id: "wellen", width: 6, height: 3, patternUnits: "userSpaceOnUse" }, defs);
    el("path", { d: "M0,1.5 q1.5,-0.8 3,0 t3,0", class: "welle" }, wellen);
    const papier = el("radialGradient", { id: "papier", cx: "50%", cy: "45%", r: "75%" }, defs);
    el("stop", { offset: "0%", class: "papier-hell" }, papier);
    el("stop", { offset: "100%", class: "papier-dunkel" }, papier);

    el("rect", { x: W.x, y: W.y, width: W.b, height: W.h, fill: "url(#papier)" }, svg);

    // Hügel als einfache Schraffur bei den Bergnamen
    const land = el("g", { class: "land" }, svg);
    for (const b of D.karte.beschriftungen.filter((b) => b.art === "berg")) {
      const [x, y] = b.position;
      for (const [dx, dy, s] of [[-3, 3.4, 1], [0, 2.8, 1.3], [3, 3.5, 0.9]]) {
        const w = 1.8 * s;
        el("path", { d: `M${x + dx - w},${y + dy} Q${x + dx},${y + dy - 2.2 * s} ${x + dx + w},${y + dy}`, class: "huegel" }, land);
      }
    }

    // Landzonen: Flächen, auf denen Fuhrwerke, Züge und Lastwagen fahren
    for (const t of Object.values(D.karte.landteile ?? {})) el("path", { d: glatt(t.ufer), class: "landflaeche" }, land);

    // Flüsse und kleine Seen (nur Darstellung, nicht befahrbar)
    for (const f of D.karte.fluesse) el("path", { d: glatt(f.linie, false), class: "fluss" }, land);
    for (const s of D.karte.kleine_seen ?? []) el("path", { d: glatt(s.ufer), class: "kleiner-see" }, land);

    // See: Uferstreifen und Uferlinie zuerst, das Wasser darüber. So verdeckt jeder Seeteil
    // die Uferlinie des anderen, wo sie sich überlappen, und nur der Aussenrand bleibt sichtbar.
    const see = el("g", { class: "see" }, svg);
    const teile = Object.values(D.karte.seeteile);
    for (const t of teile) el("path", { d: glatt(t.ufer), class: "uferstreifen" }, see);
    for (const t of teile) el("path", { d: glatt(t.ufer), class: "uferlinie" }, see);
    for (const t of teile) el("path", { d: glatt(t.ufer), class: "wasser" }, see);
    for (const t of teile) el("path", { d: glatt(t.ufer), class: "wasser-muster" }, see);
    for (const d of D.karte.durchfahrten) {
      const [x, y] = d.position;
      el("text", { x: x + 0.4, y: y + 5.2, class: "beschriftung klein" }, see).textContent = d.name;
      // Holzbrücke Rapperswil-Hurden, mit Durchlass in der Mitte
      el("path", { d: `M${x - 1.6},${y - 2.6} L${x - 0.3},${y - 0.6} M${x + 0.3},${y + 0.6} L${x + 1.4},${y + 2.4}`, class: "bruecke" }, see);
    }

    // Beschriftungen von Bergen, Flüssen, Seeteilen
    const schrift = el("g", {}, svg);
    for (const b of D.karte.beschriftungen) {
      el("text", { x: b.position[0], y: b.position[1], class: `beschriftung ${b.art}` }, schrift).textContent = b.text;
    }

    this.kartusche(svg);
    this.windrose(svg, 100, 21);

    this.ebeneKanal = el("g", { class: "kanaele" }, svg);
    this.gezeichneteKanaele = new Set();
    this.ebeneRoute = el("g", { class: "routen" }, svg);
    this.ebeneHaendler = el("g", { class: "haendler" }, svg);
    this.ebeneKrieg = el("g", { class: "kriegsschiffe" }, svg);
    this.ebeneStaedte = el("g", { class: "staedte" }, svg);
    this.ebeneSpieler = el("g", { class: "spieler" }, svg);

    this.stadtElemente = new Map();
    const unten = new Set(D.karte.beschriftung_unten || []);
    this.beschriftungUnten = unten;
    for (const stadt of this.spiel.welt.staedte) {
      const [x, y] = stadt.pos;
      const stand = this.spiel.diplomatie.vonStadt(stadt);
      const g = el("g", { class: "stadt", transform: `translate(${x},${y})`, tabindex: 0, role: "button", "aria-label": `${stadt.name} (${stand.name})`, style: `--stand: ${stand.farbe}` }, this.ebeneStaedte);
      el("circle", { r: 3.2, class: "klickflaeche" }, g);
      el("circle", { r: 2.6, class: "lichthof" }, g);
      el("path", { d: "M-1,0.6 L-1,-0.5 L0,-1.3 L1,-0.5 L1,0.6 Z", class: "haus" }, g);
      const dy = unten.has(stadt.name) ? 3.4 : -2.2;
      el("text", { y: dy, class: "stadtname" }, g).textContent = stadt.name;
      const info = el("text", { y: unten.has(stadt.name) ? 5.6 : -4.6, class: "stadtinfo" }, g);
      g.addEventListener("click", (e) => {
        e.stopPropagation();
        this.rueckrufe.stadt(stadt);
      });
      g.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          this.rueckrufe.stadt(stadt);
        }
      });
      this.stadtElemente.set(stadt, { g, info });
    }

    this.haendlerBoote = [];
    this.haendlerTypen = [];
    this.haendlerWege = new Map();
    this.spielerBoote = new Map();
    this.kriegsBoote = new Map();
  }

  kartusche(svg) {
    const g = el("g", { class: "kartusche" }, svg);
    el("rect", { x: 66, y: 1, width: 34, height: 8.6, rx: 1 }, g);
    el("rect", { x: 66.7, y: 1.7, width: 32.6, height: 7.2, rx: 0.6, class: "innen" }, g);
    el("text", { x: 83, y: 5.1, class: "titel" }, g).textContent = "Der Zürichsee";
    el("text", { x: 83, y: 7.9, class: "untertitel" }, g).textContent = "samt Obersee · Anno 1650";
  }

  windrose(svg, x, y) {
    const g = el("g", { class: "windrose", transform: `translate(${x},${y})` }, svg);
    el("circle", { r: 3.4, class: "ring" }, g);
    el("path", { d: "M0,-4.6 L0.9,0 L0,4.6 L-0.9,0 Z", class: "nadel" }, g);
    el("path", { d: "M-4.6,0 L0,0.9 L4.6,0 L0,-0.9 Z", class: "nadel hell" }, g);
    el("text", { y: -5.2, class: "himmelsrichtung" }, g).textContent = "N";
  }

  waehle(auswahl) {
    const vorher = this.auswahl.schiff;
    Object.assign(this.auswahl, auswahl);
    // Neues Schiff gewählt: Kamera holt es heran und verfolgt es; ohne Schiff endet die Verfolgung
    if (this.auswahl.schiff && this.auswahl.schiff !== vorher) {
      // Liegt das Schiff in einem anderen See, springt die Sicht dorthin
      const ort = this.auswahl.schiff.ort ?? this.spiel.naechsteStadt(this.auswahl.schiff.pos);
      if (ort.zone !== this.sichtZone) this.zeigeZone(ort.zone);
      this.kamera.fokussiere(...this.schiffspunkt(this.auswahl.schiff));
    }
    else if (!this.auswahl.schiff && vorher) this.kamera.setzeFolgen(false);
  }

  // Wird bei jedem Bild aufgerufen. anteil = Fortschritt im laufenden Tag (0..1).
  zeichne(anteil) {
    const welt = this.spiel.welt;
    const jetzt = welt.tag + anteil;

    // KI-Händler; mit der Bevölkerung kommen neue dazu, die bekommen hier ihr Schiff
    while (this.haendlerBoote.length < welt.haendler.length) {
      this.haendlerBoote.push(bootSymbol(this.ebeneHaendler, "haendlerboot"));
      this.haendlerTypen.push("nauen");
    }
    // Fremde Schiffe erscheinen nur in Sichtweite eigener Schiffe und Städte
    const sicht = this.spiel.sichtpunkte();
    welt.haendler.forEach((h, i) => {
      // In Landzonen fahren Fuhrwerke, später Wagen und Lastwagen, sonst Nauen
      const typ = this.D.zonen.zonen.find((z) => z.id === h.ort.zone)?.art === "land" ? (this.spiel.jahr() < 1830 ? "fuhrwerk" : this.spiel.jahr() < 1925 ? "frachtwagen" : "lkw") : "nauen";
      if (this.haendlerTypen[i] !== typ) {
        this.haendlerBoote[i].remove();
        this.haendlerBoote[i] = bootSymbol(this.ebeneHaendler, "haendlerboot", typ);
        this.haendlerTypen[i] = typ;
      }
      const boot = this.haendlerBoote[i];
      let x;
      let y;
      let links = i % 2 === 1; // im Hafen schauen die Schiffe abwechselnd nach links und rechts
      if (h.ziel) {
        let w = this.haendlerWege.get(h);
        if (!w || w.von !== h.ort || w.ziel !== h.ziel) {
          w = { von: h.ort, ziel: h.ziel, punkte: welt.weg(h.ort, h.ziel) };
          this.haendlerWege.set(h, w);
        }
        const t = (jetzt - h.abfahrt) / Math.max(1, h.ankunft - h.abfahrt);
        ({ x, y, links } = punktAufWeg(w.punkte, t));
      } else {
        // im Hafen: leicht verteilt um die Stadt
        const w = (i * 2.399) % (2 * Math.PI);
        x = h.ort.pos[0] + Math.cos(w) * 1.6;
        y = h.ort.pos[1] + Math.sin(w) * 1.1;
      }
      const zeigen = this.spiel.sichtbar(x, y, sicht);
      boot.style.display = zeigen ? "" : "none";
      if (!zeigen) return;
      boot.setAttribute("transform", `translate(${x.toFixed(2)},${y.toFixed(2)})`);
      boot.querySelector(".boot-koerper").setAttribute("transform", `scale(${links ? -HAENDLER_MASSSTAB : HAENDLER_MASSSTAB},${HAENDLER_MASSSTAB})`);
    });

    this.zeichneKriegsschiffe(sicht);

    // Schiffe des Spielers. Symbole von Schiffen, die es nicht mehr gibt (zur Flotte
    // zusammengelegt, verkauft, Flotte aufgelöst), werden entfernt.
    for (const [schiff, boot] of this.spielerBoote) {
      if (!this.spiel.schiffe.includes(schiff)) {
        boot.remove();
        this.spielerBoote.delete(schiff);
      }
    }
    const imHafen = new Map();
    for (const schiff of this.spiel.schiffe) {
      let boot = this.spielerBoote.get(schiff);
      if (!boot) {
        boot = bootSymbol(this.ebeneSpieler, "spielerboot", this.spiel.schiffstyp(schiff).id);
        el("circle", { r: 1.6, cy: -0.5, class: "klickflaeche" }, boot); // das kleine Symbol bleibt gut klickbar
        el("text", { y: 2.3, class: "bootname" }, boot);
        boot.addEventListener("click", (e) => {
          e.stopPropagation();
          this.rueckrufe.schiff(schiff);
        });
        this.spielerBoote.set(schiff, boot);
      }
      let x;
      let y;
      let links = false;
      if (!this.spiel.imHafen(schiff)) {
        ({ x, y, links } = this.spiel.position(schiff));
      } else {
        const n = imHafen.get(schiff.ort) ?? 0;
        imHafen.set(schiff.ort, n + 1);
        // im Hafen auf der Seite, wo der Stadtname nicht steht
        const unten = this.beschriftungUnten.has(schiff.ort.name);
        x = schiff.ort.pos[0] + (unten ? 2.6 : 2.1) + n * 2.8;
        y = schiff.ort.pos[1] + (unten ? -1.2 : 1.2);
      }
      boot.setAttribute("transform", `translate(${x.toFixed(2)},${y.toFixed(2)})`);
      if (schiff === this.auswahl.schiff) this.kamera.folge(x, y);
      const groesse = this.spiel.schiffstyp(schiff).groesse * BOOT_MASSSTAB;
      boot.querySelector(".boot-koerper").setAttribute("transform", `scale(${links ? -groesse : groesse},${groesse})`);
      const name = boot.querySelector(".bootname");
      const zeichen = (schiff.mitglieder ? ` ×${schiff.mitglieder.length}` : "") + (schiff.auto ? (schiff.auto.pausiert ? " ⏸" : " ⟳") : "");
      if (name.textContent !== schiff.name + zeichen) name.textContent = schiff.name + zeichen;
      name.setAttribute("y", (1 + 1.6 * groesse).toFixed(2));
      boot.classList.toggle("gewaehlt", schiff === this.auswahl.schiff);
    }
  }

  // Kriegsschiffe der Stände, in den Farben ihres Stands und nur in Sichtweite
  zeichneKriegsschiffe(sicht) {
    const kampf = this.spiel.kampf;
    for (const [s, boot] of this.kriegsBoote) {
      if (!kampf.schiffe.includes(s)) {
        boot.remove();
        this.kriegsBoote.delete(s);
      }
    }
    const imHafen = new Map();
    for (const s of kampf.schiffe) {
      let boot = this.kriegsBoote.get(s);
      const stand = this.D.fraktionen.nach[s.fraktion];
      if (!boot) {
        boot = bootSymbol(this.ebeneKrieg, "kriegsschiff", s.typ);
        boot.style.setProperty("--stand", stand.farbe);
        el("title", {}, boot);
        this.kriegsBoote.set(s, boot);
      }
      let x;
      let y;
      let links = false;
      if (s.ort && !s.fahrt) {
        const n = imHafen.get(s.ort) ?? 0;
        imHafen.set(s.ort, n + 1);
        x = s.ort.pos[0] - 2.2 - n * 1.6;
        y = s.ort.pos[1] + 0.9;
        links = true;
      } else {
        ({ x, y, links } = this.spiel.position(s));
      }
      const zeigen = this.spiel.sichtbar(x, y, sicht);
      boot.style.display = zeigen ? "" : "none";
      if (!zeigen) continue;
      const t = this.D.schiffe.typ[s.typ];
      const groesse = t.groesse * BOOT_MASSSTAB;
      boot.setAttribute("transform", `translate(${x.toFixed(2)},${y.toFixed(2)})`);
      boot.querySelector(".boot-koerper").setAttribute("transform", `scale(${links ? -groesse : groesse},${groesse})`);
      const feind = this.spiel.diplomatie.feindlich(s.fraktion);
      boot.classList.toggle("feind", feind);
      const titel = `${s.name} (${stand.name})${feind ? ", dir feindlich" : ""}`;
      const title = boot.querySelector("title");
      if (title.textContent !== titel) title.textContent = titel;
    }
  }

  // Wird nach jedem Tag und nach Aktionen aufgerufen: Auswahl, Fahrzeiten, Routen
  aktualisiere() {
    const spiel = this.spiel;
    // Fertige Kanäle erscheinen als Wasserstrassen zwischen den Zonen
    for (const k of spiel.zonen.alleStrecken()) {
      if (k.typ !== "kanal" || this.gezeichneteKanaele.has(k.id) || !spiel.zonen.kanalFertig(k)) continue;
      this.gezeichneteKanaele.add(k.id);
      el("path", { d: "M" + k.ufer.map((q) => q.join(",")).join(" L") + "Z", class: "kanal" }, this.ebeneKanal);
    }
    if (this.zonenAnzahl !== spiel.zonen.erschlossen.length) {
      this.zonenAnzahl = spiel.zonen.erschlossen.length;
      this.fuelleZonenwahl();
    }
    const welt = spiel.welt;
    const schiff = this.auswahl.schiff;
    const p = schiff ? spiel.position(schiff) : null;
    for (const [stadt, { g, info }] of this.stadtElemente) {
      g.classList.toggle("gewaehlt", stadt === this.auswahl.stadt);
      g.classList.toggle("gesperrt", stadt.gesperrt(welt.tag));
      g.classList.toggle("ereignis", stadt.ereignisse.length > 0);
      const feindlich = spiel.diplomatie.hafenGesperrt(stadt);
      g.classList.toggle("feindlich", feindlich);
      let text = "";
      if (schiff && !spiel.imHafen(schiff, stadt)) {
        if (stadt.gesperrt(welt.tag) || feindlich) {
          text = feindlich ? "feindlich" : "gesperrt";
        } else {
          const w = spiel.navFuer(schiff).route([p.x, p.y], stadt.pos);
          if (w) text = `${(Math.round((2 * weglaenge(w)) / spiel.tempo(schiff)) / 2).toLocaleString("de-CH")} T.`;
        }
      }
      info.textContent = text;
    }
    this.ebeneRoute.innerHTML = "";
    for (const s of spiel.schiffe) {
      if (!s.fahrt) continue;
      const w = s.fahrt.weg;
      const klasse = s === schiff ? "route gewaehlt" : "route";
      el("path", { d: "M" + w.map((q) => q.join(",")).join(" L"), class: klasse }, this.ebeneRoute);
      const [x, y] = w[w.length - 1];
      if (!s.fahrt.ziel) el("path", { d: `M${x - 0.8},${y - 0.8} L${x + 0.8},${y + 0.8} M${x - 0.8},${y + 0.8} L${x + 0.8},${y - 0.8}`, class: "zielkreuz" }, this.ebeneRoute);
    }
  }
}
