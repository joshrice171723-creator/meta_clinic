import { useCallback, useEffect, useRef, useState } from "react";
import type { TelehealthDeviceResults } from "./types";

export function useTelehealthDevices() {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [speakerConfirmed, setSpeakerConfirmed] = useState(false);
  const [running, setRunning] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const generationRef = useRef(0);
  const meterRef = useRef<{ context: AudioContext; frame: number } | null>(
    null,
  );

  const stop = useCallback(() => {
    generationRef.current += 1;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setStream(null);
    if (meterRef.current) {
      cancelAnimationFrame(meterRef.current.frame);
      void meterRef.current.context.close();
      meterRef.current = null;
    }
    setLevel(0);
    setRunning(false);
    setRequesting(false);
  }, []);

  const refresh = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    setDevices(await navigator.mediaDevices.enumerateDevices());
  }, []);

  const enable = useCallback(
    async (
      audioDeviceId?: string,
      videoDeviceId?: string,
      includeVideo = true,
    ) => {
      stop();
      const generation = generationRef.current;
      setRequesting(true);
      setError(null);
      setSpeakerConfirmed(false);
      try {
        if (!navigator.mediaDevices?.getUserMedia)
          throw new Error(
            "This browser does not support camera and microphone access.",
          );
        const next = await navigator.mediaDevices.getUserMedia({
          audio: audioDeviceId ? { deviceId: { exact: audioDeviceId } } : true,
          video: includeVideo
            ? videoDeviceId
              ? { deviceId: { exact: videoDeviceId } }
              : true
            : false,
        });
        if (generation !== generationRef.current) {
          next.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = next;
        setStream(next);
        setRunning(true);
        await refresh();
        if (generation !== generationRef.current) return;
        const context = new AudioContext();
        const analyser = context.createAnalyser();
        analyser.fftSize = 256;
        context.createMediaStreamSource(next).connect(analyser);
        const samples = new Uint8Array(analyser.frequencyBinCount);
        const draw = () => {
          analyser.getByteFrequencyData(samples);
          const peak = samples.reduce(
            (highest, value) => Math.max(highest, value),
            0,
          );
          setLevel(Math.round((peak / 255) * 100));
          if (meterRef.current)
            meterRef.current.frame = requestAnimationFrame(draw);
        };
        meterRef.current = { context, frame: requestAnimationFrame(draw) };
      } catch (reason) {
        if (generation !== generationRef.current) return;
        stop();
        const denied =
          reason instanceof DOMException && reason.name === "NotAllowedError";
        setError(
          denied
            ? "Camera or microphone permission was denied. Allow access in your browser, then try again."
            : reason instanceof Error
              ? reason.message
              : "The camera and microphone could not be checked.",
        );
        throw reason;
      } finally {
        if (generation === generationRef.current) setRequesting(false);
      }
    },
    [refresh, stop],
  );

  const playSpeakerTest = useCallback(async (outputDeviceId?: string) => {
    setError(null);
    try {
      const context = new AudioContext();
      const routedContext = context as AudioContext & {
        setSinkId?: (sinkId: string) => Promise<void>;
      };
      if (outputDeviceId && routedContext.setSinkId)
        await routedContext.setSinkId(outputDeviceId);
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      gain.gain.value = 0.08;
      oscillator.frequency.value = 440;
      oscillator.connect(gain).connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.45);
      await new Promise<void>((resolve) => {
        oscillator.addEventListener("ended", () => resolve(), { once: true });
      });
      await context.close();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "The test sound could not play.",
      );
      throw reason;
    }
  }, []);

  useEffect(() => {
    void refresh();
    navigator.mediaDevices?.addEventListener?.("devicechange", refresh);
    return () => {
      navigator.mediaDevices?.removeEventListener?.("devicechange", refresh);
      stop();
    };
  }, [refresh, stop]);

  const result: TelehealthDeviceResults = {
    camera: stream
      ?.getVideoTracks()
      .some((track) => track.readyState === "live")
      ? "passed"
      : error
        ? "failed"
        : "not_checked",
    microphone: stream
      ?.getAudioTracks()
      .some((track) => track.readyState === "live")
      ? "passed"
      : error
        ? "failed"
        : "not_checked",
    speaker: speakerConfirmed ? "passed" : "not_checked",
    browser:
      typeof navigator.mediaDevices?.getUserMedia === "function"
        ? "supported"
        : "unsupported",
    audio_only_requested: false,
    checked_at: new Date().toISOString(),
  };

  return {
    stream,
    devices,
    level,
    error,
    running,
    requesting,
    speakerConfirmed,
    setSpeakerConfirmed,
    enable,
    stop,
    playSpeakerTest,
    result,
  };
}
