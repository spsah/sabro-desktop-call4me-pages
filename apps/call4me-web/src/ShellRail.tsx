import { SHELL_RAIL_LABEL, type ShellView } from "./crm-nav";

export type ShellRailProps = {
  activeView: ShellView;
  email: string;
  onSignOut: () => void;
  onSwitchView: (view: ShellView) => void;
  showCall4Me: boolean;
  showCrm: boolean;
};

function railItemClass(active: boolean): string {
  return active ? "shell-rail-item active" : "shell-rail-item";
}

export function ShellRail(props: ShellRailProps): React.ReactElement {
  return (
    <aside aria-label={SHELL_RAIL_LABEL} className="shell-rail" id="shell-rail">
      <nav aria-label="Shell" className="shell-rail-nav">
        <button
          aria-current={props.activeView === "chat" ? "page" : undefined}
          className={railItemClass(props.activeView === "chat")}
          onClick={() => props.onSwitchView("chat")}
          type="button"
        >
          Chat
        </button>
        {props.showCall4Me ? (
          <button
            aria-current={props.activeView === "call4me" ? "page" : undefined}
            className={railItemClass(props.activeView === "call4me")}
            onClick={() => props.onSwitchView("call4me")}
            type="button"
          >
            Call
          </button>
        ) : null}
        {props.showCrm ? (
          <button
            aria-current={props.activeView === "crm" ? "page" : undefined}
            className={railItemClass(props.activeView === "crm")}
            onClick={() => props.onSwitchView("crm")}
            type="button"
          >
            CRM
          </button>
        ) : null}
      </nav>
      <div className="shell-rail-identity">
        <span>{props.email}</span>
        <button className="text-button" onClick={props.onSignOut} type="button">
          Sign out
        </button>
      </div>
    </aside>
  );
}
