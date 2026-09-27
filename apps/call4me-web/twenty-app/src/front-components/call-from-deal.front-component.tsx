import { useEffect, useState } from "react";
import { CALL_FROM_DEAL_FRONT_COMPONENT_UNIVERSAL_IDENTIFIER } from "src/constants/call-from-deal-front-component-universal-identifier";
import {
  buildCrmCall4MeUrl,
  CALL4ME_PANEL_KEYPAD,
  CALL4ME_WINDOW_NAME,
  CALL4ME_WINDOW_REL,
  fetchOpportunityDestination,
  handleOpenCallClick,
} from "src/open-call";
import { defineFrontComponent } from "twenty-sdk/define";
import { useRecordId } from "twenty-sdk/front-component";

const CallFromDeal = () => {
  const recordId = useRecordId();
  const [destination, setDestination] = useState("");

  useEffect(() => {
    if (!recordId) {
      setDestination("");
      return;
    }
    let cancelled = false;
    void fetchOpportunityDestination(recordId).then((phone) => {
      if (!cancelled) setDestination(phone ?? "");
    });
    return () => {
      cancelled = true;
    };
  }, [recordId]);

  if (!recordId) {
    return (
      <div
        style={{
          padding: 20,
          color: "#5f5f5a",
          fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
        }}
      >
        Open a deal to start a call.
      </div>
    );
  }

  const callUrl = buildCrmCall4MeUrl({
    opportunityId: recordId,
    destination,
  });

  return (
    <div
      style={{
        display: "grid",
        gap: 12,
        padding: 20,
        borderRadius: 12,
        background: "#f7f7f5",
        color: "#1c1c1c",
        fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
      }}
    >
      <p style={{ margin: 0, color: "#25733d", fontSize: 13 }}>
        This call will be saved to this deal.
      </p>
      <p style={{ margin: 0, color: "#5f5f5a", fontSize: 13 }}>
        {destination
          ? `Opens the keypad with ${destination}.`
          : "Opens the keypad. Add a phone on the deal if you want it filled."}
      </p>
      <a
        href={callUrl}
        onClick={(event) => {
          handleOpenCallClick(event, {
            opportunityId: recordId,
            destination,
            panel: CALL4ME_PANEL_KEYPAD,
          });
        }}
        rel={CALL4ME_WINDOW_REL}
        style={{
          justifySelf: "start",
          display: "inline-block",
          boxSizing: "border-box",
          minHeight: 44,
          padding: "11px 16px",
          border: 0,
          borderRadius: 8,
          background: "#4a38f5",
          color: "#fff",
          fontSize: 14,
          fontWeight: 650,
          lineHeight: "22px",
          textDecoration: "none",
          cursor: "pointer",
        }}
        target={CALL4ME_WINDOW_NAME}
      >
        Open Call
      </a>
    </div>
  );
};

export default defineFrontComponent({
  universalIdentifier: CALL_FROM_DEAL_FRONT_COMPONENT_UNIVERSAL_IDENTIFIER,
  name: "call-from-deal",
  description: "Call a customer from the open deal.",
  component: CallFromDeal,
});
