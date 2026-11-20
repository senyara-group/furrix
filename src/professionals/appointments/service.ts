import type { FurrixClient } from "../../services/supabaseClient";
import { AppError, toDataError } from "../../services/errors";
import type { Database } from "../../types/database";
type Functions = Database["public"]["Functions"];
function failure(error: { code?: string } | null) {
  if (!error) return;
  if (error.code === "23505")
    throw new AppError(
      "invalid_data",
      "Le créneau ou la demande a changé. Actualise les rendez-vous avant de réessayer.",
    );
  if (error.code === "22023")
    throw new AppError(
      "invalid_data",
      "Vérifie le créneau et la prestation : ce choix n’est plus disponible ou les informations sont invalides.",
    );
  if (error.code === "P0001")
    throw new AppError(
      "rate_limited",
      "Trop de demandes aujourd’hui. Réessaie plus tard.",
    );
  throw toDataError(error);
}
export async function listSlots(client: FurrixClient, professional: string) {
  const { data, error } = await client.rpc("list_professional_slots", {
    p_professional: professional,
  });
  failure(error);
  return data ?? [];
}
export async function listAppointments(client: FurrixClient, id?: string) {
  const { data, error } = await client.rpc(
    "list_professional_appointments",
    id ? { p_id: id } : {},
  );
  failure(error);
  return data ?? [];
}
export async function publishSlot(
  client: FurrixClient,
  args: Functions["publish_professional_slot"]["Args"],
) {
  const { error } = await client.rpc("publish_professional_slot", args);
  failure(error);
}
export async function closeSlot(client: FurrixClient, id: string) {
  const { error } = await client.rpc("close_professional_slot", { p_id: id });
  failure(error);
}
export async function requestAppointment(
  client: FurrixClient,
  args: Functions["request_professional_appointment"]["Args"],
) {
  const { data, error } = await client.rpc(
    "request_professional_appointment",
    args,
  );
  failure(error);
  if (!data)
    throw new AppError(
      "unknown",
      "L’envoi n’a pas pu être confirmé. Réessaie sans changer ta demande.",
    );
  return data;
}
export async function updateAppointment(
  client: FurrixClient,
  args: Functions["update_professional_appointment"]["Args"],
) {
  const { error } = await client.rpc("update_professional_appointment", args);
  failure(error);
}
