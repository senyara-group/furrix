import {createContext,useCallback,useContext,useMemo,useState,type ReactNode} from 'react';
type Drafts={values:Record<string,{text:string;request:string}>;save:(match:string,text:string)=>void};
const Context=createContext<Drafts|null>(null);
/** Brouillons en mémoire, limités à la session authentifiée et jamais envoyés au stockage web. */
export function MessageDraftProvider({children}:{children:ReactNode}){
 const [values,setValues]=useState<Record<string,{text:string;request:string}>>({});
 const save=useCallback((match:string,text:string)=>setValues(old=>{if((old[match]?.text??'')===text)return old;const next={...old};if(text)next[match]={text,request:old[match]?.text.trim()===text.trim()?old[match]!.request:crypto.randomUUID()};else delete next[match];return next;}),[]);
 const value=useMemo(()=>({values,save}),[values,save]);
 return <Context.Provider value={value}>{children}</Context.Provider>;
}
/** Un brouillon par match ; le fournisseur est recréé à chaque connexion. */
export function useMessageDraft(match:string):[string,(text:string)=>void,string|undefined]{
 const context=useContext(Context),[fallback,setFallback]=useState('');
 return [context?.values[match]?.text??fallback,text=>{if(context)context.save(match,text);else setFallback(text);},context?.values[match]?.request];
}
