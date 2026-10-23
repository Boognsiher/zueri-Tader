// Kurven über die Jahre (data/epochen.json): lineare Zwischenwerte, ausserhalb der Jahre der
// erste bzw. letzte Wert. Wirtschaft, Verkehr und Flotten lesen ihre Faktoren hier.

export function kurve(D, name, jahr) {
  const punkte = D.epochen.kurven[name];
  if (!punkte) throw new Error(`Unbekannte Kurve ${name} in epochen.json`);
  if (jahr <= punkte[0][0]) return punkte[0][1];
  for (let i = 1; i < punkte.length; i++) {
    const [j0, w0] = punkte[i - 1];
    const [j1, w1] = punkte[i];
    if (jahr <= j1) return w0 + ((w1 - w0) * (jahr - j0)) / (j1 - j0);
  }
  return punkte[punkte.length - 1][1];
}
