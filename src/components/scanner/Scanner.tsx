import { useCallback, useEffect, useRef, useState } from "react";
import { FlashlightOff, Flashlight, SwitchCamera, Keyboard } from "lucide-react";
import { barcodeService, type DecodedBarcode, type CameraDevice } from "../../services/BarcodeService";
import { playBeep, vibrate } from "../../utils/feedback";

interface ScannerProps {
  active: boolean;
  soundEnabled: boolean;
  vibrationEnabled: boolean;
  onDecode: (decoded: DecodedBarcode) => void;
  onManualEntry: () => void;
}

const RESCAN_LOCK_MS = 2500;

export function Scanner({ active, soundEnabled, vibrationEnabled, onDecode, onManualEntry }: ScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const lastScan = useRef<{ text: string; time: number } | null>(null);
  const [cameras, setCameras] = useState<CameraDevice[]>([]);
  const [cameraIndex, setCameraIndex] = useState(0);
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(true);

  useEffect(() => {
    barcodeService
      .listCameras()
      .then((list) => {
        setCameras(list);
        const backCamera = list.findIndex((c) => /back|rear|environment/i.test(c.label));
        if (backCamera >= 0) setCameraIndex(backCamera);
      })
      .catch(() => setCameras([]));
  }, []);

  const handleDecode = useCallback(
    (decoded: DecodedBarcode) => {
      const now = Date.now();
      const last = lastScan.current;
      if (last && last.text === decoded.text && now - last.time < RESCAN_LOCK_MS) {
        return;
      }
      lastScan.current = { text: decoded.text, time: now };
      if (soundEnabled) playBeep();
      if (vibrationEnabled) vibrate(80);
      onDecode(decoded);
    },
    [onDecode, soundEnabled, vibrationEnabled]
  );

  useEffect(() => {
    if (!active) {
      barcodeService.stop();
      return;
    }
    if (!videoRef.current) return;

    setStarting(true);
    setError(null);
    const deviceId = cameras[cameraIndex]?.deviceId;

    barcodeService
      .start(
        videoRef.current,
        deviceId,
        handleDecode,
        (err) => {
          const message = err instanceof Error ? err.message : "Camera error";
          setError(message);
        }
      )
      .then(() => {
        setStarting(false);
        const stream = videoRef.current?.srcObject as MediaStream | undefined;
        const track = stream?.getVideoTracks()[0];
        const capabilities = track?.getCapabilities?.() as (MediaTrackCapabilities & { torch?: boolean }) | undefined;
        setTorchSupported(Boolean(capabilities?.torch));
      })
      .catch((err) => {
        setStarting(false);
        setError(err instanceof Error ? err.message : "Unable to access camera");
      });

    return () => {
      barcodeService.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, cameraIndex, cameras.length]);

  const toggleTorch = async () => {
    const stream = videoRef.current?.srcObject as MediaStream | undefined;
    const track = stream?.getVideoTracks()[0];
    if (!track) return;
    try {
      const next = !torchOn;
      await track.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] });
      setTorchOn(next);
    } catch {
      setError("Flash is not supported on this device.");
    }
  };

  const switchCamera = () => {
    if (cameras.length < 2) return;
    setCameraIndex((i) => (i + 1) % cameras.length);
  };

  return (
    <div className="relative mx-auto flex w-full max-w-md flex-col overflow-hidden rounded-2xl bg-black shadow-xl">
      <div className="relative aspect-[3/4] w-full bg-slate-900">
        <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />

        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-2/3 w-5/6 rounded-xl border-4 border-brand-500/80 shadow-[0_0_0_2000px_rgba(0,0,0,0.35)]" />
        </div>

        {starting && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-sm text-white">
            Starting camera…
          </div>
        )}

        {error && (
          <div className="absolute inset-x-4 top-4 rounded-lg bg-red-600/90 px-3 py-2 text-xs font-medium text-white">
            {error}
          </div>
        )}

        <p className="absolute bottom-3 left-0 right-0 text-center text-xs font-medium text-white/90">
          Point the camera at a barcode
        </p>
      </div>

      <div className="flex items-center justify-around bg-slate-950 px-4 py-3">
        <button
          onClick={toggleTorch}
          disabled={!torchSupported}
          className="flex flex-col items-center gap-1 text-white disabled:opacity-30"
        >
          {torchOn ? <Flashlight size={22} /> : <FlashlightOff size={22} />}
          <span className="text-[11px]">Flash</span>
        </button>
        <button
          onClick={switchCamera}
          disabled={cameras.length < 2}
          className="flex flex-col items-center gap-1 text-white disabled:opacity-30"
        >
          <SwitchCamera size={22} />
          <span className="text-[11px]">Switch</span>
        </button>
        <button onClick={onManualEntry} className="flex flex-col items-center gap-1 text-white">
          <Keyboard size={22} />
          <span className="text-[11px]">Manual</span>
        </button>
      </div>
    </div>
  );
}
