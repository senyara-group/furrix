// Contrôles de texte communs : prénoms et noms, âge d'un animal, caractères invisibles.

/** Caractères de contrôle et de mise en forme invisibles (dont les inversions de sens) : jamais acceptés dans un champ d'une ligne. */
const INVISIBLE = new RegExp(
  `[${(
    [
      [0x00, 0x1f],
      [0x7f, 0x9f],
      [0x200b, 0x200f],
      [0x2028, 0x202e],
      [0x2066, 0x2069],
    ] as const
  )
    .map(
      ([from, to]) => `${String.fromCharCode(from)}-${String.fromCharCode(to)}`,
    )
    .join("")}]`,
);
export const hasControlChars = (value: string) => INVISIBLE.test(value);

/** Prénom : lettres (accents compris), espaces, tirets, apostrophes ; 1 à 80 caractères. */
export function personNameError(input: string): string | null {
  const value = input.trim();
  if (!value) return "Indique ton prénom.";
  if (value.length > 80)
    return "Ton prénom doit faire entre 1 et 80 caractères.";
  if (hasControlChars(value) || !/^\p{L}[\p{L}\p{M}' ’.\s-]*$/u.test(value))
    return "Un prénom ne contient que des lettres, des espaces, des tirets ou des apostrophes.";
  return null;
}

/** Nom d'un animal : lettres, chiffres, espaces, tirets, apostrophes et points (« R2-D2 », « Mlle. Pépite »). */
export function petNameError(input: string): string | null {
  const value = input.trim();
  if (!value) return null;
  if (
    hasControlChars(value) ||
    !/^[\p{L}\p{N}][\p{L}\p{M}\p{N}' ’.\s-]*$/u.test(value)
  )
    return "Le nom ne contient que des lettres, des chiffres, des espaces ou des tirets.";
  return null;
}

// « 3 », « 3 ans », « 1,5 an », « 6 mois », « 8 semaines », « 1 an et 2 mois ».
const AGE_RE =
  /^\d{1,2}(?:[.,]5)?\s*(?:ans?|mois|semaines?|sem\.?)?(?:\s*(?:et\s*)?\d{1,2}\s*(?:ans?|mois|semaines?|sem\.?))?$/;

/** Âge d'un animal : un nombre, puis éventuellement « an(s) », « mois » ou « semaine(s) ». Message ou null. */
export function petAgeError(input: string): string | null {
  const value = input.trim().toLowerCase();
  if (!value) return null;
  if (!AGE_RE.test(value))
    return "Indique un âge comme « 3 ans », « 6 mois » ou « 1 an et 2 mois ».";
  return null;
}
