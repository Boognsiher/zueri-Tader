// Buchhaltung des Spielers: Einnahmen und Ausgaben nach Konten, gesamt und pro Monat.
// Beträge mit Vorzeichen: Einnahmen positiv, Ausgaben negativ. Das Geld selbst ändert sich
// woanders (spiel.gulden), hier wird nur mitgeschrieben.

export const KONTEN = [
  { id: "handelVerkauf", name: "Warenverkauf der Schiffe", gruppe: "Handel" },
  { id: "handelEinkauf", name: "Wareneinkauf der Schiffe", gruppe: "Handel" },
  { id: "kontorVerkauf", name: "Verkauf aus Kontoren", gruppe: "Kontore" },
  { id: "kontorEinkauf", name: "Einkauf der Kontore", gruppe: "Kontore" },
  { id: "kontorUnterhalt", name: "Unterhalt der Kontore", gruppe: "Kontore" },
  { id: "betriebe", name: "Betriebe: Kasse nach Unterhalt", gruppe: "Betriebe und Gebäude" },
  { id: "gebaeudeUnterhalt", name: "Unterhalt der Stadtgebäude", gruppe: "Betriebe und Gebäude" },
  { id: "schiffeUnterhalt", name: "Unterhalt der Schiffe", gruppe: "Schiffe" },
  { id: "schiffeReparatur", name: "Reparaturen nach Gefechten", gruppe: "Schiffe" },
  { id: "kapitaenslohn", name: "Lohn der Kapitäne", gruppe: "Schiffe" },
  { id: "prisengeld", name: "Prisengeld", gruppe: "Krieg" },
  { id: "kaperbriefe", name: "Kaperbriefe", gruppe: "Krieg" },
  { id: "kapitaenAnwerbung", name: "Kapitäne angeworben", gruppe: "Investitionen" },
  { id: "schiffeKauf", name: "Schiffe gekauft", gruppe: "Investitionen" },
  { id: "schiffeVerkauf", name: "Schiffe verkauft", gruppe: "Investitionen" },
  { id: "betriebeKauf", name: "Betriebe gekauft", gruppe: "Investitionen" },
  { id: "betriebeVerkauf", name: "Betriebe verkauft", gruppe: "Investitionen" },
  { id: "bauten", name: "Bauten und Ausbau", gruppe: "Investitionen" },
];

const MONATE_BEHALTEN = 24;

export function neueKonten() {
  return { gesamt: {}, monate: {} };
}

// monat: Schlüssel wie "1650-04"
export function buche(konten, monat, konto, betrag) {
  if (!betrag) return;
  konten.gesamt[konto] = (konten.gesamt[konto] ?? 0) + betrag;
  const m = (konten.monate[monat] ??= {});
  m[konto] = (m[konto] ?? 0) + betrag;
  const schluessel = Object.keys(konten.monate).sort();
  for (const alt of schluessel.slice(0, Math.max(0, schluessel.length - MONATE_BEHALTEN))) delete konten.monate[alt];
}

// Laufendes Ergebnis (ohne Investitionen) einer Buchungstabelle
export function ergebnis(tabelle) {
  return KONTEN.filter((k) => k.gruppe !== "Investitionen").reduce((a, k) => a + (tabelle?.[k.id] ?? 0), 0);
}

export function investitionen(tabelle) {
  return KONTEN.filter((k) => k.gruppe === "Investitionen").reduce((a, k) => a + (tabelle?.[k.id] ?? 0), 0);
}
