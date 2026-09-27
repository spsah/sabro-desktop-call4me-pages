import { waitFor } from "@testing-library/react";
import { mount } from "./sdk";

describe("Call4Me SDK", () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it("mounts the Identity-only dialer into an isolated widget", async () => {
    document.body.innerHTML = '<div id="call4me"></div>';

    const widget = mount("#call4me", {
      opportunityId: "22222222-2222-4222-8222-222222222222",
      theme: "sabro",
    });
    const host = document.querySelector("[data-sabro-call4me]") as HTMLElement;

    await waitFor(() => {
      expect(host.shadowRoot).toHaveTextContent("Sign in to call");
    });
    expect(host.dataset.theme).toBe("sabro");
    expect(host.shadowRoot?.textContent).not.toMatch(/User|Password|Domain|Connect calling/i);

    widget.unmount();
    expect(document.querySelector("[data-sabro-call4me]")).toBeNull();
  });

  it("rejects a missing mount target", () => {
    expect(() => mount("#missing")).toThrow("mount target was not found");
  });

  it("applies validated tenant theme tokens", () => {
    vi.stubGlobal("CSS", { supports: () => true });
    document.body.innerHTML = '<div id="call4me"></div>';

    const widget = mount("#call4me", {
      theme: { accent: "#0055aa", background: "#f5f8ff" },
    });
    const host = document.querySelector("[data-sabro-call4me]") as HTMLElement;

    expect(host.dataset.theme).toBe("tenant");
    expect(host.style.getPropertyValue("--c4m-accent")).toBe("#0055aa");
    expect(host.style.getPropertyValue("--c4m-background")).toBe("#f5f8ff");
    widget.unmount();
    vi.unstubAllGlobals();
  });
});
