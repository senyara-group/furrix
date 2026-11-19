import '../design-system/styles';
import AuthApplication from '../auth/AuthApplication';
import { supabase, type FurrixClient } from '../services/supabaseClient';
import type { LegalDocuments } from '../auth/registration';
import AppShell from './AppShell';
import { FurrixProvider } from '../design-system';

/** Le menu et les données du compte restent derrière la session et les déclarations vérifiées. */
export default function ProductApp({ client = supabase, documents, privateBeta }: {
  client?: FurrixClient | null; documents?: LegalDocuments | null;
  privateBeta?: boolean;
}) {
  return <FurrixProvider><AuthApplication client={client} documents={documents} privateBeta={privateBeta}
    renderAuthenticated={(user, signOut) => <AppShell client={client!} user={user} onSignOut={signOut} />} /></FurrixProvider>;
}
