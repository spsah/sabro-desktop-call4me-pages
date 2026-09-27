import { formatVertoDestination } from "./dial";
import {
  buildVertoBye,
  buildVertoInvite,
  createUuid,
  getCallAudio,
  isOpportunityId,
  VERTO_URL,
} from "./verto";

const opportunityId = "22222222-2222-4222-8222-222222222222";

describe("Verto browser wire contract", () => {
  it("explains that browser calling requires a secure page", () => {
    expect(() => getCallAudio(null)).toThrow(
      "Calling needs a secure (HTTPS) page.",
    );
  });

  it("asks the selected microphone when a device id is provided", async () => {
    const getUserMedia = vi
      .fn()
      .mockResolvedValue({ getAudioTracks: () => [] });
    await getCallAudio({ getUserMedia }, "mic-1");
    expect(getUserMedia).toHaveBeenCalledWith({
      audio: { deviceId: { exact: "mic-1" } },
      video: false,
    });
  });

  it("creates RFC4122 v4 IDs when randomUUID is unavailable on HTTP", () => {
    const originalCrypto = globalThis.crypto;
    vi.stubGlobal("crypto", {
      getRandomValues: (bytes: Uint8Array) => {
        bytes.fill(0);
        return bytes;
      },
    });

    expect(createUuid()).toBe("00000000-0000-4000-8000-000000000000");
    vi.stubGlobal("crypto", originalCrypto);
  });

  it("pins the authorized public WSS endpoint", () => {
    expect(VERTO_URL).toBe("wss://c4mwss.siptrunk.ai/verto");
  });

  it("binds the Opportunity UUID before invite", () => {
    const invite = buildVertoInvite({
      id: 2,
      sessid: "session",
      callID: "33333333-3333-4333-8333-333333333333",
      destination: "07747448677",
      sdp: "v=0",
      opportunityId,
    });
    expect(invite.method).toBe("verto.invite");
    expect(invite.params.dialogParams).toMatchObject({
      opportunityId,
      destination_number: "07747448677",
    });
    expect(
      String(
        (invite.params.dialogParams as { destination_number: string })
          .destination_number,
      ),
    ).not.toContain("+");
  });

  it("converts keypad +E.164 to FS national digits so invite is not dead", () => {
    const invite = buildVertoInvite({
      id: 2,
      sessid: "session",
      callID: "33333333-3333-4333-8333-333333333333",
      destination: formatVertoDestination("+447747448677"),
      sdp: "v=0",
      opportunityId,
    });
    expect(invite.params.dialogParams).toMatchObject({
      destination_number: "07747448677",
    });
    expect(formatVertoDestination("07747448677")).toBe("07747448677");
    expect(formatVertoDestination("+447747448677")).not.toBe("+447747448677");
  });

  it("refuses to build an invite without a valid Opportunity UUID", () => {
    expect(() =>
      buildVertoInvite({
        id: 2,
        sessid: "session",
        callID: "call",
        destination: "1000",
        sdp: "v=0",
        opportunityId: "not-an-opportunity",
      }),
    ).toThrow(/Opportunity UUID/);
    expect(isOpportunityId("not-an-opportunity")).toBe(false);
  });

  it("allows an SDK call without an Opportunity binding", () => {
    const invite = buildVertoInvite({
      id: 2,
      sessid: "session",
      callID: "33333333-3333-4333-8333-333333333333",
      destination: "07747448677",
      sdp: "v=0",
    });

    expect(invite.params.dialogParams).not.toHaveProperty("opportunityId");
  });

  it("ends WebRTC with verto.bye and never DTMF", () => {
    const bye = buildVertoBye({ id: 3, sessid: "session", callID: "call-id" });
    expect(bye.method).toBe("verto.bye");
    expect(JSON.stringify(bye)).not.toContain('"*"');
    expect(bye.params).toMatchObject({ cause: "NORMAL_CLEARING" });
  });

  it("never puts an upstream login or password in browser invite messages", () => {
    const invite = buildVertoInvite({
      id: 2,
      sessid: "session",
      callID: "33333333-3333-4333-8333-333333333333",
      destination: "07507668958",
      sdp: "v=0",
      opportunityId,
    });
    expect(JSON.stringify(invite)).not.toMatch(/login|passwd|password/i);
  });
});
