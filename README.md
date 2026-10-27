# Diktátor

A small offline-capable web app (PWA) for practising Czech dictation on a phone.
Open it in the browser, choose “Add to Home Screen”, and it behaves like an app
on both Android and iOS. Speech comes from the phone's own Czech
text-to-speech voice, so nothing is sent anywhere.

## Modes

| Mode | What happens |
|---|---|
| Spelling | The word is spelled out letter by letter with Czech letter names (dé, ú s kroužkem, em …); you type the word. |
| Dictation: words | A word is said; you type it. Optionally plays a human recording from Wikimedia Commons when one exists. |
| Dictation: sentences | A short Tatoeba sentence is said; you type it. |
| Numbers and dates | Numbers, years, dates and times are said; you type them in digits. |

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
pipeline/       data build scripts (Python, run with uv) and JS unit tests
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

## Running locally

```sh
cd app && python3 -m http.server 8765
```

Then open http://localhost:8765/ (or your machine's LAN address from a phone).
Unit tests for the pure helpers: `node pipeline/test_app.js`.

## Deploying

Pushing to `main` runs `.github/workflows/pages.yml`, which stamps the service
worker with the commit id and publishes `app/` to GitHub Pages. In the
repository settings, set Pages → Source to “GitHub Actions” once.

## Data and licences

| Source | Used for | Licence |
|---|---|---|
| [NTU-MC Czech WordNet](https://bond-lab.github.io/NTUMC/) | word pool, parts of speech | CC BY 4.0 |
| English Wiktionary via [kaikki.org](https://kaikki.org/dictionary/Czech/) (wiktextract) | glosses, IPA, audio file names | CC BY-SA 3.0 |
| [Open Multilingual Wordnet](https://omwn.org/) omw-en | glosses for WordNet-only words | WordNet licence |
| [FrequencyWords](https://github.com/hermitdave/FrequencyWords) (OpenSubtitles 2018) | frequency bands | CC BY-SA 4.0 |
| [Tatoeba](https://tatoeba.org/) | sentences with English translations | CC BY 2.0 FR |
| [Wikimedia Commons](https://commons.wikimedia.org/wiki/Category:Czech_pronunciation) and [Lingua Libre](https://lingualibre.org/) | human recordings, streamed on demand | CC BY-SA (per file) |

Code: MIT.
