import { describe, expect, it } from "vitest";
import { checkEmail, emailSuggestion, isDisposableEmail } from "./email";

describe("checkEmail", () => {
  it("accepte une adresse courante, normalisée en minuscules", () => {
    expect(checkEmail("  Prenom.Nom+chien@Exemple.FR ")).toEqual({
      ok: true,
      email: "prenom.nom+chien@exemple.fr",
    });
  });
  it.each([
    "",
    "pas-un-mail",
    "a@b",
    "a@@b.fr",
    "a b@exemple.fr",
    ".a@exemple.fr",
    "a..b@exemple.fr",
    "a@-exemple.fr",
    "a@exemple.f",
    "a@exemple.123",
  ])("refuse « %s »", (value) => {
    expect(checkEmail(value).ok).toBe(false);
  });
  it("refuse les adresses jetables et leurs sous-domaines à l’inscription", () => {
    expect(isDisposableEmail("x@yopmail.com")).toBe(true);
    expect(isDisposableEmail("x@a.mailinator.com")).toBe(true);
    expect(isDisposableEmail("x@gmail.com")).toBe(false);
    const r = checkEmail("chien@yopmail.com");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/jetables/);
  });
  it("propose la bonne adresse sur une faute de frappe courante", () => {
    expect(emailSuggestion("sam@gmial.com")).toBe("sam@gmail.com");
    const r = checkEmail("sam@hotmial.fr");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("sam@hotmail.fr");
  });
  it("à la connexion, seul le format compte", () => {
    expect(checkEmail("chien@yopmail.com", { allowDisposable: true }).ok).toBe(
      true,
    );
    expect(checkEmail("sam@gmial.com", { allowDisposable: true }).ok).toBe(
      true,
    );
    expect(checkEmail("pas-un-mail", { allowDisposable: true }).ok).toBe(false);
  });
});

import { newPasswordError, validateCredentials, validateEmail } from "./auth";
import { personNameError, petAgeError, petNameError } from "./text";
import {
  decimalInput,
  digitsOnly,
  euroCents,
  phoneError,
  phoneInput,
} from "./numbers";
import { cityQuery, cityTextError } from "../places/cities";

describe("mots de passe, noms, âges", () => {
  it("conserve les formats déjà acceptés pour se connecter et récupérer un compte", () => {
    expect(validateEmail("Élise@exemple.fr")).toBeNull();
    expect(
      validateCredentials(
        { email: "Élise@exemple.fr", password: "ancien" },
        "login",
      ).ok,
    ).toBe(true);
    expect(personNameError("李")).toBeNull();
    expect(phoneError("03.20.12.34.56")).toBeNull();
  });
  it("mot de passe : lettre et chiffre, pas un mot de passe courant", () => {
    expect(newPasswordError("chienLoup42")).toBeNull();
    expect(newPasswordError("motdepasse")).toMatch(/chiffre/);
    expect(newPasswordError("azerty123")).toMatch(/courant/);
    expect(newPasswordError("court1")).toMatch(/8/);
  });
  it("prénom et nom d’animal", () => {
    expect(personNameError("Marie-Ève")).toBeNull();
    expect(personNameError("N'Golo")).toBeNull();
    expect(personNameError("Sam42")).toMatch(/lettres/);
    expect(petNameError("R2-D2")).toBeNull();
    expect(petNameError("<script>")).toMatch(/lettres/);
  });
  it.each([
    "3",
    "3 ans",
    "1 an",
    "1,5 an",
    "6 mois",
    "8 semaines",
    "1 an et 2 mois",
    "99 ans",
  ])("âge accepté : %s", (v) => {
    expect(petAgeError(v)).toBeNull();
  });
  it.each(["vieux", "trois ans", "3 jours", "-2 ans"])(
    "âge refusé : %s",
    (v) => {
      expect(petAgeError(v)).not.toBeNull();
    },
  );
});

describe("nombres et téléphone", () => {
  it("ne garde que des chiffres", () => {
    expect(digitsOnly("1a5 kg", 3)).toBe("15");
    expect(decimalInput("12.5")).toBe("12,5");
    expect(decimalInput("1a2 €")).toBe("12");
    expect(decimalInput("3,456")).toBe("3,45");
    expect(decimalInput("1,2,3")).toBe("1,23");
    expect(
      decimalInput("-50.123456", { decimals: 5, integers: 2, negative: true }),
    ).toBe("-50,12345");
    expect(euroCents("12,5")).toBe(1250);
    expect(euroCents("abc")).toBeNull();
  });
  it("téléphone", () => {
    expect(phoneInput("06.12-34 abc 56")).toBe("061234 56");
    expect(phoneInput("+33 6 12")).toBe("+33 6 12");
    expect(phoneError("06 12 34 56 78")).toBeNull();
    expect(phoneError("+33 6 12 34 56 78")).toBeNull();
    expect(phoneError("+32 470 12 34 56")).toBeNull();
    expect(phoneError("12345")).toMatch(/invalide/);
  });
});

describe("villes", () => {
  it("requête : 2 lettres au moins, ou un code postal complet", () => {
    expect(cityQuery("l")).toBeNull();
    expect(cityQuery("li")).toEqual({ nom: "li" });
    expect(cityQuery("59000")).toEqual({ codePostal: "59000" });
    expect(cityQuery("590")).toBeNull();
  });
  it("texte de ville", () => {
    expect(cityTextError("Marcq-en-Barœul")).toBeNull();
    expect(cityTextError("L'Isle-Adam")).toBeNull();
    expect(cityTextError("Lille42")).not.toBeNull();
    expect(cityTextError("59000", { postcode: true })).toBeNull();
    expect(cityTextError("", { required: true })).toMatch(/ville/);
  });
});
