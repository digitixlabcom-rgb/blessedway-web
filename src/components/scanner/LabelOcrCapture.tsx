import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, X } from "lucide-react";
import { recognizeLabelSmart, type LabelOcrResult } from "../../services/OcrService";

interface LabelOcrCaptureProps {
  categories: string[];
  geminiApiKey: string;
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

export function LabelOcrCapture({ categories, geminiApiKey, onResult, onClose }: LabelOcrCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const generationRef = useRef(0);
  const [phase, setPhase] = useState<Phase>("starting");
  const [error, setError] = useState<string | null>(null);
  const [captureReady, setCaptureReady] = useState(false);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const startCamera = useCallback(async () => {
    const generation = ++generationRef.current;
    stopStream();
    setPhase("starting");
    setError(null);

    // A generous but non-mandatory ("ideal") resolution request. OCR needs a
    // genuinely high-resolution frame to read small label text — without any
    // width/height hint at all, browsers commonly default to something like
    // 640x480, which reads label text as mush. "ideal" is advisory per spec
    // and should not cause getUserMedia to fail even if unsatisfiable, unlike
    // "min"/"max"/"exact" — but the fallback below covers that anyway.
    const richConstraints: MediaStreamConstraints = {
      video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
    };
    const minimalConstraints: MediaStreamConstraints = { video: { facingMode: { ideal: "environment" } } };

    async function acquire(constraints: MediaStreamConstraints): Promise<MediaStream> {
      return navigator.mediaDevices.getUserMedia(constraints);
    }

    let stream: MediaStream;
    try {
      stream = await acquire(richConstraints);
    } catch (err) {
      const name = err instanceof Error ? err.name : "";
      if (name === "NotAllowedError") {
        if (generation !== generationRef.current) return;
        setPhase("error");
        setError("Camera permission was denied. Allow camera access for this site and try again.");
        return;
      }

      // Anything else — including a resolution the device genuinely can't
      // do, or the barcode scanner's camera not fully released yet — falls
      // back to the plainest possible request, with one retry after a
      // short pause for the "device is still busy" case.
      if (generation !== generationRef.current) return;
      try {
        stream = await acquire(minimalConstraints);
      } catch (err2) {
        const name2 = err2 instanceof Error ? err2.name : "";
        if (!TRANSIENT_ERROR_NAMES.has(name2)) {
          if (generation !== generationRef.current) return;
          setPhase("error");
          setError(err2 instanceof Error ? err2.message : "Could not access the camera.");
          return;
        }
        await wait(600);
        if (generation !== generationRef.current) return;
        try {
          stream = await acquire(minimalConstraints);
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
    setCaptureReady(false);
    // Give the camera a beat to finish auto-focus/auto-exposure after the
    // stream starts — capturing on the very first live frame tends to catch
    // it mid-focus, which was very likely contributing to the garbled OCR
    // read (small label text needs a genuinely sharp frame).
    setTimeout(() => {
      if (generation === generationRef.current) setCaptureReady(true);
    }, 800);
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
        recognizeLabelSmart(canvas, categories, geminiApiKey),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 30000)),
      ]);
      onResult(result);
    } catch {
      // recognizeLabelSmart already tried Gemini and fell back to the
      // on-device OCR itself — reaching here means both failed (or our own
      // 30s timeout won the race), so the causes are genuinely mixed: no
      // internet, a slow first-time engine download, or just a hard-to-read
      // label. Cover all of them rather than guessing at one.
      setPhase("error");
      setError(
        "Couldn't read the label. Check your internet connection, make sure the label is well lit and in focus, and try again."
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
              This can take a few seconds, longer if it falls back to offline reading.
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
            {captureReady
              ? "Fill the frame with the product name, size, and brand — hold steady"
              : "Focusing…"}
          </p>
        )}
      </div>

      <div className="flex items-center justify-center bg-black py-6">
        <button
          onClick={handleCapture}
          disabled={phase !== "live" || !captureReady}
          className="flex h-16 w-16 items-center justify-center rounded-full bg-white disabled:opacity-30"
        >
          <Camera size={26} className="text-slate-900" />
        </button>
      </div>
    </div>
  );
}
