import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { FurrixClient } from "../services/supabaseClient";
import {
  AndroidPush,
  androidPushSupported,
  type PushPhase,
} from "./androidPush";
import { Alert, Button, Card, Note, Stack } from "../design-system";
const Context = createContext<{
  supported: boolean;
  phase: PushPhase;
  enable: () => Promise<void>;
  disable: () => Promise<void>;
} | null>(null);
export const useAndroidPush = () => useContext(Context);
/** Une seule série d’écouteurs par session authentifiée, partagée avec Mon compte. */
export function AndroidPushProvider({
  client,
  owner,
  children,
}: {
  client: FurrixClient;
  owner: string;
  children: ReactNode;
}) {
  const [phase, setPhase] = useState<PushPhase>("loading"),
    ref = useRef<AndroidPush>();
  const supported = androidPushSupported();
  useEffect(() => {
    if (!supported) return;
    const runtime = new AndroidPush(client, owner, setPhase);
    ref.current = runtime;
    void runtime.start();
    return () => {
      ref.current = undefined;
      runtime.stop();
    };
  }, [client, owner, supported]);
  return (
    <Context.Provider
      value={{
        supported,
        phase,
        enable: async () => {
          await ref.current?.enable();
        },
        disable: async () => {
          await ref.current?.disable();
        },
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function AndroidPushSettings() {
  const value = useAndroidPush();
  if (!value) return null;
  const busy = value.phase === "loading" || value.phase === "busy";
  return (
    <Card>
      <Stack gap={3}>
        <h2>Notifications sur cet appareil</h2>
        {!value.supported ? (
          <Note>
            Les notifications hors application se règlent dans Furrix sur
            Android. Elles arriveront ensuite sur iPhone.
          </Note>
        ) : (
          <>
            <p>
              Reçois les alertes de ton secteur et les observations sur tes
              annonces, même quand Furrix est fermé.
            </p>
            {value.phase === "on" ? (
              <Alert
                tone="ok"
                title="Notifications activées sur cet appareil"
              />
            ) : value.phase === "denied" ? (
              <Alert tone="info" title="Autorisation refusée">
                Tu peux autoriser Furrix dans les réglages de notifications du
                téléphone. Les alertes restent consultables dans l’application.
              </Alert>
            ) : value.phase === "unavailable" ? (
              <Note>
                Les notifications ne sont pas encore disponibles sur cet
                environnement.
              </Note>
            ) : value.phase === "error" ? (
              <Alert tone="err" title="Réglage non confirmé">
                Vérifie ta connexion et réessaie. Tes alertes internes restent
                accessibles.
              </Alert>
            ) : (
              <Note>
                Tu choisis de les activer sur chaque appareil. Les alertes de
                secteur dépendent de la zone choisie ci-dessus.
              </Note>
            )}
            {value.phase !== "unavailable" && (
              <div className="app-lost-actions">
                <Button
                  variant="out"
                  loading={busy}
                  onClick={() => {
                    void value.enable();
                  }}
                >
                  {value.phase === "on"
                    ? "Actualiser les notifications"
                    : "Activer sur cet appareil"}
                </Button>
                <Button
                  variant="quiet"
                  disabled={busy}
                  onClick={() => {
                    void value.disable();
                  }}
                >
                  Désactiver sur cet appareil
                </Button>
              </div>
            )}
          </>
        )}
      </Stack>
    </Card>
  );
}
