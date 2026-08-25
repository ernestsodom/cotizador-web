/** Parses a Chilean-style number ("28,50" or "1.234,50") into a JS number. */
export function parseChileanNumber(raw: string): number {
  const cleaned = raw.replace(/[^\d.,-]/g, "");
  if (!cleaned) return 0;
  const normalized = cleaned.includes(",")
    ? cleaned.replace(/\./g, "").replace(",", ".")
    : cleaned;
  const n = parseFloat(normalized);
  return Number.isFinite(n) ? n : 0;
}

/** Formats a number the way the source letters do ("28,50"). */
export function formatChileanNumber(value: number, decimals = 2): string {
  return value
    .toFixed(decimals)
    .replace(".", ",");
}

const SPANISH_MONTHS: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
  julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10,
  noviembre: 11, diciembre: 12,
};

/** Parses "Santiago, 10 de Junio de 2026" style dates into ISO (YYYY-MM-DD). */
export function parseSpanishLongDate(text: string): { city?: string; iso?: string } {
  const match = text.match(
    /([A-ZÁÉÍÓÚÑa-záéíóúñ ]+),?\s*(\d{1,2})\s+de\s+([A-Za-záéíóúñ]+)\s+de\s+(\d{4})/
  );
  if (!match) return {};
  const [, city, day, monthName, year] = match;
  const month = SPANISH_MONTHS[monthName.toLowerCase()];
  if (!month) return { city: city.trim() };
  const iso = `${year}-${String(month).padStart(2, "0")}-${String(Number(day)).padStart(2, "0")}`;
  return { city: city.trim(), iso };
}

const STOPWORDS = new Set([
  "de", "la", "el", "los", "las", "y", "en", "para", "con", "del", "un", "una",
  "a", "que", "por", "su", "al", "e", "o", "u", "punto", "puntos", "modulo",
  "modulos", "aplicacion", "sistema",
]);

/** Lowercased, accent-stripped content words, for fuzzy heading matching. */
export function contentWords(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}
