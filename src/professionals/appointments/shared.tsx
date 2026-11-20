import { useEffect, useState } from "react";
import { Alert, Button, Loading, Note } from "../../design-system";
/** Chargement annulé logiquement quand on quitte l’écran ; reprise explicite en cas d’échec. */
export function useRemote<T>(load: () => Promise<T>, dependencies: unknown[]) {
  const [data, setData] = useState<T>(),
    [error, setError] = useState(""),
    [version, setVersion] = useState(0);
  useEffect(() => {
    let current = true;
    setData(undefined);
    setError("");
    void load()
      .then((value) => {
        if (current) setData(value);
      })
      .catch(() => {
        if (current)
          setError(
            "Le chargement a échoué. Vérifie ta connexion puis réessaie.",
          );
      });
    return () => {
      current = false;
    };
  }, [...dependencies, version]);
  return { data, error, reload: () => setVersion((v) => v + 1) };
}
export function RemoteState({
  error,
  reload,
}: {
  error: string;
  reload: () => void;
}) {
  return error ? (
    <Alert
      tone="err"
      title={error}
      actions={
        <Button variant="out" onClick={reload}>
          Réessayer
        </Button>
      }
    />
  ) : (
    <Loading label="Chargement des rendez-vous…" />
  );
}
export const mutationError = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "L’action n’a pas pu être confirmée. Actualise avant de réessayer.";
export function AppointmentNotice() {
  return (
    <Note>
      Une demande attend la confirmation de l’établissement. Furrix n’encaisse
      aucun paiement. Le tarif affiché est indicatif, à confirmer directement
      avec l’établissement.
    </Note>
  );
}
