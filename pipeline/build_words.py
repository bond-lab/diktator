"""Build app/data/words.json from the Czech WordNet, the kaikki Wiktionary extract
and an OpenSubtitles frequency list.

Usage:
    uv run pipeline/build_words.py WORDNET_XML KAIKKI_JSONL FREQ_TXT OUT_JSON

Each output entry is a compact object:
    w   written form
    p   part of speech: n v a r m (noun verb adjective adverb numeral)
    g   short English gloss
    i   IPA (optional)
    a   Wikimedia Commons audio filename, spaces as underscores (optional)
    h   first two hex digits of the MD5 of that filename (Commons path) (optional)
    r   OpenSubtitles frequency rank, 0 if unranked
    s   source flags: W (WordNet), K (Wiktionary)
"""

from __future__ import annotations

import hashlib
import json
import re
import sys
import xml.etree.ElementTree as ET
from collections import defaultdict
from pathlib import Path

KAIKKI_POS = {"noun": "n", "verb": "v", "adj": "a", "adv": "r", "num": "m"}
WN_POS = {"n": "n", "v": "v", "a": "a", "r": "r"}
WORD_RE = re.compile(r"^[a-záčďéěíňóřšťúůýžĺľ]+$")
MAX_GLOSS = 80


def load_freq(path: Path) -> dict[str, int]:
    """Return word -> rank (1-based) from a 'word count' per line file."""
    ranks: dict[str, int] = {}
    with path.open(encoding="utf-8") as fh:
        for rank, line in enumerate(fh, start=1):
            word = line.split(" ", 1)[0].strip().lower()
            ranks.setdefault(word, rank)
    return ranks


def short_gloss(glosses: list[str]) -> str:
    """Join glosses into one short string."""
    text = "; ".join(g.strip() for g in glosses if g.strip())
    if len(text) > MAX_GLOSS:
        text = text[: MAX_GLOSS - 1].rstrip(" ;,") + "…"
    return text


def pick_audio(sounds: list[dict]) -> tuple[str, str] | None:
    """Prefer Wiktionary-standard Cs-*.ogg recordings, then Lingua Libre."""
    names = [s["audio"] for s in sounds if "audio" in s]
    names.sort(key=lambda n: (0 if n.startswith("Cs-") else 1, len(n)))
    if not names:
        return None
    name = names[0].replace(" ", "_")
    digest = hashlib.md5(name.encode("utf-8")).hexdigest()
    return name, digest[:2]


def load_kaikki(path: Path) -> dict[tuple[str, str], dict]:
    """Return (word, pos) -> entry fields for lemma entries only."""
    entries: dict[tuple[str, str], dict] = {}
    with path.open(encoding="utf-8") as fh:
        for line in fh:
            d = json.loads(line)
            pos = KAIKKI_POS.get(d.get("pos"))
            word = d.get("word", "")
            if pos is None or not WORD_RE.match(word):
                continue
            senses = d.get("senses", [])
            lemma_senses = [
                s
                for s in senses
                if not s.get("form_of")
                and not s.get("alt_of")
                and "form-of" not in s.get("tags", [])
            ]
            if not lemma_senses:
                continue
            glosses = [s["glosses"][0] for s in lemma_senses if s.get("glosses")][:2]
            if not glosses:
                continue
            key = (word, pos)
            if key in entries:
                continue  # keep the first etymology only
            entry = {"g": short_gloss(glosses)}
            sounds = d.get("sounds", [])
            ipa = next((s["ipa"] for s in sounds if "ipa" in s), None)
            if ipa:
                entry["i"] = ipa
            audio = pick_audio(sounds)
            if audio:
                entry["a"], entry["h"] = audio
            entries[key] = entry
    return entries


