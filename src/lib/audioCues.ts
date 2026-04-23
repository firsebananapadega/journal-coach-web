// Short audible cues for capture start/stop. Uses the Web Audio API
// directly (no asset files) so these work in any browser without a
// network fetch and respect the user's system volume.
//
// iOS Safari requires the AudioContext to be unlocked by a user
// gesture. The first call to ensureContext() inside a tap handler
// resolves that — subsequent calls are free.
//
// Design:
//   - start: 440 Hz sine, 120 ms, quick fade-in/out so it's a soft "blip"
//   - stop:  330 Hz sine, 160 ms, lower tone cues "done"
//   - volume capped modestly (0.14) so it's obvious but not jarring

let _ctx: AudioContext | null = null;

function ensureContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (_ctx) return _ctx;
  const Ctor =
    (window as typeof window & { webkitAudioContext?: typeof AudioContext }).AudioContext ||
    (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    _ctx = new Ctor();
    return _ctx;
  } catch {
    return null;
  }
}

function playTone(frequency: number, durationMs: number, peakGain = 0.14) {
  const ctx = ensureContext();
  if (!ctx) return;
  // iOS keeps the context suspended until a user gesture.
  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }
  const now = ctx.currentTime;
  const end = now + durationMs / 1000;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = frequency;
  // Fade in over 10ms, hold, fade out over 60ms — avoids a click at
  // the transition edges.
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(peakGain, now + 0.01);
  gain.gain.setValueAtTime(peakGain, end - 0.06);
  gain.gain.linearRampToValueAtTime(0, end);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(end + 0.02);
}

export function playCaptureStart() {
  playTone(440, 120);
}

export function playCaptureStop() {
  playTone(330, 160);
}
