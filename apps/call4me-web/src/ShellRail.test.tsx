import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SHELL_RAIL_LABEL } from "./crm-nav";
import { ShellRail } from "./ShellRail";

describe("ShellRail", () => {
  it("shows Chat only for Rahul and keeps Call/CRM off the rail", () => {
    render(
      <ShellRail
        activeView="chat"
        email="rahul@example.test"
        onSignOut={vi.fn()}
        onSwitchView={vi.fn()}
        showCall4Me={false}
        showCrm={false}
      />,
    );

    expect(screen.getByLabelText(SHELL_RAIL_LABEL)).toHaveClass("shell-rail");
    expect(screen.getByRole("button", { name: "Chat" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.queryByRole("button", { name: "Call" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Call4Me" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Contacts" })).toBeNull();
    expect(screen.queryByRole("button", { name: "CRM" })).toBeNull();
    expect(screen.queryByRole("tab")).toBeNull();
  });

  it("shows Chat, Call, and CRM for founder/Harish", () => {
    const onSwitchView = vi.fn();
    render(
      <ShellRail
        activeView="call4me"
        email="sabro@shambhu.net"
        onSignOut={vi.fn()}
        onSwitchView={onSwitchView}
        showCall4Me
        showCrm
      />,
    );

    expect(screen.getByRole("button", { name: "Chat" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Call" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("button", { name: "CRM" })).toBeInTheDocument();
    screen.getByRole("button", { name: "CRM" }).click();
    expect(onSwitchView).toHaveBeenCalledWith("crm");
  });
});
