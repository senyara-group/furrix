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
};
export type OwnProfessional = Omit<
  Professional,
  "professional_id" | "distance_km"
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
    return url.protocol === "https:" && !url.username && !url.password
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
