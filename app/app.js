/* Diktátor: Czech dictation practice. Plain ES2020, no build step. */
'use strict';

const BUILD = '__BUILD__';
const KEYS = { settings: 'diktator.settings', list: 'diktator.list', stats: 'diktator.stats' };

/** Czech letter names used in spelling mode. 'ch' is one letter. Where people
 *  say a letter several ways, all variants are listed and one is picked at random. */
const LETTER_NAMES = {
  a: ['a', 'krátké a'], á: ['dlouhé á'], b: 'bé', c: 'cé', č: 'čé', d: 'dé', ď: 'ďé',
  e: ['e', 'krátké e'], é: ['dlouhé é'], ě: ['e s háčkem', 'ije'], f: 'ef', g: 'gé', h: 'há', ch: 'chá',
  i: ['měkké i', 'krátké měkké i'], í: ['dlouhé měkké í', 'měkké dlouhé í'],
  j: 'jé', k: 'ká', l: 'el', m: 'em', n: 'en', ň: 'eň',
  o: ['o', 'krátké o'], ó: ['dlouhé ó'], p: 'pé', q: 'kvé',
  r: 'er', ř: 'eř', s: 'es', š: 'eš', t: 'té', ť: 'ťé',
  u: ['u', 'krátké u'], ú: ['ú s čárkou', 'dlouhé ú s čárkou'], ů: ['u s kroužkem', 'dlouhé u s kroužkem'],
  v: 'vé', w: 'dvojité vé', x: 'iks',
  y: ['tvrdé y', 'ypsilon'], ý: ['tvrdé dlouhé ý', 'dlouhé tvrdé ý', 'dlouhé ypsilon'],
  z: 'zet', ž: 'žet',
  '-': 'pomlčka', ' ': 'mezera', "'": 'apostrof',
};

/** Spoken name for one spelling unit; picks one variant at random when several exist. */
function letterName(unit, pick = (arr) => arr[Math.floor(Math.random() * arr.length)]) {
  const v = LETTER_NAMES[unit];
  if (v === undefined) return unit;
  return Array.isArray(v) ? pick(v) : v;
}

const POS_NAMES = { n: 'noun', v: 'verb', a: 'adjective', r: 'adverb', m: 'numeral' };
const MONTHS_GEN = ['ledna', 'února', 'března', 'dubna', 'května', 'června', 'července',
  'srpna', 'září', 'října', 'listopadu', 'prosince'];
const ORDINAL_GEN = ['', 'prvního', 'druhého', 'třetího', 'čtvrtého', 'pátého', 'šestého',
  'sedmého', 'osmého', 'devátého', 'desátého', 'jedenáctého', 'dvanáctého', 'třináctého',
  'čtrnáctého', 'patnáctého', 'šestnáctého', 'sedmnáctého', 'osmnáctého', 'devatenáctého',
  'dvacátého'];

const DEFAULT_SETTINGS = {
  voice: '', rate: 0.95, useClips: true, preferRecordings: false, autoPlay: true,
  pos: ['n', 'v', 'a', 'r'], bands: [1, 2, 3], minLen: 3,
  numberKinds: ['small', 'medium', 'year', 'date'],
  caseSensitive: false, punctSensitive: false,
};

/* ---------- pure helpers (also unit-tested under node) ---------- */

/** Split a Czech word into spelling units, treating 'ch' as one letter. */
function spellingUnits(word) {
  const units = [];
  const w = word.toLowerCase();
  for (let i = 0; i < w.length; i += 1) {
    if (w[i] === 'c' && w[i + 1] === 'h') { units.push('ch'); i += 1; } else units.push(w[i]);
  }
  return units;
}

/** Frequency band 1..5 from an OpenSubtitles rank (0 = unranked). */
function band(rank) {
  if (!rank) return 5;
  if (rank <= 2000) return 1;
  if (rank <= 5000) return 2;
  if (rank <= 15000) return 3;
  return 4;
}

