export const categories = {
  veterinaire: "Vétérinaire",
  toilettage: "Toilettage",
  education: "Éducation",
} as const;
export type Category = keyof typeof categories;
export type ProfessionalService = {
  name: string;
  unit: string;
  price_cents: number | null;
};
export type Professional = {
  professional_id: string;
  name: string;
  category: Category;
  city: string;
  bio: string;
  species: string[];
  hours: string;
  accessibility: string;
  phone: string | null;
  website: string | null;
  services: ProfessionalService[];
  distance_km: number | null;
  /** Position autorisée : centre de la commune déclarée, arrondi à 0,01° (environ 1 km). */
  latitude: number;
  longitude: number;
};
export type OwnProfessional = Omit<
  Professional,
  "professional_id" | "distance_km" | "latitude" | "longitude"
> & {
  user_id: string;
  latitude: number;
  longitude: number;
  active: boolean;
  updated_at: string;
};
export const professionalHref = (id?: string) =>
  id ? "#/services?professionnel=" + encodeURIComponent(id) : "#/services";
export function safeWebsite(value: string) {
  try {
    const url = new URL(value);
    // Un vrai domaine (« exemple.fr »), sans identifiant ni mot de passe dans l'adresse.
    return url.protocol === "https:" && !url.username && !url.password &&
      /^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/i.test(url.hostname)
      ? url.href
      : null;
  } catch {
    return null;
  }
}
export const servicePrice = (s: ProfessionalService) =>
  s.price_cents === null
    ? "Tarif à demander"
    : new Intl.NumberFormat("fr-FR", {
        style: "currency",
        currency: "EUR",
      }).format(s.price_cents / 100) +
      " / " +
      s.unit;
export type SaveProfessionalArgs = {
  p_name: string;
  p_category: Category;
  p_city: string;
  p_lat: number;
  p_lng: number;
  p_bio: string;
  p_species: string[];
  p_hours: string;
  p_accessibility: string;
  p_phone: string;
  p_website: string;
  p_services: ProfessionalService[];
  p_active: boolean;
};
