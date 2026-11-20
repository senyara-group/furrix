import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { meetingsFixture } from "./meetings-fixture.mjs";
const A = "10000000-0000-0000-0000-000000000001",
  P = "10000000-0000-0000-0000-000000000002",
  Q = "10000000-0000-0000-0000-000000000003",
  X = "10000000-0000-0000-0000-000000000004",
  PET = "20000000-0000-0000-0000-000000000001",
  S1 = "30000000-0000-0000-0000-000000000001",
  S2 = "30000000-0000-0000-0000-000000000002",
  S3 = "30000000-0000-0000-0000-000000000003",
  S4 = "30000000-0000-0000-0000-000000000004";
const at = (h) =>
  new Date(Date.now() + 3 * 86400000 + h * 3600000).toISOString();
const SERVICE = "Consultation",
  req = "40000000-0000-0000-0000-000000000001";
test("rendez-vous professionnels : rôles, consentement, disponibilités et transitions", async (t) => {
  const db = await meetingsFixture();
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
  let appointment;
  try {
    await db.exec(
      `insert into auth.users(id) values('${A}'),('${P}'),('${Q}'),('${X}');insert into private_beta_members(user_id,expires_at,accepted_at,notice_version,declared_adult) select id,null,now(),'2026-11-17',true from auth.users;insert into pets(id,owner_id,name,species,breed,age) values('${PET}','${A}','Luna','chien','Croisée','4 ans');`,
    );
    for (const uid of [P, Q])
      await as(
        uid,
        "select save_professional_profile('Cabinet test','veterinaire','Lille',50.63,3.06,'Présentation professionnelle de test.',array['chien'],'','','','',$1,true)",
        [
          JSON.stringify([
            { name: SERVICE, unit: "consultation", price_cents: 4500 },
          ]),
        ],
      );
    await t.test(
      "seul le titulaire publie ses créneaux ; reprises et chevauchements contrôlés",
      async () => {
        const s = at(0),
          e = at(1);
        await assert.rejects(
          as(A, "select publish_professional_slot($1,$2,$3)", [S1, s, e]),
          /Activité professionnelle/,
        );
        await as(P, "select publish_professional_slot($1,$2,$3)", [S1, s, e]);
        await as(P, "select publish_professional_slot($1,$2,$3)", [S1, s, e]);
        await assert.rejects(
          as(Q, "select publish_professional_slot($1,$2,$3)", [S1, s, e]),
          /Requête différente/,
        );
        await assert.rejects(
          as(P, "select publish_professional_slot($1,$2,$3)", [
            S2,
            at(0.5),
            at(1.5),
          ]),
          /chevauchent/,
        );
        await as(P, "select publish_professional_slot($1,$2,$3)", [
          S2,
          at(2),
          at(3),
        ]);
        await as(P, "select publish_professional_slot($1,$2,$3)", [
          S3,
          at(4),
          at(5),
        ]);
        assert.equal(
          (await as(A, "select * from list_professional_slots($1)", [P]))
            .length,
          3,
        );
      },
    );
    await t.test(
      "demande après choix explicite, animal à soi et rejeu sans duplication",
      async () => {
        await assert.rejects(
          as(
            X,
            "select request_professional_appointment($1,$2,$3,$4,false,$5)",
            [S1, PET, SERVICE, "Bonjour", req],
          ),
          /Animal non autorisé/,
        );
        appointment = (
          await as(
            A,
            "select request_professional_appointment($1,$2,$3,$4,false,$5) id",
            [S1, PET, SERVICE, "Bonjour", req],
          )
        )[0].id;
        assert.equal(
          (
            await as(
              A,
              "select request_professional_appointment($1,$2,$3,$4,false,$5) id",
              [S1, PET, SERVICE, "Bonjour", req],
            )
          )[0].id,
          appointment,
        );
        await assert.rejects(
          as(
            A,
            "select request_professional_appointment($1,$2,$3,$4,true,$5)",
            [S1, PET, SERVICE, "Bonjour", req],
          ),
          /Requête différente/,
        );
        await assert.rejects(
          as(A, "select close_professional_slot($1)", [S1]),
          /introuvable/,
        );
        await assert.rejects(
          as(P, "select close_professional_slot($1)", [S1]),
          /demandes/,
        );
      },
    );
    await t.test(
      "sans consentement le professionnel ne lit aucune information de l’animal ; un tiers ne lit rien",
      async () => {
        const [p] = await as(
          P,
          "select * from list_professional_appointments()",
        );
        assert.equal(p.pet_id, null);
        for (const key of ["pet_name", "pet_species", "pet_breed", "pet_age"])
          assert.equal(p[key], null);
        assert.equal(p.owner_name, null);
        assert.equal(
          (await as(A, "select * from list_professional_appointments()"))[0]
            .pet_name,
          "Luna",
        );
        assert.equal(
          (await as(X, "select * from list_professional_appointments()"))
            .length,
          0,
        );
        for (const table of ["professional_appointments", "professional_slots"])
          await assert.rejects(
            as(A, "select * from " + table),
            /permission denied/,
          );
      },
    );
    await t.test(
      "contre-proposition puis confirmation par le propriétaire ; une ancienne proposition est refusée",
      async () => {
        await assert.rejects(
          as(A, "select update_professional_appointment($1,'confirm',$2)", [
            appointment,
            S1,
          ]),
          /Action non autorisée/,
        );
        await as(
          P,
          "select update_professional_appointment($1,'counter',$2,'Autre horaire')",
          [appointment, S2],
        );
        await assert.rejects(
          as(
            A,
            "select update_professional_appointment($1,'accept_counter',$2)",
            [appointment, S1],
          ),
          /créneau a changé/,
        );
        await as(
          A,
          "select update_professional_appointment($1,'accept_counter',$2)",
          [appointment, S2],
        );
        assert.equal(
          (await as(A, "select * from list_professional_appointments()"))[0]
            .status,
          "confirmed",
        );
        await as(
          A,
          "select update_professional_appointment($1,'accept_counter',$2)",
          [appointment, S2],
        );
        assert.equal(
          (await as(X, "select * from list_professional_slots($1)", [P])).some(
            (s) => s.id === S2,
          ),
          false,
        );
      },
    );
    await t.test(
      "annulation par un participant, reprise stable et créneau libéré",
      async () => {
        await assert.rejects(
          as(X, "select update_professional_appointment($1,'cancel',null,'')", [
            appointment,
          ]),
          /introuvable/,
        );
        await as(
          A,
          "select update_professional_appointment($1,'cancel',null,'Indisponible')",
          [appointment],
        );
        await as(
          A,
          "select update_professional_appointment($1,'cancel',null,'Indisponible')",
          [appointment],
        );
        assert.equal(
          (await as(A, "select * from list_professional_appointments()"))[0]
            .cancelled_by,
          A,
        );
        assert.ok(
          (await as(A, "select * from list_professional_slots($1)", [P])).some(
            (s) => s.id === S2,
          ),
        );
      },
    );
    await t.test(
      "partage volontaire limité aux champs annoncés et tarif figé à la demande",
      async () => {
        const r = (
          await as(
            A,
            "select request_professional_appointment($1,$2,$3,null,true,gen_random_uuid()) id",
            [S3, PET, SERVICE],
          )
        )[0].id;
        const [p] = await as(
          P,
          "select * from list_professional_appointments($1)",
          [r],
        );
        assert.equal(p.pet_name, "Luna");
        assert.equal(p.pet_species, "chien");
        assert.equal(p.pet_id, null);
        assert.ok(!("health" in p) && !("allergies" in p) && !("photos" in p));
        await db.query(
          "update professional_profiles set services=$1 where user_id=$2",
          [
            JSON.stringify([
              { name: SERVICE, unit: "consultation", price_cents: 9900 },
            ]),
            P,
          ],
        );
        assert.equal(
          (
            await as(A, "select * from list_professional_appointments($1)", [r])
          )[0].price_cents,
          4500,
        );
        await as(
          P,
          "select update_professional_appointment($1,'decline',null,'Complet')",
          [r],
        );
      },
    );
    await t.test(
      "un animal ne peut pas avoir deux rendez-vous confirmés qui se chevauchent",
      async () => {
        await as(Q, "select publish_professional_slot($1,$2,$3)", [
          S4,
          at(2.5),
          at(3.5),
        ]);
        const r1 = (
            await as(
              A,
              "select request_professional_appointment($1,$2,$3,null,false,gen_random_uuid()) id",
              [S2, PET, SERVICE],
            )
          )[0].id,
          r2 = (
            await as(
              A,
              "select request_professional_appointment($1,$2,$3,null,false,gen_random_uuid()) id",
              [S4, PET, SERVICE],
            )
          )[0].id;
        await as(P, "select update_professional_appointment($1,'confirm',$2)", [
          r1,
          S2,
        ]);
        await assert.rejects(
          as(Q, "select update_professional_appointment($1,'confirm',$2)", [
            r2,
            S4,
          ]),
          /chevauchent/,
        );
      },
    );
    await t.test(
      "anonyme et révocation interdits, pause bloque les nouvelles demandes",
      async () => {
        await db.exec("set role anon");
        try {
          await assert.rejects(
            db.query("select * from list_professional_appointments()"),
            /permission denied/,
          );
        } finally {
          await db.exec("reset role");
        }
        await as(P, "select set_professional_active(false)");
        assert.equal(
          (await as(A, "select * from list_professional_slots($1)", [P]))
            .length,
          0,
        );
        await db.query(
          "update private_beta_members set active=false where user_id=$1",
          [A],
        );
        await assert.rejects(
          as(A, "select * from list_professional_appointments()"),
          /Accès bêta requis/,
        );
      },
    );
    await t.test(
      "retour arrière et réapplication sans modifier animaux ni profils",
      async () => {
        await db.exec(
          await readFile(
            new URL(
              "../operations/rollback_professional_appointments.sql",
              import.meta.url,
            ),
            "utf8",
          ),
        );
        await db.exec(
          await readFile(
            new URL(
              "../migrations/20261120100223_professional_appointments.sql",
              import.meta.url,
            ),
            "utf8",
          ),
        );
        assert.equal(
          (await db.query("select count(*)::int n from pets")).rows[0].n,
          1,
        );
      },
    );
  } finally {
    await db.close();
  }
});
