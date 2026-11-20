import type { FurrixClient } from "../services/supabaseClient";
import { toDataError } from "../services/errors";
import type { Category, Notification } from "./types";
export async function listNotifications(
  client: FurrixClient,
  options: { limit?: number; before?: Notification; id?: string } = {},
) {
  const { data, error } = await client.rpc("list_app_notifications", {
    p_limit: options.limit ?? 50,
    ...(options.before
      ? { p_before: options.before.created_at, p_before_id: options.before.id }
      : {}),
    ...(options.id ? { p_id: options.id } : {}),
  });
  if (error) throw toDataError(error);
  return data ?? [];
}
export async function readNotification(client: FurrixClient, id?: string) {
  const result = id
    ? await client.rpc("read_app_notification", { p_id: id })
    : await client.rpc("read_all_app_notifications");
  if (result.error) throw toDataError(result.error);
  window.dispatchEvent(new Event("furrix:notifications-read"));
}
export async function getPreferences(client: FurrixClient) {
  const { data, error } = await client.rpc("get_notification_preferences");
  if (error) throw toDataError(error);
  return data ?? [];
}
export async function setPreference(
  client: FurrixClient,
  category: Category,
  enabled: boolean,
) {
  const { error } = await client.rpc("set_notification_preference", {
    p_category: category,
    p_push: enabled,
  });
  if (error) throw toDataError(error);
}
