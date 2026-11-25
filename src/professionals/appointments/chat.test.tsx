import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSupabase } from "../../test/fakeSupabase";
import { AppError } from "../../services/errors";
import * as service from "./service";
import { AppointmentChat } from "./Chat";
import { AppointmentDetail } from "./AppointmentsArea";
import MessagesArea from "../../meetings/AfterMatch";
import * as meetings from "../../meetings/service";
import * as sitting from "../../sitting/service";
import { notificationHref } from "../../notifications/types";
import type { Appointment, ProMessage } from "./types";

const client = createFakeSupabase().client;
const item: Appointment = {
  id: "11111111-1111-4111-8111-111111111111", role: "owner", owner_id: "owner", professional_id: "pro", professional_name: "Cabinet des Oyats",
  owner_name: "Alex", category: "veterinaire", city: "Lille", pet_id: "pet", pet_name: "Luna", pet_species: "chien", pet_breed: null, pet_age: null,
  share_pet: false, service_name: "Consultation", unit: "consultation", price_cents: 4500, slot_id: "slot",
  starts_at: "2030-12-01T10:00:00Z", ends_at: "2030-12-01T11:00:00Z", status: "pending", message: "Luna a peur en voiture.",
  professional_note: null, cancel_note: null, cancelled_by: null, created_at: "2030-11-20T09:00:00Z", updated_at: "2030-11-20T09:00:00Z",
};
const msg = (id: number, sender: string, text: string): ProMessage => ({
  id, appointment_id: item.id, sender_id: sender, text, request_id: "r" + id, created_at: `2030-11-20T09:0${id}:00Z`,
});
beforeEach(() => { vi.spyOn(window, "scrollTo").mockImplementation(() => {}); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); window.history.replaceState(null, "", "/"); });

