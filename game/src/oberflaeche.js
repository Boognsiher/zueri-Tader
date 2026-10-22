// Seitenleiste und Kopfzeile: Kontor, Flotte, Stadt mit Markt, Meldungen.
// Liest den Spielzustand und ruft Spiel-Methoden auf, rechnet selbst nichts.

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
  constructor(spiel, karte, elemente) {
    this.spiel = spiel;
    this.D = spiel.D;
    this.karte = karte;
    this.e = elemente; // { datum, gulden, warenwert, flotte, stadt, meldungen }
    this.schiff = spiel.schiffe[0];
    this.stadt = this.schiff.ort;
    this.menge = "10";
    this.e.flotte.addEventListener("click", (ev) => this.klickFlotte(ev));
    this.e.stadt.addEventListener("click", (ev) => this.klickStadt(ev));
  }

  // --- Auswahl ---------------------------------------------------------
  waehleStadt(stadt) {
    this.stadt = stadt;
    // Liegt ein eigenes Schiff dort, wird es für den Handel gewählt
    if (!this.spiel.imHafen(this.schiff, stadt)) {
      const dort = this.spiel.schiffe.find((s) => this.spiel.imHafen(s, stadt));
      if (dort) this.schiff = dort;
    }
    this.aktualisiere();
  }

  waehleSchiff(schiff) {
    this.schiff = schiff;
    if (!schiff.ziel) this.stadt = schiff.ort;
    this.aktualisiere();
  }

  // Ziel per Klick auf der Karte: liegt das gewählte Schiff im Hafen, wird nur die Stadt gezeigt.
  // Abgelegt wird über die Liste in der Flotte, damit kein Fehlklick eine Fahrt auslöst.

  // --- Darstellung -----------------------------------------------------
  aktualisiere() {
    this.kopf();
    this.flotte();
    this.stadtansicht();
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

  flotte() {
    const s = this.spiel;
    const D = this.D;
    const welt = s.welt;
    let html = `<h2>Flotte</h2><ul class="schiffsliste">`;
    for (const schiff of s.schiffe) {
      const status = schiff.ziel
        ? `unterwegs nach ${esc(schiff.ziel.name)}, Ankunft ${esc(s.datumWelt(schiff.ankunft))}`
        : `liegt in ${esc(schiff.ort.name)}`;
      const ladung = Object.entries(schiff.ladung)
        .map(([g, p]) => `${p.menge} ${esc(g)}`)
        .join(", ");
      html += `<li><button class="schiff ${schiff === this.schiff ? "gewaehlt" : ""}" data-schiff="${s.schiffe.indexOf(schiff)}">
        <span class="schiffsname">${esc(D.spiel.schiffstyp)} «${esc(schiff.name)}»</span>
        <span class="laderaum">${s.ladungsmenge(schiff)} / ${D.p.SHIP_CAP}</span>
        <span class="status">${status}</span>
        ${ladung ? `<span class="ladung">${ladung}</span>` : ""}
      </button></li>`;
    }
    html += `</ul>`;

    const schiff = this.schiff;
    if (!schiff.ziel) {
      html += `<h3>«${esc(schiff.name)}» ablegen nach</h3><div class="ziele">`;
      for (const stadt of welt.staedte) {
        if (stadt === schiff.ort) continue;
        const gesperrt = stadt.gesperrt(welt.tag);
        const tage = welt.fahrtage(schiff.ort, stadt);
        html += `<button class="ziel" data-ziel="${welt.staedte.indexOf(stadt)}" ${gesperrt ? "disabled" : ""}
          title="${gesperrt ? "Föhnsturm: Der Hafen ist gesperrt" : `Ankunft ${esc(s.datumWelt(welt.tag + tage))}`}">
          ${esc(stadt.name)} <small>${gesperrt ? "gesperrt" : `${tage} ${tage === 1 ? "Tag" : "Tage"}`}</small></button>`;
      }
      html += `</div>`;
      const kosten = D.p.SHIP_COST;
      const kann = s.kannSchiffKaufen(schiff.ort);
      html += `<button class="schiffkauf" data-schiffkauf ${kann ? "" : "disabled"}
        title="Unterhalt ${D.p.UPKEEP} Gulden pro Tag, Laderaum ${D.p.SHIP_CAP}">
        Neuen ${esc(D.spiel.schiffstyp)} in ${esc(schiff.ort.name)} kaufen: ${f(kosten)} Gulden</button>`;
    }
    const b = s.bilanz;
    html += `<p class="bilanz">Unterhalt ${f(D.p.UPKEEP * s.schiffe.length)} Gulden pro Tag · bisher eingekauft ${f(b.einkauf)},
      verkauft ${f(b.verkauf)}, Unterhalt ${f(b.unterhalt)} Gulden</p>`;
    this.e.flotte.innerHTML = html;
  }

  stadtansicht() {
    const s = this.spiel;
    const D = this.D;
    const welt = s.welt;
    const stadt = this.stadt;
    const schiff = this.schiff;
    const handel = s.imHafen(schiff, stadt);

    const zufr = Math.round(stadt.zufriedenheit);
    let html = `<h2>${esc(stadt.name)}</h2>
      <p class="stadtkopf">${f(stadt.einwohner)} Einwohner · Zufriedenheit
        <span class="balken" title="${zufr} von 100"><span style="width:${zufr}%"></span></span> ${zufr}</p>`;
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

    if (handel) {
      html += `<div class="mengenwahl" role="group" aria-label="Handelsmenge">Menge:
        ${MENGEN.map(([wert, text]) => `<button data-menge="${wert}" class="${this.menge === wert ? "aktiv" : ""}">${text}</button>`).join("")}
        <span class="frei">Frei im Laderaum: ${s.freierLaderaum(schiff)}</span></div>`;
    } else {
      html += `<p class="hinweis">${
        schiff.ziel || s.schiffe.every((x) => !s.imHafen(x, stadt))
          ? "Kein eigenes Schiff im Hafen. Handeln kannst du, sobald eines hier liegt."
          : "Wähle ein Schiff, das hier liegt, um zu handeln."
      }</p>`;
    }

    const farbe = D.spiel.preisfarbe;
    const wunsch = this.menge === "max" ? Infinity : Number(this.menge);
    html += `<table class="markt"><thead><tr><th title="darunter: bestes Gebot in einer anderen Stadt">Ware</th><th>Lager</th><th>Kauf</th><th>Verkauf</th>
      <th title="im Laderaum des gewählten Schiffs">Laderaum</th>${handel ? "<th></th>" : ""}</tr></thead><tbody>`;
    const ohneMarkt = [];
    for (const g of Object.keys(D.waren)) {
      if (!stadt.handelt(g)) {
        ohneMarkt.push(g);
        continue;
      }
      const verhaeltnis = stadt.mittelpreis(g) / D.waren[g];
      const klasse = verhaeltnis <= farbe.guenstig ? "guenstig" : verhaeltnis >= farbe.teuer ? "teuer" : "";
      const posten = schiff.ladung[g];
      // bestes Gebot in einer anderen Stadt
      let beste = null;
      for (const andere of welt.staedte) {
        if (andere === stadt || !andere.handelt(g)) continue;
        const p = andere.verkaufspreis(g);
        if (!beste || p > beste.p) beste = { stadt: andere, p };
      }
      const gebot = beste
        ? `<small title="Bester Verkaufspreis in einer anderen Stadt und Fahrzeit dorthin">→ ${esc(beste.stadt.name)} ${f(beste.p)} · ${welt.fahrtage(stadt, beste.stadt)} T.</small>`
        : "";
      html += `<tr><td class="ware"><span class="gruppe g-${esc(D.gruppen[g]).replace(/[^A-Za-z]/g, "")}"></span>${esc(g)}${gebot}</td>
        <td class="zahl">${f(stadt.bestand[g])}</td>
        <td class="zahl preis ${klasse}">${f(stadt.kaufpreis(g))}</td>
        <td class="zahl preis ${klasse}">${f(stadt.verkaufspreis(g))}</td>
        <td class="zahl">${posten ? `${posten.menge}<small>Ø ${f(posten.einstand)}</small>` : "–"}</td>`;
      if (handel) {
        const k = s.kaufen(schiff, g, wunsch, false);
        const v = s.verkaufen(schiff, g, wunsch, false);
        const kaufTitel = k.menge ? `${k.menge} Stück für ${f(k.betrag)} Gulden` : "nicht möglich (Geld, Laderaum oder Lager reichen nicht)";
        const verkaufTitel = v.menge
          ? `${v.menge} Stück für ${f(v.betrag)} Gulden, ${v.gewinn >= 0 ? "Gewinn" : "Verlust"} ${f(Math.abs(v.gewinn))}`
          : "nichts geladen";
        html += `<td class="aktionen">
          <button data-kauf="${esc(g)}" ${k.menge ? "" : "disabled"} title="${esc(kaufTitel)}">kaufen</button>
          <button data-verkauf="${esc(g)}" ${v.menge ? "" : "disabled"} title="${esc(verkaufTitel)}">verkaufen</button></td>`;
      }
      html += `</tr>`;
    }
    html += `</tbody></table>`;
    if (ohneMarkt.length) html += `<p class="ohnemarkt">Kein Markt hier für: ${esc(ohneMarkt.join(", "))}</p>`;
    this.e.stadt.innerHTML = html;
  }

  meldungen() {
    this.e.meldungen.innerHTML = this.spiel.meldungen
      .slice(0, 6)
      .map((m) => `<li class="${m.art}"><span class="wann">${esc(m.datum)}</span> ${esc(m.text)}</li>`)
      .join("");
  }

  // --- Klicks --------------------------------------------------------------
  klickFlotte(ev) {
    const knopf = ev.target.closest("button");
    if (!knopf) return;
    const s = this.spiel;
    if (knopf.dataset.schiff !== undefined) {
      this.waehleSchiff(s.schiffe[Number(knopf.dataset.schiff)]);
    } else if (knopf.dataset.ziel !== undefined) {
      const ziel = s.welt.staedte[Number(knopf.dataset.ziel)];
      if (s.ablegen(this.schiff, ziel)) this.aktualisiere();
    } else if (knopf.dataset.schiffkauf !== undefined) {
      const neu = s.schiffKaufen(this.schiff.ort);
      if (neu) this.waehleSchiff(neu);
    }
  }

  klickStadt(ev) {
    const knopf = ev.target.closest("button");
    if (!knopf) return;
    const s = this.spiel;
    const wunsch = this.menge === "max" ? Infinity : Number(this.menge);
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
    }
    this.aktualisiere();
  }
}
