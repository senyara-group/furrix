import { createContext, useContext, useEffect, type ReactNode } from 'react';

/** Barre téléphone d'un sous-écran (fiche, match) : titre et retour propres à l'écran affiché. */
export type PhoneBarOverride = { title: ReactNode; back: { label: string; onClick: () => void } };

export const PhoneBarContext = createContext<(override: PhoneBarOverride | null) => void>(() => {});

/** Remplace la barre téléphone tant que l'écran est affiché ; `null` rend celle de la route. */
export function usePhoneBar(override: PhoneBarOverride | null) {
  const set = useContext(PhoneBarContext);
  useEffect(() => {
    set(override);
    return () => set(null);
  }, [set, override]);
}
