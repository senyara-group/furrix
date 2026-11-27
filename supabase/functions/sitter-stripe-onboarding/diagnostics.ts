export type StripeOperation =
  | "platform"
  | "create_account"
  | "read_account"
  | "create_link";
export type StripeDiagnostic = {
  event: "stripe_onboarding_error";
  operation: StripeOperation;
  http_status: number | null;
  code: string;
  request_id: string | null;
};

// Liste fermée : aucune chaîne libre du prestataire (message, URL, paramètre…) dans les journaux.
const codes = new Set([
  "account_token_required",
  "invalid_fields",
  "accounts_v2_access_blocked",
  "parameter_unknown",
  "parameter_missing",
  "resource_missing",
  "api_key_expired",
  "rate_limit",
  "idempotency_key_in_use",
]);

export function stripeErrorCode(body: unknown): string {
  if (body && typeof body === "object" && "error" in body) {
    const error = body.error;
    if (
      error && typeof error === "object" && "code" in error &&
      typeof error.code === "string" && codes.has(error.code)
    ) return error.code;
  }
  return "stripe_error";
}

/** Les erreurs de journalisation ne doivent pas changer le résultat ni la libération du bail. */
export function reportStripeError(
  report: (event: StripeDiagnostic) => void,
  operation: StripeOperation,
  code: string,
  response?: Response,
): void {
  const requestId = response?.headers.get("request-id") ?? "";
  try {
    report({
      event: "stripe_onboarding_error",
      operation,
      http_status: response?.status ?? null,
      code,
      request_id: /^req_[A-Za-z0-9]{1,80}$/.test(requestId) ? requestId : null,
    });
  } catch { /* Aucun objet d'erreur ni réponse brute en journal de secours. */ }
}
