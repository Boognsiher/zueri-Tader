// Kopfzeile, Seitenleiste (Flotte, Marktübersicht) und Handelsfenster.
// Liest den Spielzustand und ruft Spiel-Methoden auf, rechnet selbst nichts.
//
// Steuerung: Klick auf den See schickt das gewählte Schiff dorthin, Klick auf eine Stadt
// lässt es dort anlegen. Liegt es schon dort, öffnet sich das Handelsfenster.

import { weglaenge } from "./navigation.js";

const zahl = new Intl.NumberFormat("de-CH", { maximumFractionDigits: 0 });
const f = (n) => zahl.format(Math.round(n));

function esc(text) {
  return String(text).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
}

const MENGEN = [
  ["1", "1"],
  ["10", "10"],
  ["50", "50"],
  ["max", "alles"],
];

export class Oberflaeche {
  constructor(spiel, karte, elemente, zeit) {
    this.spiel = spiel;
    this.D = spiel.D;
    this.karte = karte;
    this.e = elemente; // { datum, gulden, warenwert, flotte, markt, meldungen, handel, handelInhalt }
    this.zeit = zeit; // { anhalten(), fortsetzen() } für das Handelsfenster
    this.schiff = spiel.schiffe[0];
    this.stadt = this.schiff.ort;
    this.menge = "10";
    this.handelOffen = false;
    this.e.flotte.addEventListener("click", (ev) => this.klickFlotte(ev));
    this.e.markt.addEventListener("change", (ev) => {
      if (ev.target.name === "stadtwahl") {
        this.stadt = this.spiel.welt.staedte[Number(ev.target.value)];
        this.aktualisiere();
      }
    });
    this.e.handel.addEventListener("click", (ev) => this.klickHandel(ev));
    this.e.handel.addEventListener("close", () => this.schliesseHandel());
  }

  // --- Steuerung über die Karte ---------------------------------------------
  waehleSchiff(schiff) {
    if (this.handelOffen && schiff !== this.schiff) this.schliesseHandel();
    this.schiff = schiff;
    if (schiff.ort) this.stadt = schiff.ort;
    this.aktualisiere();
  }

  klickStadt(stadt) {
    this.stadt = stadt;
    if (this.spiel.imHafen(this.schiff, stadt)) {
      this.oeffneHandel();
      return;
    }
    this.segle({ stadt });
  }

  klickSee(punkt) {
    this.segle({ punkt });
  }

  segle(ziel) {
    const r = this.spiel.segeln(this.schiff, ziel);
    if (!r.ok) this.spiel.melde(r.grund, "warnung");
    else if (this.handelOffen) this.schliesseHandel();
    this.aktualisiere();
  }

  // Nach einer Ankunft: Handelsfenster öffnen, wenn das Schiff in einem Hafen liegt
  angekommen(schiff) {
    this.schiff = schiff;
    if (schiff.ort) {
      this.stadt = schiff.ort;
      this.oeffneHandel();
    } else {
      this.aktualisiere();
    }
  }

  oeffneHandel() {
    if (!this.spiel.imHafen(this.schiff)) return;
    if (!this.handelOffen) {
      this.handelOffen = true;
      this.zeit.anhalten();
      this.e.handel.show();
    }
    this.aktualisiere();
  }

  schliesseHandel() {
    if (!this.handelOffen) return;
    this.handelOffen = false;
    this.e.handel.close();
    this.zeit.fortsetzen();
  }

  // --- Darstellung -----------------------------------------------------------
  aktualisiere() {
    if (this.handelOffen && !this.spiel.imHafen(this.schiff)) this.schliesseHandel();
    this.kopf();
    this.flotte();
    this.marktuebersicht();
    if (this.handelOffen) this.handelsfenster();
    this.meldungen();
    this.karte.waehle({ stadt: this.stadt, schiff: this.schiff });
    this.karte.aktualisiere();
  }

  kopf() {
    const s = this.spiel;
    this.e.datum.textContent = s.datum();
    this.e.gulden.textContent = f(s.gulden);
    this.e.gulden.classList.toggle("negativ", s.gulden < 0);
    this.e.warenwert.textContent = f(s.warenwert());
  }

