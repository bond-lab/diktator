#!/usr/bin/env bash
# Download the raw data the pipeline needs into RAW_DIR (default: ./raw, git-ignored).
# Usage: pipeline/fetch.sh [RAW_DIR]
set -euo pipefail
RAW="${1:-raw}"
mkdir -p "$RAW/kaikki" "$RAW/freq" "$RAW/tatoeba"
echo "kaikki (English Wiktionary, Czech entries, ~240 MB)"
curl -L -o "$RAW/kaikki/kaikki-cs.jsonl" https://kaikki.org/dictionary/Czech/kaikki.org-dictionary-Czech.jsonl
echo "OpenSubtitles 2018 frequency list"
curl -L -o "$RAW/freq/cs_50k.txt" https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/cs/cs_50k.txt
echo "Tatoeba"
for f in ces/ces_sentences.tsv.bz2 ces/ces-eng_links.tsv.bz2 eng/eng_sentences.tsv.bz2; do
  curl -L -o "$RAW/tatoeba/$(basename "$f")" "https://downloads.tatoeba.org/exports/per_language/$f"
done
echo "done: $RAW"
