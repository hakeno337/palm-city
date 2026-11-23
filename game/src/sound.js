// Palm City — tiny WebAudio synth. No audio assets: every sound is an
// oscillator or a puff of filtered noise, made on the spot. The context is
// created lazily on the first user gesture; the siren is a two-tone loop
// that follows the wanted level while police are close.

export function createSound() {
  let ctx = null;
  let muted = false;
  let sirenNodes = null;

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone(freqA, freqB, seconds, type = 'square', volume = 0.05, delay = 0) {
    if (muted) return;
    const ac = ensure();
    if (!ac) return;
    const t0 = ac.currentTime + delay;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freqA, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(30, freqB), t0 + seconds);
    gain.gain.setValueAtTime(volume, t0);
    gain.gain.exponentialRampToValueAtTime(0.0008, t0 + seconds);
    osc.connect(gain).connect(ac.destination);
    osc.start(t0);
    osc.stop(t0 + seconds + 0.02);
  }

  function noise(seconds, volume = 0.08, cutoff = 900) {
    if (muted) return;
    const ac = ensure();
    if (!ac) return;
    const len = Math.max(1, Math.floor(ac.sampleRate * seconds));
    const buffer = ac.createBuffer(1, len, ac.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ac.createBufferSource();
    src.buffer = buffer;
    const filter = ac.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    const gain = ac.createGain();
    gain.gain.value = volume;
    src.connect(filter).connect(gain).connect(ac.destination);
    src.start();
  }

  function setSiren(on) {
    if (on && !sirenNodes && !muted) {
      const ac = ensure();
      if (!ac) return;
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      const lfo = ac.createOscillator();
      const lfoGain = ac.createGain();
      osc.type = 'triangle';
      osc.frequency.value = 660;
      lfo.frequency.value = 0.85;
      lfoGain.gain.value = 130;
      lfo.connect(lfoGain).connect(osc.frequency);
      gain.gain.value = 0.016;
      osc.connect(gain).connect(ac.destination);
      osc.start();
      lfo.start();
      sirenNodes = { osc, lfo, gain };
    } else if (!on && sirenNodes) {
      try { sirenNodes.osc.stop(); sirenNodes.lfo.stop(); } catch { /* already stopped */ }
      sirenNodes = null;
    }
  }

  return {
    unlock() { ensure(); },
    toggleMute() {
      muted = !muted;
      if (muted) setSiren(false);
      return muted;
    },
    isMuted() { return muted; },
    setSiren,
    pickup() { tone(880, 1320, 0.09, 'square', 0.045); },
    cash() { tone(990, 990, 0.07, 'square', 0.05); tone(1480, 1480, 0.11, 'square', 0.05, 0.07); },
    punch() { noise(0.09, 0.1, 500); },
    crash() { noise(0.22, 0.13, 700); tone(120, 45, 0.2, 'sawtooth', 0.05); },
    board() { tone(420, 620, 0.08, 'square', 0.04); },
    crime() { tone(196, 196, 0.1, 'square', 0.045); tone(185, 185, 0.14, 'square', 0.045, 0.1); },
    missionStart() { tone(523, 523, 0.09, 'square', 0.05); tone(659, 659, 0.09, 'square', 0.05, 0.09); tone(784, 784, 0.14, 'square', 0.05, 0.18); },
    missionDone() { tone(659, 659, 0.09, 'square', 0.05); tone(784, 784, 0.09, 'square', 0.05, 0.09); tone(1046, 1046, 0.1, 'square', 0.05, 0.18); tone(1318, 1318, 0.2, 'square', 0.05, 0.27); },
    missionFail() { tone(392, 392, 0.12, 'square', 0.05); tone(330, 330, 0.12, 'square', 0.05, 0.12); tone(262, 262, 0.22, 'square', 0.05, 0.24); },
    busted() { tone(660, 660, 0.14, 'square', 0.06); tone(495, 495, 0.14, 'square', 0.06, 0.16); tone(660, 660, 0.14, 'square', 0.06, 0.32); tone(495, 495, 0.3, 'square', 0.06, 0.48); },
    wasted() { tone(330, 55, 0.7, 'sawtooth', 0.06); },
    storyDone() { [523, 659, 784, 1046, 784, 1046, 1318].forEach((f, i) => tone(f, f, 0.14, 'square', 0.05, i * 0.11)); },
    splash() { tone(740, 990, 0.08, 'sine', 0.03); },
  };
}
