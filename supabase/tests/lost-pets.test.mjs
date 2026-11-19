import assert from "node:assert/strict";
import { test } from "node:test";
import { meetingsFixture } from "./meetings-fixture.mjs";
const A = "10000000-0000-0000-0000-000000000001",
  B = "10000000-0000-0000-0000-000000000002",
  C = "10000000-0000-0000-0000-000000000003";
const PA = "20000000-0000-0000-0000-000000000001",
  PB = "20000000-0000-0000-0000-000000000002",
  L = "30000000-0000-0000-0000-000000000001",
  S = "40000000-0000-0000-0000-000000000001";
test("animaux perdus : diffusion de secteur, confidentialité et déduplication", async (t) => {
  const db = await meetingsFixture();
  const as = async (uid, sql, args = []) => {
    await db.exec("set role authenticated");
    try {
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
        uid,
      ]);
      return (await db.query(sql, args)).rows;
    } finally {
      await db.exec("reset role; reset request.jwt.claim.sub");
    }
  };
  const publish = (uid = A, pet = PA, id = L) =>
    as(uid, "select publish_lost_alert($1,$2,$3,$4,$5,now(),$6,$7,$8) id", [
      id,
      pet,
      "Lille",
      50.63,
      3.06,
      "Petit chien au collier bleu",
      "Ne pas courir après lui",
      25,
    ]);
  try {
    await db.exec(`insert into auth.users(id) values('${A}'),('${B}'),('${C}'); insert into pets(id,owner_id,name,species) values('${PA}','${A}','Luna','chien'),('${PB}','${B}','Milo','chat');
  insert into private_beta_members(user_id,expires_at,accepted_at,notice_version,declared_adult) values('${A}',null,now(),'2026-11-17',true),('${B}',null,now(),'2026-11-17',true),('${C}',null,now(),'2026-11-17',true);`);
    await t.test(
      "abonnement volontaire, secteur privé et coordonnées arrondies",
      async () => {
        await as(B, "select set_lost_alert_sector(true,50.63234,3.06111,25)");
        await as(C, "select set_lost_alert_sector(true,43.60,1.44,25)");
        assert.equal(
          (await as(A, "select * from lost_alert_subscriptions")).length,
          0,
        );
        assert.equal(
          Number(
            (await as(B, "select latitude from lost_alert_subscriptions"))[0]
              .latitude,
          ),
          50.63,
        );
        await assert.rejects(
          as(B, "update lost_alert_subscriptions set radius_km=500"),
        );
      },
    );
    await t.test(
      "publication liée à son animal, sans fabrication de notifications client",
      async () => {
        await assert.rejects(publish(A, PB));
        await assert.rejects(
          as(
            A,
            `insert into local_notifications(user_id,alert_id,kind,event_key,title) values('${B}','${L}','lost_local','fake','fake')`,
          ),
        );
        assert.equal((await publish())[0].id, L);
        assert.equal((await publish())[0].id, L);
        assert.equal(
          (await db.query("select * from lost_pets")).rows.length,
          1,
        );
        assert.equal(
          (await as(B, "select * from local_notifications")).length,
          1,
        );
        assert.equal(
          (await as(C, "select * from local_notifications")).length,
          0,
        );
      },
    );
    await t.test(
      "lecture par DTO et protection des tables et des notifications",
      async () => {
        assert.equal((await as(B, "select * from lost_pets")).length, 0);
        const list = await as(B, "select * from list_lost_alerts()");
        assert.equal(list[0].display_name, "Luna");
        assert.equal(list[0].is_mine, false);
        assert.ok(!("reward" in list[0]));
        const n = (await as(B, "select * from local_notifications"))[0];
        await assert.rejects(
          as(A, "select read_local_notification($1)", [n.id]),
        );
        await as(B, "select read_local_notification($1)", [n.id]);
        assert.ok(
          (await as(B, "select * from local_notifications"))[0].read_at,
        );
      },
    );
    await t.test(
      "photo copiée : seule l’image référencée est partagée, pas les documents",
      async () => {
        const photo = `${A}/${L}/portrait.jpg`;
        await db.query("update lost_pets set photo_path=$1 where id=$2", [
          photo,
          L,
        ]);
        await db.query(
          "insert into storage.objects(bucket_id,name) values('pet-photos',$1),('pet-photos',$2),('documents',$1)",
          [photo, `${A}/${L}/non-referencee.jpg`],
        );
        const visible = await as(
          B,
          "select bucket_id,name from storage.objects",
        );
        assert.equal(visible.length, 1);
        assert.equal(visible[0].name, photo);
        await assert.rejects(
          as(
            B,
            "insert into storage.objects(bucket_id,name) values('pet-photos',$1)",
            [`${A}/${L}/intrus.jpg`],
          ),
        );
      },
    );
    await t.test(
      "observation visible seulement de son auteur et du propriétaire, sans doublon",
      async () => {
        const args = [S, L, "Lille", "Aperçu près du parc"];
        await as(B, "select add_lost_sighting($1,$2,now(),$3,$4)", args);
        await as(B, "select add_lost_sighting($1,$2,now(),$3,$4)", args);
        assert.equal((await as(A, "select * from lost_sightings")).length, 1);
        assert.equal((await as(C, "select * from lost_sightings")).length, 0);
        assert.equal(
          (await as(A, "select * from local_notifications")).length,
          1,
        );
        await assert.rejects(
          as(B, "select update_lost_alert($1,'Modification','','found')", [L]),
        );
      },
    );
    await t.test(
      "édition sans rediffusion, retrouvé notifié une fois et observations fermées",
      async () => {
        await as(
          A,
          "select update_lost_alert($1,'Toujours recherché','','lost')",
          [L],
        );
        assert.equal(
          (await as(B, "select * from local_notifications")).length,
          1,
        );
        await as(A, "select update_lost_alert($1,'Retrouvé','','found')", [L]);
        await as(A, "select update_lost_alert($1,'Retrouvé','','found')", [L]);
        assert.equal(
          (await as(B, "select * from local_notifications")).length,
          2,
        );
        assert.equal(
          (await as(B, "select * from list_lost_alerts()")).length,
          0,
        );
        await assert.rejects(
          as(
            B,
            "select add_lost_sighting('40000000-0000-0000-0000-000000000002',$1,now(),'Lille','Ici')",
            [L],
          ),
        );
        await assert.rejects(
          as(A, "select update_lost_alert($1,'Retour','','lost')", [L]),
        );
      },
    );
    await t.test(
      "désabonnement efface le secteur ; révocation ferme les RPC et les lectures",
      async () => {
        await as(B, "select set_lost_alert_sector(false)");
        assert.equal(
          (await as(B, "select * from lost_alert_subscriptions")).length,
          0,
        );
        await db.query(
          "update private_beta_members set active=false where user_id=$1",
          [B],
        );
        assert.equal(
          (await as(B, "select * from local_notifications")).length,
          0,
        );
        await assert.rejects(as(B, "select * from list_lost_alerts()"));
      },
    );
    await t.test(
      "publication limitée même en changeant de requête ou d’animal",
      async () => {
        for (let n = 2; n <= 4; n++) {
          const pet = `20000000-0000-0000-0000-00000000000${n + 2}`,
            id = `30000000-0000-0000-0000-00000000000${n}`;
          await db.query(
            "insert into pets(id,owner_id,name,species) values($1,$2,'Test','chien')",
            [pet, A],
          );
          if (n < 4) await publish(A, pet, id);
          else await assert.rejects(publish(A, pet, id));
        }
      },
    );
    await t.test('une alerte retiree ne reste pas accessible par un ancien lien', async () => {
      const id = '30000000-0000-0000-0000-000000000002';
      const photo = A+'/'+id+'/portrait.jpg';
      await db.query('update lost_pets set photo_path=$1 where id=$2',[photo,id]);
      await as(A,"select update_lost_alert($1,'Annonce retiree','','closed')",[id]);
      assert.equal((await as(C,'select * from list_lost_alerts(p_id=>$1)',[id])).length,0);
      assert.equal((await as(A,'select * from list_lost_alerts(p_id=>$1)',[id])).length,1);
      assert.equal((await as(C,'select lost_photo_visible($1) ok',[photo]))[0].ok,false);
      assert.equal((await as(C,'select * from list_lost_alerts(p_id=>$1)',[L]))[0].status,'found');
    });
  } finally {
    await db.close();
  }
});
