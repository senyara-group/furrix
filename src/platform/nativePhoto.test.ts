import { afterEach, describe, expect, it, vi } from 'vitest';
import { Camera } from '@capacitor/camera';
import type { MediaType } from '@capacitor/camera';
import { pickNativePetPhoto } from './nativePhoto';
vi.mock('@capacitor/core',()=>({Capacitor:{isNativePlatform:()=>true}}));
vi.mock('@capacitor/camera',()=>({Camera:{takePhoto:vi.fn(),chooseFromGallery:vi.fn()},EncodingType:{JPEG:0},MediaTypeSelection:{Photo:0}}));
const media={webPath:'http://localhost/_capacitor_file_/photo.jpg',type:0 as MediaType,format:'jpeg',saved:false};
afterEach(()=>{vi.clearAllMocks();vi.unstubAllGlobals();});
describe('photos natives',()=>{
 it('choisit une seule photo sans metadonnees et conserve le controle du format',async()=>{
  vi.mocked(Camera.chooseFromGallery).mockResolvedValue({results:[media]});
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,blob:async()=>new Blob(['image'],{type:'image/jpeg'})}));
  const file=await pickNativePetPhoto('gallery');expect(file?.type).toBe('image/jpeg');
  expect(Camera.chooseFromGallery).toHaveBeenCalledWith(expect.objectContaining({includeMetadata:false,allowMultipleSelection:false}));
 });
 it('ne sauvegarde pas automatiquement la prise de vue dans la phototheque',async()=>{
  vi.mocked(Camera.takePhoto).mockResolvedValue(media);
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,blob:async()=>new Blob(['image'],{type:'image/jpeg'})}));
  await pickNativePetPhoto('camera');expect(Camera.takePhoto).toHaveBeenCalledWith(expect.objectContaining({saveToGallery:false,includeMetadata:false}));
 });
 it('une annulation ne lit ni ne televerse de fichier',async()=>{
  vi.mocked(Camera.chooseFromGallery).mockRejectedValue(new Error('User cancelled photos app'));
  const fetch=vi.fn();vi.stubGlobal('fetch',fetch);expect(await pickNativePetPhoto('gallery')).toBeNull();expect(fetch).not.toHaveBeenCalled();
 });
 it('refuse un fichier trop lourd ou dans un format non accepte',async()=>{
  vi.mocked(Camera.chooseFromGallery).mockResolvedValue({results:[media]});
  for(const blob of [new Blob(['image'],{type:'image/heic'}),new Blob([new Uint8Array(5*1024*1024+1)],{type:'image/jpeg'})]){
   vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,blob:async()=>blob}));await expect(pickNativePetPhoto('gallery')).rejects.toThrow();
  }
 });
});
