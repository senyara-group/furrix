import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { meetingsFixture } from "./meetings-fixture.mjs";
const A = "10000000-0000-0000-0000-000000000001", // propriétaire
  P = "10000000-0000-0000-0000-000000000002", // établissement
  X = "10000000-0000-0000-0000-000000000003", // tiers
  PET = "20000000-0000-0000-0000-000000000001",
  S1 = "30000000-0000-0000-0000-000000000001",
  S2 = "30000000-0000-0000-0000-000000000002";
const at = (h) => new Date(Date.now() + 3 * 86400000 + h * 3600000).toISOString();
const M = (n) => `50000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
test("messagerie Services : participants seulement, rejeu, historique après annulation, notifications et suppression", async (t) => {
  const db = await meetingsFixture();
  const as = async (uid, sql, args = []) => {
    await db.exec("set role authenticated");
    try {
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [uid]);
      return (await db.query(sql, args)).rows;
    } finally {
      await db.exec("reset role;reset request.jwt.claim.sub");
    }
  };
  const send = (uid, appointment, text, n) => as(uid, "select * from send_professional_message($1,$2,$3)", [appointment, text, M(n)]);
  const read = (uid, appointment) => as(uid, "select * from professional_messages where appointment_id=$1 order by id", [appointment]);
  try {
    await db.exec(`insert into auth.users(id,raw_user_meta_data) values('${A}','{"name":"Alex"}'),('${P}','{"name":"Pat"}'),('${X}','{"name":"Inès"}');
      insert into private_beta_members(user_id,expires_at,accepted_at,notice_version,declared_adult) select id,null,now(),'2026-11-17',true from auth.users;
      insert into pets(id,owner_id,name,species) values('${PET}','${A}','Luna','chien');`);
    await as(P, "select save_professional_profile('Cabinet test','veterinaire','Lille',50.63,3.06,'Présentation professionnelle de test.',array['chien'],'','','','',$1,true)",
      [JSON.stringify([{ name: "Consultation", unit: "consultation", price_cents: 4500 }])]);
    await as(P, "select publish_professional_slot($1,$2,$3)", [S1, at(0), at(1)]);
    await as(P, "select publish_professional_slot($1,$2,$3)", [S2, at(2), at(3)]);
    const [{ id }] = await as(A, "select request_professional_appointment($1,$2,$3,$4,$5,$6) id", [S1, PET, "Consultation", "Première visite", false, M(900)]);

    await t.test("seuls les deux participants lisent et écrivent ; aucune écriture directe", async () => {
      const [m1] = await send(A, id, "  Bonjour, Luna a peur en voiture.  ", 1);
      assert.equal(m1.text, "Bonjour, Luna a peur en voiture.");
      await send(P, id, "Pas de souci, on prendra le temps.", 2);
      assert.deepEqual((await read(A, id)).map((m) => m.sender_id), [A, P]);
      assert.equal((await read(P, id)).length, 2);
      assert.equal((await read(X, id)).length, 0, "un tiers ne lit rien");
      await assert.rejects(send(X, id, "Coucou", 3), /Conversation non autorisée/);
      for (const priv of ["INSERT", "UPDATE", "DELETE"])
        assert.equal((await db.query("select has_table_privilege('authenticated','public.professional_messages',$1) ok", [priv])).rows[0].ok, false);
      await assert.rejects(as(A, "insert into professional_messages(appointment_id,sender_id,text,request_id) values($1,$2,'x',$3)", [id, A, M(4)]), /permission denied/);
    });
    await t.test("message vide ou trop long refusé ; rejeu sans doublon ; limite d’envoi", async () => {
      await assert.rejects(send(A, id, "   ", 5), /Message invalide/);
      await assert.rejects(send(A, id, "x".repeat(2001), 6), /Message invalide/);
      const [again] = await send(A, id, "Bonjour, Luna a peur en voiture.", 1);
      assert.equal((await read(A, id)).length, 2, "le rejeu ne crée pas de doublon");
      assert.equal(again.sender_id, A);
      await assert.rejects(send(A, id, "Autre texte", 1), /Requête différente/);
      const before = (await read(P, id)).filter((m) => m.sender_id === P).length;
      for (let n = 0; n < 30 - before; n++) await send(P, id, "Message " + n, 100 + n);
      await assert.rejects(send(P, id, "Un de trop", 199), /Trop de messages/);
      await db.query("update professional_messages set created_at=now()-interval '1 hour' where sender_id=$1", [P]);
    });
    await t.test("notifications : l’autre participant est prévenu, sans le texte", async () => {
      const notes = (await db.query("select * from app_notifications where user_id=$1 and kind='appointment_message' order by created_at", [P])).rows;
      assert.ok(notes.length >= 1);
      assert.equal(notes[0].target_type, "appointment");
      assert.equal(notes[0].target_id, id);
      assert.ok(!JSON.stringify(notes).includes("peur en voiture"));
      assert.ok((await db.query("select * from app_notifications where user_id=$1 and kind='appointment_message'", [A])).rows.length >= 1, "Alex est prévenu des réponses de l’établissement");
      assert.equal((await db.query("select count(*)::int n from app_notifications where kind='appointment_message' and user_id=other_id")).rows[0].n, 0, "jamais prévenu de ses propres messages");
    });
    await t.test("Messages : la conversation apparaît pour les deux, jamais pour un tiers", async () => {
      const [mine] = await as(A, "select * from list_professional_threads()");
      assert.equal(mine.appointment_id, id); assert.equal(mine.role, "owner"); assert.equal(mine.other_name, "Cabinet test");
      const [theirs] = await as(P, "select * from list_professional_threads()");
      assert.equal(theirs.role, "professional"); assert.equal(theirs.other_name, "Alex");
      assert.equal((await as(X, "select * from list_professional_threads()")).length, 0);
    });
    await t.test("après annulation : historique conservé et lisible, plus d’envoi", async () => {
      await as(P, "select update_professional_appointment($1,'confirm',$2,null)", [id, S1]);
      await send(A, id, "Merci, à bientôt !", 7);
      await as(A, "select update_professional_appointment($1,'cancel',null,'Imprévu')", [id]);
      await assert.rejects(send(A, id, "Encore là ?", 8), /Conversation close/);
      await assert.rejects(send(P, id, "Dommage", 9), /Conversation close/);
      const history = await read(A, id);
      assert.ok(history.length >= 3);
      assert.equal((await read(P, id)).length, history.length);
      assert.equal((await as(A, "select * from list_professional_threads()"))[0].status, "cancelled");
    });
    await t.test("blocage : plus d’envoi ; suppression du compte : illisible puis texte effacé", async () => {
      const [{ id: second }] = await as(A, "select request_professional_appointment($1,$2,$3,$4,$5,$6) id", [S2, PET, "Consultation", null, false, M(901)]);
      await send(A, second, "Deuxième demande", 10);
      await db.query("insert into meeting_blocks(blocker_id,blocked_id) values($1,$2)", [P, A]);
      await assert.rejects(send(A, second, "Allô ?", 11), /Conversation indisponible/);
      await db.query("delete from meeting_blocks");
      await db.query("insert into account_deletions(user_id) values($1)", [A]);
      assert.equal((await read(A, second)).length, 0, "une ancienne session ne lit plus rien");
      assert.equal((await read(P, second)).length, 1);
      await db.query("update account_deletions set cleaned_at=now() where user_id=$1", [A]);
      assert.equal((await read(P, second))[0].text, "Contenu supprimé à la suppression du compte");
    });
    await t.test("retour arrière puis réapplication", async () => {
      await db.exec(await readFile(new URL("../operations/rollback_professional_messages.sql", import.meta.url), "utf8"));
      assert.equal((await db.query("select to_regclass('public.professional_messages') t")).rows[0].t, null);
      await db.exec(await readFile(new URL("../migrations/20261125120000_professional_messages.sql", import.meta.url), "utf8"));
      assert.equal((await db.query("select count(*)::int n from professional_messages")).rows[0].n, 0);
    });
  } finally {
    await db.close();
  }
});
