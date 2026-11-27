import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { createFakeSupabase } from "../../test/fakeSupabase";
import * as service from "./service";
import { ReceivedRequests, ReceivedShortcut, sortReceived, type ReceivedTab } from "./Received";
import type { Appointment } from "./types";

const client = createFakeSupabase().client;
const NOW = Date.now();
const iso = (days: number, hours = 0) => new Date(NOW + days * 86400_000 + hours * 3600_000).toISOString();
const base: Appointment = {
  id: "a1",
  role: "professional",
  owner_id: "owner",
  professional_id: "pro",
  professional_name: "Cabinet",
  owner_name: "Camille",
  category: "veterinaire",
  city: "Lille",
  pet_id: "pet",
  pet_name: "Luna",
  pet_species: "Chien",
  pet_breed: "Berger",
  pet_age: "3 ans",
  share_pet: true,
  service_name: "Consultation",
  unit: "consultation",
  price_cents: 4500,
  slot_id: "slot-1",
  starts_at: iso(2),
  ends_at: iso(2, 1),
  status: "pending",
  message: "Elle boite depuis hier.",
  professional_note: null,
  cancel_note: null,
  cancelled_by: null,
  created_at: "",
  updated_at: "",
};
const make = (over: Partial<Appointment>): Appointment => ({ ...base, ...over });

