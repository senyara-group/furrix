import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { createFakeSupabase } from "../../test/fakeSupabase";
import type { PetRow } from "../../types/database";
import * as professionals from "../service";
import * as service from "./service";
import AppointmentRequest from "./Request";
import { AppointmentDetail } from "./AppointmentsArea";
import type { Appointment } from "./types";
const client = createFakeSupabase().client;
const slot = {
  id: "slot",
  starts_at: "2030-12-01T10:00:00Z",
  ends_at: "2030-12-01T11:00:00Z",
  available: true,
};
const pet = { id: "pet", name: "Luna" } as PetRow;
const item: Appointment = {
  id: "appointment",
  role: "owner",
  owner_id: "owner",
  professional_id: "pro",
  professional_name: "Cabinet",
  owner_name: "Guillaume",
  category: "veterinaire",
  city: "Lille",
  pet_id: "pet",
  pet_name: "Luna",
  pet_species: "chien",
  pet_breed: null,
  pet_age: null,
  share_pet: false,
  service_name: "Consultation",
  unit: "consultation",
  price_cents: 4500,
  slot_id: slot.id,
  starts_at: slot.starts_at,
  ends_at: slot.ends_at,
  status: "countered",
  message: null,
  professional_note: null,
  cancel_note: null,
  cancelled_by: null,
  created_at: "",
  updated_at: "",
};
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.history.replaceState(null, "", "/");
});
it("conserve la demande après une réponse perdue, rejoue le même identifiant et ne partage rien par défaut", async () => {
  vi.spyOn(professionals, "getProfessional").mockResolvedValue({
    professional_id: "pro",
    name: "Cabinet",
    category: "veterinaire",
    city: "Lille",
    bio: "",
    species: ["chien"],
    hours: "",
    accessibility: "",
    phone: null,
    website: null,
    distance_km: null, latitude: 50.63, longitude: 3.06,
    services: [
      { name: "Consultation", unit: "consultation", price_cents: 4500 },
    ],
  });
  vi.spyOn(service, "listSlots").mockResolvedValue([slot]);
  let reject!: (e: Error) => void;
  const send = vi
    .spyOn(service, "requestAppointment")
    .mockImplementationOnce(
      () =>
        new Promise((_, fail) => {
          reject = fail;
        }),
    )
    .mockResolvedValue("appointment");
  render(
    <AppointmentRequest
      client={client}
      professional="pro"
      selected="slot"
      pets={[pet]}
    />,
  );
  fireEvent.change(await screen.findByLabelText("Ton animal"), {
    target: { value: "pet" },
  });
  fireEvent.change(screen.getByLabelText("Prestation"), {
    target: { value: "Consultation" },
  });
  const share = screen.getByRole("checkbox") as HTMLInputElement;
  expect(share.checked).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "Envoyer la demande" }));
  fireEvent.click(screen.getByRole("button", { name: /Envoyer la demande/ }));
  expect(send).toHaveBeenCalledTimes(1);
  expect(window.location.hash).not.toContain("rendezvous=");
  reject(new Error("Réponse perdue"));
  await screen.findByRole("alert");
  fireEvent.click(screen.getByRole("button", { name: "Envoyer la demande" }));
  await waitFor(() =>
    expect(window.location.hash).toContain("rendezvous=appointment"),
  );
  expect(send.mock.calls[0]?.[1].p_share).toBe(false);
  expect(send.mock.calls[1]?.[1].p_request).toBe(send.mock.calls[0]?.[1].p_request);
});
it("le propriétaire accepte uniquement le créneau affiché et attend la réponse du serveur", async () => {
  vi.spyOn(service, "listAppointments").mockResolvedValue([item]);
  let resolve!: () => void;
  const update = vi.spyOn(service, "updateAppointment").mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  render(<AppointmentDetail client={client} id={item.id} />);
  const accept = await screen.findByRole("button", {
    name: "Accepter ce nouveau créneau",
  });
  fireEvent.click(accept);
  fireEvent.click(accept);
  expect(update).toHaveBeenCalledTimes(1);
  expect(update.mock.calls[0]?.[1]).toMatchObject({
    p_id: item.id,
    p_action: "accept_counter",
    p_slot: "slot",
  });
  expect(screen.queryByText("Rendez-vous confirmé")).toBeNull();
  resolve();
  await waitFor(() =>
    expect(service.listAppointments).toHaveBeenCalledTimes(2),
  );
});
it("un professionnel ne voit pas l’animal non partagé et peut confirmer la demande", async () => {
  vi.spyOn(service, "listAppointments").mockResolvedValue([
    {
      ...item,
      role: "professional",
      status: "pending",
      pet_id: null,
      pet_name: null,
      pet_species: null,
    },
  ]);
  vi.spyOn(service, "listSlots").mockResolvedValue([slot]);
  vi.spyOn(service, "updateAppointment").mockResolvedValue();
  render(<AppointmentDetail client={client} id={item.id} />);
  fireEvent.click(
    await screen.findByRole("button", { name: "Confirmer ce rendez-vous" }),
  );
  expect(
    screen.getByText(
      "Le propriétaire n’a pas partagé les informations de son animal.",
    ),
  ).toBeTruthy();
  expect(screen.queryByText(/Animal : Luna/)).toBeNull();
  expect(service.updateAppointment).toHaveBeenCalledWith(client, {
    p_id: item.id,
    p_action: "confirm",
    p_slot: "slot",
    p_note: "",
  });
});
it("l’annulation demande une confirmation explicite avant tout appel serveur", async () => {
  vi.spyOn(service, "listAppointments").mockResolvedValue([
    { ...item, status: "confirmed" },
  ]);
  const update = vi.spyOn(service, "updateAppointment").mockResolvedValue();
  render(<AppointmentDetail client={client} id={item.id} />);
  fireEvent.click(
    await screen.findByRole("button", { name: "Annuler le rendez-vous" }),
  );
  expect(update).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText(/Motif d’annulation/), {
    target: { value: "Indisponible" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Confirmer l’annulation" }),
  );
  expect(update).toHaveBeenCalledWith(client, {
    p_id: item.id,
    p_action: "cancel",
    p_note: "Indisponible",
  });
});
