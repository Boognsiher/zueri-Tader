// Spielstand speichern und laden. Gespeichert wird alles, was sich im Spiel ändert:
// Welt (Lager, Ereignisse, KI-Händler, Zufallszustand), Spieler, Schiffe, Kontore, Betriebe.
// Nach dem Laden läuft das Spiel genau so weiter, wie es ohne Speichern weitergelaufen wäre.
// Städte stehen als Namen bzw. Positionen in der Städteliste drin, Fahrtziele als Namen.

import { Spiel } from "./spiel.js";

export const VERSION = 1;

export function speichere(spiel) {
  const welt = spiel.welt;
  const nr = (stadt) => (stadt ? welt.staedte.indexOf(stadt) : null);
  return {
    spiel: "Züri-Trade",
    version: VERSION,
    gespeichert: new Date().toISOString(),
    datum: spiel.datum(),
    staedte: welt.staedte.map((s) => s.name),
    welt: {
      tag: welt.tag,
      zufall: welt.zufall.zustand,
      staedte: welt.staedte.map((s) => ({
        bestand: s.bestand,
        unterwegs: s.unterwegs,
        ballast: s.ballast,
        prodFaktor: s.prodFaktor,
        verbrauchFaktor: s.verbrauchFaktor,
        sperreBis: s.sperreBis,
        zufriedenheit: s.zufriedenheit,
        einwohner: s.einwohner,
        ereignisse: s.ereignisse,
      })),
      haendler: welt.haendler.map((h) => ({
        ort: nr(h.ort),
        geld: h.geld,
        ladung: h.ladung,
        ziel: nr(h.ziel),
        abfahrt: h.abfahrt,
        ankunft: h.ankunft,
      })),
    },
    spieler: {
      starttag: spiel.starttag,
      anteil: spiel.anteil,
      gulden: spiel.gulden,
      namen: spiel.namen,
      meldungen: spiel.meldungen,
      konten: spiel.konten,
      werft: spiel.werft.zustand(),
      schiffe: spiel.schiffe.map((s) => ({
        name: s.name,
        typ: s.typ,
        gebraucht: s.gebraucht,
        pos: s.pos,
        ort: nr(s.ort),
        fahrt: s.fahrt ? { weg: s.fahrt.weg, start: s.fahrt.start, ende: s.fahrt.ende, ziel: nr(s.fahrt.ziel) } : null,
        ladung: s.ladung,
        auto: s.auto,
      })),
      ausbau: spiel.ausbau.zustand(),
    },
  };
}

// Prüft einen Spielstand, gibt einen Fehlertext zurück oder null
export function pruefe(D, stand) {
  if (!stand || stand.spiel !== "Züri-Trade") return "Das ist kein Spielstand von Züri-Trade.";
  if (stand.version !== VERSION) return `Spielstand-Version ${stand.version} wird nicht unterstützt (erwartet ${VERSION}).`;
  const namen = D.staedte.map((s) => s.name);
  if (JSON.stringify(namen) !== JSON.stringify(stand.staedte)) return "Der Spielstand passt nicht zu den aktuellen Städtedaten.";
  return null;
}

// Baut ein Spiel aus einem Spielstand. Wirft einen Fehler, wenn der Stand nicht passt.
export function lade(D, stand) {
  const fehler = pruefe(D, stand);
  if (fehler) throw new Error(fehler);
  // Kopie, damit das Spiel den gespeicherten Stand nicht verändert
  stand = JSON.parse(JSON.stringify(stand));
  const spiel = new Spiel(D, 1, { leer: true });
  const welt = spiel.welt;
  const stadt = (i) => (i === null ? null : welt.staedte[i]);

  welt.tag = stand.welt.tag;
  welt.zufall.zustand = stand.welt.zufall;
  stand.welt.staedte.forEach((z, i) => {
    Object.assign(welt.staedte[i], z);
    welt.staedte[i].skaliere(); // Verbrauch und Zielbestände zur gespeicherten Bevölkerung
  });
  welt.haendler = stand.welt.haendler.map((z, i) => {
    const h = welt.haendler[i] ?? Object.create(Object.getPrototypeOf(welt.haendler[0]));
    Object.assign(h, { D, ort: stadt(z.ort), geld: z.geld, ladung: z.ladung, ziel: stadt(z.ziel), abfahrt: z.abfahrt, ankunft: z.ankunft });
    return h;
  });

  const sp = stand.spieler;
  spiel.starttag = sp.starttag;
  spiel.anteil = sp.anteil;
  spiel.gulden = sp.gulden;
  spiel.namen = sp.namen;
  spiel.meldungen = sp.meldungen;
  if (sp.konten) spiel.konten = sp.konten; // ältere Spielstände ohne Buchhaltung beginnen leer
  spiel.schiffe = sp.schiffe.map((z) => ({
    name: z.name,
    typ: z.typ ?? D.schiffe.startschiff, // Spielstände vor dem Bootshandel
    gebraucht: z.gebraucht ?? false,
    pos: z.pos,
    ort: stadt(z.ort),
    fahrt: z.fahrt ? { ...z.fahrt, ziel: stadt(z.fahrt.ziel) } : null,
    ladung: z.ladung,
    auto: z.auto,
  }));
  spiel.ausbau.laden(sp.ausbau);
  spiel.werft.laden(sp.werft);
  return spiel;
}
