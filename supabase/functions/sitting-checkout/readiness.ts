/** À lever dans un lot revu avec événements signés, confirmation, annulation et rapprochement raccordés. */
const PAYMENT_LIFECYCLE_READY = false;
export function checkoutEnabled(
  requested: string | undefined,
  project: string,
  key: string,
): boolean {
  return PAYMENT_LIFECYCLE_READY && requested === "true" &&
    project === "https://jemikzqgbpaivlujnfgl.supabase.co" &&
    /^sk_test_[A-Za-z0-9]+$/.test(key);
}
