export type NotificationSoundType = 'success' | 'error' | 'warning' | 'info';

export function playNotificationSound(type: NotificationSoundType): void {
  try {
    const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    // Envelope
    const now = ctx.currentTime;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.2, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);

    osc.type = 'sine';

    // Choose base frequency and a short up/down sweep for each type
    let startFreq = 440; // A4
    let endFreq = 440;

    switch (type) {
      case 'success':
        startFreq = 660; endFreq = 880; // quick rising chirp
        break;
      case 'error':
        startFreq = 220; endFreq = 180; // falling buzz
        osc.type = 'square';
        break;
      case 'warning':
        startFreq = 520; endFreq = 440; // slight drop
        osc.type = 'triangle';
        break;
      case 'info':
      default:
        startFreq = 520; endFreq = 600; // gentle up
        osc.type = 'sine';
        break;
    }

    osc.frequency.setValueAtTime(startFreq, now);
    osc.frequency.exponentialRampToValueAtTime(endFreq, now + 0.25);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.6);

    // Auto-close the context shortly after to free resources
    osc.onended = () => {
      try { ctx.close(); } catch {}
    };
  } catch {
    // ignore
  }
}
