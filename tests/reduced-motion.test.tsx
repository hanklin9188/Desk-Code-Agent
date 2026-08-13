import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { App } from "../apps/desktop/src/app/App";
import { resetMediaQueries, setMediaQueryMatches } from "./setup";

const reducedMotionQuery = "(prefers-reduced-motion: reduce)";

beforeEach(() => {
  window.localStorage.clear();
  resetMediaQueries();
});

afterEach(() => {
  cleanup();
  resetMediaQueries();
});

describe("live appearance preferences", () => {
  it("reacts to OS reduced-motion changes and allows an explicit local override", async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);
    const app = container.querySelector(".app");
    expect(app).not.toHaveClass("reduce-motion");

    act(() => setMediaQueryMatches(reducedMotionQuery, true));
    expect(app).toHaveClass("reduce-motion");

    await user.click(screen.getByRole("button", { name: "Settings" }));
    const reduceMotion = screen.getByRole("checkbox", { name: /Reduce motion/ });
    expect(reduceMotion).toBeChecked();
    expect(screen.getByText(/Current effective setting: Reduced/)).toBeInTheDocument();

    await user.click(reduceMotion);
    expect(app).not.toHaveClass("reduce-motion");
    expect(window.localStorage.getItem("dca.motion")).toBe("full");

    await user.click(screen.getByRole("button", { name: "Use system motion setting" }));
    expect(app).toHaveClass("reduce-motion");
    expect(window.localStorage.getItem("dca.motion")).toBeNull();
  });

  it("applies text size and theme choices immediately and stores them locally", async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);
    const app = container.querySelector(".app");

    await user.click(screen.getByRole("button", { name: "Settings" }));
    await user.selectOptions(screen.getByRole("combobox", { name: /^Text size/ }), "125");
    expect(app).toHaveStyle({ "--font-scale": "1.25" });
    expect(window.localStorage.getItem("dca.textScale")).toBe("125");

    await user.click(screen.getByRole("radio", { name: "Light" }));
    expect(app).toHaveAttribute("data-theme", "light");
    expect(window.localStorage.getItem("dca.theme")).toBe("light");
  });
});
