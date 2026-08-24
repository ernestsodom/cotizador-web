export function formatMoney(value: number, currency: string): string {
  const n = new Intl.NumberFormat("es-CL", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
  if (currency === "UF") return `${n} UF`;
  if (currency === "CLP") return `$${new Intl.NumberFormat("es-CL").format(Math.round(value))}`;
  return `${n} ${currency}`;
}

export function formatDateEs(iso: string | null | undefined): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  const months = [
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
  ];
  return `${d} de ${months[m - 1]} de ${y}`;
}
