// @vitest-environment node
import {it,expect,vi} from 'vitest';
import {firebaseSender} from '../../supabase/functions/android-push-worker/core';
it('réutilise OAuth, reprend les erreurs temporaires et distingue un appareil désinscrit',async()=>{
 const pair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
 const der=await crypto.subtle.exportKey('pkcs8',pair.privateKey);
 const private_key='-----BEGIN PRIVATE KEY-----\n'+btoa(String.fromCharCode(...new Uint8Array(der)))+'\n-----END PRIVATE KEY-----';
 const request=vi.fn().mockResolvedValueOnce(Response.json({access_token:'fake',expires_in:3600})).mockResolvedValueOnce(Response.json({name:'ok'})).mockResolvedValueOnce(Response.json({error:{details:[{errorCode:'UNREGISTERED'}]}},{status:404})).mockResolvedValueOnce(new Response(null,{status:429})).mockResolvedValueOnce(new Response(null,{status:403})).mockResolvedValueOnce(new Response(null,{status:400}));
 const send=firebaseSender({project_id:'furrix-8dd6e',client_email:'test@furrix-8dd6e.iam.gserviceaccount.com',private_key},request);
 const d={token:'fake',alert_id:'alert',notification_id:'notice',kind:'lost_local'};
 expect(await send(d)).toBe('sent');expect(await send(d)).toBe('invalid_token');expect(await send(d)).toBe('retry');expect(await send(d)).toBe('retry');expect(await send(d)).toBe('permanent');
 expect(request.mock.calls.filter(c=>c[0]==='https://oauth2.googleapis.com/token')).toHaveLength(1);
 expect(request.mock.calls.slice(1).every(c=>c[0]==='https://fcm.googleapis.com/v1/projects/furrix-8dd6e/messages:send')).toBe(true);
});