function Harness({ start = "a-traiter" as ReceivedTab }) {
  const [tab, setTab] = useState<ReceivedTab>(start);
  return <ReceivedRequests client={client} tab={tab} onTab={setTab} />;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it("répartit les demandes reçues : à traiter, à venir, passées, sans les demandes envoyées", () => {
  const groups = sortReceived([
    make({ id: "later", starts_at: iso(5), ends_at: iso(5, 1) }),
    make({ id: "soon", status: "countered", starts_at: iso(1), ends_at: iso(1, 1) }),
    make({ id: "missed", starts_at: iso(-1), ends_at: iso(-1, 1) }),
    make({ id: "confirmed", status: "confirmed" }),
    make({ id: "done", status: "confirmed", starts_at: iso(-3), ends_at: iso(-3, 1) }),
    make({ id: "declined", status: "declined" }),
    make({ id: "mine", role: "owner" }),
  ], NOW);
  expect(groups["a-traiter"].map((a) => a.id)).toEqual(["soon", "later"]);
  expect(groups["a-venir"].map((a) => a.id)).toEqual(["confirmed"]);
  expect(groups.passees.map((a) => a.id)).toEqual(["declined", "missed", "done"]);
});

it("affiche prestation, personne, animal, date et message, puis accepte la demande sur son créneau", async () => {
  const list = vi.spyOn(service, "listAppointments")
    .mockResolvedValueOnce([base, make({ id: "mine", role: "owner", service_name: "Toilettage" })])
    .mockResolvedValueOnce([make({ status: "confirmed" })]);
  const update = vi.spyOn(service, "updateAppointment").mockResolvedValue();
  render(<Harness />);
  const card = await screen.findByRole("article", { name: "Consultation · Camille" });
  expect(within(card).getByText("Luna · Chien · Berger · 3 ans")).toBeTruthy();
  expect(within(card).getByText("Elle boite depuis hier.")).toBeTruthy();
  expect(within(card).getByText("À traiter")).toBeTruthy();
  expect(screen.queryByText("Toilettage")).toBeNull();
  expect(within(card).getByRole("link", { name: "Ouvrir la conversation" }).getAttribute("href"))
    .toBe("#/services?vue=conversation&rendezvous=a1&depuis=demandes");
  fireEvent.click(within(card).getByRole("button", { name: "Accepter" }));
  await waitFor(() => expect(update).toHaveBeenCalledWith(client, { p_id: "a1", p_action: "confirm", p_slot: "slot-1", p_note: "" }));
  expect(await screen.findByText("Rendez-vous confirmé avec Camille.")).toBeTruthy();
  expect(list).toHaveBeenCalledTimes(2);
  expect(await screen.findByRole("button", { name: "À venir (1)" })).toBeTruthy();
});

it("demande une confirmation avant de refuser, avec un mot facultatif", async () => {
  vi.spyOn(service, "listAppointments").mockResolvedValue([make({ pet_name: null, share_pet: false })]);
  const update = vi.spyOn(service, "updateAppointment").mockResolvedValue();
  render(<Harness />);
  const card = await screen.findByRole("article");
  expect(within(card).getByText("Informations non partagées")).toBeTruthy();
  fireEvent.click(within(card).getByRole("button", { name: "Refuser" }));
  expect(update).not.toHaveBeenCalled();
  fireEvent.click(within(card).getByRole("button", { name: "Garder la demande" }));
  fireEvent.click(within(card).getByRole("button", { name: "Refuser" }));
  fireEvent.change(within(card).getByRole("textbox"), { target: { value: " Complet ce jour-là. " } });
  fireEvent.click(within(card).getByRole("button", { name: "Oui, refuser" }));
  await waitFor(() => expect(update).toHaveBeenCalledWith(client, { p_id: "a1", p_action: "decline", p_note: "Complet ce jour-là." }));
});

it("annule un rendez-vous à venir après confirmation, et garde l'erreur du serveur visible", async () => {
  vi.spyOn(service, "listAppointments").mockResolvedValue([make({ status: "confirmed" })]);
  const update = vi.spyOn(service, "updateAppointment").mockRejectedValue(new Error("Le créneau ou la demande a changé."));
  render(<Harness start="a-venir" />);
  const card = await screen.findByRole("article");
  expect(within(card).queryByRole("button", { name: "Accepter" })).toBeNull();
  fireEvent.click(within(card).getByRole("button", { name: "Annuler le rendez-vous" }));
  fireEvent.click(within(card).getByRole("button", { name: "Oui, annuler" }));
  await waitFor(() => expect(update).toHaveBeenCalledWith(client, { p_id: "a1", p_action: "cancel", p_note: "" }));
  expect(await within(card).findByText("Le créneau ou la demande a changé.")).toBeTruthy();
});

it("une contre-proposition attend la réponse : refus possible, pas d'acceptation", async () => {
  vi.spyOn(service, "listAppointments").mockResolvedValue([make({ status: "countered" })]);
  render(<Harness />);
  const card = await screen.findByRole("article");
  expect(within(card).getByText("Autre créneau proposé : en attente de réponse")).toBeTruthy();
  expect(within(card).queryByRole("button", { name: "Accepter" })).toBeNull();
  expect(within(card).getByRole("button", { name: "Refuser" })).toBeTruthy();
});

it("les demandes passées n'ont plus d'action, seulement le suivi", async () => {
  vi.spyOn(service, "listAppointments").mockResolvedValue([
    make({ id: "x", status: "cancelled", cancelled_by: "owner", cancel_note: "Imprévu" }),
  ]);
  render(<Harness />);
  expect(await screen.findByText("Aucune demande à traiter. Les nouvelles demandes s’afficheront ici.")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Passées" }));
  const card = await screen.findByRole("article");
  expect(within(card).getByText("Annulé par le propriétaire : Imprévu")).toBeTruthy();
  expect(within(card).queryByRole("button")).toBeNull();
  expect(within(card).getByRole("link", { name: "Voir le détail" }).getAttribute("href"))
    .toBe("#/services?vue=rendez-vous&rendezvous=x&depuis=demandes&onglet=passees");
});

it("prévoit chargement, erreur avec reprise, et aucune demande reçue", async () => {
  let fail!: (e: Error) => void;
  vi.spyOn(service, "listAppointments")
    .mockImplementationOnce(() => new Promise((_, reject) => { fail = reject; }))
    .mockResolvedValueOnce([make({ role: "owner" })]);
  render(<Harness />);
  expect(screen.getByText("Chargement des demandes reçues…")).toBeTruthy();
  fail(new Error("réseau"));
  fireEvent.click(await screen.findByRole("button", { name: "Réessayer" }));
  expect(await screen.findByText("Aucune demande reçue pour le moment")).toBeTruthy();
  expect(screen.getByRole("link", { name: "Publier des créneaux" }).getAttribute("href")).toBe("#/services?vue=creneaux");
});

it("le raccourci de « Mon activité » compte les demandes à traiter", async () => {
  vi.spyOn(service, "listAppointments").mockResolvedValue([
    base, make({ id: "b" }), make({ id: "c", status: "confirmed" }), make({ id: "d", status: "countered" }),
  ]);
  render(<ReceivedShortcut client={client} />);
  expect(await screen.findByText("2 demandes à traiter · 1 rendez-vous à venir")).toBeTruthy();
  expect(screen.getByRole("link", { name: "Voir les demandes reçues" }).getAttribute("href")).toBe("#/services?vue=demandes");
});
