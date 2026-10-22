// Seekarte des Zürichsees als SVG: Ufer, Flüsse, Städte, Schiffe.
// Alle Formen kommen aus data/karte.json und data/cities.json, hier steht nur die Darstellung.
// Klicks auf den See, auf Städte und auf eigene Schiffe gehen an die Oberfläche.

import { punktAufWeg, weglaenge } from "./navigation.js";

const NS = "http://www.w3.org/2000/svg";

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

// Eigenes, schlichtes Symbol eines Lastseglers mit Rahsegel
function bootSymbol(eltern, klasse) {
  const g = el("g", { class: klasse }, eltern);
  const inhalt = el("g", { class: "boot-koerper" }, g);
  el("path", { d: "M-1.5,0 L1.5,0 L1.1,0.75 L-1.1,0.75 Z", class: "rumpf" }, inhalt);
  el("path", { d: "M-0.08,0 L-0.08,-2.3 L0.08,-2.3 L0.08,0 Z", class: "mast" }, inhalt);
  el("path", { d: "M-0.95,-2.0 Q0,-1.75 0.95,-2.0 L0.85,-0.45 Q0,-0.25 -0.85,-0.45 Z", class: "segel" }, inhalt);
  el("path", { d: "M0.08,-2.3 L0.9,-2.55 L0.08,-2.75 Z", class: "wimpel" }, inhalt);
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
  }

  baue() {
    const svg = this.svg;
    const D = this.D;
    svg.setAttribute("viewBox", "-3 -5 110 62");
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

    el("rect", { x: -3, y: -5, width: 110, height: 62, fill: "url(#papier)" }, svg);

    // Hügel als einfache Schraffur bei den Bergnamen
    const land = el("g", { class: "land" }, svg);
    for (const b of D.karte.beschriftungen.filter((b) => b.art === "berg")) {
      const [x, y] = b.position;
      for (const [dx, dy, s] of [[-3, 3.4, 1], [0, 2.8, 1.3], [3, 3.5, 0.9]]) {
        const w = 1.8 * s;
        el("path", { d: `M${x + dx - w},${y + dy} Q${x + dx},${y + dy - 2.2 * s} ${x + dx + w},${y + dy}`, class: "huegel" }, land);
      }
    }

    // Flüsse
    for (const f of D.karte.fluesse) el("path", { d: glatt(f.linie, false), class: "fluss" }, land);

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
    this.windrose(svg, 99, 7);

    this.ebeneRoute = el("g", { class: "routen" }, svg);
    this.ebeneHaendler = el("g", { class: "haendler" }, svg);
    this.ebeneStaedte = el("g", { class: "staedte" }, svg);
    this.ebeneSpieler = el("g", { class: "spieler" }, svg);

    this.stadtElemente = new Map();
    const unten = new Set(D.karte.beschriftung_unten || []);
    this.beschriftungUnten = unten;
    for (const stadt of this.spiel.welt.staedte) {
      const [x, y] = stadt.pos;
      const g = el("g", { class: "stadt", transform: `translate(${x},${y})`, tabindex: 0, role: "button", "aria-label": stadt.name }, this.ebeneStaedte);
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

    this.haendlerPunkte = this.spiel.welt.haendler.map(() => el("circle", { r: 0.5, class: "haendler-punkt" }, this.ebeneHaendler));
    this.haendlerWege = new Map();
    this.spielerBoote = new Map();
  }

  kartusche(svg) {
    const g = el("g", { class: "kartusche" }, svg);
    el("rect", { x: 56, y: -3.5, width: 32, height: 8.6, rx: 1 }, g);
    el("rect", { x: 56.7, y: -2.8, width: 30.6, height: 7.2, rx: 0.6, class: "innen" }, g);
    el("text", { x: 72, y: 0.6, class: "titel" }, g).textContent = "Der Zürichsee";
    el("text", { x: 72, y: 3.4, class: "untertitel" }, g).textContent = "samt Obersee · Anno 1650";
  }

  windrose(svg, x, y) {
    const g = el("g", { class: "windrose", transform: `translate(${x},${y})` }, svg);
    el("circle", { r: 3.4, class: "ring" }, g);
    el("path", { d: "M0,-4.6 L0.9,0 L0,4.6 L-0.9,0 Z", class: "nadel" }, g);
    el("path", { d: "M-4.6,0 L0,0.9 L4.6,0 L0,-0.9 Z", class: "nadel hell" }, g);
    el("text", { y: -5.2, class: "himmelsrichtung" }, g).textContent = "N";
  }

  waehle(auswahl) {
    Object.assign(this.auswahl, auswahl);
  }

  // Wird bei jedem Bild aufgerufen. anteil = Fortschritt im laufenden Tag (0..1).
  zeichne(anteil) {
    const welt = this.spiel.welt;
    const jetzt = welt.tag + anteil;

    // KI-Händler
    welt.haendler.forEach((h, i) => {
      const punkt = this.haendlerPunkte[i];
      let x;
      let y;
      if (h.ziel) {
        let w = this.haendlerWege.get(h);
        if (!w || w.von !== h.ort || w.ziel !== h.ziel) {
          w = { von: h.ort, ziel: h.ziel, punkte: welt.weg(h.ort, h.ziel) };
          this.haendlerWege.set(h, w);
        }
        const t = (jetzt - h.abfahrt) / Math.max(1, h.ankunft - h.abfahrt);
        ({ x, y } = punktAufWeg(w.punkte, t));
      } else {
        // im Hafen: leicht verteilt um die Stadt
        const w = (i * 2.399) % (2 * Math.PI);
        x = h.ort.pos[0] + Math.cos(w) * 1.6;
        y = h.ort.pos[1] + Math.sin(w) * 1.1;
      }
      punkt.setAttribute("cx", x.toFixed(2));
      punkt.setAttribute("cy", y.toFixed(2));
    });

    // Schiffe des Spielers
    const imHafen = new Map();
    for (const schiff of this.spiel.schiffe) {
      let boot = this.spielerBoote.get(schiff);
      if (!boot) {
        boot = bootSymbol(this.ebeneSpieler, "spielerboot");
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
        x = schiff.ort.pos[0] + (unten ? 3 : 2.4) + n * 3.2;
        y = schiff.ort.pos[1] + (unten ? -1.2 : 1.2);
      }
      boot.setAttribute("transform", `translate(${x.toFixed(2)},${y.toFixed(2)})`);
      const groesse = this.spiel.schiffstyp(schiff).groesse;
      boot.querySelector(".boot-koerper").setAttribute("transform", `scale(${links ? -groesse : groesse},${groesse})`);
      const name = boot.querySelector(".bootname");
      const zeichen = (schiff.mitglieder ? ` ×${schiff.mitglieder.length}` : "") + (schiff.auto ? (schiff.auto.pausiert ? " ⏸" : " ⟳") : "");
      if (name.textContent !== schiff.name + zeichen) name.textContent = schiff.name + zeichen;
      name.setAttribute("y", (2.3 * groesse).toFixed(2));
      boot.classList.toggle("gewaehlt", schiff === this.auswahl.schiff);
    }
  }

  // Wird nach jedem Tag und nach Aktionen aufgerufen: Auswahl, Fahrzeiten, Routen
  aktualisiere() {
    const spiel = this.spiel;
    const welt = spiel.welt;
    const schiff = this.auswahl.schiff;
    const p = schiff ? spiel.position(schiff) : null;
    for (const [stadt, { g, info }] of this.stadtElemente) {
      g.classList.toggle("gewaehlt", stadt === this.auswahl.stadt);
      g.classList.toggle("gesperrt", stadt.gesperrt(welt.tag));
      g.classList.toggle("ereignis", stadt.ereignisse.length > 0);
      let text = "";
      if (schiff && !spiel.imHafen(schiff, stadt)) {
        if (stadt.gesperrt(welt.tag)) {
          text = "gesperrt";
        } else {
          const w = spiel.nav.route([p.x, p.y], stadt.pos);
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
