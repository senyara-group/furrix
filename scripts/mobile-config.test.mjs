import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateMobileConfig } from './mobile-config.mjs';
const base={VITE_FURRIX_APP:'app',VITE_PRIVATE_BETA:'true',VITE_REGISTRATION_ENABLED:'false',VITE_SUPABASE_URL:'https://jemikzqgbpaivlujnfgl.supabase.co',VITE_SUPABASE_ANON_KEY:'sb_publishable_exemple_public_sans_valeur'};
test('la beta mobile cible le produit et DEV, sans exposer la cle dans le rapport',()=>{const out=validateMobileConfig(base);assert.equal(out.privateBeta,true);assert.ok(!JSON.stringify(out).includes(base.VITE_SUPABASE_ANON_KEY));});
test('refuse le banc technique, une beta ouverte et les configurations incompletes',()=>{for(const patch of [{VITE_FURRIX_APP:'platform-check'},{VITE_PRIVATE_BETA:'false'},{VITE_REGISTRATION_ENABLED:'true'},{VITE_SUPABASE_ANON_KEY:''},{VITE_SUPABASE_URL:'https://other.supabase.co'}]) assert.throws(()=>validateMobileConfig({...base,...patch}));});
test('refuse une cle serveur et un JWT anon pour un autre projet',()=>{for(const role of ['service_role','anon']){const payload=Buffer.from(JSON.stringify({role,ref:role==='anon'?'other':'jemikzqgbpaivlujnfgl'})).toString('base64url');assert.throws(()=>validateMobileConfig({...base,VITE_SUPABASE_ANON_KEY:'header.'+payload+'.signature'}));}assert.throws(()=>validateMobileConfig({...base,VITE_SUPABASE_ANON_KEY:'sb_secret_exemple'}));});
