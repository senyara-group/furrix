import type { FurrixClient } from "../services/supabaseClient";
export type AccountBlocker = { section: string; total: number };
export const deletionNoticeKey = "furrix:account-deletion-requested";
export async function deletionChecks(client: FurrixClient) {
  const { data: session } = await client.auth.getSession();
  if (!session.session) throw Error("Reconnecte-toi pour vérifier ton compte.");
  const status = await client
    .from("account_deletions")
    .select("completed_at")
    .eq("user_id", session.session.user.id)
    .maybeSingle();
  if (status.error)
    throw Error("La suppression n’est pas disponible pour le moment.");
  const owner = session.session.user.id;
  if (status.data)
    return { owner, requested: true, blockers: [] as AccountBlocker[] };
  const { data, error } = await client.rpc("account_deletion_blockers");
  if (error || !Array.isArray(data))
    throw Error("Les activités n’ont pas pu être vérifiées.");
  return { owner, requested: false, blockers: data as AccountBlocker[] };
}
export async function requestDeletion(
  client: FurrixClient,
  password: string,
  confirmation: string,
  owner: string,
) {
  const { data, error } = await client.functions.invoke("account-deletion", {
    body: { password, confirmation, expected_user: owner },
  });
  if (error) {
    let code = "";
    try {
      code = (await error.context?.json())?.status ?? "";
    } catch {}
    if (code === "activities_pending")
      throw Error("Une activité reste à traiter. Actualise les vérifications.");
    if (code === "reauthentication_failed")
      throw Error("Le mot de passe n’a pas pu être confirmé. Réessaie.");
    if (code === "account_changed")
      throw Error(
        "Le compte connecté a changé. Recharge ton espace avant de continuer.",
      );
    if (code === "mfa_support_required")
      throw Error(
        "Ce compte utilise un second facteur. Contacte l’équipe pour effectuer sa suppression sans contourner cette protection.",
      );
    throw Error(
      "La demande n’a pas pu être confirmée. Réessaie : une demande déjà acceptée ne sera pas dupliquée.",
    );
  }
  if (data?.status !== "accepted")
    throw Error("La demande n’a pas pu être confirmée.");
  try {
    sessionStorage.removeItem("furrix:active-pet:" + owner);
    localStorage.removeItem("furrix:first-steps:v1:" + owner);
  } catch {}
}
/** Ne contient ni adresse ni identifiant ; permet de retrouver l'accusé de réception après déconnexion. */
export function rememberDeletion() {
  try {
    sessionStorage.setItem(deletionNoticeKey, "1");
  } catch {}
}
