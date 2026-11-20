import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import FirstSteps from "./FirstSteps";
import type { PetRow } from "../../types/database";
afterEach(() => {
  cleanup();
  localStorage.clear();
});
it("guide vers le premier animal et laisse proposer une activité sans en posséder", () => {
  render(
    <FirstSteps owner="a" profile={{ name: null, city: null }} pets={[]} />,
  );
  expect(
    screen
      .getByRole("link", { name: "Continuer : présenter mon animal" })
      .getAttribute("href"),
  ).toBe("#/animaux?nouveau=1");
  expect(
    screen
      .getByRole("link", { name: "Proposer une garde" })
      .getAttribute("href"),
  ).toBe("#/garde?vue=profil");
  expect(
    screen.getByRole("link", { name: "Proposer mes services" }),
  ).toBeTruthy();
});
it("disparaît lorsque le compte, un profil animal et un portrait sont prêts", () => {
  render(
    <FirstSteps
      owner="a"
      profile={{ name: "Alex", city: "Lille" }}
      pets={[{ id: "p", photos: ["private/path"] } as PetRow]}
    />,
  );
  expect(screen.queryByText("Tes premiers pas")).toBeNull();
});
it("permet de masquer le guide pour ce compte sans le masquer à un autre", () => {
  const view = render(
    <FirstSteps owner="a" profile={{ name: null, city: null }} pets={[]} />,
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Masquer ce guide sur cet appareil" }),
  );
  expect(screen.queryByText("Tes premiers pas")).toBeNull();
  view.rerender(
    <FirstSteps owner="b" profile={{ name: null, city: null }} pets={[]} />,
  );
  expect(screen.getByText("Tes premiers pas")).toBeTruthy();
  expect(localStorage.getItem("furrix:first-steps:v1:a")).toBe("1");
  expect(localStorage.getItem("furrix:first-steps:v1:b")).toBeNull();
});
