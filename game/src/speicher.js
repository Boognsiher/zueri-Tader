// Spielstand speichern und laden. Gespeichert wird alles, was sich im Spiel ändert:
// Welt (Lager, Ereignisse, KI-Händler, Zufallszustand), Spieler, Schiffe, Kontore, Betriebe.
// Nach dem Laden läuft das Spiel genau so weiter, wie es ohne Speichern weitergelaufen wäre.
// Städte stehen als Namen bzw. Positionen in der Städteliste drin, Fahrtziele als Namen.

import { Spiel } from "./spiel.js";
import { neueKampfdaten } from "./kampf.js";

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
        baujahr: s.baujahr,
        bautag: s.bautag,
        pos: s.pos,
        ort: nr(s.ort),
        fahrt: s.fahrt ? { weg: s.fahrt.weg, start: s.fahrt.start, ende: s.fahrt.ende, ziel: nr(s.fahrt.ziel), ...(s.fahrt.jagd ? { jagd: true } : {}) } : null,
        ladung: s.ladung,
        auto: s.auto,
        mitglieder: s.mitglieder ?? null,
        kampf: s.kampf,
        kapitaen: s.kapitaen ?? null,
        versichert: s.versichert ?? false,
      })),
      kriegszufall: spiel.kriegszufall.zustand,
      diplomatie: spiel.diplomatie.zustand(),
      kampf: spiel.kampf.zustand(),
      ausbau: spiel.ausbau.zustand(),
      kapitaene: spiel.kapitaene.zustand(),
      ziel: spiel.ziel.zustand(),
      risiko: spiel.risiko.zustand(),
      zoll: spiel.zoll.zustand(),
      zonen: spiel.zonen.zustand(),
      spielsekunden: spiel.spielsekunden,
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
    baujahr: z.baujahr ?? spiel.jahr(), // ältere Spielstände: Schiffe gelten als neu
    bautag: z.bautag ?? spiel.tag, // Spielstände vor dem schnelleren Kalender: Alter beginnt neu
    pos: z.pos,
    ort: stadt(z.ort),
    fahrt: z.fahrt ? { ...z.fahrt, ziel: stadt(z.fahrt.ziel) } : null,
    ladung: z.ladung,
    auto: z.auto,
    ...(z.mitglieder ? { mitglieder: z.mitglieder } : {}),
    ...(z.kapitaen ? { kapitaen: z.kapitaen } : {}),
    ...(z.versichert ? { versichert: true } : {}),
  }));
  // Spielstände vor dem Kampfsystem: Kampfdaten nach Schiffstyp
  for (const [i, s] of spiel.schiffe.entries()) s.kampf = sp.schiffe[i].kampf ?? neueKampfdaten(spiel.schiffstyp(s).kampfschiff);
  if (sp.kriegszufall !== undefined) spiel.kriegszufall.zustand = sp.kriegszufall;
  spiel.diplomatie.laden(sp.diplomatie);
  spiel.kampf.laden(sp.kampf);
  spiel.ausbau.laden(sp.ausbau);
  spiel.werft.laden(sp.werft);
  spiel.kapitaene.laden(sp.kapitaene);
  spiel.ziel.laden(sp.ziel);
  spiel.risiko.laden(sp.risiko);
  spiel.zoll.laden(sp.zoll);
  spiel.zonen.laden(sp.zonen);
  spiel.spielsekunden = sp.spielsekunden ?? 0;
  return spiel;
}
