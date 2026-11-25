import {createContext,useCallback,useContext,useMemo,useState,type ReactNode} from 'react';
export type InboxFilter='toutes'|'rencontres'|'garde'|'services';
export type Inbox={filter:InboxFilter;query:string};
type Drafts={values:Record<string,{text:string;request:string}>;save:(match:string,text:string)=>void;inbox:Inbox;setInbox:(next:Partial<Inbox>)=>void};
const Context=createContext<Drafts|null>(null);
/** Brouillons en mémoire, limités à la session authentifiée et jamais envoyés au stockage web. */
export function MessageDraftProvider({children}:{children:ReactNode}){
 const [values,setValues]=useState<Record<string,{text:string;request:string}>>({});
 const save=useCallback((match:string,text:string)=>setValues(old=>{if((old[match]?.text??'')===text)return old;const next={...old};if(text)next[match]={text,request:old[match]?.text.trim()===text.trim()?old[match]!.request:crypto.randomUUID()};else delete next[match];return next;}),[]);
 const [inbox,setInboxState]=useState<Inbox>({filter:'toutes',query:''});
 const setInbox=useCallback((next:Partial<Inbox>)=>setInboxState(old=>({...old,...next})),[]);
 const value=useMemo(()=>({values,save,inbox,setInbox}),[values,save,inbox,setInbox]);
 return <Context.Provider value={value}>{children}</Context.Provider>;
}
/** Un brouillon par match ; le fournisseur est recréé à chaque connexion. */
export function useMessageDraft(match:string):[string,(text:string)=>void,string|undefined]{
 const context=useContext(Context),[fallback,setFallback]=useState('');
 return [context?.values[match]?.text??fallback,text=>{if(context)context.save(match,text);else setFallback(text);},context?.values[match]?.request];
}
/** Filtre et recherche de la boîte Messages, retrouvés au retour d'une conversation (mémoire de session uniquement). */
export function useInbox():[Inbox,(next:Partial<Inbox>)=>void]{
 const context=useContext(Context),[fallback,setFallback]=useState<Inbox>({filter:'toutes',query:''});
 return context?[context.inbox,context.setInbox]:[fallback,next=>setFallback(old=>({...old,...next}))];
}
