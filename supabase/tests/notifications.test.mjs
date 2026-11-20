import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID as uuid } from "node:crypto";
import { readFile } from "node:fs/promises";
import { meetingsFixture } from "./meetings-fixture.mjs";
test("notifications communes : événements, destinataires, consentement et accès", async (t) => {
  const db = await meetingsFixture(),
    A = uuid(),
    B = uuid(),
    C = uuid(),
    PA = uuid(),
    PB = uuid(),
    device = uuid(),
    session = uuid();
  let match, appointment, sitting;
  const as = async (uid, sql, args = []) => {
    await db.exec("set role authenticated");
    try {
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
        uid,
      ]);
      return (await db.query(sql, args)).rows;
    } finally {
      await db.exec("reset role;reset request.jwt.claim.sub");
    }
  };
  const list = (uid) => as(uid, "select * from list_app_notifications()");
  const count = async () =>
    Number(
      (await db.query("select count(*) n from app_notifications")).rows[0].n,
    );
  const date = (h) =>
    new Date(Date.now() + 86400000 * 5 + h * 3600000).toISOString();
  const msg = (nonce = uuid()) =>
    as(A, "select * from send_match_message($1,$2,$3)", [
      match,
      "Texte privé à ne jamais copier dans une notification",
      nonce,
    ]);
  try {
    await db.query("insert into auth.users(id) select unnest($1::uuid[])", [
      [A, B, C],
    ]);
    await db.exec(
      "insert into private_beta_members(user_id,expires_at,accepted_at,notice_version,declared_adult) select id,null,now(),'2026-11-17',true from auth.users",
    );
    await db.query(
      "insert into pets(id,owner_id,name,species) values($1,$2,'Luna','chien'),($3,$4,'Milo','chien')",
      [PA, A, PB, B],
    );
    await t.test(
      "aucun rattrapage historique et nouvelles catégories push désactivées",
      async () => {
        assert.equal(await count(), 0);
        const p = await as(B, "select * from get_notification_preferences()");
        assert.equal(p.length, 5);
        assert.equal(p.filter((x) => x.push_enabled).length, 1);
        assert.equal(p.find((x) => x.push_enabled).category, "animaux_perdus");
      },
    );
    await t.test(
      "j’aime reçu sans identité du propriétaire, puis match pour les deux membres, sans doublon au rejeu",
      async () => {
        await as(A, "select swipe_and_match($1,$2,'right')", [PA, PB]);
        assert.equal((await list(A)).length, 0);
        const [like] = await list(B);
        assert.equal(like.kind, "like");
        assert.equal(like.target_id, PB);
        assert.ok(!("other_id" in like) && !("user_id" in like));
        match = (
          await as(B, "select swipe_and_match($1,$2,'right') id", [PB, PA])
        )[0].id;
        assert.ok(match);
        assert.equal(
          (await list(A)).filter((n) => n.kind === "match").length,
          1,
        );
        assert.equal(
          (await list(B)).filter((n) => n.kind === "match").length,
          1,
        );
        const before = await count();
        await as(A, "select swipe_and_match($1,$2,'right')", [PA, PB]);
        assert.equal(await count(), before);
      },
    );
    await t.test(
      "message : seulement le destinataire, aucune copie du texte, aucune duplication en reprise",
      async () => {
        const nonce = uuid(),
          before = (await list(A)).length;
        await msg(nonce);
        await msg(nonce);
        assert.equal((await list(A)).length, before);
        assert.equal(
          (await list(B)).filter((n) => n.kind === "match_message").length,
          1,
        );
        assert.ok(!JSON.stringify(await list(B)).includes("Texte privé"));
        assert.equal((await list(C)).length, 0);
      },
    );
    await t.test(
      "proposition et acceptation de rencontre adressées à l’autre participant",
      async () => {
        const p = (
          await as(
            A,
            "select * from create_meeting_proposal($1,'balade','Parc de test',$2::timestamptz[],null,$3)",
            [match, [date(0)], uuid()],
          )
        )[0];
        assert.ok((await list(B)).some((n) => n.kind === "meeting_pending"));
        await as(
          B,
          "select * from update_meeting_proposal($1,'accept',$2,null)",
          [p.id, p.slots[0]],
        );
        assert.ok((await list(A)).some((n) => n.kind === "meeting_accepted"));
      },
    );
    await t.test(
      "garde : demande, accord, message et nouvelles sans contenu privé",
      async () => {
        await as(
          B,
          "select save_sitter_profile('particulier','Présentation de test suffisamment longue.','Lille',50.63,3.06,array['chien'],null,'sans_jardin',$1,true)",
          [JSON.stringify([{ service: "chez_gardien", price_cents: 2000 }])],
        );
        sitting = (
          await as(
            A,
            "select * from create_sitting_request($1,$2,'chez_gardien',$3,$4,'Bonjour',$5)",
            [B, PA, date(24), date(48), uuid()],
          )
        )[0];
        assert.ok((await list(B)).some((n) => n.kind === "sitting_pending"));
        await as(B, "select * from update_sitting_request($1,'accept')", [
          sitting.id,
        ]);
        assert.ok((await list(A)).some((n) => n.kind === "sitting_accepted"));
        await as(A, "select * from send_sitting_message($1,$2,$3,$4)", [
          A,
          B,
          "Message de garde privé",
          uuid(),
        ]);
        assert.ok(
          (await list(B)).some(
            (n) =>
              n.kind === "sitting_message" &&
              n.target_id === A &&
              n.context_id === B,
          ),
        );
        await db.query(
          "insert into sitting_updates(sitting_id,author_id,text) values($1,$2,'Journal privé')",
          [sitting.id, B],
        );
        assert.ok((await list(A)).some((n) => n.kind === "sitting_update"));
        assert.ok(!JSON.stringify(await list(A)).includes("Journal privé"));
        await as(
          A,
          "select * from update_sitting_request($1,'withdraw','Indisponible')",
          [sitting.id],
        );
        assert.ok((await list(B)).some((n) => n.kind === "sitting_withdrawn"));
      },
    );
    await t.test(
      "services : demande, contre-proposition, acceptation propriétaire et annulation",
      async () => {
        await as(
          B,
          "select save_professional_profile('Cabinet test','veterinaire','Lille',50.63,3.06,'Présentation de test.',array['chien'],'','','','',$1,true)",
          [
            JSON.stringify([
              { name: "Consultation", unit: "consultation", price_cents: 4500 },
            ]),
          ],
        );
        const s1 = uuid(),
          s2 = uuid();
        await as(B, "select publish_professional_slot($1,$2,$3)", [
          s1,
          date(1),
          date(2),
        ]);
        await as(B, "select publish_professional_slot($1,$2,$3)", [
          s2,
          date(3),
          date(4),
        ]);
        appointment = (
          await as(
            A,
            "select request_professional_appointment($1,$2,'Consultation','Motif médical privé',false,$3) id",
            [s1, PA, uuid()],
          )
        )[0].id;
        assert.ok(
          (await list(B)).some((n) => n.kind === "appointment_pending"),
        );
        await as(
          B,
          "select update_professional_appointment($1,'counter',$2,'Note privée')",
          [appointment, s2],
        );
        const before = await count();
        await as(
          B,
          "select update_professional_appointment($1,'counter',$2,'Note privée')",
          [appointment, s2],
        );
        assert.equal(await count(), before);
        assert.ok(
          (await list(A)).some((n) => n.kind === "appointment_countered"),
        );
        await as(
          A,
          "select update_professional_appointment($1,'accept_counter',$2)",
          [appointment, s2],
        );
        assert.ok(
          (await list(B)).some((n) => n.kind === "appointment_confirmed"),
        );
        await as(
          B,
          "select update_professional_appointment($1,'cancel',null,'Motif privé')",
          [appointment],
        );
        assert.ok(
          (await list(A)).some((n) => n.kind === "appointment_cancelled"),
        );
        assert.ok(!JSON.stringify(await list(A)).includes("Note privée"));
      },
    );
    await t.test(
      "expiration de garde : les deux participants sont informés",
      async () => {
        const row = (
          await as(
            A,
            "select * from create_sitting_request($1,$2,'chez_gardien',$3,$4,'Bonjour',$5)",
            [B, PA, date(80), date(104), uuid()],
          )
        )[0];
        await db.query(
          "update sitting_requests set status='expired',updated_at=now() where id=$1",
          [row.id],
        );
        for (const uid of [A, B])
          assert.ok(
            (await list(uid)).some(
              (n) => n.kind === "sitting_expired" && n.target_id === row.id,
            ),
          );
      },
    );
    await t.test(
      "préférences privées, refus d’accès direct et refus anonyme",
      async () => {
        await as(A, "select set_notification_preference('messages',true)");
        assert.equal(
          (await as(B, "select * from get_notification_preferences()")).find(
            (p) => p.category === "messages",
          ).push_enabled,
          false,
        );
        await assert.rejects(
          as(A, "select set_notification_preference('inconnue',true)"),
          /Préférence invalide/,
        );
        for (const table of ["app_notifications", "notification_preferences"])
          await assert.rejects(
            as(B, "select * from " + table),
            /permission denied/,
          );
        await db.exec("set role anon");
        try {
          await assert.rejects(
            db.query("select * from list_app_notifications()"),
            /permission denied/,
          );
        } finally {
          await db.exec("reset role");
        }
      },
    );
    await t.test(
      "pagination stable, marquage propre au destinataire et lecture globale",
      async () => {
        const rows = await list(B),
          one = rows[0];
        await as(C, "select read_app_notification($1)", [one.id]);
        assert.equal(
          (
            await as(B, "select * from list_app_notifications(p_id=>$1)", [
              one.id,
            ])
          )[0].read_at,
          null,
        );
        await as(B, "select read_app_notification($1)", [one.id]);
        assert.ok(
          (
            await as(B, "select * from list_app_notifications(p_id=>$1)", [
              one.id,
            ])
          )[0].read_at,
        );
        const page = await as(B, "select * from list_app_notifications(2)"),
          tail = await as(B, "select * from list_app_notifications(2,$1,$2)", [
            page[1].created_at,
            page[1].id,
          ]);
        assert.ok(tail.every((n) => !page.some((p) => p.id === n.id)));
        await as(B, "select read_all_app_notifications()");
        assert.ok((await list(B)).every((n) => n.read_at !== null));
      },
    );
    await t.test(
      "file Android uniquement après choix explicite ; lecture et désactivation coupent une livraison en attente",
      async () => {
        await db.query("insert into auth.sessions(id,user_id) values($1,$2)", [
          session,
          B,
        ]);
        await db.query(
          "insert into android_push_devices(id,user_id,session_id,token) values($1,$2,$3,$4)",
          [device, B, session, "test-not-a-real-device-token"],
        );
        await msg();
        assert.equal(
          Number(
            (await db.query("select count(*) n from android_push_jobs")).rows[0]
              .n,
          ),
          0,
        );
        await as(B, "select set_notification_preference('messages',true)");
        await msg();
        const job = (await db.query("select * from claim_android_push(10)"))
          .rows[0];
        assert.ok(job);
        const delivery = (
          await db.query("select * from android_push_delivery($1,$2)", [
            job.job_id,
            job.lease_id,
          ])
        ).rows[0];
        assert.equal(delivery.alert_id, null);
        assert.equal(delivery.kind, "match_message");
        await as(B, "select read_app_notification($1)", [
          delivery.notification_id,
        ]);
        assert.equal(
          (
            await db.query("select * from android_push_delivery($1,$2)", [
              job.job_id,
              job.lease_id,
            ])
          ).rows.length,
          0,
        );
        await msg();
        const newJob = (
          await db.query("select * from claim_android_push(10)")
        ).rows.find((x) => x.job_id !== job.job_id);
        assert.ok(newJob);
        await as(B, "select set_notification_preference('messages',false)");
        assert.equal(
          (
            await db.query("select * from android_push_delivery($1,$2)", [
              newJob.job_id,
              newJob.lease_id,
            ])
          ).rows.length,
          0,
        );
      },
    );
    await t.test(
      "une session terminée empêche la livraison déjà réclamée",
      async () => {
        const sid = uuid(),
          did = uuid();
        await db.query("insert into auth.sessions(id,user_id) values($1,$2)", [
          sid,
          B,
        ]);
        await db.query(
          "insert into android_push_devices(id,user_id,session_id,token) values($1,$2,$3,$4)",
          [did, B, sid, "second-test-device-without-real-token"],
        );
        await as(B, "select set_notification_preference('messages',true)");
        await msg();
        const jobs = (await db.query("select * from claim_android_push(10)"))
          .rows;
        let selected;
        for (const job of jobs) {
          const q = (
            await db.query(
              "select device_id from android_push_jobs where id=$1",
              [job.job_id],
            )
          ).rows[0];
          if (q.device_id === did) selected = job;
        }
        assert.ok(selected);
        await db.query("delete from auth.sessions where id=$1", [sid]);
        assert.equal(
          (
            await db.query("select * from android_push_delivery($1,$2)", [
              selected.job_id,
              selected.lease_id,
            ])
          ).rows.length,
          0,
        );
      },
    );
    await t.test(
      "une transaction métier annulée ne laisse aucune notification",
      async () => {
        const before = await count();
        await db.exec("begin");
        await db.query(
          "insert into messages(match_id,sender_id,text,request_id) values($1,$2,'Annulé',$3)",
          [match, A, uuid()],
        );
        await db.exec("rollback");
        assert.equal(await count(), before);
      },
    );
    await t.test(
      "blocage, fermeture et révocation masquent les événements et arrêtent les push",
      async () => {
        await as(B, "select set_notification_preference('messages',true)");
        await msg();
        const job = (await db.query("select * from claim_android_push(10)"))
          .rows[0];
        assert.ok(job);
        await as(A, "select report_or_block_match($1,'','',false)", [match]);
        assert.equal((await list(B)).length, 0);
        assert.equal(
          (
            await db.query("select * from android_push_delivery($1,$2)", [
              job.job_id,
              job.lease_id,
            ])
          ).rows.length,
          0,
        );
        await db.query(
          "update private_beta_members set active=false where user_id=$1",
          [B],
        );
        await assert.rejects(list(B), /Accès bêta requis/);
      },
    );
    await t.test(
      "retour arrière et réapplication conservent les données métier",
      async () => {
        await db.exec(
          await readFile(
            new URL(
              "../operations/rollback_unified_notifications.sql",
              import.meta.url,
            ),
            "utf8",
          ),
        );
        assert.equal(
          (
            await db.query(
              "select count(*)::int n from professional_appointments",
            )
          ).rows[0].n,
          1,
        );
        await db.exec(
          await readFile(
            new URL(
              "../migrations/20261120100904_unified_notifications.sql",
              import.meta.url,
            ),
            "utf8",
          ),
        );
        assert.equal(await count(), 0);
      },
    );
  } finally {
    await db.close();
  }
});
