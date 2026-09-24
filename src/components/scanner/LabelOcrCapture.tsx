import { useEffect, useRef, useState } from "react";
import { Camera, X } from "lucide-react";
import { recognizeProductLabel, type LabelOcrResult } from "../../services/OcrService";

interface LabelOcrCaptureProps {
  onResult: (result: LabelOcrResult) => void;
  onClose: () => void;
}

type Phase = "starting" | "live" | "processing" | "error";

export function LabelOcrCapture({ onResult, onClose }: LabelOcrCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [phase, setPhase] = useState<Phase>("starting");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 1280 } } })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        setPhase("live");
      })
      .catch((err) => {
        setPhase("error");
        setError(err instanceof Error ? err.message : "Could not access the camera.");
      });

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  async function handleCapture() {
    const video = videoRef.current;
    if (!video) return;

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    setPhase("processing");
    try {
      const result = await recognizeProductLabel(canvas);
      onResult(result);
    } catch {
      // tesseract.js's failure modes here are indistinguishable client-side
      // (a blocked/slow network fetch of its recognition engine looks the
      // same as an internal decode error), so cover both real causes rather
      // than guessing — a "bad lighting" message alone would mislead anyone
      // whose real problem is no internet connection.
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
                onClick={() => setPhase("live")}
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
