# Diktátor: research notes (2026-10-27)

Goal: phone app (Android + iOS) for Czech dictation practice. Modes: (1) numbers
and dates, (2) spelling (letters read out), (3) dictation of words / short
sentences, (4) preposition + nominative -> inflected form, (5) verb + subject +
tense/aspect -> conjugated form. Start with (2) and (3).

## Existing free apps

Nothing found that does listen-and-type dictation for Czech learners.

| Candidate | What it is | Why it does not fit |
|---|---|---|
| Diktáty, Diktáty SK (Google Play) | Slovak school dictations | Slovak, not Czech; multiple choice |
| Umíme česky (umimecesky.cz) | Czech school practice site with audio dictations | For native schoolchildren; whole-passage dictation only; site blocks automated fetch so not re-verified |
| Clozemaster (Czech) | Fill-the-blank listening | Text appears within a second; typed dictation was only a forum feature request |
| Liberation Philology Czech (iOS, paid) | Declension/conjugation drills | Multiple choice, no audio |
| Emme Czech (iOS) | Handwriting + dictation of letters/numbers | Beginner alphabet focus |
| Duolingo Czech | Some type-what-you-hear exercises | No control over word list, no spelling mode |

Conclusion: build it.

## Data sources

### Vocabulary
- NTU-MC Czech WordNet, local copy: /home/bond/git/NTUMC/build/wn-ntumc-ces.xml
  (WN-LMF 1.4, CC BY 4.0). 34,542 lexical entries; lemma POS: 25,093 n, 6,772 v,
  2,250 a, 405 r. About a third are multiword. No pronunciation, no forms,
  almost no examples. Good for random word sampling by POS; link to omw-en for
  English glosses.
- English Wiktionary via kaikki.org (wiktextract): 72,441 entries (68,786
  single-word; 35k nouns, 12.7k verbs, 11.3k adjectives, 10k proper names),
  71k with IPA, 8.7k with Commons audio, 47.7k with inflection forms.
  download kaikki.org-dictionary-Czech.jsonl (235 MB), dump 2026-10-01.
  Per entry: IPA, Commons audio filenames with ogg/mp3 URLs, full "forms"
  array with case/number tags (e.g. domu = genitive singular), hyphenation.
  This covers modes 2-4 for free. Czech Wiktionary own dump exists at
  dumps.wikimedia.org/cswiktionary/ (latest 20261001) but wiktextract does not
  parse the cs edition, so kaikki/enwiktionary is the practical choice.
- DBnary (kaiko.getalp.org, Ontolex RDF): added the Czech Wiktionary edition in
  June 2025 as its 27th edition. The only machine-readable route to the cs
  edition (Czech-language definitions; morphology if the cs extractor emits
  it). Not needed for modes 2-3; evaluate for modes 4-5 alongside enwiktionary
  forms and MorfFlex. Site was slow/unreachable on 2026-10-27, so dump
  contents not yet inspected.
- Frequency: hermitdave/FrequencyWords cs_50k.txt (OpenSubtitles 2018,
  CC BY-SA 4.0); or Python `wordfreq` (MIT, has cs). Use to grade words
  common -> rare.
- MorfFlex CZ 2.1 (ÚFAL): 127M lemma-tag-form triples, CC BY-NC-SA 4.0.
  Fallback for modes 4-5 if Wiktionary forms are incomplete. NC license is fine
  for personal use.

### Pronunciation
- Phone built-in TTS (Google TTS on Android, Apple Zuzana/Iveta on iOS) via the
  Web Speech API or a native TTS plugin. Works offline once the Czech voice is
  installed. Best option for arbitrary words, numbers, sentences, and
  letter-by-letter spelling. Needs on-device verification of cs-CZ voices.
- Recorded human audio: Wikimedia Commons Category:Czech pronunciation
  (3,220 files) + Lingua Libre pronunciation-ces (6,565 wav files), CC BY-SA.
  Filenames carry the word (LL-Q9056 (ces)-<user>-<word>.wav). Use as
  preferred audio when a recording exists, TTS otherwise.
- Piper TTS (MIT): cs_CZ voices jirka (low, medium) and kasandra (medium) in
  rhasspy/piper-voices. Option for pre-generating audio server-side or on
  desktop if device TTS is poor.
- Tatoeba Czech (CC BY 2.0 FR): 90k sentences, 72k linked to English. Source
  for short-sentence dictation.
- Common Voice Czech (CC0, 269 h): full sentences only, no re-hosting; not
  useful for word-level work.

## Recommended stack

Progressive Web App (PWA): a single static site, installable on both Android
and iOS home screens, no app-store accounts or fees, offline via service
worker. Uses speechSynthesis for audio, IndexedDB/localStorage for the
personal word list and progress. Data built offline with a Python (uv)
pipeline: WordNet + kaikki + frequency -> compact JSON word packs.

Alternative if store distribution matters later: wrap the same web app with
Capacitor, or rewrite in Flutter (flutter_tts has Czech).

Toolchain on this machine: uv 0.5.9, node 18.19.1; no flutter.
