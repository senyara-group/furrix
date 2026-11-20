export type Slot = {
  id: string;
  starts_at: string;
  ends_at: string;
  available: boolean;
};
export type Appointment = {
  id: string;
  role: "owner" | "professional";
  owner_id: string;
  professional_id: string;
  professional_name: string;
  owner_name: string | null;
  category: string;
  city: string;
  pet_id: string | null;
  pet_name: string | null;
  pet_species: string | null;
  pet_breed: string | null;
  pet_age: string | null;
  share_pet: boolean;
  service_name: string;
  unit: string;
  price_cents: number | null;
  slot_id: string;
  starts_at: string;
  ends_at: string;
  status:
    | "pending"
    | "countered"
    | "confirmed"
    | "declined"
    | "withdrawn"
    | "cancelled";
  message: string | null;
  professional_note: string | null;
  cancel_note: string | null;
  cancelled_by: string | null;
  created_at: string;
  updated_at: string;
};
export const labels: Record<Appointment["status"], string> = {
  pending: "Demande envoyée",
  countered: "Autre créneau proposé",
  confirmed: "Rendez-vous confirmé",
  declined: "Demande refusée",
  withdrawn: "Demande retirée",
  cancelled: "Rendez-vous annulé",
};
export const appointmentHref = (id?: string) =>
  "#/services?vue=rendez-vous" +
  (id ? "&rendezvous=" + encodeURIComponent(id) : "");
export const slotsHref = "#/services?vue=creneaux";
export const slotLabel = (s: { starts_at: string; ends_at: string }) =>
  new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(s.starts_at)) +
  " → " +
  new Intl.DateTimeFormat("fr-FR", {
    timeStyle: "short",
    ...(new Date(s.starts_at).toDateString() !==
    new Date(s.ends_at).toDateString()
      ? { dateStyle: "medium" as const }
      : {}),
  }).format(new Date(s.ends_at));
export const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