/** Normalise an answer for comparison. */
function normalize(text, kind, settings) {
  let t = text.normalize('NFC').trim().replace(/\s+/g, ' ');
  if (kind === 'number') return t.replace(/\s+/g, '').replace(/,/g, '.').replace(/\.$/, '');
  if (!settings.caseSensitive) t = t.toLowerCase();
  if (kind === 'sentence' && !settings.punctSensitive) {
    t = t.replace(/[.,!?;:"„“”…()]/g, '').replace(/\s+/g, ' ').trim();
  }
  if (kind !== 'sentence') t = t.replace(/[.!?]+$/, '');
  return t;
}

/** Character-level diff (LCS). Returns [{op:'eq'|'del'|'ins', ch}] where
 *  del = in expected but missing from given, ins = typed but not expected. */
function charDiff(expected, given) {
  const a = Array.from(expected), b = Array.from(given);
  const n = a.length, m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { out.push({ op: 'eq', ch: a[i] }); i += 1; j += 1; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push({ op: 'del', ch: a[i] }); i += 1; }
    else { out.push({ op: 'ins', ch: b[j] }); j += 1; }
  }
  while (i < n) { out.push({ op: 'del', ch: a[i] }); i += 1; }
  while (j < m) { out.push({ op: 'ins', ch: b[j] }); j += 1; }
  return out;
}

function randInt(lo, hi) { return lo + Math.floor(Math.random() * (hi - lo + 1)); }
function choice(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

/** Czech plural form picker for counts (1 / 2-4 / other), as used after a numeral. */
function plural(n, one, few, many) {
  if (n === 1) return one;
  const last = n % 100;
  if (last % 10 >= 2 && last % 10 <= 4 && (last < 12 || last > 14)) return few;
  return many;
}

/** Use the feminine 'dvě' when a count ends in 2 and the noun is feminine (hodiny, minuty). */
function feminine(units) {
  return units.map((u, i) => (u === 'dva' && i === units.length - 1 ? 'dvě' : u));
}

/** Spoken form of a day-of-month ordinal in the genitive. */
function dayOrdinal(d) {
  if (d <= 20) return ORDINAL_GEN[d];
  if (d === 30) return 'třicátého';
  const tens = d < 30 ? 'dvacátého' : 'třicátého';
  return `${tens} ${ORDINAL_GEN[d % 10]}`;
}

const ONES = ['nula', 'jedna', 'dva', 'tři', 'čtyři', 'pět', 'šest', 'sedm', 'osm', 'devět', 'deset',
  'jedenáct', 'dvanáct', 'třináct', 'čtrnáct', 'patnáct', 'šestnáct', 'sedmnáct', 'osmnáct', 'devatenáct'];
const TENS = ['', '', 'dvacet', 'třicet', 'čtyřicet', 'padesát', 'šedesát', 'sedmdesát', 'osmdesát', 'devadesát'];
const HUNDREDS = ['', 'sto', 'dvě stě', 'tři sta', 'čtyři sta', 'pět set', 'šest set', 'sedm set', 'osm set', 'devět set'];

/** Czech words for a whole number 0..999 999 999, one word per array element. */
function numberUnits(n) {
  if (n === 0) return ['nula'];
  const out = [];
  const group = (k, one, few, many) => {
    if (!k) return;
    if (k !== 1) out.push(...numberUnits(k));
    out.push(plural(k, one, few, many));
  };
  group(Math.floor(n / 1000000), 'milion', 'miliony', 'milionů');
  group(Math.floor(n / 1000) % 1000, 'tisíc', 'tisíce', 'tisíc');
  const rest = n % 1000;
  if (rest >= 100) out.push(...HUNDREDS[Math.floor(rest / 100)].split(' '));
  const tail = rest % 100;
  if (tail >= 20) { out.push(TENS[Math.floor(tail / 10)]); if (tail % 10) out.push(ONES[tail % 10]); }
  else if (tail > 0) out.push(ONES[tail]);
  return out;
}

/** Every word that can occur in a spoken number, year, date or time (for the recorded clips). */
const NUMBER_UNITS = Array.from(new Set([
  ...ONES, ...TENS.filter(Boolean), ...HUNDREDS.join(' ').split(' ').filter(Boolean),
  'tisíc', 'tisíce', 'milion', 'miliony', 'milionů', 'rok',
  ...ORDINAL_GEN.filter(Boolean), 'třicátého', ...MONTHS_GEN,
  'hodina', 'hodiny', 'hodin', 'minuta', 'minuty', 'minut',
]));

/** Make a number/date/time item. `units` are the spoken words, `say` the same as text
 *  for a voice, `text` the expected answer. */
function makeNumberItem(kinds, rng = { randInt, choice }) {
  const kind = rng.choice(kinds.length ? kinds : ['small']);
  const item = (text, units, hint) => ({ kind: 'number', text, units, say: units.join(' '), hint });
  switch (kind) {
    case 'small': { const n = rng.randInt(0, 100); return item(String(n), numberUnits(n), 'number'); }
    case 'medium': { const n = rng.randInt(100, 10000); return item(String(n), numberUnits(n), 'number'); }
    case 'large': { const n = rng.randInt(10000, 10000000); return item(String(n), numberUnits(n), 'number'); }
    case 'year': { const n = rng.randInt(1500, 2030); return item(String(n), ['rok', ...numberUnits(n)], 'year'); }
    case 'time': {
      const h = rng.randInt(0, 23), m = rng.randInt(0, 59);
      const units = [...feminine(numberUnits(h)), plural(h, 'hodina', 'hodiny', 'hodin')];
      if (m) units.push(...feminine(numberUnits(m)), plural(m, 'minuta', 'minuty', 'minut'));
      return item(`${h}:${String(m).padStart(2, '0')}`, units, 'time as hh:mm');
    }
    default: {
      const d = rng.randInt(1, 28), mo = rng.randInt(1, 12), y = rng.randInt(1900, 2030);
      return item(`${d}.${mo}.${y}`, [...dayOrdinal(d).split(' '), MONTHS_GEN[mo - 1], ...numberUnits(y)], 'date as d. m. yyyy');
    }
  }
}

/** Commons URL for the transcoded MP3 of a recording (plays everywhere, including iOS). */
function commonsMp3(name, h) {
  const enc = encodeURIComponent(name);
  return `https://upload.wikimedia.org/wikipedia/commons/transcoded/${h[0]}/${h}/${enc}/${enc}.mp3`;
}

if (typeof module !== 'undefined') {
  module.exports = { spellingUnits, letterName, band, normalize, charDiff, makeNumberItem, dayOrdinal, numberUnits, plural, commonsMp3, LETTER_NAMES, NUMBER_UNITS };
}

/* ---------- app ---------- */

if (typeof document !== 'undefined') {
  const $ = (sel) => document.querySelector(sel);
  const state = {
    words: [], sentences: [], voices: [],
    settings: load(KEYS.settings, DEFAULT_SETTINGS),
    list: load(KEYS.list, []),
    stats: load(KEYS.stats, {}),
    current: null, answered: false, session: { seen: 0, ok: 0 },
    audio: null, voicesSettled: false,
    ctx: null, playToken: 0, sources: [], clips: null, clipCache: new Map(),
    piper: null, piperModule: null, synthCache: new Map(),
  };

  function load(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return structuredClone(fallback);
      const v = JSON.parse(raw);
      return Array.isArray(fallback) ? v : { ...structuredClone(fallback), ...v };
    } catch { return structuredClone(fallback); }
  }
  function save(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ } }

  /* --- speech ---
   * Three sources of sound: the device's speech synthesis, the built-in Piper voice
   * (app/piper.js, loaded on demand), and recorded clips for letter names and number
   * words (app/audio, played through Web Audio). */
  const PIPER_PREFIX = 'piper:';
  function usingPiper() { return state.settings.voice.startsWith(PIPER_PREFIX); }
  function czechVoices() { return state.voices.filter((v) => v.lang && v.lang.toLowerCase().startsWith('cs')); }
  function currentVoice() {
    const cz = czechVoices();
    return cz.find((v) => v.voiceURI === state.settings.voice) || cz[0] || null;
  }
  function audioContext() {
    if (!state.ctx) state.ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (state.ctx.state === 'suspended') state.ctx.resume();
    return state.ctx;
  }
  function setPlayStatus(msg) {
    const el = $('#play-status');
    el.textContent = msg;
    el.hidden = !msg;
  }
  function stopAudio() {
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    if (state.audio) { state.audio.pause(); state.audio = null; }
    state.playToken += 1;
    for (const s of state.sources) { try { s.stop(); } catch { /* already ended */ } }
    state.sources = [];
    setPlayStatus('');
  }
  /** Schedule decoded buffers back to back with `gap` seconds between them. */
  function playSequence(buffers, { gap = 0, rate = 1 } = {}, token) {
    if (token !== state.playToken) return;
    const ctx = audioContext();
    let t = ctx.currentTime + 0.05;
    for (const buf of buffers) {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = rate;
      src.connect(ctx.destination);
      src.start(t);
      state.sources.push(src);
      t += buf.duration / rate + gap;
    }
  }
  /** Decoded clip from app/audio, cached for the session. */
  function clipBuffer(file) {
    if (!state.clipCache.has(file)) {
      const p = fetch(`audio/${file}`)
        .then((r) => { if (!r.ok) throw new Error(`${r.status} for ${file}`); return r.arrayBuffer(); })
        .then((bytes) => audioContext().decodeAudioData(bytes))
        .catch((e) => { state.clipCache.delete(file); throw e; });
      state.clipCache.set(file, p);
    }
    return state.clipCache.get(file);
  }
  /** Files for the clips that spell `word`, or null if any letter has no clip. */
  function spellingClips(word) {
    if (!state.clips) return null;
    const files = spellingUnits(word).map((u) => state.clips.letters[letterName(u)]);
    return files.every(Boolean) ? files : null;
  }
  /** Files for a number's words (mid-phrase form, falling form for the last), or null. */
  function numberClips(units) {
    if (!state.clips) return null;
    const files = units.map((u, i) => (state.clips.numbers[u] || {})[i === units.length - 1 ? 'f' : 'm']);
    return files.every(Boolean) ? files : null;
  }
  /** Play clips in order; if one cannot be fetched (offline, first visit) run `fallback`. */
  async function playClips(files, { gap, rate }, fallback) {
    stopAudio();
    const token = state.playToken;
    let buffers;
    try { buffers = await Promise.all(files.map(clipBuffer)); } catch { if (token === state.playToken) fallback(); return; }
    playSequence(buffers, { gap, rate: Math.min(1.25, Math.max(0.75, rate)) }, token);
  }
  function clipsUsable() { return state.settings.useClips && state.clips && (window.AudioContext || window.webkitAudioContext); }
  /** Fetch every clip once in the background so spelling and numbers work offline later. */
  async function warmClipCache() {
    if (!state.clips || !navigator.onLine) return;
    const files = [...Object.values(state.clips.letters), ...Object.values(state.clips.numbers).flatMap((v) => Object.values(v))];
    for (let i = 0; i < files.length; i += 8) {
      await Promise.all(files.slice(i, i + 8).map((f) => fetch(`audio/${f}`).catch(() => {})));
    }
  }

  function piperStatus(p, label) {
    const mb = (n) => `${Math.round(n / 1e6)} MB`;
    const msg = p.phase === 'voice' ? `Downloading ${label}: ${mb(p.loaded)} of ${mb(p.total)}…`
      : p.phase === 'runtime' ? 'Loading the speech runtime…'
        : p.phase === 'init' ? 'Preparing the voice…' : p.phase === 'ready' ? `${label} is ready.` : '';
    const el = $('#voice-status');
    el.textContent = msg; el.hidden = !msg;
    setPlayStatus(p.phase === 'ready' ? '' : msg);
  }
  /** The built-in voice engine for the selected voice, loading it (once) if needed. */
  function piperEngine() {
    const id = state.settings.voice.slice(PIPER_PREFIX.length);
    if (state.piper && state.piper.id === id) return state.piper.promise;
    const label = (state.piperModule && state.piperModule.VOICES[id] || { label: id }).label;
    const promise = (async () => {
      const mod = state.piperModule || await import('./piper.js');
      state.piperModule = mod;
      const engine = await mod.loadVoice(id, (p) => piperStatus(p, label));
      piperStatus({ phase: 'ready' }, label);
      return engine;
    })().catch((e) => { state.piper = null; throw e; });
    state.piper = { id, promise };
    return promise;
  }
  async function piperSpeak(text, rate, token) {
    const engine = await piperEngine();
    if (token !== state.playToken) return;
    setPlayStatus('…');
    const key = `${text}\u0000${rate}`;
    if (!state.synthCache.has(key)) {
      const { samples, sampleRate } = await engine.synthesize(text, { lengthScale: 1 / rate });
      const buf = audioContext().createBuffer(1, samples.length, sampleRate);
      buf.copyToChannel(samples, 0);
      if (state.synthCache.size > 40) state.synthCache.delete(state.synthCache.keys().next().value);
      state.synthCache.set(key, buf);
    }
    if (token !== state.playToken) return;
    setPlayStatus('');
    playSequence([state.synthCache.get(key)], {}, token);
  }
  function utter(text, rate) {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'cs-CZ';
    const v = currentVoice();
    if (v) u.voice = v;
    u.rate = rate;
    return u;
  }
  function speak(text, rate = state.settings.rate) {
    stopAudio();
    if (usingPiper()) {
      const token = state.playToken;
      piperSpeak(text, rate, token).catch((e) => {
        if (token !== state.playToken) return;
        setPlayStatus(`Built-in voice failed (${e.message}).${czechVoices().length ? ' Using the device voice.' : ''}`);
        if (czechVoices().length) speechSynthesis.speak(utter(text, rate));
      });
      return;
    }
    if (!('speechSynthesis' in window)) return;
    speechSynthesis.speak(utter(text, rate));
  }
  function speakSpelling(word, rate = state.settings.rate, slow = false) {
    const files = clipsUsable() ? spellingClips(word) : null;
    if (files) { playClips(files, { gap: slow ? 0.9 : 0.35, rate }, () => speakSpellingWithVoice(word, rate)); return; }
    speakSpellingWithVoice(word, rate);
  }
  function speakSpellingWithVoice(word, rate) {
    if (usingPiper()) { speak(`${spellingUnits(word).map((u) => letterName(u)).join(', ')}.`, rate); return; }
    if (!('speechSynthesis' in window)) return;
    stopAudio();
    for (const unit of spellingUnits(word)) {
      speechSynthesis.speak(utter(letterName(unit), rate * 0.9));
    }
  }
  function speakNumber(it, rate, slow = false) {
    const files = clipsUsable() ? numberClips(it.units) : null;
    if (files) playClips(files, { gap: slow ? 0.5 : 0.1, rate }, () => speak(it.say, rate));
    else speak(it.say, rate);
  }
  function playRecording(entry, onFail) {
    const a = new Audio(commonsMp3(entry.a, entry.h));
    state.audio = a;
    a.onerror = onFail;
    a.play().catch(onFail);
  }
  function playCurrent(slow = false) {
    const it = state.current;
    if (!it) return;
    const rate = slow ? state.settings.rate * 0.65 : state.settings.rate;
    if (it.kind === 'spell') { speakSpelling(it.text, rate, slow); return; }
    if (it.kind === 'number') { speakNumber(it, rate, slow); return; }
    if (it.kind === 'word' && state.settings.preferRecordings && navigator.onLine && it.entry && it.entry.a && !slow) {
      stopAudio();
      playRecording(it.entry, () => speak(it.text, rate));
      return;
    }
    speak(it.text, rate);
  }

  /* --- item selection --- */
  function wordPool() {
    const s = state.settings;
    return state.words.filter((e) => s.pos.includes(e.p) && s.bands.includes(band(e.r)) && e.w.length >= s.minLen);
  }
  function statKey(it) { return `${it.kind}:${it.text}`; }
  function missedItems(kind) {
    return Object.entries(state.stats)
      .filter(([k, v]) => k.startsWith(`${kind}:`) && v.ok < v.seen)
      .map(([k]) => k.slice(kind.length + 1));
  }
  function listEntries() {
    return state.list.map((l) => ({ w: l.w, g: l.g || '', p: l.p, a: l.a, h: l.h, r: l.r || 0 }));
  }
  function nextItem() {
    const mode = $('#mode').value, source = $('#source').value;
    if (mode === 'number') return makeNumberItem(state.settings.numberKinds);
    if (mode === 'sentence') {
      let pool = state.sentences;
      if (source === 'missed') {
        const missed = new Set(missedItems('sentence'));
        pool = state.sentences.filter((s) => missed.has(s.cs));
      }
      if (!pool.length) return null;
      const s = choice(pool);
      return { kind: 'sentence', text: s.cs, gloss: s.en, tatoeba: s.id };
    }
    const kind = mode === 'spell' ? 'spell' : 'word';
    let pool;
    if (source === 'list') pool = listEntries();
    else if (source === 'missed') {
      const missed = new Set(missedItems(kind));
      pool = state.words.concat(listEntries()).filter((e) => missed.has(e.w));
    } else {
      pool = wordPool();
      // Bias towards words previously missed, a quarter of the time.
      const missed = new Set(missedItems(kind));
      const due = pool.filter((e) => missed.has(e.w));
      if (due.length && Math.random() < 0.25) pool = due;
    }
    if (!pool.length) return null;
    const e = choice(pool);
    return { kind, text: e.w, gloss: e.g, entry: e };
  }

  /* --- UI --- */
  /** Link back to the source of a sentence (Tatoeba) or recording (Commons), for attribution. */
  function attributionLink(it) {
    let href = null, label = null;
    if (it.kind === 'sentence' && it.tatoeba) { href = `https://tatoeba.org/sentences/show/${it.tatoeba}`; label = `Tatoeba #${it.tatoeba}`; }
    else if (it.entry && it.entry.a) { href = `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(it.entry.a)}`; label = 'recording on Commons'; }
    if (!href) return null;
    const a = document.createElement('a');
    a.href = href; a.target = '_blank'; a.rel = 'noopener'; a.textContent = label;
    return a;
  }
  function showItem(it) {
    state.current = it;
    state.answered = false;
    $('#answer').value = '';
    $('#result').hidden = true;
    $('#next').hidden = true;
    $('#check').hidden = false;
    $('#skip').hidden = false;
    if (!it) {
      $('#hint').textContent = 'Nothing to practise with these settings. Add words to your list or widen the filters.';
      $('#play').disabled = true;
      return;
    }
    $('#play').disabled = false;
    const hints = [];
    if (it.kind === 'number') hints.push(it.hint);
    if (it.entry && it.entry.p) hints.push(POS_NAMES[it.entry.p] || it.entry.p);
    if (it.kind === 'spell' || it.kind === 'word') hints.push(`${Array.from(it.text).length} letters`);
    $('#hint').textContent = hints.join(' · ');
    $('#answer').focus();
    if (state.settings.autoPlay) playCurrent();
  }
  function renderDiff(expected, given) {
    const box = $('#diff');
    box.innerHTML = '';
    const line = document.createElement('div');
    for (const { op, ch } of charDiff(expected, given)) {
      const span = document.createElement('span');
      span.textContent = ch;
      if (op !== 'eq') span.className = op;
      line.appendChild(span);
    }
    box.appendChild(line);
    const exp = document.createElement('div');
    exp.className = 'exp';
    exp.textContent = expected;
    box.appendChild(exp);
  }
  function check(skipped = false) {
    const it = state.current;
    if (!it || state.answered) return;
    state.answered = true;
    const given = $('#answer').value;
    const ok = !skipped && normalize(given, it.kind, state.settings) === normalize(it.text, it.kind, state.settings);
    const key = statKey(it);
    const st = state.stats[key] || { seen: 0, ok: 0 };
    st.seen += 1; if (ok) st.ok += 1; st.last = Date.now();
    state.stats[key] = st;
    save(KEYS.stats, state.stats);
    state.session.seen += 1; if (ok) state.session.ok += 1;

    const v = $('#verdict');
    v.textContent = ok ? '✓ Correct' : (skipped ? 'Skipped' : '✗ Not quite');
    v.className = ok ? 'ok' : 'bad';
    if (ok || !given.trim()) { $('#diff').textContent = it.text; } else renderDiff(it.text, given);
    const parts = [];
    if (it.gloss) parts.push(it.gloss);
    if (it.entry && it.entry.i) parts.push(it.entry.i);
    const meaning = $('#meaning');
    meaning.textContent = parts.join('  ·  ');
    const link = attributionLink(it);
    if (link) { meaning.append(parts.length ? '  ·  ' : '', link); }
    $('#add-current').hidden = it.kind === 'number';
    $('#result').hidden = false;
    $('#check').hidden = true;
    $('#skip').hidden = true;
    $('#next').hidden = false;
    $('#next').focus();
    renderStats();
  }
  function renderStats() {
    const all = Object.values(state.stats);
    const seen = all.reduce((n, s) => n + s.seen, 0), ok = all.reduce((n, s) => n + s.ok, 0);
    $('#stats').textContent = `Session ${state.session.ok}/${state.session.seen} · all time ${ok}/${seen} · ${wordPool().length} words in current sample`;
  }

  /* --- my list --- */
  function findEntry(word) {
    const w = word.trim().toLowerCase();
    return state.words.find((e) => e.w === w) || null;
  }
  function addToList(word, gloss) {
    const w = word.trim();
    if (!w) return;
    if (state.list.some((l) => l.w.toLowerCase() === w.toLowerCase())) return;
    const e = findEntry(w);
    const item = { w: e ? e.w : w, g: gloss || (e && e.g) || '', added: Date.now() };
    if (e) { item.p = e.p; item.r = e.r; if (e.a) { item.a = e.a; item.h = e.h; } }
    state.list.unshift(item);
    save(KEYS.list, state.list);
    renderList();
  }
  function renderList() {
    const ul = $('#my-list');
    ul.innerHTML = '';
    for (const l of state.list) {
      const li = document.createElement('li');
      const w = document.createElement('span'); w.className = 'w'; w.textContent = l.w;
      const g = document.createElement('span'); g.className = 'g'; g.textContent = l.g || '';
      const hear = document.createElement('button'); hear.textContent = '🔊';
      hear.onclick = () => speak(l.w);
      const del = document.createElement('button'); del.textContent = '✕';
      del.onclick = () => { state.list = state.list.filter((x) => x !== l); save(KEYS.list, state.list); renderList(); };
      li.append(w, g, hear, del);
      ul.appendChild(li);
    }
    if (!state.list.length) { const li = document.createElement('li'); li.className = 'muted'; li.textContent = 'Your list is empty.'; ul.appendChild(li); }
  }

  /* --- settings --- */
  function checkedValues(sel) { return Array.from(document.querySelectorAll(`${sel} input:checked`)).map((i) => i.value); }
  function setChecked(sel, values) { document.querySelectorAll(`${sel} input`).forEach((i) => { i.checked = values.map(String).includes(i.value); }); }
  function renderVoices() {
    const sel = $('#voice');
    sel.innerHTML = '';
    const cz = czechVoices();
    for (const v of cz) {
      const o = document.createElement('option');
      o.value = v.voiceURI; o.textContent = `${v.name} (${v.lang})${v.localService ? '' : ' · online'}`;
      sel.appendChild(o);
    }
    const builtIn = document.createElement('optgroup');
    builtIn.label = 'Built-in voice (downloads about 95 MB once, then works offline)';
    const piperVoices = state.piperModule ? state.piperModule.VOICES : {};
    for (const [id, v] of Object.entries(piperVoices)) {
      const o = document.createElement('option');
      o.value = PIPER_PREFIX + id; o.textContent = `${v.label} · Piper`;
      builtIn.appendChild(o);
    }
    sel.appendChild(builtIn);
    const chosen = currentVoice();
    if (usingPiper() && piperVoices[state.settings.voice.slice(PIPER_PREFIX.length)]) sel.value = state.settings.voice;
    else if (chosen) sel.value = chosen.voiceURI;
    const warn = $('#voice-warning');
    const builtInHint = ' Or choose the built-in voice under Settings › Czech voice.';
    let msg = '';
    if (usingPiper()) msg = '';
    else if (!('speechSynthesis' in window)) msg = `This browser has no speech synthesis.${builtInHint}`;
    else if (!cz.length && state.voices.length) msg = `No Czech voice is installed. Android: Settings › System › Languages › Text-to-speech › install Czech. iOS: Settings › Accessibility › Spoken Content › Voices › Czech.${builtInHint}`;
    else if (!cz.length && state.voicesSettled) msg = `This browser reports no speech voices at all.${builtInHint}`;
    warn.textContent = msg;
    warn.hidden = !msg;
  }
  function applySettingsToForm() {
    const s = state.settings;
    $('#rate').value = s.rate; $('#rate-val').textContent = `${s.rate}×`;
    $('#use-clips').checked = s.useClips;
    $('#prefer-recordings').checked = s.preferRecordings;
    $('#auto-play').checked = s.autoPlay;
    setChecked('#pos-filter', s.pos); setChecked('#band-filter', s.bands); setChecked('#number-kinds', s.numberKinds);
    $('#min-len').value = s.minLen;
    $('#case-sensitive').checked = s.caseSensitive;
    $('#punct-sensitive').checked = s.punctSensitive;
  }
  function readSettingsFromForm() {
    const s = state.settings;
    s.voice = $('#voice').value;
    s.rate = parseFloat($('#rate').value); $('#rate-val').textContent = `${s.rate}×`;
    s.useClips = $('#use-clips').checked;
    s.preferRecordings = $('#prefer-recordings').checked;
    s.autoPlay = $('#auto-play').checked;
    s.pos = checkedValues('#pos-filter');
    s.bands = checkedValues('#band-filter').map(Number);
    s.numberKinds = checkedValues('#number-kinds');
    s.minLen = Math.max(1, parseInt($('#min-len').value, 10) || 1);
    s.caseSensitive = $('#case-sensitive').checked;
    s.punctSensitive = $('#punct-sensitive').checked;
    save(KEYS.settings, s);
    renderStats();
  }

  /* --- wiring --- */
  function wire() {
    document.querySelectorAll('#tabs button').forEach((b) => {
      b.onclick = () => {
        document.querySelectorAll('#tabs button').forEach((x) => x.classList.toggle('active', x === b));
        document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.id === `tab-${b.dataset.tab}`));
        stopAudio();
      };
    });
    $('#mode').onchange = () => showItem(nextItem());
    $('#source').onchange = () => showItem(nextItem());
    $('#play').onclick = () => playCurrent(false);
    $('#play-slow').onclick = () => playCurrent(true);
    $('#answer-form').onsubmit = (ev) => { ev.preventDefault(); if (state.answered) showItem(nextItem()); else check(false); };
    $('#skip').onclick = () => check(true);
    $('#next').onclick = () => showItem(nextItem());
    $('#say-word').onclick = () => { const it = state.current; if (!it) return; if (it.kind === 'number') speakNumber(it, state.settings.rate); else speak(it.text); };
    $('#add-current').onclick = () => { const it = state.current; if (it) addToList(it.text, it.gloss); $('#add-current').textContent = '✓ Added'; setTimeout(() => { $('#add-current').textContent = '＋ Add to my list'; }, 1200); };

    $('#add-form').onsubmit = (ev) => { ev.preventDefault(); addToList($('#add-word').value, $('#add-gloss').value.trim()); $('#add-word').value = ''; $('#add-gloss').value = ''; $('#add-word').focus(); };
    $('#export-list').onclick = () => {
      const blob = new Blob([JSON.stringify(state.list, null, 1)], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'diktator-list.json'; a.click();
    };
    $('#import-list').onclick = () => $('#import-file').click();
    $('#import-file').onchange = async (ev) => {
      const f = ev.target.files[0]; if (!f) return;
      try { for (const l of JSON.parse(await f.text())) if (l && l.w) addToList(l.w, l.g); } catch { alert('Could not read that file.'); }
      ev.target.value = '';
    };

    document.querySelectorAll('#tab-settings input, #tab-settings select').forEach((el) => { el.onchange = readSettingsFromForm; });
    $('#voice').onchange = () => {
      readSettingsFromForm();
      renderVoices();
      if (!usingPiper()) { $('#voice-status').hidden = true; return; }
      piperEngine().catch((e) => { const el = $('#voice-status'); el.textContent = `Could not load the built-in voice: ${e.message}`; el.hidden = false; });
    };
    $('#rate').oninput = readSettingsFromForm;
    $('#test-voice').onclick = () => speak('Dobrý den. Toto je zkouška hlasu.');
    $('#reset-stats').onclick = () => { if (confirm('Delete all progress statistics?')) { state.stats = {}; save(KEYS.stats, state.stats); state.session = { seen: 0, ok: 0 }; renderStats(); } };

    if ('speechSynthesis' in window) {
      const loadVoices = () => { state.voices = speechSynthesis.getVoices(); renderVoices(); };
      loadVoices();
      speechSynthesis.onvoiceschanged = loadVoices;
      setTimeout(() => { state.voicesSettled = true; loadVoices(); }, 1500);
    } else renderVoices();
  }

  async function loadData() {
    const [w, s] = await Promise.all([fetch('data/words.json'), fetch('data/sentences.json')]);
    const wd = await w.json(), sd = await s.json();
    state.words = wd.words; state.sentences = sd.sentences;
    $('#build').textContent = `Build ${BUILD} · ${wd.meta.count} words · ${sd.meta.count} sentences`;
  }
  /** Optional extras: the clip manifest and the built-in voice list. Failure just disables them. */
  async function loadExtras() {
    await Promise.all([
      fetch('audio/manifest.json').then((r) => (r.ok ? r.json() : null)).then((m) => { state.clips = m; return warmClipCache(); }).catch(() => {}),
      import('./piper.js').then((m) => { state.piperModule = m; renderVoices(); }).catch(() => {}),
    ]);
  }

  async function main() {
    wire();
    applySettingsToForm();
    loadExtras();
    renderList();
    $('#alphabet').textContent = Object.entries(LETTER_NAMES).filter(([k]) => k.trim() && k !== '-' && k !== "'").map(([k, v]) => `${k} = ${Array.isArray(v) ? v.join(' / ') : v}`).join(', ');
    try { await loadData(); } catch (e) { $('#hint').textContent = `Could not load data: ${e.message}`; return; }
    renderStats();
    // Do not auto-play before the first user gesture: browsers block it.
    const s = state.settings.autoPlay; state.settings.autoPlay = false;
    showItem(nextItem());
    state.settings.autoPlay = s;
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
      let reloaded = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => { if (!reloaded) { reloaded = true; location.reload(); } });
    }
  }
  main();
}
