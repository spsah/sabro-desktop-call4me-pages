import { captureMicrophone } from "./audio-devices";
import { formatVertoDestination, normalizeDialDestination } from "./dial";

export const VERTO_URL = "wss://c4mwss.siptrunk.ai/verto";
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type CallEvidence = {
  schema: "sabro.call.evidence.v1";
  event: "invite" | "answered" | "ended" | "failed";
  opportunityId: string;
  call_id: string;
  fs_uuid?: string;
  occurredAt: string;
  cause?: string;
};

type Rpc = {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params: Record<string, unknown>;
};
type Message = {
  id?: number;
  method?: string;
  result?: Record<string, unknown>;
  error?: { message?: string };
  params?: Record<string, unknown>;
};

function rpc(id: number, method: string, params: Record<string, unknown>): Rpc {
  return { jsonrpc: "2.0", id, method, params };
}

export function isOpportunityId(value: string): boolean {
  return UUID.test(value.trim());
}

export function createUuid(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));
  return [
    hex.slice(0, 4).join(""),
    hex.slice(4, 6).join(""),
    hex.slice(6, 8).join(""),
    hex.slice(8, 10).join(""),
    hex.slice(10, 16).join(""),
  ].join("-");
}

export function getCallAudio(
  mediaDevices:
    | Pick<MediaDevices, "getUserMedia">
    | null
    | undefined = navigator.mediaDevices,
  deviceId?: string | null,
): Promise<MediaStream> {
  if (!mediaDevices?.getUserMedia) {
    throw new Error("Calling needs a secure (HTTPS) page.");
  }
  return captureMicrophone(
    (constraints) => mediaDevices.getUserMedia(constraints),
    deviceId,
  );
}

export function buildVertoInvite(input: {
  id: number;
  sessid: string;
  callID: string;
  destination: string;
  sdp: string;
  opportunityId?: string;
}): Rpc {
  if (input.opportunityId && !isOpportunityId(input.opportunityId)) {
    throw new Error("A valid Opportunity UUID is required before dialing.");
  }
  return rpc(input.id, "verto.invite", {
    sdp: input.sdp,
    dialogParams: {
      callID: input.callID,
      destination_number: input.destination,
      caller_id_name: "SABRO Call4Me",
      remote_caller_id_name: "Outbound Call",
      remote_caller_id_number: input.destination,
      useVideo: false,
      useStereo: false,
      screenShare: false,
      tag: input.callID,
      ...(input.opportunityId ? { opportunityId: input.opportunityId } : {}),
    },
    sessid: input.sessid,
  });
}

export function buildVertoBye(input: {
  id: number;
  sessid: string;
  callID: string;
}): Rpc {
  return rpc(input.id, "verto.bye", {
    dialogParams: { callID: input.callID },
    cause: "NORMAL_CLEARING",
    sessid: input.sessid,
  });
}

function callIdFrom(message: Message): string {
  const params = message.params ?? {};
  const dialog = (params.dialogParams ?? {}) as Record<string, unknown>;
  return String(params.callID ?? dialog.callID ?? "");
}

function fsUuidFrom(message: Message): string | undefined {
  const params = message.params ?? {};
  const dialog = (params.dialogParams ?? {}) as Record<string, unknown>;
  for (const value of [
    params.fs_uuid,
    params.uuid,
    dialog.fs_uuid,
    dialog.uuid,
  ]) {
    if (typeof value === "string" && UUID.test(value)) return value;
  }
  return undefined;
}

export class VertoClient {
  private socket: WebSocket | null = null;
  private peer: RTCPeerConnection | null = null;
  private stream: MediaStream | null = null;
  private seq = 1;
  private sessid = createUuid();
  private activeCallId: string | null = null;
  private activeOpportunityId: string | null = null;
  private fsUuid: string | undefined;
  private inviteTimer: number | null = null;

  constructor(
    private readonly onEvidence: (event: CallEvidence) => void,
    private readonly onRemoteStream: (stream: MediaStream) => void,
    private readonly onEnded: (cause: string) => void,
    private readonly selectedInputDeviceId?: () => string | null,
  ) {}

