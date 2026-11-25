import { describe, expect, it, vi } from "vitest";
import {
  type Claim,
  OnboardingError,
  onboardingHandler,
} from "../../supabase/functions/sitter-stripe-onboarding/core";
import {
  FURRIX_STRIPE_SANDBOX,
  stripeOnboarding,
} from "../../supabase/functions/sitter-stripe-onboarding/stripe";
const claim: Claim = {
  user: "owner",
  account: null,
  key: "stable",
  claim: "lease",
};
function setup() {
  const store = {
    identify: vi.fn(async () => "owner"),
    prepare: vi.fn(async () => claim),
    attach: vi.fn(async () => {}),
    release: vi.fn(async () => {}),
  };
  const provider = {
    verifyPlatform: vi.fn(async () => {}),
    create: vi.fn(async () => "acct_test"),
    status: vi.fn(async () => ({
      charges: false,
      payouts: false,
      reviewing: false,
    })),
    link: vi.fn(async () => "https://connect.stripe.com/setup/test"),
  };
  return { store, provider, run: onboardingHandler(store, provider, true) };
}
const req = (body: object = { action: "start" }, token = "valid") =>
  new Request("https://example.test", {
    method: "POST",
    headers: token ? { authorization: "Bearer " + token } : {},
    body: JSON.stringify(body),
  });
