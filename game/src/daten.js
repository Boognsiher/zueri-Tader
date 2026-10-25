// Lädt alle Spielzahlen aus data/*.json, dieselben Dateien, die auch die Simulation liest.
// Im Browser per fetch, unter Node (Tests) über eine eigene Lesefunktion.

const DATEIEN = ["goods", "recipes", "consumption", "cities", "params", "events", "karte", "spiel", "buildings", "schiffe", "fraktionen", "kapitaene", "ziel", "risiko", "zoll", "zonen", "epochen", "vertraege"];

export async function ladeDaten(lesen) {
  const roh = {};
  for (const name of DATEIEN) roh[name] = await lesen(`${name}.json`);
  return aufbereiten(roh);
}

export function ladeImBrowser(basis = "../data/") {
  return ladeDaten(async (datei) => {
    const antwort = await fetch(basis + datei, { cache: "no-cache" });
    if (!antwort.ok) throw new Error(`${datei} konnte nicht geladen werden (${antwort.status})`);
    return antwort.json();
  });
}

function aufbereiten(roh) {
  const p = {};
  for (const [name, eintrag] of Object.entries(roh.params.parameter)) p[name] = eintrag.wert;

  const waren = {};
  const gruppen = {};
  const jahreszeit = {}; // Ware -> 12 Monatsfaktoren auf die Produktion
  for (const [name, eintrag] of Object.entries(roh.goods.waren)) {
    waren[name] = eintrag.basispreis;
    gruppen[name] = eintrag.gruppe;
    if (eintrag.jahreszeit) jahreszeit[name] = eintrag.jahreszeit;
  }

  const seeteil = {};
  for (const [teil, eintrag] of Object.entries(roh.karte.seeteile)) {
    for (const stadt of eintrag.staedte) seeteil[stadt] = teil;
  }

  const staedte = roh.cities.staedte.map((s) => ({
    name: s.name,
    einwohner: s.einwohner,
    pos: s.position,
    zone: s.zone ?? "zuerichsee",
    prod: s.produktion,
    imp: s.import ?? {}, // Einfuhr der Verteilzentren: zählt wie Produktion, aber ohne Rohstoffbetrieb
    werk: s.werkstaetten,
  }));


  return {
    p,
    waren,
    gruppen,
    jahreszeit,
    rezepte: roh.recipes.rezepte,
    verbrauch: roh.consumption.verbrauch_pro_1000_einwohner_und_tag,
    grundbedarf: roh.consumption.grundbedarf,
    gehoben: roh.consumption.gehobener_bedarf,
    staedte,
    ereignisse: roh.events.ereignisse,
    karte: roh.karte,
    seeteil,
    spiel: roh.spiel,
    bau: roh.buildings,
    kapitaene: roh.kapitaene,
    ziel: roh.ziel,
    risiko: roh.risiko,
    zoll: roh.zoll,
    zonen: roh.zonen,
    vertraege: roh.vertraege,
    epochen: roh.epochen,
    kalender: roh.epochen.kalendertage_je_spieltag ?? 1, // Kalendertage pro Spieltag
    schiffe: { ...roh.schiffe, typ: Object.fromEntries(roh.schiffe.typen.map((t) => [t.id, t])) },
    fraktionen: {
      ...roh.fraktionen,
      nach: Object.fromEntries(roh.fraktionen.fraktionen.map((f) => [f.id, f])),
      stadt: Object.fromEntries(roh.fraktionen.fraktionen.flatMap((f) => f.staedte.map((s) => [s, f.id]))),
    },
  };
}
