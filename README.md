# Diktátor

A small offline-capable web app (PWA) for practising Czech dictation on a phone.
Open it in the browser, choose “Add to Home Screen”, and it behaves like an app
on both Android and iOS. Spelling and numbers are played from recorded clips
bundled with the app. Words and sentences are spoken either by the phone's own
Czech text-to-speech voice or by a built-in [Piper](https://github.com/rhasspy/piper)
voice that runs inside the browser after a one-time download, so nothing you
type is sent anywhere.

## Modes

| Mode | What happens |
|---|---|
| Spelling | The word is spelled out letter by letter with Czech letter names (dé, ú s kroužkem, em …) from recorded clips; you type the word. |
| Dictation: words | A word is said; you type it. Optionally plays a human recording from Wikimedia Commons when one exists. |
| Dictation: sentences | A short Tatoeba sentence is said; you type it. |
| Numbers and dates | Numbers, years, dates, times, phone numbers and post codes are composed from recorded number words (tisíc devět set osmdesát devět); you type them in digits. |

Source can be a random sample (filtered by part of speech, frequency band and
length), your own word list, or words you have got wrong before. Answers are
checked after normalisation (case, punctuation and spacing are configurable)
and mistakes are shown as a character diff.

Planned: preposition + nominative → inflected form; verb + subject + tense →
conjugated form (data: Wiktionary `forms`, DBnary cs edition, MorfFlex CZ).

## Layout

```
app/            the PWA (static files; this folder is what gets deployed)
  data/         word and sentence packs built by the pipeline
  audio/        letter-name and number-word clips (MP3) and their manifest
  piper.js      the built-in voice: Piper via ONNX Runtime Web + piper-phonemize wasm
pipeline/       data build scripts (Python, run with uv) and JS unit tests
tests/          pytest tests for the pipeline
RESEARCH.md     survey of existing apps and data sources
```

## Building the data

```sh
pipeline/fetch.sh raw                  # ~270 MB of downloads into ./raw
uv run pipeline/build_words.py /path/to/wn-ntumc-ces.xml \
    raw/kaikki/kaikki-cs.jsonl raw/freq/cs_50k.txt app/data/words.json
uv run pipeline/build_sentences.py raw/tatoeba/ces_sentences.tsv.bz2 \
    raw/tatoeba/ces-eng_links.tsv.bz2 raw/tatoeba/eng_sentences.tsv.bz2 \
    app/data/sentences.json 4000
```

`build_words.py` needs the `omw-en:2.0` lexicon in your local `wn` database
for the glosses of WordNet-only words (`python -m wn download omw-en:2.0`).

The spelling and number clips are synthesised with Piper (needs `ffmpeg`):

```sh
uv run --group audio python -m piper.download_voices cs_CZ-jirka-medium --data-dir raw/piper
uv run --group audio pipeline/build_audio.py raw/piper/cs_CZ-jirka-medium.onnx app/audio
```

The script reads the letter names and number words from `app/app.js`, so the
clips always match what the app can ask for. Human recordings can replace the
synthesised ones: `build_audio.py --prompts` prints a numbered sheet of the 220
things to read (letter names once, number words once with a comma and once with
a full stop, for mid-phrase and final intonation); record them as
`<id>.wav` (or mp3/ogg/flac/m4a) in a folder and pass it as a third argument.
Anything not recorded falls back to Piper.

Recordings of the *words* are best contributed through
[Lingua Libre](https://lingualibre.org/), which uploads them to Wikimedia
Commons where the app already looks for pronunciations.

## Running locally

```sh
cd app && python3 -m http.server 8765
```

Then open http://localhost:8765/ (or your machine's LAN address from a phone).
Unit tests for the pure helpers: `node pipeline/test_app.js`; pipeline tests:
`uv run --group test pytest`.

### The built-in voice

Choosing “Jirka” or “Kasandra · Piper” under Settings › Czech voice downloads
ONNX Runtime Web and piper-phonemize from jsdelivr (pinned versions) and the
voice model (63 MB) from Hugging Face, about 95 MB in all. The service worker
keeps them in a cache that survives app updates, so it then works offline.
Synthesis takes well under a second per sentence on a laptop and a few seconds
on a phone.

## Deploying

The app is published at https://bond-lab.github.io/diktator/. Pushing to
`main` runs `.github/workflows/pages.yml`, which stamps the service worker
with the commit id and publishes `app/` to GitHub Pages.

## Licences

The code in this repository is released under the MIT licence (see `LICENSE`).

The data packs in `app/data/` are derived works and are released under
[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/), because they
combine content from share-alike sources (see `app/data/LICENSE.md`). The app
itself links each Tatoeba sentence and each Wikimedia Commons recording back
to its source page.

The clips in `app/audio/` were synthesised with Piper's jirka voice, whose
training data is CC0; the clips themselves are released under CC0 as well.

## Acknowledgements

Diktátor would not exist without these freely licensed resources:

- **NTU-MC Czech WordNet** (CC BY 4.0), https://bond-lab.github.io/NTUMC/.
  Francis Bond, Shan Wang, Eshley Huini Gao, Hazel Shuwen Mok and Jeanette
  Yiwen Tan (2013). Developing parallel sense-tagged corpora with wordnets.
  *Proceedings of the 7th Linguistic Annotation Workshop and Interoperability
  with Discourse (LAW 2013)*, pp. 149–158. It is based on **Czech WordNet
  2.1** from the NLP Centre, Faculty of Informatics, Masaryk University,
  released under a WordNet-style open licence
  (https://deb.fi.muni.cz/wnlicense.php). Adam Rambousek, Aleš Horák and
  Karel Pala (2018). Sustainable long-term WordNet development and
  maintenance: Case study of the Czech WordNet. *Cognitive Studies | Études
  cognitives* 18. https://doi.org/10.11649/cs.1715
- **English Wiktionary** (CC BY-SA 4.0, text also under GFDL),
  https://en.wiktionary.org/, written by its volunteer contributors, as
  extracted by **Wiktextract** and distributed at https://kaikki.org/.
  Tatu Ylonen (2022). Wiktextract: Wiktionary as Machine-Readable Structured
  Data. *Proceedings of the 13th Conference on Language Resources and
  Evaluation (LREC 2022)*, pp. 1317–1325.
- **Open Multilingual Wordnet**, English wordnet omw-en 2.0 (WordNet 3.0
  licence), https://omwn.org/ and https://github.com/omwn/omw-data.
  Francis Bond and Ryan Foster (2013). Linking and extending an open
  multilingual wordnet. *Proceedings of the 51st Annual Meeting of the
  Association for Computational Linguistics (ACL 2013)*, pp. 1352–1362.
  Based on **Princeton WordNet 3.0**: Christiane Fellbaum (ed.) (1998).
  *WordNet: An Electronic Lexical Database*. MIT Press, Cambridge, MA.
- **FrequencyWords** by Hermit Dave (CC BY-SA 4.0),
  https://github.com/hermitdave/FrequencyWords, computed from the
  OpenSubtitles2018 corpus in OPUS. Pierre Lison and Jörg Tiedemann (2016).
  OpenSubtitles2016: Extracting Large Parallel Corpora from Movie and TV
  Subtitles. *Proceedings of LREC 2016*, pp. 923–929.
- **Tatoeba** (CC BY 2.0 FR), https://tatoeba.org/, sentences and
  translations contributed by its members. Each sentence in the app links to
  its Tatoeba page, which names the contributors.
- **Wikimedia Commons** pronunciation recordings
  (https://commons.wikimedia.org/wiki/Category:Czech_pronunciation),
  including those made with **Lingua Libre** (https://lingualibre.org/,
  CC BY-SA 4.0). Recordings are streamed from Commons and each one links to its
  file page, which gives the author and licence.
- **Piper** text-to-speech (MIT), https://github.com/rhasspy/piper, by Michael
  Hansen and the Rhasspy project, with the Czech voices **jirka** (training
  data CC0, https://github.com/OHF-Voice/voice-datasets) and **kasandra**
  (recordings by Ondřej Šimek, CC BY 4.0) from
  https://huggingface.co/rhasspy/piper-voices. The letter and number clips in
  `app/audio/` were synthesised with jirka. In the browser the voice runs on
  **ONNX Runtime Web** (MIT, https://onnxruntime.ai/) and **piper-phonemize** /
  **espeak-ng** (GPL-3.0) compiled to WebAssembly by Diffusion Studio
  (https://github.com/diffusion-studio/vits-web), both loaded from jsdelivr.
- Device speech synthesis, when chosen instead, is provided by the user's own
  phone or computer (Google Text-to-speech, Apple voices, Microsoft voices).