  status(schiff) {
    const s = this.spiel;
    if (schiff.fahrt) {
      const w = schiff.fahrt.weg;
      const ziel = schiff.fahrt.ziel ? `nach ${schiff.fahrt.ziel.name}` : `zu einem Punkt vor ${s.naechsteStadt(w[w.length - 1]).name}`;
      return `segelt ${esc(ziel)}, Ankunft ${esc(s.datumWelt(schiff.fahrt.ende))}`;
    }
    if (schiff.ort) return `liegt in ${esc(schiff.ort.name)}`;
    return `ankert vor ${esc(s.naechsteStadt(schiff.pos).name)}`;
  }

  flotte() {
    const s = this.spiel;
    const D = this.D;
    let html = `<h2>Flotte</h2><ul class="schiffsliste">`;
    for (const schiff of s.schiffe) {
      const ladung = Object.entries(schiff.ladung)
        .map(([g, p]) => `${p.menge} ${esc(g)}`)
        .join(", ");
      html += `<li><button class="schiff ${schiff === this.schiff ? "gewaehlt" : ""}" data-schiff="${s.schiffe.indexOf(schiff)}">
        <span class="schiffsname">${esc(D.spiel.schiffstyp)} «${esc(schiff.name)}»</span>
        <span class="laderaum">${s.ladungsmenge(schiff)} / ${D.p.SHIP_CAP}</span>
        <span class="status">${this.status(schiff)}</span>
        ${ladung ? `<span class="ladung">${ladung}</span>` : ""}
      </button></li>`;
    }
    html += `</ul>`;
    const schiff = this.schiff;
    const aktionen = [];
    if (s.imHafen(schiff)) aktionen.push(`<button data-handeln>Handelsfenster öffnen</button>`);
    if (schiff.fahrt) aktionen.push(`<button data-anhalten>Anhalten</button>`);
    if (aktionen.length) html += `<div class="schiffsaktionen">${aktionen.join("")}</div>`;
    html += `<p class="steuerhilfe">Klick auf den See: «${esc(schiff.name)}» segelt dorthin. Klick auf eine Stadt: anlegen und handeln. Ein anderes Schiff wählst du per Klick in dieser Liste oder auf der Karte.</p>
      <p class="bilanz">Unterhalt ${f(D.p.UPKEEP * s.schiffe.length)} Gulden pro Tag · bisher eingekauft ${f(s.bilanz.einkauf)},
      verkauft ${f(s.bilanz.verkauf)}, Unterhalt ${f(s.bilanz.unterhalt)} Gulden</p>`;
    this.e.flotte.innerHTML = html;
  }

  // Stadtinfo und Preise einer beliebigen Stadt, ohne Handel
  marktuebersicht() {
    const welt = this.spiel.welt;
    const stadt = this.stadt;
    const zufr = Math.round(stadt.zufriedenheit);
    let html = `<h2>Marktübersicht</h2>
      <label class="stadtwahl">Stadt <select name="stadtwahl">${welt.staedte
        .map((x, i) => `<option value="${i}" ${x === stadt ? "selected" : ""}>${esc(x.name)}</option>`)
        .join("")}</select></label>
      <p class="stadtkopf">${f(stadt.einwohner)} Einwohner · Zufriedenheit
        <span class="balken" title="${zufr} von 100"><span style="width:${zufr}%"></span></span> ${zufr}</p>`;
    html += this.stadtprofil(stadt);
    html += this.markttabelle(stadt, null);
    this.e.markt.innerHTML = html;
  }

  stadtprofil(stadt) {
    const s = this.spiel;
    const D = this.D;
    let html = "";
    if (stadt.ereignisse.length) {
      html += `<p class="ereignisse">${stadt.ereignisse
        .map((e) => `<span class="marke">${esc(e.name)} bis ${esc(s.datumWelt(e.bis))}</span>`)
        .join(" ")}</p>`;
    }
    const erzeugt = Object.keys(stadt.prod).join(", ");
    const werk = Object.entries(stadt.werk)
      .map(([g]) => `${g} aus ${Object.keys(D.rezepte[g]).join(" und ")}`)
      .join(", ");
    html += `<p class="profil"><b>Erzeugt:</b> ${esc(erzeugt || "nichts")}${werk ? `<br><b>Werkstätten:</b> ${esc(werk)}` : ""}</p>`;
    return html;
  }

  // Fahrzeit in Tagen (auf halbe Tage gerundet) für die Anzeige
  tage(von, nach) {
    const w = this.spiel.nav.route(von, nach);
    return w ? Math.round((2 * weglaenge(w)) / this.D.p.SPEED) / 2 : null;
  }

