// Beep via Web Audio API — no external audio asset needed, works offline.
let audioCtx: AudioContext | null = null;

export function playBeep(): void {
  try {
    if (!audioCtx) {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioCtx = new Ctor();
    }
    const ctx = audioCtx;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = 1500;
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.12);
  } catch {
    // Audio isn't critical to the scan flow — fail silently.
  }
}

export function vibrate(pattern: number | number[] = 80): void {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // Vibration API not supported on this device — ignore.
  }
}
