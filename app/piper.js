/* Piper text-to-speech inside the browser: piper-phonemize (espeak-ng) compiled to
 * WebAssembly turns text into phoneme ids, ONNX Runtime Web runs the VITS voice.
 * Everything is fetched from pinned CDN / Hugging Face URLs once and kept by the
 * service worker, so after the first download it works offline. */

const ORT_BASE = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.31.1/dist/';
const PHONEMIZE_BASE = 'https://cdn.jsdelivr.net/npm/@diffusionstudio/piper-wasm@1.0.0/build/piper_phonemize';
const VOICE_BASE = 'https://huggingface.co/rhasspy/piper-voices/resolve/5041a7a49ae5b3a0f30e6837769eb03fdbb231bd/';

export const VOICES = {
  'cs_CZ-jirka-medium': { label: 'Jirka (male)', path: 'cs/cs_CZ/jirka/medium/cs_CZ-jirka-medium', mb: 63 },
  'cs_CZ-kasandra-medium': { label: 'Kasandra (female)', path: 'cs/cs_CZ/kasandra/medium/cs_CZ-kasandra-medium', mb: 64 },
};

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error(`Could not load ${src}`));
    document.head.appendChild(s);
  });
}

/** Fetch a URL as bytes, reporting progress as {loaded, total}. */
async function fetchBytes(url, onProgress) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} fetching ${url}`);
  const total = Number(res.headers.get('Content-Length')) || 0;
  const reader = res.body.getReader();
  const chunks = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    if (onProgress) onProgress({ loaded, total });
  }
  const out = new Uint8Array(loaded);
  let pos = 0;
  for (const c of chunks) { out.set(c, pos); pos += c.length; }
  return out;
}

let phonemizerPromise = null;
/** The espeak-ng phonemiser module, created once and reused. */
function phonemizer() {
  if (!phonemizerPromise) {
    phonemizerPromise = (async () => {
      await loadScript(`${PHONEMIZE_BASE}.js`);
      const lines = [];
      const mod = await window.createPiperPhonemize({
        print: (line) => lines.push(line),
        printErr: (msg) => console.warn('piper-phonemize:', msg),
        locateFile: (f) => (f.endsWith('.wasm') ? `${PHONEMIZE_BASE}.wasm` : f.endsWith('.data') ? `${PHONEMIZE_BASE}.data` : f),
      });
      return { mod, lines };
    })();
  }
  return phonemizerPromise;
}

/** Phoneme ids for `text` in espeak voice `lang`. */
async function phonemeIds(text, lang) {
  const { mod, lines } = await phonemizer();
  lines.length = 0;
  mod.callMain(['-l', lang, '--input', JSON.stringify([{ text }]), '--espeak_data', '/espeak-ng-data']);
  if (!lines.length) throw new Error('phonemiser produced no output');
  return JSON.parse(lines[lines.length - 1]).phoneme_ids;
}

let ortPromise = null;
function ort() {
  if (!ortPromise) {
    ortPromise = import(`${ORT_BASE}ort.wasm.min.mjs`).then((m) => {
      const lib = m.default || m;
      lib.env.wasm.wasmPaths = ORT_BASE;
      lib.env.wasm.numThreads = 1; // GitHub Pages sends no COOP/COEP headers, so no SharedArrayBuffer
      return lib;
    });
  }
  return ortPromise;
}

/**
 * Load a voice. `onProgress({phase, loaded, total})` reports the download.
 * Returns an engine with `synthesize(text, {lengthScale}) -> {samples, sampleRate}`.
 */
export async function loadVoice(voiceId, onProgress = () => {}) {
  const v = VOICES[voiceId];
  if (!v) throw new Error(`unknown voice ${voiceId}`);
  onProgress({ phase: 'runtime', loaded: 0, total: 0 });
  const [lib] = await Promise.all([ort(), phonemizer()]);
  const config = await (await fetch(`${VOICE_BASE}${v.path}.onnx.json`)).json();
  const model = await fetchBytes(`${VOICE_BASE}${v.path}.onnx`, (p) => onProgress({ phase: 'voice', ...p }));
  onProgress({ phase: 'init', loaded: 0, total: 0 });
  const session = await lib.InferenceSession.create(model, { executionProviders: ['wasm'] });
  const inf = config.inference;
  return {
    id: voiceId,
    sampleRate: config.audio.sample_rate,
    async synthesize(text, { lengthScale = 1 } = {}) {
      const ids = await phonemeIds(text, config.espeak.voice);
      const feeds = {
        input: new lib.Tensor('int64', BigInt64Array.from(ids, BigInt), [1, ids.length]),
        input_lengths: new lib.Tensor('int64', BigInt64Array.from([BigInt(ids.length)])),
        scales: new lib.Tensor('float32', Float32Array.from([inf.noise_scale, inf.length_scale * lengthScale, inf.noise_w])),
      };
      if (config.num_speakers > 1) feeds.sid = new lib.Tensor('int64', BigInt64Array.from([0n]));
      const { output } = await session.run(feeds);
      return { samples: output.data, sampleRate: config.audio.sample_rate };
    },
  };
}
