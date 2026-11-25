import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID as uuid } from "node:crypto";
import { readFile } from "node:fs/promises";
import { meetingsFixture } from "./meetings-fixture.mjs";
test("inscription Stripe : accès, reprise, bail et suppression", async () => {
  const db = await meetingsFixture(), A = uuid(), B = uuid(), session = uuid();
  const as = async (role, user, sql, args = []) => {
    await db.exec("set role " + role);
    try {
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
        user ?? "",
      ]);
      await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({session_id:session})]);
      return (await db.query(sql, args)).rows;
    } finally {
      await db.exec("reset role;reset request.jwt.claim.sub;reset request.jwt.claims");
    }
  };
  const member = (u, start) =>
    as(
      "authenticated",
      u,
      "select prepare_sitter_stripe_onboarding($1) result",
      [start],
    );
  const server = (sql, args = []) => as("service_role", null, sql, args);
  try {
    await db.exec(
      await readFile(
        new URL(
          "../operations/rollback_sitter_stripe_onboarding.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    await db.exec(
      await readFile(
        new URL(
          "../migrations/20261125135930_sitter_stripe_onboarding.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    await db.query("insert into auth.users(id) values($1),($2)", [A, B]);
    await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[session,A]);
    await db.exec(
      "insert into private_beta_members(user_id,expires_at,accepted_at,notice_version,declared_adult) select id,null,now(),'2026-11-17',true from auth.users",
    );
    await assert.rejects(member(A, true), /Profil de gardien requis/);
    await as(
      "authenticated",
      A,
      "select save_sitter_profile('particulier','Présentation personnelle suffisamment longue.','Lille',50,3,array['chien'],15,'jardin_clos',$1,true)",
      [JSON.stringify([{ service: "visite", price_cents: 1000 }])],
    );
    assert.equal((await member(A, false))[0].result.account, null);
    const first = (await member(A, true))[0].result;
    assert.equal(first.user, A);
    assert.deepEqual(
      await as("authenticated", A, "select * from account_deletion_blockers()"),
      [{ section: "paiement", total: 1 }],
    );
    await assert.rejects(
      db.exec(
        await readFile(
          new URL(
            "../operations/rollback_sitter_stripe_onboarding.sql",
            import.meta.url,
          ),
          "utf8",
        ),
      ),
      /Liaisons Stripe présentes/,
    );
    await db.exec("rollback");
    await assert.rejects(member(A, true), /Préparation en cours/);
    await assert.rejects(
      as("authenticated", A, "select * from sitter_stripe_accounts"),
      /permission denied/,
    );
    await assert.rejects(
      as("anon", null, "select prepare_sitter_stripe_onboarding(true)"),
      /permission denied/,
    );
    await assert.rejects(
      as("authenticated", B, "select attach_sitter_stripe_account($1,$2,$3)", [
        A,
        first.key,
        "acct_test",
      ]),
      /permission denied/,
    );
    await assert.rejects(
      server("select attach_sitter_stripe_account($1,$2,$3)", [
        A,
        uuid(),
        "acct_test",
      ]),
      /Liaison incohérente/,
    );
    await server("select release_sitter_stripe_onboarding($1,$2)", [A, uuid()]);
    await assert.rejects(member(A, true), /Préparation en cours/);
    await server("select release_sitter_stripe_onboarding($1,$2)", [
      A,
      first.claim,
    ]);
    await db.query(
      "update sitter_stripe_accounts set last_link_at=now()-interval '1 minute' where user_id=$1",
      [A],
    );
    const retry = (await member(A, true))[0].result;
    assert.equal(retry.key, first.key);
    assert.notEqual(retry.claim, first.claim);
    await server("select attach_sitter_stripe_account($1,$2,$3)", [
      A,
      first.key,
      "acct_test",
    ]);
    await server("select attach_sitter_stripe_account($1,$2,$3)", [
      A,
      first.key,
      "acct_test",
    ]);
    await assert.rejects(
      server("select attach_sitter_stripe_account($1,$2,$3)", [
        A,
        first.key,
        "acct_other",
      ]),
      /Liaison incohérente/,
    );
    assert.equal((await member(A, false))[0].result.account, "acct_test");
    await db.query('delete from auth.sessions where id=$1',[session]);
    await assert.rejects(member(A,false),/Session terminée/);
    await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[session,A]);
    await assert.rejects(
      server("select request_account_deletion($1)", [A]),
      /Compte de paiement à clôturer/,
    );
    await db.query(
      "update private_beta_members set active=false where user_id=$1",
      [A],
    );
    await assert.rejects(member(A, false), /Accès bêta requis/);
    await db.query(
      "update private_beta_members set active=true where user_id=$1",
      [A],
    );
    await db.query(
      "update sitter_stripe_accounts set stripe_account_id=null,lease_until=null,last_link_at=null,created_at=now()-interval '24 hours' where user_id=$1",
      [A],
    );
    await assert.rejects(member(A, true), /Rapprochement Stripe nécessaire/);
  } finally {
    await db.close();
  }
});
