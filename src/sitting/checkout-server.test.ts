import { expect, it, vi } from 'vitest';
import { checkoutHandler, CheckoutError, type CheckoutClaim, type CheckoutStore, type CheckoutProvider } from '../../supabase/functions/sitting-checkout/core';
import { checkoutEnabled } from '../../supabase/functions/sitting-checkout/readiness';

const owner='10000000-0000-4000-8000-000000000001', sitter='10000000-0000-4000-8000-000000000002';
const session='20000000-0000-4000-8000-000000000001', request='30000000-0000-4000-8000-000000000001';
const attempt='40000000-0000-4000-8000-000000000001', claim='50000000-0000-4000-8000-000000000001';
const clock=Date.parse('2026-11-27T12:00:00Z');
const jwt=(extra:object={})=>'header.'+btoa(JSON.stringify({sub:owner,role:'authenticated',session_id:session,...extra})).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_')+'.signature';
const url='https://checkout.stripe.com/c/pay/cs_test_Example';
const stored=():CheckoutClaim=>({
 saved:{id:attempt,stripe_account:'acct_guard',commission_basis_points:'1250',prepared_at:clock/1000,expires_at:clock/1000+3600,
 request:{owner_id:owner,sitter_id:sitter,status:'accepted',starts_at:'2026-12-01T12:00:00Z',units:2,unit_price_cents:2000}},
 claim,session:null,
});
const options={enabled:true,commission:'1250',windowSeconds:'3600',now:()=>clock};
function setup() {
 const store={verify:vi.fn<CheckoutStore['verify']>().mockResolvedValue(owner),prepare:vi.fn<CheckoutStore['prepare']>().mockResolvedValue(stored()),
 attach:vi.fn<CheckoutStore['attach']>().mockResolvedValue(undefined),release:vi.fn<CheckoutStore['release']>().mockResolvedValue(undefined)};
 const provider={verifyPlatform:vi.fn<CheckoutProvider['verifyPlatform']>().mockResolvedValue(undefined),
 status:vi.fn<CheckoutProvider['status']>().mockResolvedValue({charges:true,payouts:true}),
 create:vi.fn<CheckoutProvider['create']>().mockResolvedValue({id:'cs_test_Example',status:'open',url})};
 return {store,provider,handler:checkoutHandler(store,provider,options)};
}
function req(body:unknown={request_id:request},token:string|null=jwt(),method='POST') {
 return new Request('https://functions.test/sitting-checkout',{method,headers:token?{authorization:'Bearer '+token}:{},
 ...(method==='POST'?{body:JSON.stringify(body)}:{})});
}
it('reste fermé dans le point d’entrée même si une variable demande l’ouverture prématurée',()=>{
 expect(checkoutEnabled('true','https://jemikzqgbpaivlujnfgl.supabase.co','sk_test_fake')).toBe(false);
 expect(checkoutEnabled('true','https://another.supabase.co','sk_live_fake')).toBe(false);
});
it('interrupteur coupé : aucune authentification, lecture en base ou requête Stripe',async()=>{
 const {store,provider}=setup();const response=await checkoutHandler(store,provider,{...options,enabled:false})(req());
 expect(response.status).toBe(503);expect(await response.json()).toEqual({status:'unavailable'});
 expect(store.verify).not.toHaveBeenCalled();expect(store.prepare).not.toHaveBeenCalled();expect(provider.verifyPlatform).not.toHaveBeenCalled();
 expect(response.headers.get('Cache-Control')).toBe('no-store');
});
it('prévol accepté et méthodes refusées sans préparer de paiement',async()=>{
 const {handler,store}=setup();expect((await handler(req(null,null,'OPTIONS'))).status).toBe(204);
 expect((await handler(req(null,null,'GET'))).status).toBe(405);expect(store.prepare).not.toHaveBeenCalled();
});
it.each([{commission:undefined},{commission:'12.5'},{windowSeconds:undefined},{windowSeconds:'1799'},{windowSeconds:'86401'}])('refuse une configuration commerciale absente ou invalide : %j',async bad=>{
 const {store,provider}=setup();expect((await checkoutHandler(store,provider,{...options,...bad})(req())).status).toBe(503);
 expect(store.verify).not.toHaveBeenCalled();expect(store.prepare).not.toHaveBeenCalled();
});
it('refuse un jeton non vérifié avant de lire ses déclarations',async()=>{
 const {store,provider,handler}=setup();store.verify.mockResolvedValue(null);
 expect((await handler(req())).status).toBe(401);expect(store.prepare).not.toHaveBeenCalled();expect(provider.verifyPlatform).not.toHaveBeenCalled();
});
it.each([null,'broken',jwt({sub:sitter}),jwt({role:'service_role'}),jwt({session_id:null}),jwt({session_id:'bad'})])('refuse une session manquante ou incohérente',async token=>{
 const {handler,store}=setup();expect((await handler(req(undefined,token))).status).toBe(401);expect(store.prepare).not.toHaveBeenCalled();
});
it.each([{request_id:request,amount:1},{request_id:request,stripe_account:'acct_other'},{request_id:request,commission:0},{request_id:request,return_url:'https://other.test'},[],null,{request_id:'bad'}])('n’accepte que l’identifiant UUID de la demande : %j',async body=>{
 const {handler,store,provider}=setup();expect((await handler(req(body))).status).toBe(400);
 expect(store.prepare).not.toHaveBeenCalled();expect(provider.verifyPlatform).not.toHaveBeenCalled();
});
it('borne le corps sans se fier à Content-Length',async()=>{
 const {handler,store}=setup();const response=await handler(new Request('https://functions.test',{method:'POST',headers:{authorization:'Bearer '+jwt()},body:' '.repeat(1025)}));
 expect(response.status).toBe(400);expect(store.prepare).not.toHaveBeenCalled();
});
it('une mauvaise plateforme ne réserve aucune tentative',async()=>{
 const {handler,store,provider}=setup();provider.verifyPlatform.mockRejectedValue(Error('wrong_sandbox'));
 expect((await handler(req())).status).toBe(503);expect(store.prepare).not.toHaveBeenCalled();expect(provider.create).not.toHaveBeenCalled();
});
it('utilise l’identité vérifiée et la configuration serveur, enregistre avant de rendre le lien',async()=>{
 const {handler,store,provider}=setup();const response=await handler(req());
 expect(store.prepare).toHaveBeenCalledWith(request,{id:owner,session},1250,3600);
 expect(provider.status).toHaveBeenCalledWith('acct_guard');expect(provider.create).toHaveBeenCalledWith(stored().saved,clock/1000);
 expect(store.attach).toHaveBeenCalledWith(attempt,'cs_test_Example');expect(store.release).toHaveBeenCalledWith(attempt,claim);
 expect(store.attach.mock.invocationCallOrder[0]).toBeLessThan(store.release.mock.invocationCallOrder[0]!);
 expect(response.status).toBe(200);expect(await response.json()).toEqual({status:'checkout_ready',url});
 expect(response.headers.get('Cache-Control')).toBe('no-store');
});
it.each([['forbidden',403],['busy',409],['request_unavailable',409]] as const)('traduit les refus contrôlés de la base : %s',async(code,status)=>{
 const {handler,store,provider}=setup();store.prepare.mockRejectedValue(new CheckoutError(code));const response=await handler(req());
 expect(response.status).toBe(status);expect(await response.json()).toEqual({status:code});expect(provider.create).not.toHaveBeenCalled();expect(store.release).not.toHaveBeenCalled();
});
it('ne crée pas de session si les versements du gardien sont inactifs',async()=>{
 const {handler,store,provider}=setup();provider.status.mockResolvedValue({charges:true,payouts:false});
 const response=await handler(req());expect(response.status).toBe(409);expect(await response.json()).toEqual({status:'onboarding_required'});
 expect(provider.create).not.toHaveBeenCalled();expect(store.release).toHaveBeenCalledWith(attempt,claim);
});
it('un résultat perdu conserve la même tentative au nouvel essai et ne divulgue pas l’erreur brute',async()=>{
 const {handler,store,provider}=setup();provider.create.mockRejectedValueOnce(Error('secret sk_test_example URL https://internal.test'));
 const response=await handler(req());expect(response.status).toBe(503);expect(await response.text()).toBe('{"status":"unavailable"}');
 expect(store.attach).not.toHaveBeenCalled();expect(store.release).toHaveBeenCalledTimes(1);
 expect((await handler(req())).status).toBe(200);expect(provider.create.mock.calls[0]?.[0]).toEqual(provider.create.mock.calls[1]?.[0]);
});
it('un échec d’enregistrement ne remet jamais le lien au client',async()=>{
 const {handler,store}=setup();store.attach.mockRejectedValue(Error('database unavailable'));const response=await handler(req());
 expect(response.status).toBe(503);expect(await response.json()).toEqual({status:'unavailable'});expect(store.release).toHaveBeenCalled();
});
it.each(['complete','expired'])('une session %s exige un rapprochement et ne confirme rien',async status=>{
 const {handler,store,provider}=setup();provider.create.mockResolvedValue({id:'cs_test_Example',status,url:null});
 const response=await handler(req());expect(response.status).toBe(409);expect(await response.json()).toEqual({status:'reconciliation_required'});
 expect(store.attach).toHaveBeenCalledWith(attempt,'cs_test_Example');
});
it('une session différente de celle enregistrée est refusée',async()=>{
 const {handler,store}=setup();store.prepare.mockResolvedValue({...stored(),session:'cs_test_Previous'});
 expect((await handler(req())).status).toBe(503);expect(store.attach).not.toHaveBeenCalled();
});
it('refuse une tentative attribuée à un autre propriétaire et libère seulement son bail',async()=>{
 const {handler,store,provider}=setup();const state=stored();state.saved.request.owner_id=sitter;store.prepare.mockResolvedValue(state);
 expect((await handler(req())).status).toBe(503);expect(provider.status).not.toHaveBeenCalled();expect(store.release).toHaveBeenCalledWith(attempt,claim);
});
it('un lien hors de Stripe ne sort jamais dans une réponse',async()=>{
 const {handler,provider}=setup();provider.create.mockResolvedValue({id:'cs_test_Example',status:'open',url:'https://other.test'});
 expect((await handler(req())).status).toBe(503);
});
it('un échec de libération ne détruit pas le résultat enregistré',async()=>{
 const {handler,store}=setup();store.release.mockRejectedValue(Error('network'));expect((await handler(req())).status).toBe(200);
 expect(store.attach).toHaveBeenCalledWith(attempt,'cs_test_Example');
});
