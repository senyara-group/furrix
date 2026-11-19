import type { FurrixClient } from "../services/supabaseClient";
import { toDataError } from "../services/errors";
import type { Category, SaveProfessionalArgs } from "./types";
export async function searchProfessionals(
  client: FurrixClient,
  position: { latitude: number; longitude: number },
  radius: number,
  category?: Category,
) {
  const { data, error } = await client.rpc("search_professionals", {
    p_lat: position.latitude,
    p_lng: position.longitude,
    p_radius: radius,
    ...(category ? { p_category: category } : {}),
  });
  if (error) throw toDataError(error);
  return data ?? [];
}
export async function getProfessional(client: FurrixClient, id: string) {
  const { data, error } = await client.rpc("search_professionals", {
    p_professional: id,
  });
  if (error) throw toDataError(error);
  return data?.[0] ?? null;
}
export async function ownProfessional(client: FurrixClient, owner: string) {
  const { data, error } = await client
    .from("professional_profiles")
    .select("*")
    .eq("user_id", owner)
    .maybeSingle();
  if (error) throw toDataError(error);
  return data;
}
export async function saveProfessional(
  client: FurrixClient,
  args: SaveProfessionalArgs,
) {
  const { data, error } = await client.rpc("save_professional_profile", args);
  if (error) throw toDataError(error);
  return data;
}
export async function setProfessionalActive(
  client: FurrixClient,
  active: boolean,
) {
  const { error } = await client.rpc("set_professional_active", {
    p_active: active,
  });
  if (error) throw toDataError(error);
}
