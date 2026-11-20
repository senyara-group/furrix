// Saisie de nombres : on filtre pendant la frappe pour que seuls des chiffres arrivent dans les champs de prix, poids ou coordonnées.

/** Chiffres seulement (poids, durée, code…), au plus `max` chiffres. Les lettres et symboles collés sont retirés. */
export function digitsOnly(input: string, max = 6): string {
  return input.replace(/\D/g, "").slice(0, max);
}

/**
 * Montant ou nombre décimal : chiffres, une seule virgule (le point est converti), `decimals` chiffres après elle.
 * Exemples : « 12.5 » → « 12,5 », « 1a2 € » → « 12 », « 3,456 » → « 3,45 ».
 */
export function decimalInput(
  input: string,
  { decimals = 2, integers = 5, negative = false } = {},
): string {
  const minus = negative && input.trim().startsWith("-") ? "-" : "";
  const cleaned = input.replace(/\./g, ",").replace(/[^\d,]/g, "");
  const [whole = "", ...rest] = cleaned.split(",");
  const intPart = whole.replace(/^0+(?=\d)/, "").slice(0, integers);
  if (!rest.length || decimals === 0) return minus + intPart;
  return `${minus}${intPart || "0"},${rest.join("").slice(0, decimals)}`;
}

/** Valeur numérique d'une saisie décimale (« 12,5 » → 12.5), ou null si vide ou invalide. */
export function parseDecimal(input: string): number | null {
  const value = input.trim().replace(",", ".");
  if (!/^-?\d+(\.\d+)?$/.test(value)) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Montant en euros saisi → centimes (« 12,5 » → 1250), ou null. */
export function euroCents(input: string): number | null {
  const n = parseDecimal(input);
  return n === null || n < 0 ? null : Math.round(n * 100);
}

/** Téléphone : chiffres, espaces et un « + » initial seulement, pendant la frappe. */
export function phoneInput(input: string): string {
  const plus = input.trim().startsWith("+") ? "+" : "";
  return (plus + input.replace(/[^\d ]/g, ""))
    .replace(/\s{2,}/g, " ")
    .slice(0, 20);
}

/** Numéro français (06 12 34 56 78, 03…, +33 6…) ou international (+ et 8 à 15 chiffres). Message d'erreur ou null. */
export function phoneError(
  input: string,
  { required = false } = {},
): string | null {
  const value = input.replace(/[\s.()-]/g, "");
  if (!value) return required ? "Indique un numéro de téléphone." : null;
  if (/^0[1-9]\d{8}$/.test(value) || /^\+33[1-9]\d{8}$/.test(value))
    return null;
  if (/^\+(?!33)[1-9]\d{7,14}$/.test(value)) return null;
  return "Numéro invalide. Exemple : 06 12 34 56 78 ou +33 6 12 34 56 78.";
}