  // Markttabelle. Mit schiff: Laderaum-Spalte und Knöpfe zum Kaufen und Verkaufen.
  markttabelle(stadt, schiff) {
    const s = this.spiel;
    const D = this.D;
    const welt = s.welt;
    const farbe = D.spiel.preisfarbe;
    const wunsch = this.menge === "max" ? Infinity : Number(this.menge);
    let html = `<table class="markt"><thead><tr><th title="darunter: bestes Gebot in einer anderen Stadt">Ware</th>
      <th>Lager</th><th>Kauf</th><th>Verkauf</th>${schiff ? "<th>Laderaum</th><th></th>" : ""}</tr></thead><tbody>`;
    const ohneMarkt = [];
    for (const g of Object.keys(D.waren)) {
      if (!stadt.handelt(g)) {
        ohneMarkt.push(g);
        continue;
      }
      const verhaeltnis = stadt.mittelpreis(g) / D.waren[g];
      const klasse = verhaeltnis <= farbe.guenstig ? "guenstig" : verhaeltnis >= farbe.teuer ? "teuer" : "";
      let beste = null;
      for (const andere of welt.staedte) {
        if (andere === stadt || !andere.handelt(g)) continue;
        const p = andere.verkaufspreis(g);
        if (!beste || p > beste.p) beste = { stadt: andere, p };
      }
      const gebot = beste
        ? `<small title="Bester Verkaufspreis in einer anderen Stadt und Fahrzeit dorthin">→ ${esc(beste.stadt.name)} ${f(beste.p)} · ${this.tage(stadt.pos, beste.stadt.pos).toLocaleString("de-CH")} T.</small>`
        : "";
      html += `<tr><td class="ware"><span class="gruppe g-${esc(D.gruppen[g]).replace(/[^A-Za-z]/g, "")}"></span>${esc(g)}${gebot}</td>
        <td class="zahl">${f(stadt.bestand[g])}</td>
        <td class="zahl preis ${klasse}">${f(stadt.kaufpreis(g))}</td>
        <td class="zahl preis ${klasse}">${f(stadt.verkaufspreis(g))}</td>`;
      if (schiff) {
        const posten = schiff.ladung[g];
        const k = s.kaufen(schiff, g, wunsch, false);
        const v = s.verkaufen(schiff, g, wunsch, false);
        const kaufTitel = k.menge ? `${k.menge} Stück für ${f(k.betrag)} Gulden` : "nicht möglich (Geld, Laderaum oder Lager reichen nicht)";
        const verkaufTitel = v.menge
          ? `${v.menge} Stück für ${f(v.betrag)} Gulden, ${v.gewinn >= 0 ? "Gewinn" : "Verlust"} ${f(Math.abs(v.gewinn))}`
          : "nichts geladen";
        html += `<td class="zahl">${posten ? `${posten.menge}<small>Ø ${f(posten.einstand)}</small>` : "–"}</td>
          <td class="aktionen">
          <button data-kauf="${esc(g)}" ${k.menge ? "" : "disabled"} title="${esc(kaufTitel)}">kaufen</button>
          <button data-verkauf="${esc(g)}" ${v.menge ? "" : "disabled"} title="${esc(verkaufTitel)}">verkaufen</button></td>`;
      }
      html += `</tr>`;
    }
    html += `</tbody></table>`;
    if (ohneMarkt.length) html += `<p class="ohnemarkt">Kein Markt hier für: ${esc(ohneMarkt.join(", "))}</p>`;
    if (schiff) {
      const ohne = Object.entries(schiff.ladung).filter(([g]) => !stadt.handelt(g));
      if (ohne.length) html += `<p class="ohnemarkt">Im Laderaum, hier nicht verkäuflich: ${esc(ohne.map(([g, p]) => `${p.menge} ${g}`).join(", "))}</p>`;
    }
    return html;
  }