describe("conversation d’une demande de service", () => {
  it("affiche la demande, son message puis les échanges dans l’ordre", async () => {
    vi.spyOn(service, "listAppointments").mockResolvedValue([item]);
    vi.spyOn(service, "loadProfessionalMessages").mockResolvedValue([msg(2, "pro", "On prendra le temps."), msg(1, "owner", "Merci !")].reverse());
    render(<AppointmentChat client={client} me="owner" id={item.id} />);
    await screen.findByText("On prendra le temps.");
    const bubbles = ["Luna a peur en voiture.", "Merci !", "On prendra le temps."].map((t) => screen.getByText(t));
    expect(bubbles[0]!.compareDocumentPosition(bubbles[1]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(bubbles[1]!.compareDocumentPosition(bubbles[2]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getAllByRole("link", { name: "Voir la demande" })[0]!.getAttribute("href")).toBe("#/services?vue=rendez-vous&rendezvous=" + item.id);
    expect(screen.getByLabelText("Ton message")).toBeTruthy();
  });
  it("chargement, puis conversation vide avec une invitation à écrire", async () => {
    vi.spyOn(service, "listAppointments").mockResolvedValue([{ ...item, message: null }]);
    vi.spyOn(service, "loadProfessionalMessages").mockResolvedValue([]);
    render(<AppointmentChat client={client} me="owner" id={item.id} />);
    expect(screen.getByText("Chargement de la conversation…")).toBeTruthy();
    expect(await screen.findByText("Pas encore de message. Pose ta question à Cabinet des Oyats.")).toBeTruthy();
  });
  it("une erreur de chargement propose de réessayer, puis la conversation s’affiche", async () => {
    const list = vi.spyOn(service, "listAppointments").mockRejectedValueOnce(new Error("réseau")).mockResolvedValue([item]);
    vi.spyOn(service, "loadProfessionalMessages").mockResolvedValue([]);
    render(<AppointmentChat client={client} me="owner" id={item.id} />);
    fireEvent.click(await screen.findByRole("button", { name: "Réessayer" }));
    await screen.findByText("Luna a peur en voiture.");
    expect(list).toHaveBeenCalledTimes(2);
  });
  it("une demande qui n’existe pas ou ne concerne pas le compte", async () => {
    vi.spyOn(service, "listAppointments").mockResolvedValue([]);
    vi.spyOn(service, "loadProfessionalMessages").mockResolvedValue([]);
    render(<AppointmentChat client={client} me="other" id={item.id} />);
    expect(await screen.findByText("Conversation indisponible")).toBeTruthy();
  });
  it("envoi en cours : pas de doublon, même identifiant après un échec", async () => {
    vi.spyOn(service, "listAppointments").mockResolvedValue([item]);
    vi.spyOn(service, "loadProfessionalMessages").mockResolvedValue([]);
    let resolve!: (m: ProMessage) => void;
    const sendSpy = vi.spyOn(service, "sendProfessionalMessage")
      .mockRejectedValueOnce(new Error("coupure"))
      .mockImplementationOnce(() => new Promise((r) => { resolve = r; }));
    render(<AppointmentChat client={client} me="owner" id={item.id} />);
    const box = await screen.findByLabelText("Ton message");
    fireEvent.change(box, { target: { value: "Faut-il venir à jeun ?" } });
    fireEvent.click(screen.getByRole("button", { name: /Envoyer/ }));
    expect(await screen.findByText(/Envoi non confirmé/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Envoyer/ }));
    fireEvent.click(screen.getByRole("button", { name: /Envoyer/ }));
    await waitFor(() => expect(sendSpy).toHaveBeenCalledTimes(2));
    expect(sendSpy.mock.calls[0]![3]).toBe(sendSpy.mock.calls[1]![3]);
    resolve(msg(3, "owner", "Faut-il venir à jeun ?"));
    await screen.findByText("Faut-il venir à jeun ?");
    expect((screen.getByLabelText("Ton message") as HTMLTextAreaElement).value).toBe("");
  });
  it("après annulation : historique conservé, plus d’envoi possible", async () => {
    vi.spyOn(service, "listAppointments").mockResolvedValue([{ ...item, status: "cancelled", cancelled_by: "owner" }]);
    vi.spyOn(service, "loadProfessionalMessages").mockResolvedValue([msg(1, "pro", "À bientôt.")]);
    render(<AppointmentChat client={client} me="owner" id={item.id} />);
    await screen.findByText("À bientôt.");
    expect(screen.queryByLabelText("Ton message")).toBeNull();
    expect(screen.getByText(/l’historique reste consultable/, { selector: ".fx-note, .fx-note *" })).toBeTruthy();
  });
  it("un refus du serveur (limite, demande close) est expliqué tel quel", async () => {
    vi.spyOn(service, "listAppointments").mockResolvedValue([item]);
    vi.spyOn(service, "loadProfessionalMessages").mockResolvedValue([]);
    vi.spyOn(service, "sendProfessionalMessage").mockRejectedValue(new AppError("rate_limited", "Trop de messages, réessaie dans quelques minutes"));
    render(<AppointmentChat client={client} me="owner" id={item.id} />);
    fireEvent.change(await screen.findByLabelText("Ton message"), { target: { value: "Bonjour" } });
    fireEvent.click(screen.getByRole("button", { name: /Envoyer/ }));
    expect(await screen.findByText("Trop de messages, réessaie dans quelques minutes")).toBeTruthy();
  });
});

describe("accès à la conversation", () => {
  it("la demande propose d’écrire à l’établissement", async () => {
    vi.spyOn(service, "listAppointments").mockResolvedValue([item]);
    render(<AppointmentDetail client={client} id={item.id} />);
    const link = await screen.findByRole("link", { name: "Écrire à l’établissement" });
    expect(link.getAttribute("href")).toBe("#/services?vue=conversation&rendezvous=" + item.id);
  });
  it("la rubrique Messages liste les conversations de services", async () => {
    window.history.replaceState(null, "", "/#/messages");
    vi.spyOn(meetings, "listMyMatches").mockResolvedValue([]);
    vi.spyOn(sitting, "listSittingThreads").mockResolvedValue([]);
    vi.spyOn(service, "listProfessionalThreads").mockResolvedValue([{ appointment_id: item.id, role: "owner", other_name: "Cabinet des Oyats",
      service_name: "Consultation", status: "pending", starts_at: item.starts_at, last_text: "On prendra le temps.", last_at: item.created_at, last_sender: "pro" }]);
    render(<MessagesArea client={client} ownerId="owner" />);
    const row = await screen.findByRole("link", { name: /Cabinet des Oyats/ });
    expect(row.getAttribute("href")).toBe("#/services?vue=conversation&rendezvous=" + item.id + "&depuis=messages");
    expect(screen.getByText("Services")).toBeTruthy();
  });
  it("une erreur des conversations de services n’efface pas les autres", async () => {
    window.history.replaceState(null, "", "/#/messages");
    vi.spyOn(meetings, "listMyMatches").mockResolvedValue([]);
    vi.spyOn(sitting, "listSittingThreads").mockResolvedValue([]);
    vi.spyOn(service, "listProfessionalThreads").mockRejectedValue(new Error("panne"));
    render(<MessagesArea client={client} ownerId="owner" />);
    expect(await screen.findByText(/Les conversations de services n’ont pas pu être actualisées/)).toBeTruthy();
    expect(screen.queryByText("Pas encore de conversation")).toBeNull();
  });
  it("la notification d’un message ouvre la conversation", () => {
    const n = { target_type: "appointment", target_id: item.id, context_id: null };
    expect(notificationHref({ ...n, kind: "appointment_message" })).toBe("#/services?vue=conversation&rendezvous=" + item.id);
    expect(notificationHref({ ...n, kind: "appointment_confirmed" })).toBe("#/services?vue=rendez-vous&rendezvous=" + item.id);
  });
});
