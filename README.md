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

## Acknowledgements

Diktátor would not exist without these freely licensed resources:

- **NTU-MC Czech WordNet** (CC BY 4.0), https://bond-lab.github.io/NTUMC/.
  Francis Bond, Shan Wang, Eshley Huini Gao, Hazel Shuwen Mok and Jeanette
  Yiwen Tan (2013). Developing parallel sense-tagged corpora with wordnets.
  *Proceedings of the 7th Linguistic Annotation Workshop and Interoperability
  with Discourse (LAW 2013)*, pp. 149–158.
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
  Based on Princeton WordNet 3.0: George A. Miller (1995). WordNet: A lexical
  database for English. *Communications of the ACM* 38(11), 39–41.
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
- Speech synthesis is provided by the user's own device (Google
  Text-to-speech on Android, Apple voices on iOS).