  handelsfenster() {
    const s = this.spiel;
    const D = this.D;
    const welt = s.welt;
    const schiff = this.schiff;
    const stadt = schiff.ort;
    let html = `<header><div><h2>Handel in ${esc(stadt.name)}</h2>
        <span class="untertitel">${esc(D.spiel.schiffstyp)} «${esc(schiff.name)}» · ${s.ladungsmenge(schiff)} / ${D.p.SHIP_CAP} geladen · ${f(s.gulden)} Gulden</span></div>
        <button class="schliessen" data-schliessen title="Schliessen (Esc)" aria-label="Schliessen">×</button></header>`;
    html += this.stadtprofil(stadt);
    html += `<div class="mengenwahl" role="group" aria-label="Handelsmenge">Menge:
      ${MENGEN.map(([wert, text]) => `<button data-menge="${wert}" class="${this.menge === wert ? "aktiv" : ""}">${text}</button>`).join("")}
      <span class="frei">Frei im Laderaum: ${s.freierLaderaum(schiff)}</span></div>`;
    html += this.markttabelle(stadt, schiff);

    html += `<details class="direktfahrt"><summary>Direkt zu einem Hafen segeln</summary><div class="ziele">`;
    for (const ziel of welt.staedte) {
      if (ziel === stadt) continue;
      const gesperrt = ziel.gesperrt(welt.tag);
      const tage = this.tage(stadt.pos, ziel.pos);
      html += `<button class="ziel" data-ziel="${welt.staedte.indexOf(ziel)}" ${gesperrt || tage === null ? "disabled" : ""}
        title="${gesperrt ? "Föhnsturm: Der Hafen ist gesperrt" : ""}">${esc(ziel.name)}
        <small>${gesperrt ? "gesperrt" : `${tage.toLocaleString("de-CH")} T.`}</small></button>`;
    }
    html += `</div></details>`;
    const kann = s.kannSchiffKaufen(stadt);
    html += `<button class="schiffkauf" data-schiffkauf ${kann ? "" : "disabled"}
      title="Unterhalt ${D.p.UPKEEP} Gulden pro Tag, Laderaum ${D.p.SHIP_CAP}">
      Neuen ${esc(D.spiel.schiffstyp)} kaufen: ${f(D.p.SHIP_COST)} Gulden</button>`;
    this.e.handelInhalt.innerHTML = html;
  }

  meldungen() {
    this.e.meldungen.innerHTML = this.spiel.meldungen
      .slice(0, 6)
      .map((m) => `<li class="${m.art}"><span class="wann">${esc(m.datum)}</span> ${esc(m.text)}</li>`)
      .join("");
  }

  // --- Klicks ----------------------------------------------------------------
  klickFlotte(ev) {
    const knopf = ev.target.closest("button");
    if (!knopf) return;
    if (knopf.dataset.schiff !== undefined) {
      this.waehleSchiff(this.spiel.schiffe[Number(knopf.dataset.schiff)]);
    } else if (knopf.dataset.handeln !== undefined) {
      this.oeffneHandel();
    } else if (knopf.dataset.anhalten !== undefined) {
      this.spiel.anhalten(this.schiff);
      this.aktualisiere();
    }
  }

  klickHandel(ev) {
    const knopf = ev.target.closest("button");
    if (!knopf) return;
    const s = this.spiel;
    const wunsch = this.menge === "max" ? Infinity : Number(this.menge);
    if (knopf.dataset.schliessen !== undefined) {
      this.schliesseHandel();
      return;
    }
    if (knopf.dataset.menge) {
      this.menge = knopf.dataset.menge;
    } else if (knopf.dataset.kauf) {
      const r = s.kaufen(this.schiff, knopf.dataset.kauf, wunsch);
      if (r.menge) s.melde(`${r.menge} ${knopf.dataset.kauf} für ${f(r.betrag)} Gulden gekauft.`, "handel");
    } else if (knopf.dataset.verkauf) {
      const r = s.verkaufen(this.schiff, knopf.dataset.verkauf, wunsch);
      if (r.menge) {
        const ergebnis = r.gewinn >= 0 ? `Gewinn ${f(r.gewinn)}` : `Verlust ${f(-r.gewinn)}`;
        s.melde(`${r.menge} ${knopf.dataset.verkauf} für ${f(r.betrag)} Gulden verkauft (${ergebnis}).`, r.gewinn >= 0 ? "gut" : "handel");
      }
    } else if (knopf.dataset.ziel !== undefined) {
      this.segle({ stadt: s.welt.staedte[Number(knopf.dataset.ziel)] });
      return;
    } else if (knopf.dataset.schiffkauf !== undefined) {
      const neu = s.schiffKaufen(this.schiff.ort);
      if (neu) this.schiff = neu;
    }
    this.aktualisiere();
  }
}
