import { messagesHref } from "../meetings/links";
import { chatHref, gardeHref } from "../sitting/links";
import { appointmentHref } from "../professionals/appointments/types";
import { lostHref } from "../lost-pets/links";
export const categories = {
  rencontres: "Rencontres",
  messages: "Messages",
  garde: "Garde",
  services: "Services",
  animaux_perdus: "Animaux perdus",
} as const;
export type Category = keyof typeof categories;
export type Notification = {
  id: string;
  category: Category;
  kind: string;
  target_type: string;
  target_id: string;
  context_id: string | null;
  title: string;
  read_at: string | null;
  created_at: string;
  legacy: boolean;
  unread_total: number;
};
export type Preference = { category: Category; push_enabled: boolean };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Aucun lien libre venu du réseau : seulement des destinations connues et des UUID validés. */
export function notificationHref(
  n: Pick<Notification, "target_type" | "target_id" | "context_id">,
) {
  if (!uuid.test(n.target_id)) return null;
  switch (n.target_type) {
    case "like":
      return "#/rencontres";
    case "match":
      return messagesHref(n.target_id);
    case "proposal":
      return messagesHref(n.target_id, "rencontre");
    case "sitting":
      return gardeHref({ vue: "suivi", demande: n.target_id });
    case "sitting_chat":
      return n.context_id && uuid.test(n.context_id)
        ? chatHref(n.target_id, n.context_id)
        : null;
    case "appointment":
      return appointmentHref(n.target_id);
    case "lost":
      return lostHref("notifications", n.target_id);
    default:
      return null;
  }
}
