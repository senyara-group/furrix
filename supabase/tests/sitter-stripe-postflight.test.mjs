import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { meetingsFixture } from "./meetings-fixture.mjs";
const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
test("contrôle après application de l’inscription Stripe", async (t) => {
  const db = await meetingsFixture();
  const check = await read("../checks/sitter-stripe-onboarding-postflight.sql");
  const migration = await read("../migrations/20261125105925_sitter_stripe_onboarding.sql");
  const rollback = await read("../operations/rollback_sitter_stripe_onboarding.sql");
  try {
    await t.test("accepte la migration telle que versionnée", async () => {
      await db.exec(check);
    });
    await t.test("détecte une lecture directe ouverte au client", async () => {
      await db.exec("grant select on public.sitter_stripe_accounts to authenticated");
      await assert.rejects(db.exec(check), /Accès client direct/);
      await db.exec("rollback; revoke select on public.sitter_stripe_accounts from authenticated");
    });
    await t.test("détecte une RPC serveur exposée au client", async () => {
      await db.exec("grant execute on function public.attach_sitter_stripe_account(uuid,uuid,text) to authenticated");
      await assert.rejects(db.exec(check), /RPC serveur exposée au client/);
      await db.exec("rollback; revoke execute on function public.attach_sitter_stripe_account(uuid,uuid,text) from authenticated");
    });
    await t.test("détecte une migration absente, puis la réapplication", async () => {
      await db.exec(rollback);
      await assert.rejects(db.exec(check), /Table manquante/);
      await db.exec("rollback");
      await db.exec(migration);
      await db.exec(check);
    });
  } finally {
    await db.close();
  }
});
