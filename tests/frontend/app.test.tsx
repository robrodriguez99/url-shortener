// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "../../frontend/src/App.js";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("frontend App", () => {
  it("creates a short URL and displays the result", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          code: "example",
          originalUrl: "https://example.com",
          shortUrl: "http://localhost:3000/example",
        }),
        {
          status: 201,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );
    const user = userEvent.setup();

    render(<App />);
    await user.type(
      screen.getByLabelText("URL de destino"),
      "https://example.com",
    );
    await user.type(screen.getByLabelText(/Alias/), "example");
    await user.click(
      screen.getByRole("button", { name: "Generar URL" }),
    );

    expect(
      await screen.findByRole("link", {
        name: "http://localhost:3000/example",
      }),
    ).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      "/api/urls",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          originalUrl: "https://example.com",
          alias: "example",
        }),
      }),
    );
  });

  it("opens a valid code in another tab", async () => {
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    const user = userEvent.setup();

    render(<App />);
    await user.type(screen.getByLabelText("Código para abrir"), "example");
    await user.click(screen.getByRole("button", { name: "Abrir" }));

    expect(open).toHaveBeenCalledWith(
      "http://localhost:3000/example",
      "_blank",
      "noopener,noreferrer",
    );
  });

  it("loads and displays URL statistics", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          code: "example",
          totalClicks: 3,
          lastClick: null,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    render(<App />);
    fireEvent.change(screen.getByLabelText("Código para estadísticas"), {
      target: { value: "example" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Ver" }));

    await waitFor(() => {
      expect(screen.getByText("3")).toBeInTheDocument();
      expect(screen.getByText("Sin accesos")).toBeInTheDocument();
    });
    expect(fetch).toHaveBeenCalledWith(
      "/api/stats/example",
      undefined,
    );
  });
});
