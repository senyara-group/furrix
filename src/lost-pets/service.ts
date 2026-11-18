import type { FurrixClient } from "../services/supabaseClient";
import { AppError, toDataError } from "../services/errors";
import { uploadPetPhoto } from "../services/petPhotos";
import { downloadPrivatePetPhoto } from "../pets/privatePhotos";
import type { PetRow } from "../types/database";
import type { LostForm, PublishLostArgs } from "./types";

/** Validation avant toute requête, dont la copie de la photo. Le serveur vérifie à nouveau. */
export function validateLostForm(
  values: LostForm,
  now = Date.now(),
): Omit<PublishLostArgs, "p_id" | "p_photo"> {
  const lat = Number(values.latitude),
    lng = Number(values.longitude),
    date = new Date(values.seenAt),
    radius = Number(values.radius);
  if (
    !values.petId ||
    !values.city.trim() ||
    values.city.trim().length > 80 ||
    !values.latitude.trim() ||
    !values.longitude.trim() ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    Math.abs(lat) > 90 ||
    Math.abs(lng) > 180
  )
    throw new AppError(
      "validation",
      "Choisis ton animal, une ville et une zone valide.",
    );
  if (!Number.isFinite(date.getTime()) || date.getTime() > now + 5 * 60_000)
    throw new AppError(
      "validation",
      "Indique une date passée pour la dernière observation.",
    );
  if (
    !values.description.trim() ||
    values.description.trim().length > 1500 ||
    values.instructions.length > 500 ||
    !Number.isInteger(radius) ||
    radius < 1 ||
    radius > 50
  )
    throw new AppError(
      "validation",
      "Complète la description et vérifie les longueurs et le rayon.",
    );
  return {
    p_pet: values.petId,
    p_city: values.city.trim(),
    p_lat: Math.round(lat * 100) / 100,
    p_lng: Math.round(lng * 100) / 100,
    p_seen: date.toISOString(),
    p_description: values.description.trim(),
    p_instructions: values.instructions.trim(),
    p_radius: radius,
  };
}
/** Copie indépendante du portrait : remplacer la photo du profil ne casse pas l'alerte. */
export async function snapshotLostPhoto(
  client: FurrixClient,
  pet: PetRow,
  alertId: string,
) {
  const source = pet.photos?.[0];
  if (!source) return undefined;
  const blob = await downloadPrivatePetPhoto(
    client,
    pet.owner_id,
    pet.id,
    source,
  );
  return uploadPetPhoto(client, {
    userId: pet.owner_id,
    petId: alertId,
    file: blob,
  });
}
export async function publishLost(client: FurrixClient, args: PublishLostArgs) {
  const { data, error } = await client.rpc("publish_lost_alert", args);
  if (error) throw toDataError(error);
  return data;
}
export async function listLost(
  client: FurrixClient,
  city = "",
  after?: string,
  id?: string,
) {
  const { data, error } = await client.rpc("list_lost_alerts", {
    ...(city.trim() ? { p_city: city.trim() } : {}),
    ...(after ? { p_after: after } : {}),
    ...(id ? { p_id: id } : {}),
    p_limit: 30,
  });
  if (error) throw toDataError(error);
  return data ?? [];
}
export async function updateLost(
  client: FurrixClient,
  id: string,
  description: string,
  instructions: string,
  status: "lost" | "found" | "closed",
) {
  const { error } = await client.rpc("update_lost_alert", {
    p_id: id,
    p_description: description,
    p_instructions: instructions,
    p_status: status,
  });
  if (error) throw toDataError(error);
}
export async function addSighting(
  client: FurrixClient,
  id: string,
  alert: string,
  seen: string,
  city: string,
  message: string,
) {
  const date = new Date(seen);
  if (
    !city.trim() ||
    city.trim().length > 80 ||
    !message.trim() ||
    message.trim().length > 1000 ||
    !Number.isFinite(date.getTime()) ||
    date.getTime() > Date.now() + 300_000
  )
    throw new AppError("validation", "Vérifie la date, le lieu et le message.");
  const { error } = await client.rpc("add_lost_sighting", {
    p_id: id,
    p_alert: alert,
    p_seen: date.toISOString(),
    p_city: city.trim(),
    p_message: message.trim(),
  });
  if (error) throw toDataError(error);
}
export async function listSightings(client: FurrixClient, id: string) {
  const { data, error } = await client
    .from("lost_sightings")
    .select("id,alert_id,observer_id,seen_at,city,message,created_at")
    .eq("alert_id", id)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw toDataError(error);
  return data ?? [];
}
export async function listNotifications(
  client: FurrixClient,
  owner: string,
  unread = false,
) {
  let query = client
    .from("local_notifications")
    .select("id,user_id,alert_id,kind,title,read_at,created_at")
    .eq("user_id", owner);
  if (unread) query = query.is("read_at", null);
  const { data, error } = await query
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw toDataError(error);
  return data ?? [];
}
export async function readNotification(client: FurrixClient, id: string) {
  const { error } = await client.rpc("read_local_notification", { p_id: id });
  if (error) throw toDataError(error);
}
export async function getSector(client: FurrixClient, owner: string) {
  const { data, error } = await client
    .from("lost_alert_subscriptions")
    .select("user_id,latitude,longitude,radius_km,created_at")
    .eq("user_id", owner)
    .maybeSingle();
  if (error) throw toDataError(error);
  return data;
}
export async function setSector(
  client: FurrixClient,
  enabled: boolean,
  lat?: number,
  lng?: number,
  radius = 25,
) {
  const { error } = await client.rpc("set_lost_alert_sector", {
    p_enabled: enabled,
    ...(enabled ? { p_lat: lat, p_lng: lng, p_radius: radius } : {}),
  });
  if (error) throw toDataError(error);
}
export async function reportLost(
  client: FurrixClient,
  id: string,
  reason: string,
) {
  const { error } = await client.rpc("report_lost_alert", {
    p_id: id,
    p_reason: reason.trim(),
  });
  if (error) throw toDataError(error);
}
