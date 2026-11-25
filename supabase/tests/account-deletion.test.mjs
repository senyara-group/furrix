import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID as uuid } from "node:crypto";
import { readFile } from "node:fs/promises";
import { meetingsFixture } from "./meetings-fixture.mjs";
test("suppression de compte : droits, activités, conservation et reprise", async (t) => {
  const db = await meetingsFixture(),
    A = uuid(),
    B = uuid(),
    C = uuid(),
    P = uuid(),
    Q = uuid(),
    sitting = uuid(),
    slot = uuid(),
    appointment = uuid();
  const as = async (role, user, sql, args = []) => {
    await db.exec("set role " + role);
    try {
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
        user ?? "",
      ]);
      return (await db.query(sql, args)).rows;
    } finally {
      await db.exec("reset role;reset request.jwt.claim.sub");
    }
  };
  const member = (uid, sql, args = []) => as("authenticated", uid, sql, args),
    server = (sql, args = []) => as("service_role", null, sql, args);
  const request = () => server("select request_account_deletion($1)", [A]);
  let lease;
  try {
    await db.query("insert into auth.users(id) select unnest($1::uuid[])", [
      [A, B, C],
    ]);
    await db.exec(
      "insert into private_beta_members(user_id,expires_at,accepted_at,notice_version,declared_adult) select id,null,now(),'2026-11-17',true from auth.users",
    );
    await db.query(
      "update profiles set name='Alice',city='Lille',bio='Contact privé' where id=$1",
      [A],
    );
    await db.query(
      "insert into pets(id,owner_id,name,species,photos,allerg,lat,lng) values($1,$2,'Luna','chien',$3,'Secret',50,3),($4,$5,'Milo','chien','{}',null,null,null)",
      [P, A, [`${A}/${P}/main.jpg`], Q, B],
    );
    await member(
      A,
      "select save_sitter_profile('particulier','Présentation de garde personnelle.','Lille',50.63,3.06,array['chien'],15,'jardin_clos',$1,true)",
      [JSON.stringify([{ service: "visite", price_cents: 1000 }])],
    );
    await member(
      A,
      "select save_professional_profile('Cabinet privé','veterinaire','Lille',50.63,3.06,'Présentation professionnelle privée.',array['chien'],'','','','',$1,true)",
      [
        JSON.stringify([
          { name: "Consultation", unit: "consultation", price_cents: 4500 },
        ]),
      ],
    );
    await t.test(
      "une identité ne prépare que son compte, et seul le serveur peut accepter ou traiter",
      async () => {
        await assert.rejects(
          member(A, "select request_account_deletion($1)", [B]),
          /permission denied/,
        );
        await assert.rejects(
          member(A, "select * from claim_account_deletion()"),
          /permission denied/,
        );
        await assert.rejects(
          as("anon", null, "select * from account_deletion_blockers()"),
          /permission denied/,
        );
        assert.equal(
          (await member(A, "select * from account_deletion_blockers()")).length,
          0,
        );
        await assert.rejects(
          member(A, "insert into account_deletions(user_id) values($1)", [A]),
          /permission denied/,
        );
      },
    );
    await t.test(
      "les demandes reçues comme gardien et professionnel bloquent aussi la suppression",
      async () => {
        await db.query(
          "insert into sitting_requests(id,owner_id,sitter_id,pet_id,service,starts_at,ends_at,units,unit_price_cents,status,request_id) values($1,$2,$3,$4,'visite',now()+interval '1 day',now()+interval '2 days',1,1000,'pending',$5)",
          [sitting, B, A, Q, uuid()],
        );
        await assert.rejects(request(), /Activités à traiter/);
        assert.equal(
          (
            await member(
              A,
              "select total from account_deletion_blockers() where section='garde'",
            )
          )[0].total,
          1,
        );
        await db.query(
          "update sitting_requests set status='declined' where id=$1",
          [sitting],
        );
        await db.query(
          "insert into professional_slots(id,professional_id,starts_at,ends_at) values($1,$2,now()+interval '1 day',now()+interval '25 hours')",
          [slot, A],
        );
        await db.query(
          "insert into professional_appointments(id,owner_id,professional_id,pet_id,requested_slot_id,slot_id,service_name,unit,request_id) values($1,$2,$3,$4,$5,$5,'Consultation','consultation',$6)",
          [appointment, B, A, Q, slot, uuid()],
        );
        await assert.rejects(request(), /Activités à traiter/);
        await db.query(
          "update professional_appointments set status='declined' where id=$1",
          [appointment],
        );
      },
    );
    await t.test(
      "retour arrière avant toute demande puis réapplication sans perte des réservations",
      async () => {
        await db.exec(
          await readFile(
            new URL(
              "../operations/rollback_account_deletion.sql",
              import.meta.url,
            ),
            "utf8",
          ),
        );
        assert.equal(
          (
            await db.query("select id from sitting_requests where id=$1", [
              sitting,
            ])
          ).rows.length,
          1,
        );
        await db.exec(
          await readFile(
            new URL(
              "../migrations/20261125085916_account_deletion.sql",
              import.meta.url,
            ),
            "utf8",
          ),
        );
      },
    );
    await t.test(
      "un abonnement ou dossier ouvert doit être traité au préalable",
      async () => {
        await db.query(
          "insert into subscriptions(user_id,status) values($1,'active')",
          [A],
        );
        await assert.rejects(request(), /Activités à traiter/);
        await db.query(
          "update subscriptions set status='canceled' where user_id=$1",
          [A],
        );
        await db.query(
          "insert into sitting_reports(sitting_id,reporter_id,category,details) values($1,$2,'comportement','Un problème à traiter.')",
          [sitting, B],
        );
        await assert.rejects(request(), /Activités à traiter/);
        await db.query(
          "update sitting_reports set status='closed' where sitting_id=$1",
          [sitting],
        );
      },
    );
    await t.test(
      "acceptation rejouable, fermeture immédiate, préférences et jetons retirés",
      async () => {
        await db.query(
          "insert into sitting_messages(owner_id,sitter_id,sender_id,text,request_id) values($1,$2,$1,'Coordonnées privées',$3)",
          [B, A, uuid()],
        );
        await db.query(
          "insert into storage.objects(bucket_id,name,owner_id) values('pet-photos',$1,$2),('pet-photos',$3,$4)",
          [`${A}/${P}/orphan.jpg`, A, `${B}/${Q}/main.jpg`, B],
        );
        await db.query(
          "insert into push_tokens(user_id,token) values($1,'token')",
          [A],
        );
        await request();
        await request();
        assert.equal(
          (await db.query("select count(*)::int n from account_deletions"))
            .rows[0].n,
          1,
        );
        assert.equal(
          (await member(A, "select can_use_private_beta() allowed"))[0].allowed,
          false,
        );
        assert.equal((await member(A, "select name from profiles")).length, 0);
        assert.equal(
          (await member(A, "select text from sitting_messages")).length,
          0,
          "ancien JWT : lecture directe fermée avant le nettoyage",
        );
        assert.equal(
          (await member(B, "select completed_at from account_deletions"))
            .length,
          0,
        );
        assert.equal(
          (await db.query("select * from push_tokens where user_id=$1", [A]))
            .rows.length,
          0,
        );
        await assert.rejects(
          member(
            A,
            "update profiles set name='Retour' where id=$1 returning id",
            [A],
          ).then((rows) => {
            if (!rows.length) throw Error("access denied");
          }),
          /denied/,
        );
      },
    );
    await t.test(
      "une écriture privilégiée déjà engagée ne peut réintroduire un profil ou une activité",
      async () => {
        await assert.rejects(
          member(
            B,
            "insert into pets(owner_id,name,species) values($1,'Autre','chien')",
            [A],
          ),
          /suppression|row-level security/,
        );
        await assert.rejects(
          member(B, "select send_sitting_message($1,$2,'Bonjour',$3)", [
            B,
            A,
            uuid(),
          ]),
          /indisponible|suppression/,
        );
      },
    );
    await t.test(
      "bail privé, nettoyage idempotent, historique partagé sans profil ni texte privé",
      async () => {
        lease = (await server("select * from claim_account_deletion()"))[0];
        assert.equal(lease.user_id, A);
        assert.equal(
          (await server("select * from claim_account_deletion()")).length,
          0,
        );
        await assert.rejects(
          server("select clean_account_data($1,$2)", [A, uuid()]),
          /Bail expiré/,
        );
        await server("select clean_account_data($1,$2)", [A, lease.claim]);
        await server("select clean_account_data($1,$2)", [A, lease.claim]);
        const p = (await db.query("select * from pets where id=$1", [P]))
          .rows[0];
        assert.equal(p.name, "Animal supprimé");
        assert.equal(p.allerg, null);
        assert.equal(p.lat, null);
        assert.deepEqual(p.photos, []);
        assert.ok(p.archived_at);
        assert.equal(
          (await db.query("select name,city from profiles where id=$1", [A]))
            .rows[0].name,
          "Compte supprimé",
        );
        const history = await member(B, "select * from list_my_sittings($1)", [
          sitting,
        ]);
        assert.equal(history.length, 1);
        assert.equal(history[0].other_name, "Compte supprimé");
        assert.equal(
          (
            await db.query(
              "select text from sitting_messages where sitter_id=$1",
              [A],
            )
          ).rows[0].text,
          "Contenu supprimé à la suppression du compte",
        );
        const appointments = await member(
          B,
          "select * from list_professional_appointments($1)",
          [appointment],
        );
        assert.equal(appointments.length, 1);
        assert.equal(appointments[0].professional_name, "Compte supprimé");
        assert.equal(
          (await db.query("select name from pets where id=$1", [Q])).rows[0]
            .name,
          "Milo",
        );
        const files = await server(
          "select * from account_deletion_files($1,$2)",
          [A, lease.claim],
        );
        assert.equal(files.length, 1);
        assert.equal(files[0].path, `${A}/${P}/orphan.jpg`);
        assert.equal(
          (await db.query("select * from storage.objects")).rows.length,
          2,
          "SQL ne supprime pas les octets Storage",
        );
      },
    );
    await t.test(
      "échec repris après délai avec nouveau bail ; ancien acquittement refusé",
      async () => {
        await server("select finish_account_deletion($1,$2,false)", [
          A,
          lease.claim,
        ]);
        assert.equal(
          (await server("select * from claim_account_deletion()")).length,
          0,
        );
        await db.query(
          "update account_deletions set retry_at=now()-interval '1 second' where user_id=$1",
          [A],
        );
        const next = (
          await server("select * from claim_account_deletion()")
        )[0];
        assert.notEqual(next.claim, lease.claim);
        await assert.rejects(
          server("select finish_account_deletion($1,$2,true)", [A, next.claim]),
          /Suppression non finalisée/,
        );
        // Simulation de l'API Storage et d'Auth, jamais de suppression SQL Storage en production.
        await db.query("delete from storage.objects where owner_id=$1", [A]);
        await db.exec(
          "alter table auth.users add column deleted_at timestamptz",
        );
        await db.query("update auth.users set deleted_at=now() where id=$1", [
          A,
        ]);
        await assert.rejects(
          server("select finish_account_deletion($1,$2,true)", [
            A,
            lease.claim,
          ]),
          /Bail expiré/,
        );
        await server("select finish_account_deletion($1,$2,true)", [
          A,
          next.claim,
        ]);
        assert.ok(
          (await member(A, "select completed_at from account_deletions"))[0]
            .completed_at,
        );
      },
    );
    await t.test(
      "retour arrière refusé dès qu’une suppression existe",
      async () => {
        await assert.rejects(
          db.exec(
            await readFile(
              new URL(
                "../operations/rollback_account_deletion.sql",
                import.meta.url,
              ),
              "utf8",
            ),
          ),
          /Retour arrière refusé/,
        );
        await db.exec("rollback");
      },
    );
  } finally {
    await db.close();
  }
});
