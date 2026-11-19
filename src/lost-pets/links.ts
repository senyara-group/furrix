export type LostTab = "list" | "mine" | "new" | "notifications" | "sector";
const tabs: readonly string[] = [
  "list",
  "mine",
  "new",
  "notifications",
  "sector",
];
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Les adresses ne contiennent qu’un onglet et l’identifiant de l’alerte, jamais de données de compte. */
export function readLostRoute(hash: string) {
  const p = new URLSearchParams(hash.split("?")[1] ?? "");
  const candidate = p.has("notifications")
    ? "notifications"
    : (p.get("vue") ?? "list");
  const tab: LostTab = tabs.includes(candidate)
    ? (candidate as LostTab)
    : "list";
  const ids = p.getAll("alerte");
  const invalid = ids.length > 1 || (ids.length === 1 && !uuid.test(ids[0]!));
  return {
    tab,
    alertId: !invalid && ids.length === 1 ? ids[0]! : null,
    invalid,
  };
}
export function lostHref(tab: LostTab = "list", id?: string) {
  const p = new URLSearchParams();
  if (tab === "notifications") p.set("notifications", "");
  else if (tab !== "list") p.set("vue", tab);
  if (id) {
    if (!uuid.test(id)) throw Error("Identifiant d’alerte invalide.");
    p.set("alerte", id);
  }
  const query = p.toString();
  return "#/animaux-perdus" + (query ? "?" + query : "");
}
export const lostShareUrl = (id: string) =>
  "https://furrix.fr/" + lostHref("list", id);
