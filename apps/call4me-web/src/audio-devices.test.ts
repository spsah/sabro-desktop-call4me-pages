import { describe, expect, it, vi } from "vitest";
import {
  applyOutputDevice,
  audioDeviceLabel,
  captureMicrophone,
  listAudioDevices,
  replaceMicrophone,
  resolveAudioDevice,
} from "./audio-devices";

describe("Call4Me audio device selection (Desktop picker reuse)", () => {
  it("lists input and output devices and keeps a name when only one exists", () => {
    const listed = listAudioDevices([
      { deviceId: "mic-only", label: "Headset Microphone", kind: "audioinput" },
      { deviceId: "spk-only", label: "Headset Earphone", kind: "audiooutput" },
      { deviceId: "cam-1", label: "USB Camera", kind: "videoinput" },
    ]);
    expect(listed.inputs).toEqual([
      { deviceId: "mic-only", label: "Headset Microphone", kind: "audioinput" },
    ]);
    expect(listed.outputs).toEqual([
      { deviceId: "spk-only", label: "Headset Earphone", kind: "audiooutput" },
    ]);
    expect(resolveAudioDevice(listed.inputs, null)?.label).toBe(
      "Headset Microphone",
    );
    expect(resolveAudioDevice(listed.outputs, null)?.label).toBe(
      "Headset Earphone",
    );
  });

  it("keeps the preferred device and falls back to the first named device", () => {
    const devices = listAudioDevices([
      { deviceId: "mic-1", label: "Laptop Mic", kind: "audioinput" },
      { deviceId: "mic-2", label: "USB Mic", kind: "audioinput" },
      { deviceId: "", label: "ghost", kind: "audioinput" },
      { deviceId: "spk-1", label: "Laptop Speakers", kind: "audiooutput" },
      { deviceId: "spk-2", label: "HDMI Display", kind: "audiooutput" },
    ]);
    expect(resolveAudioDevice(devices.inputs, "mic-2")?.deviceId).toBe("mic-2");
    expect(resolveAudioDevice(devices.outputs, "missing")?.deviceId).toBe(
      "spk-1",
    );
    expect(resolveAudioDevice([], "mic-2")).toBeNull();
  });

  it("names unlabeled devices so a single picker still shows an active device", () => {
    expect(
      audioDeviceLabel(
        { deviceId: "mic-1", label: "  ", kind: "audioinput" },
        0,
      ),
    ).toBe("Microphone");
    expect(
      audioDeviceLabel(
        { deviceId: "spk-2", label: "", kind: "audiooutput" },
        1,
      ),
    ).toBe("Speaker 2");
  });

  it("routes remote playback to the selected speaker when setSinkId exists", async () => {
    const setSinkId = vi.fn().mockResolvedValue(undefined);
    await expect(applyOutputDevice({ setSinkId }, "spk-2")).resolves.toBe(true);
    expect(setSinkId).toHaveBeenCalledWith("spk-2");
    await expect(applyOutputDevice({}, "spk-2")).resolves.toBe(false);
  });

  it("stops the previous mic and captures the newly selected input", async () => {
    const previousTrack = { stop: vi.fn() };
    const nextTrack = { kind: "audio", readyState: "live" } as MediaStreamTrack;
    const previous = {
      getTracks: () => [previousTrack],
      getAudioTracks: () => [previousTrack],
    } as unknown as MediaStream;
    const next = {
      getTracks: () => [nextTrack],
      getAudioTracks: () => [nextTrack],
    } as unknown as MediaStream;
    const getUserMedia = vi.fn().mockResolvedValue(next);
    await expect(
      replaceMicrophone(previous, getUserMedia, "mic-2"),
    ).resolves.toBe(next);
    expect(previousTrack.stop).toHaveBeenCalledOnce();
    expect(getUserMedia).toHaveBeenCalledWith({
      audio: { deviceId: { exact: "mic-2" } },
      video: false,
    });
  });

  it("captures the selected microphone for two-way audio", async () => {
    const stream = { getAudioTracks: () => [{ readyState: "live" }] };
    const getUserMedia = vi.fn().mockResolvedValue(stream);
    await expect(captureMicrophone(getUserMedia, "mic-1")).resolves.toBe(
      stream,
    );
    expect(getUserMedia).toHaveBeenCalledWith({
      audio: { deviceId: { exact: "mic-1" } },
      video: false,
    });
  });
});
