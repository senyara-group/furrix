import AuthApplication from '../auth/AuthApplication';
import { supabase, type FurrixClient } from '../services/supabaseClient';
import type { LegalDocuments } from '../auth/registration';
import AppShell from './AppShell';

/** Le menu et les données du compte restent derrière la session et les déclarations vérifiées. */
export default function ProductApp({ client = supabase, documents, privateBeta }: {
  client?: FurrixClient | null; documents?: LegalDocuments | null;
  privateBeta?: boolean;
}) {
  return <AuthApplication client={client} documents={documents} privateBeta={privateBeta}
    renderAuthenticated={(user, signOut) => <AppShell client={client!} user={user} onSignOut={signOut} />} />;
}
