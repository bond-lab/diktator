"""Build app/data/sentences.json from Tatoeba per-language exports.

Usage:
    uv run pipeline/build_sentences.py CES_SENTENCES.tsv.bz2 CES_ENG_LINKS.tsv.bz2 \
        ENG_SENTENCES.tsv.bz2 OUT_JSON [MAX]

Keeps short, plain Czech sentences that have an English translation.
Each output entry: {"cs": ..., "en": ..., "id": tatoeba_id}.
"""

from __future__ import annotations

import bz2
import json
import random
import re
import sys
from pathlib import Path

ALLOWED = re.compile(r"^[A-Za-zÁ-žŘřŠšŽžĎďŤťŇňĚěŮůÚúÝýČčÍíÉéÓóÁá0-9 ,.!?'\-]+$")
MIN_WORDS, MAX_WORDS, MAX_CHARS = 3, 9, 60
TOM_SHARE = 0.25


def read_tsv(path: Path):
    """Yield tab-split rows from a bz2 TSV."""
    with bz2.open(path, "rt", encoding="utf-8") as fh:
        for line in fh:
            yield line.rstrip("\n").split("\t")


def main(argv: list[str]) -> None:
    """Select sentences and write the pack."""
    ces_path, links_path, eng_path, out_path = (Path(a) for a in argv[1:5])
    limit = int(argv[5]) if len(argv) > 5 else 4000

    ces = {}
    for sid, _lang, text in read_tsv(ces_path):
        words = text.split()
        if not (MIN_WORDS <= len(words) <= MAX_WORDS) or len(text) > MAX_CHARS:
            continue
        if not ALLOWED.match(text) or '"' in text:
            continue
        ces[sid] = text

    links: dict[str, str] = {}
    for cs_id, en_id in read_tsv(links_path):
        if cs_id in ces and cs_id not in links:
            links[cs_id] = en_id
    needed = set(links.values())
    eng = {sid: text for sid, _lang, text in read_tsv(eng_path) if sid in needed}

    rows = [
        {"id": int(cs_id), "cs": ces[cs_id], "en": eng[en_id]}
        for cs_id, en_id in links.items()
        if en_id in eng
    ]
    rng = random.Random(2026)
    rng.shuffle(rows)
    tom = [r for r in rows if "Tom" in r["cs"] or "Mary" in r["cs"] or "Marie" in r["cs"]]
    other = [r for r in rows if r not in tom]
    n_tom = min(len(tom), int(limit * TOM_SHARE))
    chosen = other[: limit - n_tom] + tom[:n_tom]
    rng.shuffle(chosen)
    # Dedupe by lowercase Czech text.
    seen, out = set(), []
    for r in chosen:
        k = r["cs"].lower()
        if k not in seen:
            seen.add(k)
            out.append(r)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w", encoding="utf-8") as fh:
        json.dump(
            {"meta": {"count": len(out), "source": "Tatoeba (CC BY 2.0 FR)"}, "sentences": out},
            fh,
            ensure_ascii=False,
            separators=(",", ":"),
        )
    print(f"candidates {len(rows)}, wrote {len(out)} sentences to {out_path}", file=sys.stderr)


if __name__ == "__main__":
    main(sys.argv)
