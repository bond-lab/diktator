"""Record the spelling-alphabet and number-word clips with a Piper voice.

Usage:
  uv run --group audio pipeline/build_audio.py VOICE_ONNX OUT_DIR [RECORDINGS_DIR]
  uv run --group audio pipeline/build_audio.py --prompts > prompts.tsv

Reads LETTER_NAMES and NUMBER_UNITS from app/app.js (via node) so the clips always
match what the app can ask for, synthesises each with Piper, trims the silence and
writes small mono MP3s plus OUT_DIR/manifest.json mapping each spoken form to its file.
Number words are recorded twice: once mid-phrase ("dvacet,") and once phrase-final
("dvacet."), so a composed number can end with falling intonation.

Human recordings can replace the synthesised ones: `--prompts` prints a numbered
sheet of everything to read (id, text to say), and if RECORDINGS_DIR holds files named
<id>.wav (or .mp3/.ogg/.flac/.m4a) they are used instead of Piper for those prompts.
"""

from __future__ import annotations

import hashlib
import json
import subprocess
import sys
import tempfile
import unicodedata
import wave
from dataclasses import dataclass
from pathlib import Path

from piper import PiperVoice

APP_JS = Path(__file__).resolve().parent.parent / "app" / "app.js"
FFMPEG_TRIM = (
    "silenceremove=start_periods=1:start_threshold=-45dB,areverse,"
    "silenceremove=start_periods=1:start_threshold=-45dB,areverse"
)


def spoken_forms() -> tuple[list[str], list[str]]:
    """Return (letter names, number units) as defined in app.js."""
    script = (
        f"const a = require({json.dumps(str(APP_JS))});"
        "const letters = [...new Set(Object.values(a.LETTER_NAMES).flat())];"
        "console.log(JSON.stringify({letters, numbers: a.NUMBER_UNITS}));"
    )
    out = subprocess.run(["node", "-e", script], check=True, capture_output=True, text=True)
    data = json.loads(out.stdout)
    return data["letters"], data["numbers"]


def slug(text: str) -> str:
    """ASCII file stem for a spoken form, made unique with a short hash."""
    ascii_ = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    stem = "".join(c if c.isalnum() else "_" for c in ascii_).strip("_") or "x"
    digest = hashlib.sha1(text.encode()).hexdigest()[:6]
    return f"{stem}-{digest}"


def prompts(letters: list[str], numbers: list[str]) -> list[tuple[str, str, str]]:
    """Everything to record as (id, kind, text), ids stable across runs.

    Args:
        letters: Letter names from app.js
        numbers: Number words from app.js

    Returns:
        One row per clip: letters as "L<n>", number words as "N<n>m" (mid-phrase,
        read with a comma) and "N<n>f" (phrase-final, read with a full stop).
    """
    rows = [(f"L{i:02d}", "letter", f"{name}.") for i, name in enumerate(letters, 1)]
    for i, unit in enumerate(numbers, 1):
        rows.append((f"N{i:02d}m", "number", f"{unit},"))
        rows.append((f"N{i:02d}f", "number", f"{unit}."))
    return rows


def find_recording(recordings: Path | None, prompt_id: str) -> Path | None:
    """A human recording for `prompt_id` in `recordings`, if one exists."""
    if recordings is None:
        return None
    for ext in ("wav", "mp3", "ogg", "flac", "m4a"):
        candidate = recordings / f"{prompt_id}.{ext}"
        if candidate.exists():
            return candidate
    return None


def synthesize(voice: PiperVoice, text: str, wav_path: Path) -> None:
    """Write Piper's rendering of `text` to a 16-bit mono WAV file."""
    with wave.open(str(wav_path), "wb") as wav:
        voice.synthesize_wav(text, wav)


def to_mp3(wav_path: Path, mp3_path: Path) -> None:
    """Trim leading/trailing silence and encode as a small mono MP3."""
    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-loglevel",
            "error",
            "-i",
            str(wav_path),
            "-af",
            FFMPEG_TRIM,
            "-ac",
            "1",
            "-codec:a",
            "libmp3lame",
            "-q:a",
            "6",
            str(mp3_path),
        ],
        check=True,
    )


@dataclass
class Clip:
    """One clip to produce: the prompt, where it goes, and an optional human recording."""

    prompt_id: str
    text: str
    mp3: Path
    human: Path | None = None


def record(voice: PiperVoice, clip: Clip, tmp: Path) -> str:
    """Produce `clip.mp3` from the human recording or Piper; return the file name."""
    if not clip.mp3.exists():
        source = clip.human
        if source is None:
            source = tmp / f"{clip.mp3.stem}.wav"
            synthesize(voice, clip.text, source)
        to_mp3(source, clip.mp3)
    return clip.mp3.name


def main(voice_path: str, out_dir: str, recordings_dir: str | None = None) -> None:
    """Build the clip set and manifest.

    Args:
        voice_path: Piper .onnx voice (its .onnx.json must sit beside it)
        out_dir: Output folder; gets letters/, numbers/ and manifest.json
        recordings_dir: Optional folder of human recordings named <prompt id>.<ext>
    """
    out = Path(out_dir)
    recordings = Path(recordings_dir) if recordings_dir else None
    letters, numbers = spoken_forms()
    voice = PiperVoice.load(voice_path)
    manifest: dict = {
        "meta": {
            "voice": Path(voice_path).stem,
            "source": "https://huggingface.co/rhasspy/piper-voices",
            "license": "Synthesised with Piper (MIT); jirka voice dataset CC0",
        },
        "letters": {},
        "numbers": {},
    }
    humans = 0
    with tempfile.TemporaryDirectory() as tmp_name:
        tmp = Path(tmp_name)
        for prompt_id, kind, text in prompts(letters, numbers):
            form = text[:-1]
            sub = "letters" if kind == "letter" else "numbers"
            stem = slug(form) if kind == "letter" else f"{slug(form)}-{prompt_id[-1]}"
            clip = Clip(
                prompt_id, text, out / sub / f"{stem}.mp3", find_recording(recordings, prompt_id)
            )
            clip.mp3.parent.mkdir(parents=True, exist_ok=True)
            humans += clip.human is not None
            rel = f"{sub}/{record(voice, clip, tmp)}"
            if kind == "letter":
                manifest["letters"][form] = rel
            else:
                manifest["numbers"].setdefault(form, {})[prompt_id[-1]] = rel
    (out / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=1) + "\n")
    total = sum(p.stat().st_size for p in out.rglob("*.mp3"))
    print(
        f"{len(letters)} letter clips, {len(numbers)} number units, "
        f"{humans} from human recordings, {total / 1e6:.2f} MB"
    )


if __name__ == "__main__":
    if sys.argv[1:] == ["--prompts"]:
        for row in prompts(*spoken_forms()):
            print("\t".join(row))
    elif len(sys.argv) in (3, 4):
        main(*sys.argv[1:])
    else:
        sys.exit(__doc__)
