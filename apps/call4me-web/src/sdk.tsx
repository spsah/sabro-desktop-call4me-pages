import React from "react";
import { createRoot, type Root } from "react-dom/client";
import App from "./App";
import styles from "./styles.css?inline";

export type Call4MeTheme =
  | "sabro"
  | {
      accent?: string;
      background?: string;
      surface?: string;
      text?: string;
    };

export type Call4MePanel =
  | "todays-calls"
  | "active-deals"
  | "contacts"
  | "keypad"
  | "phonebook"
  | "extensions"
  | "activities";

export type Call4MeMountOptions = {
  opportunityId?: string;
  theme?: Call4MeTheme;
  /** Tenant-shell IA panel; when set with tenantShell, App hides its own subnav. */
  panel?: Call4MePanel;
  /** Mounted under Amplify Call4MeSurface — shell owns Today's calls / Active deals / Contacts. */
  tenantShell?: boolean;
  /** Tenant flag number_mask_last4; MMPL default ON. */
  numberMaskLast4?: boolean;
  /** Path-MT client id for empty-safe tenant-deals fetch. */
  clientId?: string;
  /** Identity bearer for tenant-deals (same session as shell). */
  accessToken?: string;
};

export type Call4MeMount = {
  unmount(): void;
};

type MountedWidget = {
  root: Root;
  wrapper: HTMLDivElement;
};

const mountedWidgets = new WeakMap<Element, MountedWidget>();

function resolveTarget(target: string | Element): Element {
  const element = typeof target === "string" ? document.querySelector(target) : target;
  if (!element) throw new Error("Call4Me mount target was not found.");
  return element;
}

function applyTheme(element: HTMLElement, theme: Call4MeTheme): void {
  element.dataset.theme = typeof theme === "string" ? theme : "tenant";
  if (typeof theme === "string") return;
  const tokens = {
    "--c4m-accent": theme.accent,
    "--c4m-background": theme.background,
    "--c4m-surface": theme.surface,
    "--c4m-text": theme.text,
  };
  for (const [name, value] of Object.entries(tokens)) {
    if (value && CSS.supports("color", value)) element.style.setProperty(name, value);
  }
}

export function mount(
  target: string | Element,
  options: Call4MeMountOptions = {},
): Call4MeMount {
  const host = resolveTarget(target);
  mountedWidgets.get(host)?.root.unmount();
  mountedWidgets.get(host)?.wrapper.remove();

  const wrapper = document.createElement("div");
  wrapper.setAttribute("data-sabro-call4me", "");
  const shadow = wrapper.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = `:host{display:block;color:var(--c4m-text,#1c1c1c);font-family:Inter,ui-sans-serif,system-ui,sans-serif}${styles}`;
  const container = document.createElement("div");
  shadow.append(style, container);
  host.append(wrapper);
  applyTheme(wrapper, options.theme ?? "sabro");

  const root = createRoot(container);
  root.render(
    <App
      allowUnboundOpportunity
      embedded
      opportunityId={options.opportunityId}
      panel={options.panel}
      tenantShell={options.tenantShell}
      numberMaskLast4={options.numberMaskLast4}
      clientId={options.clientId}
      accessToken={options.accessToken}
    />,
  );
  mountedWidgets.set(host, { root, wrapper });

  return {
    unmount() {
      const current = mountedWidgets.get(host);
      if (current?.root !== root) return;
      root.unmount();
      wrapper.remove();
      mountedWidgets.delete(host);
    },
  };
}

export const Call4Me = { mount };

const globalWindow = window as Window & {
  SABRO?: Record<string, unknown>;
};
globalWindow.SABRO = {
  ...(globalWindow.SABRO ?? {}),
  Call4Me,
};
