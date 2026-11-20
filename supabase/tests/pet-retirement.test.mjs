import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID as uuid } from "node:crypto";
import { readFile } from "node:fs/promises";
import { meetingsFixture } from "./meetings-fixture.mjs";
test("retrait d’animal : profil masqué, activités protégées, historique conservé", async (t) => {
  const db = await meetingsFixture(),
    A = uuid(),
    B = uuid(),
    C = uuid(),
    P = uuid(),
    Q = uuid(),
    R = uuid();
  let match, closedAppointment;
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
  const retire = () => as(A, "select retire_pet_profile($1)", [P]),
    blockers = () => as(A, "select * from pet_retirement_blockers($1)", [P]),
    date = (h) =>
      new Date(Date.now() + 86400000 * 4 + h * 3600000).toISOString();
  try {
    await db.query("insert into auth.users(id) select unnest($1::uuid[])", [
      [A, B, C],
    ]);
    await db.exec(
      "insert into private_beta_members(user_id,expires_at,accepted_at,notice_version,declared_adult) select id,null,now(),'2026-11-17',true from auth.users",
    );
    await db.query(
      "insert into pets(id,owner_id,name,species,photos) values($1,$2,'Luna','chien',$3),($4,$5,'Milo','chien','{}'),($6,$2,'Autre animal','chien','{}')",
      [P, A, [`${A}/${P}/main.jpg`], Q, B, R],
    );
    await t.test(
      "un tiers, un anonyme et une suppression directe sont refusés",
      async () => {
        await assert.rejects(
          as(B, "select retire_pet_profile($1)", [P]),
          /Animal non autorisé/,
        );
        await assert.rejects(
          as(B, "select * from pet_retirement_blockers($1)", [P]),
          /Animal non autorisé/,
        );
        await assert.rejects(
          as(A, "delete from pets where id=$1", [P]),
          /permission denied/,
        );
        await assert.rejects(
          as(A, "update pets set archived_at=now() where id=$1", [P]),
          /permission denied/,
        );
        await db.exec("set role anon");
        try {
          await assert.rejects(
            db.query("select retire_pet_profile($1)", [P]),
            /permission denied/,
          );
        } finally {
          await db.exec("reset role");
        }
      },
    );
    await t.test(
      "une proposition ouverte bloque le retrait jusqu’à son traitement",
      async () => {
        await as(A, "select swipe_and_match($1,$2,'right')", [P, Q]);
        match = (
          await as(B, "select swipe_and_match($1,$2,'right') id", [Q, P])
        )[0].id;
        const proposal = (
          await as(
            A,
            "select * from create_meeting_proposal($1,'balade','Parc de test',$2::timestamptz[],null,$3)",
            [match, [date(0)], uuid()],
          )
        )[0];
        assert.equal((await blockers())[0].section, "rencontres");
        await assert.rejects(retire(), /Activités à traiter/);
        await as(A, "select update_meeting_proposal($1,'withdraw')", [
          proposal.id,
        ]);
        assert.equal((await blockers()).length, 0);
      },
    );
    await t.test(
      "une garde ouverte bloque le retrait ; son historique reste conservé après retrait",
      async () => {
        await as(
          B,
          "select save_sitter_profile('particulier','Présentation de garde suffisamment longue.','Lille',50.63,3.06,array['chien'],null,'sans_jardin',$1,true)",
          [JSON.stringify([{ service: "chez_gardien", price_cents: 2000 }])],
        );
        const s = (
          await as(
            A,
            "select * from create_sitting_request($1,$2,'chez_gardien',$3,$4,'Bonjour',$5)",
            [B, P, date(24), date(48), uuid()],
          )
        )[0];
        assert.ok((await blockers()).some((x) => x.section === "garde"));
        await assert.rejects(retire(), /Activités à traiter/);
        await as(A, "select update_sitting_request($1,'withdraw')", [s.id]);
      },
    );
    await t.test(
      "un rendez-vous ouvert bloque le retrait, une annulation libère le contrôle",
      async () => {
        await as(
          B,
          "select save_professional_profile('Cabinet','veterinaire','Lille',50.63,3.06,'Présentation de test.',array['chien'],'','','','',$1,true)",
          [
            JSON.stringify([
              { name: "Consultation", unit: "consultation", price_cents: 4500 },
            ]),
          ],
        );
        const slot = uuid();
        await as(B, "select publish_professional_slot($1,$2,$3)", [
          slot,
          date(2),
          date(3),
        ]);
        closedAppointment = (
          await as(
            A,
            "select request_professional_appointment($1,$2,'Consultation','Bonjour',true,$3) id",
            [slot, P, uuid()],
          )
        )[0].id;
        await as(B, "select update_professional_appointment($1,'confirm',$2)", [
          closedAppointment,
          slot,
        ]);
        assert.ok((await blockers()).some((x) => x.section === "services"));
        await assert.rejects(retire(), /Activités à traiter/);
        await as(A, "select update_professional_appointment($1,'cancel')", [
          closedAppointment,
        ]);
      },
    );
    await t.test(
      "une alerte perdue bloque le retrait, un animal retrouvé permet de poursuivre",
      async () => {
        const alert = uuid();
        await as(
          A,
          "select publish_lost_alert($1,$2,'Lille',50.63,3.06,now(),'Collier','Calme',25)",
          [alert, P],
        );
        assert.ok(
          (await blockers()).some((x) => x.section === "animaux_perdus"),
        );
        await assert.rejects(retire(), /Activités à traiter/);
        await as(A, "select update_lost_alert($1,'Collier','Calme','found')", [
          alert,
        ]);
        assert.equal((await blockers()).length, 0);
      },
    );
    await t.test(
      "retrait idempotent, invisible dans la liste et la découverte, matchs fermés et photo non partagée",
      async () => {
        await as(A, "select set_pet_meeting_location($1,50.63,3.06)", [P]);
        await as(B, "select set_pet_meeting_location($1,50.63,3.06)", [Q]);
        assert.equal(
          (
            await as(B, "select meeting_photo_visible($1) visible", [
              `${A}/${P}/main.jpg`,
            ])
          )[0].visible,
          true,
        );
        await retire();
        await retire();
        assert.equal((await db.query("select status from lost_pets where pet_id=$1", [P])).rows[0].status, "closed");
        const pets = await as(A, "select id from pets");
        assert.equal(pets.length, 1);
        assert.equal(pets[0].id, R);
        assert.equal(
          (await db.query("select archived_at from pets where id=$1", [P])).rows
            .length,
          1,
        );
        assert.ok(
          (await db.query("select archived_at from pets where id=$1", [P]))
            .rows[0].archived_at,
        );
        assert.equal(
          (await as(B, "select * from discover_pets($1)", [Q])).some(
            (x) => x.id === P,
          ),
          false,
        );
        await assert.rejects(
          as(A, "select * from discover_pets($1)", [P]),
          /Animal non autorisé/,
        );
        assert.equal(
          (await as(B, "select * from list_my_matches($1)", [match])).length,
          0,
        );
        assert.equal(
          (
            await as(B, "select meeting_photo_visible($1) visible", [
              `${A}/${P}/main.jpg`,
            ])
          )[0].visible,
          false,
        );
        assert.equal(
          (
            await db.query(
              "select count(*)::int n from pet_meeting_locations where pet_id=$1",
              [P],
            )
          ).rows[0].n,
          0,
        );
      },
    );
    await t.test(
      "une ancienne URL ne permet pas de relancer une activité avec le profil retiré",
      async () => {
        await assert.rejects(
          as(B, "select swipe_and_match($1,$2,'right')", [Q, P]),
          /Match terminé|Profil animal retiré/,
        );
        await assert.rejects(
          as(A, "select set_pet_meeting_location($1,50.63,3.06)", [P]),
          /retiré/,
        );
        await assert.rejects(
          as(
            A,
            "select * from create_sitting_request($1,$2,'chez_gardien',$3,$4,'Nouveau',$5)",
            [B, P, date(72), date(96), uuid()],
          ),
          /retiré/,
        );
        const slot = uuid();
        await as(B, "select publish_professional_slot($1,$2,$3)", [
          slot,
          date(5),
          date(6),
        ]);
        await assert.rejects(
          as(
            A,
            "select request_professional_appointment($1,$2,'Consultation','Nouveau',false,$3)",
            [slot, P, uuid()],
          ),
          /retiré/,
        );
        await assert.rejects(
          as(
            A,
            "select publish_lost_alert($1,$2,'Lille',50.63,3.06,now(),'Collier','Calme',25)",
            [uuid(), P],
          ),
          /retiré/,
        );
      },
    );
    await t.test(
      "les historiques de garde et rendez-vous restent accessibles aux participants",
      async () => {
        const past = await as(A, "select * from list_my_sittings()");
        assert.equal(past.length, 1);
        assert.equal(past[0].pet_name, "Luna");
        assert.equal(past[0].status, "withdrawn");
        assert.equal(
          (await as(B, "select * from list_my_sittings()")).length,
          1,
        );
        assert.equal(
          (
            await as(A, "select * from list_professional_appointments($1)", [
              closedAppointment,
            ])
          )[0].pet_name,
          "Luna",
        );
        assert.equal(
          (
            await as(C, "select * from list_professional_appointments($1)", [
              closedAppointment,
            ])
          ).length,
          0,
        );
      },
    );
    await t.test(
      "révocation et retrait refusés ; retour arrière/réapplication conservant les historiques",
      async () => {
        await db.query(
          "update private_beta_members set active=false where user_id=$1",
          [A],
        );
        await assert.rejects(retire(), /Accès bêta requis/);
        await db.exec(
          await readFile(
            new URL(
              "../operations/rollback_pet_profile_retirement.sql",
              import.meta.url,
            ),
            "utf8",
          ),
        );
        assert.equal(
          (await db.query("select count(*)::int n from sitting_requests"))
            .rows[0].n,
          1,
        );
        await db.exec(
          await readFile(
            new URL(
              "../migrations/20261120122123_pet_profile_retirement.sql",
              import.meta.url,
            ),
            "utf8",
          ),
        );
        assert.equal(
          (await db.query("select ended_at from matches where id=$1", [match]))
            .rows[0].ended_at !== null,
          true,
        );
      },
    );
  } finally {
    await db.close();
  }
});
