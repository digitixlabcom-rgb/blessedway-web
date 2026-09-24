import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, X } from "lucide-react";
import { recognizeProductLabel, type LabelOcrResult } from "../../services/OcrService";

interface LabelOcrCaptureProps {
  onResult: (result: LabelOcrResult) => void;
  onClose: () => void;
}

type Phase = "starting" | "live" | "processing" | "error";

// Errors that typically mean the camera hardware hasn't been released yet by
// a just-closed consumer (the barcode scanner behind this modal) rather than
// a real, permanent failure — worth one automatic retry after a short pause.
const TRANSIENT_ERROR_NAMES = new Set(["NotReadableError", "TrackStartError", "AbortError"]);

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Polls for real video dimensions instead of trusting play() resolving —
// play() can resolve before the browser has actually negotiated a frame
// size, which previously let a capture through against a 0x0/black frame.
async function waitForVideoDimensions(video: HTMLVideoElement, timeoutMs: number): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (video.videoWidth > 0 && video.videoHeight > 0) return true;
    await wait(100);
  }
  return video.videoWidth > 0 && video.videoHeight > 0;
}

export function LabelOcrCapture({ onResult, onClose }: LabelOcrCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const generationRef = useRef(0);
  const [phase, setPhase] = useState<Phase>("starting");
  const [error, setError] = useState<string | null>(null);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const startCamera = useCallback(async () => {
    const generation = ++generationRef.current;
    stopStream();
    setPhase("starting");
    setError(null);

    // Simple facingMode-only constraints — the previous forced 1280x1280
    // square resolution was too strict for this device's camera and caused
    // getUserMedia to fail outright ("Could not start video source").
    const constraints: MediaStreamConstraints = { video: { facingMode: { ideal: "environment" } } };

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch (err) {
      const name = err instanceof Error ? err.name : "";
      if (TRANSIENT_ERROR_NAMES.has(name)) {
        await wait(600);
        if (generation !== generationRef.current) return;
        try {
          stream = await navigator.mediaDevices.getUserMedia(constraints);
        } catch (retryErr) {
          if (generation !== generationRef.current) return;
          setPhase("error");
          setError(
            retryErr instanceof Error
              ? `Could not start the camera (${retryErr.message}). Close this and try again in a moment.`
              : "Could not start the camera."
          );
          return;
        }
      } else {
        if (generation !== generationRef.current) return;
        setPhase("error");
        setError(
          name === "NotAllowedError"
            ? "Camera permission was denied. Allow camera access for this site and try again."
            : err instanceof Error
            ? err.message
            : "Could not access the camera."
        );
        return;
      }
    }

    if (generation !== generationRef.current) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }

    streamRef.current = stream;
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = stream;

    try {
      await video.play();
    } catch (playErr) {
      if (generation !== generationRef.current) return;
      setPhase("error");
      setError(playErr instanceof Error ? playErr.message : "Could not start the camera preview.");
      return;
    }

    const gotFrame = await waitForVideoDimensions(video, 4000);
    if (generation !== generationRef.current) return;

    if (!gotFrame) {
      setPhase("error");
      setError("The camera preview never produced a picture. Close this and try again.");
      return;
    }

    setPhase("live");
  }, [stopStream]);

  useEffect(() => {
    startCamera();
    return () => {
      generationRef.current++;
      stopStream();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleCapture() {
    const video = videoRef.current;
    if (!video) return;

    if (!video.videoWidth || !video.videoHeight) {
      setPhase("error");
      setError("The camera preview isn't ready yet — wait a moment for the live picture to appear and try again.");
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    setPhase("processing");
    try {
      const result = await Promise.race([
        recognizeProductLabel(canvas),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 30000)),
      ]);
      onResult(result);
    } catch {
      // tesseract.js's failure modes here are indistinguishable client-side
      // (a blocked/slow network fetch of its recognition engine looks the
      // same as an internal decode error or our own 30s timeout above), so
      // cover both real causes rather than guessing — a "bad lighting"
      // message alone would mislead anyone whose real problem is no
      // internet connection or a slow first-time engine download.
      setPhase("error");
      setError(
        "Couldn't read the label. This needs an internet connection the first time (to download the recognition engine) and works best in good, even lighting. Check your connection and try again."
      );
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <div className="flex items-center justify-between px-4 py-3 text-white">
        <span className="text-sm font-semibold">Scan Product Label</span>
        <button onClick={onClose} className="rounded-full p-1 hover:bg-white/10">
          <X size={20} />
        </button>
      </div>

      <div className="relative flex-1">
        <video ref={videoRef} className="h-full w-full object-cover" muted playsInline autoPlay />

        <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-8">
          <div className="h-2/3 w-full rounded-xl border-4 border-dashed border-white/70" />
        </div>

        {phase === "starting" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-sm text-white">
            Starting camera…
          </div>
        )}

        {phase === "processing" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/70 text-white">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-white border-t-transparent" />
            <p className="text-sm">Reading label…</p>
            <p className="max-w-xs text-center text-xs text-white/70">
              First use downloads a small language file — this can take a bit longer once.
            </p>
          </div>
        )}

        {phase === "error" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80 px-6 text-center text-white">
            <p className="text-sm">{error}</p>
            <div className="flex gap-2">
              <button
                onClick={() => startCamera()}
                className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-slate-900"
              >
                Try Again
              </button>
              <button
                onClick={onClose}
                className="rounded-lg border border-white/40 px-4 py-2 text-sm font-medium"
              >
                Close and enter manually
              </button>
            </div>
          </div>
        )}

        {phase === "live" && (
          <p className="absolute bottom-28 left-0 right-0 text-center text-xs font-medium text-white/90">
            Fill the frame with the product name, size, and brand
          </p>
        )}
      </div>

      <div className="flex items-center justify-center bg-black py-6">
        <button
          onClick={handleCapture}
          disabled={phase !== "live"}
          className="flex h-16 w-16 items-center justify-center rounded-full bg-white disabled:opacity-30"
        >
          <Camera size={26} className="text-slate-900" />
        </button>
      </div>
    </div>
  );
}
