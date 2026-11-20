import { useEffect, useState } from "react";
import {
  Button,
  Card,
  FurrixScope,
  Stack,
  StatusBadge,
} from "../../design-system";
import type { PetRow } from "../../types/database";
import "./home.css";
/** Guide facultatif : proposer une activité reste possible sans posséder d’animal. */
export default function FirstSteps({
  owner,
  profile,
  pets,
}: {
  owner: string;
  profile: { name: string | null; city: string | null };
  pets: PetRow[];
}) {
  const key = "furrix:first-steps:v1:" + owner;
  const [hidden, setHidden] = useState({ owner, hidden: false });
  useEffect(() => {
    let value = false;
    try {
      value = localStorage.getItem(key) === "1";
    } catch {}
    setHidden({ owner, hidden: value });
  }, [key, owner]);
  const steps = [
    {
      label: "Vérifier mon compte et ma ville",
      done: !!profile.name?.trim() && !!profile.city?.trim(),
      href: "#/compte",
    },
    {
      label: "Présenter mon animal",
      done: pets.length > 0,
      href: pets.length ? "#/animaux" : "#/animaux?nouveau=1",
    },
    {
      label: "Ajouter son portrait",
      done: pets.some((p) => !!p.photos?.[0]),
      href: "#/animaux",
    },
  ];
  if ((hidden.owner === owner && hidden.hidden) || steps.every((s) => s.done))
    return null;
  return (
    <FurrixScope className="app-first-steps">
      <Card>
        <Stack gap={4}>
          <h2>Tes premiers pas</h2>
          <p>
            Prépare ton profil et celui de ton compagnon à ton rythme. Tu peux
            continuer à explorer Furrix à tout moment.
          </p>
          <ol className="app-first-steps-list">
            {steps.map((step) => (
              <li key={step.href + step.label}>
                <Stack gap={3}>
                  <StatusBadge status={step.done ? "ok" : "todo"}>
                    {step.done ? "Prêt" : "À compléter"}
                  </StatusBadge>
                  <span>{step.label}</span>
                  <Button as="a" href={step.href} variant="quiet" aria-label={`${step.done ? "Consulter" : "Continuer"} : ${step.label.toLowerCase()}`}>
                    {step.done ? "Consulter" : "Continuer"}
                  </Button>
                </Stack>
              </li>
            ))}
          </ol>
          <p>
            Tu viens pour proposer une activité ? Tu n’as pas besoin d’ajouter
            un animal.
          </p>
          <div className="app-home-actions">
            <Button as="a" href="#/garde?vue=profil" variant="out">
              Proposer une garde
            </Button>
            <Button as="a" href="#/services?vue=profil" variant="out">
              Proposer mes services
            </Button>
            <Button
              variant="quiet"
              onClick={() => {
                setHidden({ owner, hidden: true });
                try {
                  localStorage.setItem(key, "1");
                } catch {}
              }}
            >
              Masquer ce guide sur cet appareil
            </Button>
          </div>
        </Stack>
      </Card>
    </FurrixScope>
  );
}