describe("Inscription Stripe côté serveur", () => {
  it("reste désactivée et refuse un appel non authentifié sans contacter Stripe", async () => {
    const { store, provider, run } = setup();
    expect((await onboardingHandler(store, provider, false)(req())).status)
      .toBe(503);
    expect((await run(req({}, ""))).status).toBe(401);
    expect(provider.create).not.toHaveBeenCalled();
  });
  it("refuse tout compte ou retour fourni par le client et les utilisateurs révoqués", async () => {
    const { store, provider, run } = setup();
    expect((await run(req({ action: "start", account: "acct_other" }))).status)
      .toBe(400);
    store.prepare.mockRejectedValue(new OnboardingError("forbidden"));
    expect((await run(req())).status).toBe(403);
    expect(provider.create).not.toHaveBeenCalled();
  });
  it("conserve le compte avant de créer le lien et libère le bail", async () => {
    const { store, provider, run } = setup();
    const result = await run(req());
    expect(await result.json()).toEqual({
      status: "incomplete",
      url: "https://connect.stripe.com/setup/test",
    });
    expect(store.attach).toHaveBeenCalledWith("owner", "stable", "acct_test");
    expect(store.attach.mock.invocationCallOrder[0]).toBeLessThan(
      provider.link.mock.invocationCallOrder[0]!,
    );
    expect(store.release).toHaveBeenCalledWith("owner", "lease");
  });
  it("reprend le compte existant et ne confond pas inscription envoyée et compte prêt", async () => {
    const { store, provider, run } = setup();
    store.prepare.mockResolvedValue({ ...claim, account: "acct_existing" });
    provider.status.mockResolvedValue({
      charges: true,
      payouts: false,
      reviewing: true,
    });
    expect(await (await run(req({ action: "status" }))).json()).toEqual({
      status: "pending",
    });
    expect(provider.create).not.toHaveBeenCalled();
    expect(provider.link).not.toHaveBeenCalled();
  });
  it("refuse le lien si la bêta a été révoquée pendant la préparation", async () => {
    const { store, provider, run } = setup();
    store.prepare.mockResolvedValueOnce(claim).mockResolvedValueOnce(claim)
      .mockRejectedValueOnce(new OnboardingError("forbidden"));
    expect((await run(req())).status).toBe(403);
    expect(provider.link).not.toHaveBeenCalled();
  });
  it("une réponse de création perdue conserve la même clé lors du nouvel essai", async () => {
    const { store, provider, run } = setup();
    provider.create.mockRejectedValueOnce(Error("network"));
    expect((await run(req())).status).toBe(503);
    await run(req());
    expect(provider.create.mock.calls).toEqual([["stable"], ["stable"]]);
    expect(store.release).toHaveBeenCalledTimes(2);
  });
  it("ne divulgue ni lien non Stripe ni détail du prestataire", async () => {
    const { provider, run } = setup();
    provider.link.mockResolvedValue(
      "https://connect.stripe.com.evil.test/setup",
    );
    expect(await (await run(req())).json()).toEqual({ status: "unavailable" });
  });
  it("signale une création concurrente ou trop ancienne sans recréer de compte", async () => {
    const { store, provider, run } = setup();
    for (const code of ["busy", "reconciliation_required"] as const) {
      store.prepare.mockRejectedValueOnce(new OnboardingError(code));
      expect(await (await run(req())).json()).toEqual({ status: code });
    }
    expect(provider.create).not.toHaveBeenCalled();
  });
});
describe("Adaptateur Stripe de test", () => {
  it("refuse une clé réelle et une autre plateforme avant la création", async () => {
    const send = vi.fn<typeof fetch>();
    await expect(stripeOnboarding("sk_live_fake", send).verifyPlatform())
      .rejects.toThrow("test_key_required");
    expect(send).not.toHaveBeenCalled();
    send.mockResolvedValue(Response.json({ id: "acct_other" }));
    await expect(stripeOnboarding("sk_test_fake", send).verifyPlatform())
      .rejects.toThrow("wrong_sandbox");
  });
  it("lit l’état par les capacités Accounts v2, sans supposer une capacité absente active", async () => {
    const account = (card?: string, payouts?: string, livemode = false) =>
      Response.json({
        id: "acct_v2",
        livemode,
        configuration: {
          merchant: {
            capabilities: {
              ...(card ? { card_payments: { status: card } } : {}),
              ...(payouts ? { stripe_balance: { payouts: { status: payouts } } } : {}),
            },
          },
        },
      });
    const send = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(account("active", "active"))
      .mockResolvedValueOnce(account("active"))
      .mockResolvedValueOnce(account("pending", "restricted"))
      .mockResolvedValueOnce(account("restricted", "restricted"))
      .mockResolvedValueOnce(account("active", "active", true));
    const stripe = stripeOnboarding("sk_test_fake", send);
    expect(await stripe.status("acct_v2")).toEqual({ charges: true, payouts: true, reviewing: false });
    expect(await stripe.status("acct_v2")).toEqual({ charges: true, payouts: false, reviewing: false });
    expect(await stripe.status("acct_v2")).toEqual({ charges: false, payouts: false, reviewing: true });
    expect(await stripe.status("acct_v2")).toEqual({ charges: false, payouts: false, reviewing: false });
    await expect(stripe.status("acct_v2")).rejects.toThrow("test_account_required");
    expect(String(send.mock.calls[0]![0])).toBe(
      "https://api.stripe.com/v2/core/accounts/acct_v2?include[0]=configuration.merchant",
    );
    expect(send.mock.calls[0]![1]!.method).toBe("GET");
    expect(send.mock.calls[0]![1]!.headers).toMatchObject({ "Stripe-Version": "2026-11-18.endive" });
  });
  it("fige le périmètre, la clé d’idempotence et les URLs de retour serveur", async () => {
    const send = vi.fn<typeof fetch>().mockResolvedValueOnce(
      Response.json({ id: FURRIX_STRIPE_SANDBOX }),
    )
      .mockResolvedValueOnce(
        Response.json({ id: "acct_created", livemode: false }),
      )
      .mockResolvedValueOnce(
        Response.json({ url: "https://connect.stripe.com/setup/test" }),
      );
    const stripe = stripeOnboarding("sk_test_fake", send);
    await stripe.verifyPlatform();
    await stripe.create("stable");
    await stripe.link("acct_created");
    const create = send.mock.calls[1]![1]!;
    expect(create.headers).toMatchObject({
      // Clé versionnée : le premier corps (avec display_name) a été envoyé sous « furrix-sitter-<clé> ».
      "Idempotency-Key": "furrix-sitter-v2-stable",
    });
    const body = JSON.parse(String(create.body));
    // Express exigerait des responsabilités « application » : combinaison refusée par Stripe.
    expect(body.dashboard).toBe("full");
    expect(body.configuration.merchant.capabilities).toEqual({ card_payments: { requested: true } });
    expect(body.defaults.responsibilities).toEqual({
      fees_collector: "stripe",
      losses_collector: "stripe",
    });
    // Plateforme française : sans jeton de compte, seule identity.country est permise (400 account_token_required).
    for (const field of ["display_name", "contact_email", "contact_phone"]) expect(body).not.toHaveProperty(field);
    expect(body.identity).toEqual({ country: "fr" });
    const link = JSON.parse(String(send.mock.calls[2]![1]!.body));
    // Corps accepté par Stripe : « configurations » est refusé (400 invalid_fields, champ inconnu).
    expect(link.use_case).toEqual({
      type: "account_onboarding",
      account_onboarding: {
        collection_options: { fields: "eventually_due" },
        return_url: "https://furrix.fr/#/garde?vue=profil",
        refresh_url: "https://furrix.fr/#/garde?vue=profil",
      },
    });
  });
});
