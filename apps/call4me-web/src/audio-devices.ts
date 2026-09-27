export type AudioDeviceKind = "audioinput" | "audiooutput";

export type AudioDeviceChoice = {
  deviceId: string;
  label: string;
  kind: AudioDeviceKind;
};

export type ListedMediaDevice = {
  deviceId: string;
  label?: string | null;
  kind: string;
};

export type MediaStreamFactory = (
  constraints: MediaStreamConstraints,
) => Promise<MediaStream>;

export function audioDeviceLabel(
  device: ListedMediaDevice,
  fallbackIndex = 0,
): string {
  const named = device.label?.trim();
  if (named) return named;
  if (device.kind === "audiooutput") {
    return fallbackIndex === 0 ? "Speaker" : `Speaker ${fallbackIndex + 1}`;
  }
  return fallbackIndex === 0 ? "Microphone" : `Microphone ${fallbackIndex + 1}`;
}

export function listAudioDevices(devices: ListedMediaDevice[]): {
  inputs: AudioDeviceChoice[];
  outputs: AudioDeviceChoice[];
} {
  const inputs: AudioDeviceChoice[] = [];
  const outputs: AudioDeviceChoice[] = [];
  for (const device of devices) {
    if (!device.deviceId) continue;
    if (device.kind === "audioinput") {
      inputs.push({
        deviceId: device.deviceId,
        label: audioDeviceLabel(device, inputs.length),
        kind: "audioinput",
      });
    } else if (device.kind === "audiooutput") {
      outputs.push({
        deviceId: device.deviceId,
        label: audioDeviceLabel(device, outputs.length),
        kind: "audiooutput",
      });
    }
  }
  return { inputs, outputs };
}

export function resolveAudioDevice(
  devices: AudioDeviceChoice[],
  preferredId?: string | null,
): AudioDeviceChoice | null {
  if (devices.length === 0) return null;
  return (
    devices.find((device) => device.deviceId === preferredId) ??
    devices[0] ??
    null
  );
}

export async function captureMicrophone(
  getUserMedia: MediaStreamFactory,
  deviceId?: string | null,
): Promise<MediaStream> {
  return getUserMedia({
    audio: deviceId ? { deviceId: { exact: deviceId } } : true,
    video: false,
  });
}

export async function applyOutputDevice(
  element: { setSinkId?: (sinkId: string) => Promise<void> },
  deviceId?: string | null,
): Promise<boolean> {
  if (!deviceId || typeof element.setSinkId !== "function") return false;
  await element.setSinkId(deviceId);
  return true;
}

export async function replaceMicrophone(
  previous: MediaStream | null,
  getUserMedia: MediaStreamFactory,
  deviceId?: string | null,
): Promise<MediaStream> {
  previous?.getTracks().forEach((track) => {
    track.stop();
  });
  return captureMicrophone(getUserMedia, deviceId);
}
