// All sound in Solmar Bay is synthesised with WebAudio: no audio files.
// Engine hum, police siren, gunshots, punches, interface blips and a small
// bass-driven radio loop are all built from oscillators and filtered noise.

export function createAudio() {
  const audio = {
    ctx: null,
    master: null,
    muted: false,
    engineOsc: null,
    engineOsc2: null,
    engineGain: null,
    engineFilter: null,
    sirenOsc: null,
    sirenGain: null,
    sirenOn: false,
    radioTimer: null,
    radioStep: 0,
    started: false,
  };

  // The context must be created (or resumed) from a user gesture.
  audio.start = function startAudio() {
    if (audio.started) {
      if (audio.ctx && audio.ctx.state === 'suspended') audio.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    audio.ctx = new Ctx();
    audio.master = audio.ctx.createGain();
    audio.master.gain.value = 0.5;
    audio.master.connect(audio.ctx.destination);

    // The engine is two detuned saws through a low-pass filter.
    audio.engineOsc = audio.ctx.createOscillator();
    audio.engineOsc.type = 'sawtooth';
    audio.engineOsc.frequency.value = 55;
    audio.engineOsc2 = audio.ctx.createOscillator();
    audio.engineOsc2.type = 'sawtooth';
    audio.engineOsc2.frequency.value = 82;
    audio.engineFilter = audio.ctx.createBiquadFilter();
    audio.engineFilter.type = 'lowpass';
    audio.engineFilter.frequency.value = 320;
    audio.engineGain = audio.ctx.createGain();
    audio.engineGain.gain.value = 0;
    audio.engineOsc.connect(audio.engineFilter);
    audio.engineOsc2.connect(audio.engineFilter);
    audio.engineFilter.connect(audio.engineGain);
    audio.engineGain.connect(audio.master);
    audio.engineOsc.start();
    audio.engineOsc2.start();

    // The siren is a square wave that alternates between two notes.
    audio.sirenOsc = audio.ctx.createOscillator();
    audio.sirenOsc.type = 'square';
    audio.sirenOsc.frequency.value = 700;
    audio.sirenGain = audio.ctx.createGain();
    audio.sirenGain.gain.value = 0;
    audio.sirenOsc.connect(audio.sirenGain);
    audio.sirenGain.connect(audio.master);
    audio.sirenOsc.start();

    audio.started = true;
  };

  audio.setMuted = function setMuted(muted) {
    audio.muted = muted;
    if (audio.master) audio.master.gain.value = muted ? 0 : 0.5;
  };

  // speed01 is 0..1 of the car's top speed; 0 silences the engine.
  audio.setEngine = function setEngineSpeed(speed01, on) {
    if (!audio.started) return;
    const t = audio.ctx.currentTime;
    const level = on ? 0.05 + speed01 * 0.09 : 0;
    audio.engineGain.gain.setTargetAtTime(level, t, 0.08);
    audio.engineOsc.frequency.setTargetAtTime(55 + speed01 * 110, t, 0.08);
    audio.engineOsc2.frequency.setTargetAtTime(82 + speed01 * 165, t, 0.08);
  };

  audio.setSiren = function setSiren(on) {
    if (!audio.started) return;
    audio.sirenOn = on;
    const t = audio.ctx.currentTime;
    audio.sirenGain.gain.setTargetAtTime(on ? 0.045 : 0, t, 0.2);
  };

  // The siren's two-note wail, stepped in the game loop.
  audio.updateSiren = function updateSiren(time) {
    if (!audio.started || !audio.sirenOn) return;
    const note = Math.floor(time * 2.4) % 2 === 0 ? 700 : 940;
    audio.sirenOsc.frequency.setTargetAtTime(note, audio.ctx.currentTime, 0.05);
  };

  function burstNoise(duration, filterType, filterFreq, gainValue) {
    if (!audio.started) return;
    const ctx = audio.ctx;
    const length = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    gain.gain.value = gainValue;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(audio.master);
    source.start();
  }

  function blip(freq, duration, type, gainValue) {
    if (!audio.started) return;
    const ctx = audio.ctx;
    const osc = ctx.createOscillator();
    osc.type = type || 'sine';
    osc.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(gainValue || 0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(audio.master);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  }

  audio.gunshot = function playGunshot() {
    burstNoise(0.14, 'bandpass', 1400, 0.5);
    blip(160, 0.08, 'square', 0.2);
  };

  audio.punch = function playPunch() {
    burstNoise(0.09, 'lowpass', 300, 0.5);
  };

  audio.crash = function playCrash() {
    burstNoise(0.25, 'lowpass', 500, 0.6);
  };

  audio.pickup = function playPickup() {
    blip(880, 0.12, 'sine', 0.18);
    setTimeout(() => blip(1320, 0.16, 'sine', 0.18), 90);
  };

  audio.missionDone = function playMissionDone() {
    [523, 659, 784, 1047].forEach((f, i) => {
      setTimeout(() => blip(f, 0.22, 'triangle', 0.2), i * 110);
    });
  };

  audio.missionFail = function playMissionFail() {
    [392, 330, 262].forEach((f, i) => {
      setTimeout(() => blip(f, 0.25, 'triangle', 0.2), i * 140);
    });
  };

  audio.uiClick = function playUiClick() {
    blip(660, 0.07, 'sine', 0.15);
  };

  // A slow bassline groove: A minor, eight steps a bar, plus a hat tick.
  const RADIO_BASS = [55, 0, 55, 65.4, 0, 55, 49, 61.7];
  audio.startRadio = function startRadio() {
    if (!audio.started || audio.radioTimer) return;
    audio.radioTimer = setInterval(() => {
      if (audio.muted) return;
      const note = RADIO_BASS[audio.radioStep % RADIO_BASS.length];
      if (note > 0) blip(note, 0.28, 'square', 0.06);
      if (audio.radioStep % 2 === 0) burstNoise(0.03, 'highpass', 6000, 0.03);
      audio.radioStep += 1;
    }, 240);
  };

  audio.stopRadio = function stopRadio() {
    if (audio.radioTimer) {
      clearInterval(audio.radioTimer);
      audio.radioTimer = null;
    }
  };

  return audio;
}