def load_wordnet(path: Path) -> dict[tuple[str, str], list[str]]:
    """Return (lemma, pos) -> list of synset ids for single-word lemmas."""
    out: dict[tuple[str, str], list[str]] = defaultdict(list)
    for _event, el in ET.iterparse(path, events=("end",)):
        if el.tag != "LexicalEntry":
            continue
        lemma = el.find("Lemma")
        word = lemma.get("writtenForm", "")
        pos = WN_POS.get(lemma.get("partOfSpeech", ""))
        if pos and WORD_RE.match(word):
            for sense in el.findall("Sense"):
                out[(word, pos)].append(sense.get("synset"))
        el.clear()
    return out


def omw_definitions(needed: set[str]) -> dict[str, str]:
    """Look up English definitions in omw-en for ntumc-cs synset ids."""
    import wn

    en = wn.Wordnet("omw-en:2.0")
    defs: dict[str, str] = {}
    for sid in needed:
        offset = sid.split("-", 2)[-1]  # e.g. 03395514-n
        try:
            ss = en.synset(f"omw-en-{offset}")
        except wn.Error:
            continue
        d = ss.definition()
        if d:
            defs[sid] = d
    return defs


def main(argv: list[str]) -> None:
    """Merge the three sources and write the word pack."""
    wn_path, kaikki_path, freq_path, out_path = (Path(a) for a in argv[1:5])
    ranks = load_freq(freq_path)
    kaikki = load_kaikki(kaikki_path)
    wordnet = load_wordnet(wn_path)
    print(f"kaikki lemmas {len(kaikki)}, wordnet lemmas {len(wordnet)}", file=sys.stderr)

    need_defs = {sid for key, sids in wordnet.items() if key not in kaikki for sid in sids}
    defs = omw_definitions(need_defs)
    print(f"omw-en definitions found for {len(defs)}/{len(need_defs)} synsets", file=sys.stderr)

    words: list[dict] = []
    for key in sorted(set(kaikki) | set(wordnet)):
        word, pos = key
        rank = ranks.get(word, 0)
        in_wn = key in wordnet
        in_k = key in kaikki
        # Keep everything in WordNet, plus Wiktionary words that are reasonably common.
        if not in_wn and not (0 < rank <= 50000):
            continue
        entry = {"w": word, "p": pos}
        if in_k:
            entry.update(kaikki[key])
        else:
            glosses = [defs[s] for s in wordnet[key] if s in defs][:2]
            if not glosses:
                continue
            entry["g"] = short_gloss(glosses)
        entry["r"] = rank
        entry["s"] = ("W" if in_wn else "") + ("K" if in_k else "")
        words.append(entry)

    words.sort(key=lambda e: (e["r"] or 10**9, e["w"]))
    meta = {
        "count": len(words),
        "license": "CC BY-SA 4.0 (derived work; see app/data/LICENSE.md)",
        "sources": [
            (
                "NTU-MC Czech WordNet, Bond et al. 2013 (CC BY 4.0), based on Czech WordNet 2.1, "
                "NLP Centre, Masaryk University, Rambousek, Horák & Pala 2018"
            ),
            "English Wiktionary via Wiktextract/kaikki.org, Ylonen 2022 (CC BY-SA 4.0)",
            (
                "Open Multilingual Wordnet omw-en 2.0, Bond & Foster 2013, based on "
                "Princeton WordNet 3.0, Fellbaum 1998 (WordNet 3.0 licence)"
            ),
            "FrequencyWords (OpenSubtitles2018), Hermit Dave (CC BY-SA 4.0)",
        ],
    }
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w", encoding="utf-8") as fh:
        json.dump({"meta": meta, "words": words}, fh, ensure_ascii=False, separators=(",", ":"))
    by_pos = defaultdict(int)
    with_audio = sum(1 for e in words if "a" in e)
    for e in words:
        by_pos[e["p"]] += 1
    print(
        f"wrote {len(words)} words to {out_path}; by pos {dict(by_pos)}; "
        f"with audio {with_audio}; size {out_path.stat().st_size // 1024} KiB",
        file=sys.stderr,
    )


if __name__ == "__main__":
    main(sys.argv)
