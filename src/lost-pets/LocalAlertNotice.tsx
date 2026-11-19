import type { FurrixClient } from '../services/supabaseClient';
import { useLocalAlertUnread } from './useLocalAlertUnread';
/** Bandeau autonome pour les intégrations sans header ; ne pas monter en plus du hook partagé. */
export default function LocalAlertNotice({client,owner}:{client:FurrixClient;owner:string}){
 const unread=useLocalAlertUnread(client,owner);
 return unread?<aside className="app-local-alert" role="status"><a href="#/animaux-perdus?notifications">Une alerte animaux perdus demande ton attention. Consulter mes notifications.</a></aside>:null;
}
