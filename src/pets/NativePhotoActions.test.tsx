import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { NativePhotoActions } from './NativePhotoActions';
import { pickNativePetPhoto } from '../platform/nativePhoto';
vi.mock('../platform/nativePhoto',()=>({pickNativePetPhoto:vi.fn()}));
afterEach(()=>{cleanup();vi.clearAllMocks();});
it('ignore une reponse du selecteur apres avoir quitte la fiche',async()=>{
 let finish!: (file:File)=>void;vi.mocked(pickNativePetPhoto).mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
 const save=vi.fn().mockResolvedValue(undefined);const view=render(<NativePhotoActions busy={false} onPhoto={save}/>);
 fireEvent.click(screen.getByRole('button',{name:'Choisir une photo'}));view.unmount();
 await act(async()=>finish(new File(['x'],'animal.jpg',{type:'image/jpeg'})));expect(save).not.toHaveBeenCalled();
});
it('evite les doubles choix pendant le transfert de la photo',async()=>{
 vi.mocked(pickNativePetPhoto).mockResolvedValue(new File(['x'],'animal.jpg',{type:'image/jpeg'}));
 let done!:()=>void;const save=vi.fn(()=>new Promise<void>(resolve=>{done=resolve;}));
 render(<NativePhotoActions busy={false} onPhoto={save}/>);
 const choose=screen.getByRole('button',{name:'Choisir une photo'});fireEvent.click(choose);fireEvent.click(choose);
 await waitFor(()=>expect(save).toHaveBeenCalledTimes(1));expect(pickNativePetPhoto).toHaveBeenCalledTimes(1);await act(async()=>done());
});
