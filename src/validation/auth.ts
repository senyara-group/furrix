import { checkEmail } from "./email";
import type { FieldErrors, ValidationResult } from "../types/pet";

export type AuthMode = "signup" | "login";
export type Credentials = { email: string; password: string };

export const PASSWORD_MIN = 8;
/** Au-delà de 72 octets, bcrypt (GoTrue) tronque silencieusement. */
export const PASSWORD_MAX = 72;

/** Format seul (connexion, mot de passe oublié, renvoi du lien) : un compte existant n'est jamais bloqué. */
export function validateEmail(input: string): string | null {
  const email = input.trim();
  return !email
    ? "Indique ton adresse e-mail."
    : email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
      ? "E-mail invalide"
      : null;
}

/** Mots de passe trop répandus, refusés même s'ils ont la bonne longueur. */
const COMMON_PASSWORDS = new Set([
  "12345678",
  "123456789",
  "1234567890",
  "azerty123",
  "azertyuiop",
  "password",
  "password1",
  "motdepasse",
  "qwerty123",
  "qwertyuiop",
  "11111111",
  "00000000",
  "abcd1234",
  "furrix123",
  "iloveyou",
  "soleil123",
  "doudou123",
  "chouchou",
]);

/** Nouveau mot de passe : longueur, au moins une lettre et un chiffre, pas un mot de passe courant. Message ou null. */
export function newPasswordError(password: string): string | null {
  if (password.length < PASSWORD_MIN)
    return `Au moins ${PASSWORD_MIN} caractères`;
  if (new TextEncoder().encode(password).length > PASSWORD_MAX)
    return "Mot de passe trop long";
  if (!/\p{L}/u.test(password) || !/\d/.test(password))
    return "Mélange au moins une lettre et un chiffre.";
  if (COMMON_PASSWORDS.has(password.toLowerCase()) || /^(.)\1+$/.test(password))
    return "Ce mot de passe est trop courant. Choisis-en un autre.";
  return null;
}

export function validateNewPassword(
  password: string,
  confirmation: string,
): string | null {
  const problem = newPasswordError(password);
  if (problem) return problem;
  return password === confirmation
    ? null
    : "Les mots de passe ne correspondent pas.";
}

export function validateCredentials(
  input: Credentials,
  mode: AuthMode,
): ValidationResult<Credentials, keyof Credentials> {
  const errors: FieldErrors<keyof Credentials> = {};
  const email = (input.email ?? "").trim().toLowerCase();
  const password = input.password ?? "";

  // Inscription : format, fautes de frappe courantes et adresses jetables. Connexion : format seul.
  if (mode === "login") {
    const problem = validateEmail(email);
    if (problem) errors.email = problem;
  } else {
    const checked = checkEmail(email);
    if (!checked.ok) errors.email = checked.error;
  }

  if (!password) errors.password = "Le mot de passe est requis";
  else if (new TextEncoder().encode(password).length > PASSWORD_MAX)
    errors.password = "Mot de passe trop long";
  else if (mode === "signup" && newPasswordError(password))
    errors.password = newPasswordError(password)!;

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, value: { email, password } };
}