  async connect(accessToken: string): Promise<void> {
    this.close();
    if (!accessToken) throw new Error("Calling is unavailable.");
    const brokerUrl = import.meta.env.VITE_CALL_BROKER_URL ?? "";
    if (!brokerUrl) throw new Error("Calling is unavailable.");
    this.sessid = createUuid();
    const sessionResponse = await fetch(brokerUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ sessionId: this.sessid }),
    });
    if (!sessionResponse.ok) throw new Error("Calling is unavailable.");
    const session = (await sessionResponse.json()) as { websocketUrl?: string };
    if (!session.websocketUrl?.startsWith("wss://"))
      throw new Error("Calling is unavailable.");
    const socket = new WebSocket(session.websocketUrl);
    this.socket = socket;

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      let timeout = 0;
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeout);
        if (error) {
          socket.close();
          reject(error);
        } else {
          resolve();
        }
      };
      timeout = window.setTimeout(
        () => finish(new Error("Calling isn’t available — try again.")),
        10_000,
      );
      socket.addEventListener("message", (event) => {
        const message = this.parse(event.data);
        if (!message) return;
        if (message.error)
          finish(new Error("Calling isn’t available — try again."));
        if (message.result?.message === "logged in") finish();
      });
      socket.addEventListener(
        "error",
        () => finish(new Error("Calling isn’t available — try again.")),
        { once: true },
      );
      socket.addEventListener("close", () => {
        if (this.activeCallId) this.finishRemote("SIGNALING_CLOSED");
      });
      socket.addEventListener("message", (event) =>
        this.handleMessage(event.data),
      );
    });
  }

  async dial(destination: string, opportunityId?: string): Promise<string> {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN)
      throw new Error("Calling isn’t available — try again.");
    if (opportunityId && !isOpportunityId(opportunityId))
      throw new Error("Add a valid Deal ID before calling.");
    const e164 = normalizeDialDestination(destination);
    const digits = formatVertoDestination(e164);
    if (digits.replace(/\D/g, "").length < 3)
      throw new Error("Enter a valid number or extension.");
    if (this.activeCallId)
      throw new Error("End the active call before dialing again.");

    this.stream = await getCallAudio(
      navigator.mediaDevices,
      this.selectedInputDeviceId?.() ?? null,
    );
    const peer = new RTCPeerConnection();
    this.peer = peer;
    peer.ontrack = (event) => {
      const stream = event.streams[0];
      if (stream) this.onRemoteStream(stream);
    };
    for (const track of this.stream.getAudioTracks())
      peer.addTrack(track, this.stream);
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    await this.waitForIce(peer);
    const sdp = peer.localDescription?.sdp;
    if (!sdp) throw new Error("The browser could not prepare call audio.");

    const callID = createUuid();
    this.activeCallId = callID;
    this.activeOpportunityId = opportunityId ?? null;
    this.socket.send(
      JSON.stringify(
        buildVertoInvite({
          id: this.seq++,
          sessid: this.sessid,
          callID,
          destination: digits,
          sdp,
          opportunityId,
        }),
      ),
    );
    this.emit("invite");
    this.inviteTimer = window.setTimeout(() => {
      if (!this.activeCallId) return;
      this.emit("failed", "INVITE_TIMEOUT");
      this.resetCall();
      this.onEnded("INVITE_TIMEOUT");
    }, 20_000);
    return callID;
  }

  async end(): Promise<void> {
    if (!this.activeCallId || !this.socket) return;
    this.socket.send(
      JSON.stringify(
        buildVertoBye({
          id: this.seq++,
          sessid: this.sessid,
          callID: this.activeCallId,
        }),
      ),
    );
    this.emit("ended", "NORMAL_CLEARING");
    this.resetCall();
  }

  close(): void {
    this.resetCall();
    this.socket?.close();
    this.socket = null;
  }

  private handleMessage(raw: unknown): void {
    const message = this.parse(raw);
    if (!message) return;
    const callID = callIdFrom(message);
    if (callID && callID !== this.activeCallId) return;
    this.fsUuid = fsUuidFrom(message) ?? this.fsUuid;
    if (
      (message.method === "verto.answer" || message.method === "verto.media") &&
      message.params?.sdp
    ) {
      void this.applyAnswer(String(message.params.sdp));
    } else if (message.method === "verto.bye") {
      this.finishRemote(String(message.params?.cause ?? "NORMAL_CLEARING"));
    } else if (message.error && this.activeCallId) {
      this.emit("failed", message.error.message ?? "VERTO_ERROR");
      this.finishRemote(message.error.message ?? "VERTO_ERROR");
    }
  }

  private async applyAnswer(sdp: string): Promise<void> {
    if (!this.peer || this.peer.remoteDescription) return;
    if (this.inviteTimer !== null) window.clearTimeout(this.inviteTimer);
    this.inviteTimer = null;
    await this.peer.setRemoteDescription({ type: "answer", sdp });
    this.emit("answered");
  }

  private finishRemote(cause: string): void {
    if (!this.activeCallId) return;
    this.emit("ended", cause);
    this.resetCall();
    this.onEnded(cause);
  }

  private emit(event: CallEvidence["event"], cause?: string): void {
    if (!this.activeCallId || !this.activeOpportunityId) return;
    this.onEvidence({
      schema: "sabro.call.evidence.v1",
      event,
      opportunityId: this.activeOpportunityId,
      call_id: this.activeCallId,
      ...(this.fsUuid ? { fs_uuid: this.fsUuid } : {}),
      occurredAt: new Date().toISOString(),
      ...(cause ? { cause } : {}),
    });
  }

  private resetCall(): void {
    if (this.inviteTimer !== null) window.clearTimeout(this.inviteTimer);
    this.inviteTimer = null;
    this.peer?.close();
    this.peer = null;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.activeCallId = null;
    this.activeOpportunityId = null;
    this.fsUuid = undefined;
  }

  private parse(raw: unknown): Message | null {
    try {
      return JSON.parse(String(raw)) as Message;
    } catch {
      return null;
    }
  }

  private async waitForIce(peer: RTCPeerConnection): Promise<void> {
    if (peer.iceGatheringState === "complete") return;
    await new Promise<void>((resolve) => {
      const timeout = window.setTimeout(resolve, 3_000);
      peer.addEventListener("icegatheringstatechange", () => {
        if (peer.iceGatheringState === "complete") {
          window.clearTimeout(timeout);
          resolve();
        }
      });
    });
  }
}
