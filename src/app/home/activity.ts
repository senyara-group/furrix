import { messagesHref } from "../../meetings/links";
import { gardeHref } from "../../sitting/links";
import { appointmentHref } from "../../professionals/appointments/types";
import type { HomeActivity } from "./service";
export type ActivityItem = {
  id: string;
  category: string;
  title: string;
  status: string;
  date: string | null;
  ends?: string;
  href: string;
  waiting: boolean;
  ongoing: boolean;
};
const time = (value: string) => new Date(value).getTime();
/** Les accords ne deviennent jamais des confirmations par simple affichage dans l’accueil. */
export function activityItems(
  data: HomeActivity,
  now: number,
): { waiting: ActivityItem[]; upcoming: ActivityItem[] } {
  const result: ActivityItem[] = [];
  for (const m of data.matches) {
    if (
      m.proposal_status !== "pending" &&
      !(
        m.proposal_status === "accepted" &&
        m.proposal_slot &&
        time(m.proposal_slot) > now
      )
    )
      continue;
    result.push({
      id: "match:" + m.match_id,
      category: "Rencontres",
      title: `${m.my_pet_name} et ${m.name}`,
      status:
        m.proposal_status === "pending"
          ? "Proposition à consulter"
          : "Rencontre acceptée",
      date: m.proposal_status === "pending" ? null : m.proposal_slot,
      href: messagesHref(m.match_id, "rencontre"),
      waiting: m.proposal_status === "pending",
      ongoing: false,
    });
  }
  for (const s of data.sittings) {
    if (
      !Number.isFinite(time(s.starts_at)) ||
      !Number.isFinite(time(s.ends_at)) ||
      time(s.ends_at) <= now
    )
      continue;
    if (
      !["pending", "accepted", "confirmed"].includes(s.status) ||
      (s.status !== "confirmed" && time(s.starts_at) <= now)
    )
      continue;
    const ongoing = s.status === "confirmed" && time(s.starts_at) <= now;
    result.push({
      id: "sitting:" + s.id,
      category: "Garde",
      title: `Garde de ${s.pet_name}`,
      status:
        s.status === "pending"
          ? s.role === "sitter"
            ? "Demande reçue à consulter"
            : "En attente du gardien"
          : s.status === "accepted"
            ? "Accord du gardien · garde non confirmée"
            : ongoing
              ? "Garde en cours"
              : "Garde confirmée",
      date: s.starts_at,
      ends: s.ends_at,
      href: gardeHref({ vue: "suivi", demande: s.id }),
      waiting: s.status !== "confirmed",
      ongoing,
    });
  }
  for (const a of data.appointments) {
    if (
      !Number.isFinite(time(a.starts_at)) ||
      !Number.isFinite(time(a.ends_at)) ||
      time(a.ends_at) <= now ||
      !["pending", "countered", "confirmed"].includes(a.status)
    )
      continue;
    if (a.status !== "confirmed" && time(a.starts_at) <= now) continue;
    const ongoing = a.status === "confirmed" && time(a.starts_at) <= now;
    result.push({
      id: "appointment:" + a.id,
      category: "Services",
      title: `${a.service_name} · ${a.professional_name}`,
      status:
        a.status === "pending"
          ? a.role === "professional"
            ? "Demande reçue à consulter"
            : "En attente de l’établissement"
          : a.status === "countered"
            ? a.role === "owner"
              ? "Nouveau créneau à accepter"
              : "En attente du propriétaire"
            : ongoing
              ? "Rendez-vous en cours"
              : "Rendez-vous confirmé",
      date: a.starts_at,
      ends: a.ends_at,
      href: appointmentHref(a.id),
      waiting: a.status !== "confirmed",
      ongoing,
    });
  }
  const compare = (a: ActivityItem, b: ActivityItem) =>
    Number(b.ongoing) - Number(a.ongoing) ||
    (a.date ? time(a.date) : Number.MAX_SAFE_INTEGER) -
      (b.date ? time(b.date) : Number.MAX_SAFE_INTEGER) ||
    a.id.localeCompare(b.id);
  const unique = [...new Map(result.map((item) => [item.id, item])).values()];
  return {
    waiting: unique.filter((item) => item.waiting).sort(compare),
    upcoming: unique.filter((item) => !item.waiting).sort(compare),
  };
}
export function activityDate(item: ActivityItem) {
  if (!item.date) return "Créneau à consulter dans la proposition";
  const format = new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  });
  return (
    format.format(new Date(item.date)) +
    (item.ends ? " → " + format.format(new Date(item.ends)) : "")
  );
}
