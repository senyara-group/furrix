import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import HomeActivity from "./HomeActivity";
import { activityItems } from "./activity";
import * as service from "./service";
import type {
  HomeActivity as Data,
  HomeAppointment,
  HomeSitting,
} from "./service";
import { createFakeSupabase } from "../../test/fakeSupabase";
const now = Date.parse("2030-06-01T10:00:00Z"),
  date = (hours: number) => new Date(now + hours * 3600000).toISOString();
const empty: Data = { matches: [], sittings: [], appointments: [], failed: [] };
const sitting: HomeSitting = {
  id: "sitting",
  role: "owner",
  pet_name: "Luna",
  status: "accepted",
  starts_at: date(2),
  ends_at: date(4),
};
const appointment: HomeAppointment = {
  id: "appointment",
  role: "owner",
  professional_name: "Cabinet",
  pet_name: null,
  service_name: "Consultation",
  starts_at: date(3),
  ends_at: date(4),
  status: "countered",
};
const client = createFakeSupabase().client;
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it("distingue l’accord de garde d’une confirmation et adapte les réponses à chaque rôle", () => {
  const result = activityItems(
    { ...empty, sittings: [sitting], appointments: [appointment] },
    now,
  );
  expect(result.upcoming).toEqual([]);
  expect(result.waiting[0]?.status).toBe(
    "Accord du gardien · garde non confirmée",
  );
  expect(result.waiting[1]?.status).toBe("Nouveau créneau à accepter");
  const pro = activityItems(
    { ...empty, appointments: [{ ...appointment, role: "professional" }] },
    now,
  );
  expect(pro.waiting[0]?.status).toBe("En attente du propriétaire");
});
it("écarte les activités terminées, refusées, annulées et les dates invalides", () => {
  const result = activityItems(
    {
      ...empty,
      sittings: [
        { ...sitting, status: "cancelled" },
        {
          ...sitting,
          id: "past",
          status: "confirmed",
          starts_at: date(-2),
          ends_at: date(-1),
        },
        { ...sitting, id: "bad", starts_at: "invalide" },
      ],
      appointments: [
        { ...appointment, status: "declined" },
        {
          ...appointment,
          id: "old-pending",
          status: "pending",
          starts_at: date(-1),
          ends_at: date(1),
        },
      ],
      matches: [
        {
          match_id: "past-match",
          my_pet_name: "Luna",
          name: "Milo",
          proposal_status: "accepted",
          proposal_slot: date(-1),
        },
      ],
    },
    now,
  );
  expect(result).toEqual({ waiting: [], upcoming: [] });
});
it("place les activités en cours avant les suivantes et déduplique les identifiants par parcours", () => {
  const result = activityItems(
    {
      ...empty,
      sittings: [
        {
          ...sitting,
          status: "confirmed",
          starts_at: date(-2),
          ends_at: date(2),
        },
      ],
      appointments: [
        { ...appointment, status: "confirmed" },
        { ...appointment, status: "confirmed" },
        { ...appointment, id: "soon", status: "confirmed", starts_at: date(1) },
      ],
    },
    now,
  );
  expect(result.upcoming.map((x) => x.id)).toEqual([
    "sitting:sitting",
    "appointment:soon",
    "appointment:appointment",
  ]);
  expect(result.upcoming[0]?.status).toBe("Garde en cours");
});
it("ne choisit pas un créneau de rencontre à la place des participants", () => {
  const result = activityItems(
    {
      ...empty,
      matches: [
        {
          match_id: "match",
          my_pet_name: "Luna",
          name: "Milo",
          proposal_status: "pending",
          proposal_slot: null,
        },
      ],
    },
    now,
  );
  expect(result.waiting[0]?.date).toBeNull();
  expect(result.waiting[0]?.href).toBe("#/messages?match=match&vue=rencontre");
});
it("préserve les sources disponibles quand une requête échoue et utilise des projections sans texte privé", async () => {
  const calls: Array<{ name: string; fields: string; signal: AbortSignal }> =
    [];
  const rpc = vi.fn((name: string) => ({
    select: (fields: string) => ({
      abortSignal: (signal: AbortSignal) => {
        calls.push({ name, fields, signal });
        return Promise.resolve(
          name === "list_my_sittings"
            ? { data: null, error: { code: "42501" } }
            : { data: [], error: null },
        );
      },
    }),
  }));
  const signal = new AbortController().signal;
  const result = await service.loadHomeActivity(
    { rpc } as unknown as typeof client,
    signal,
  );
  expect(result.failed).toEqual(["Garde"]);
  expect(calls).toHaveLength(3);
  expect(
    calls.every(
      (x) =>
        x.signal === signal &&
        !/message|last_text|photo|weight|price/.test(x.fields),
    ),
  ).toBe(true);
});
it("une source en panne ne masque pas les activités disponibles et ne produit pas de faux état vide", async () => {
  vi.spyOn(service, "loadHomeActivity").mockResolvedValue({
    ...empty,
    failed: ["Garde"],
    matches: [
      {
        match_id: "match",
        my_pet_name: "Luna",
        name: "Milo",
        proposal_status: "pending",
        proposal_slot: null,
      },
    ],
  });
  render(<HomeActivity client={client} owner="a" />);
  await screen.findByText("Luna et Milo");
  expect(screen.getByText("Suivi partiellement indisponible")).toBeTruthy();
  expect(screen.queryByText("Rien à suivre dans cet aperçu")).toBeNull();
  expect(
    screen.getByRole("link", { name: "Voir le détail" }).getAttribute("href"),
  ).toBe("#/messages?match=match&vue=rencontre");
});
it("retire les anciennes cartes pendant une actualisation et après une révocation d’accès", async () => {
  vi.spyOn(service, "loadHomeActivity")
    .mockResolvedValueOnce({
      ...empty,
      matches: [
        {
          match_id: "match",
          my_pet_name: "Luna",
          name: "Milo",
          proposal_status: "pending",
          proposal_slot: null,
        },
      ],
    })
    .mockResolvedValueOnce({
      ...empty,
      failed: ["Rencontres", "Garde", "Services"],
    });
  render(<HomeActivity client={client} owner="a" />);
  await screen.findByText("Luna et Milo");
  fireEvent.click(screen.getByRole("button", { name: "Actualiser le suivi" }));
  await screen.findByText("Suivi partiellement indisponible");
  expect(screen.queryByText("Luna et Milo")).toBeNull();
});
it("ignore la réponse de l’ancien compte et interrompt sa requête", async () => {
  let finish!: (data: Data) => void;
  const signals: AbortSignal[] = [];
  vi.spyOn(service, "loadHomeActivity")
    .mockImplementationOnce((_client, signal) => {
      signals.push(signal);
      return new Promise((done) => {
        finish = done;
      });
    })
    .mockResolvedValueOnce(empty);
  const view = render(<HomeActivity client={client} owner="a" />);
  view.rerender(<HomeActivity client={client} owner="b" />);
  await screen.findByText("Rien à suivre dans cet aperçu");
  expect(signals[0]?.aborted).toBe(true);
  await act(async () =>
    finish({
      ...empty,
      matches: [
        {
          match_id: "match",
          my_pet_name: "Ancien compte",
          name: "Milo",
          proposal_status: "pending",
          proposal_slot: null,
        },
      ],
    }),
  );
  expect(screen.queryByText("Ancien compte et Milo")).toBeNull();
});
it("ne monte l’aperçu complet que dans la limite annoncée et sans action de confirmation", async () => {
  const matches = Array.from({ length: 5 }, (_, i) => ({
    match_id: "m" + i,
    my_pet_name: "Luna " + i,
    name: "Milo",
    proposal_status: "pending" as const,
    proposal_slot: null,
  }));
  vi.spyOn(service, "loadHomeActivity").mockResolvedValue({
    ...empty,
    matches,
  });
  render(<HomeActivity client={client} owner="a" />);
  await waitFor(() =>
    expect(
      screen.getAllByRole("link", { name: "Voir le détail" }),
    ).toHaveLength(3),
  );
  expect(
    screen.queryByRole("button", { name: /Confirmer|Accepter|Payer/ }),
  ).toBeNull();
});
