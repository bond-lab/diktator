"""Tests for pipeline/build_audio.py (Piper itself is mocked)."""

import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "pipeline"))
import build_audio


def test_slug_is_ascii_and_distinct_for_accented_forms():
    assert build_audio.slug("bé").startswith("be-")
    assert build_audio.slug("a") != build_audio.slug("á")
    assert build_audio.slug("ú s čárkou").startswith("u_s_carkou-")
    assert build_audio.slug("'").startswith("x-")


def test_spoken_forms_come_from_app_js():
    letters, numbers = build_audio.spoken_forms()
    assert "chá" in letters and "u s kroužkem" in letters
    assert {"nula", "dvacet", "stě", "tisíce", "milionů", "prosince", "minut"} <= set(numbers)
    assert len(numbers) == len(set(numbers))


class FakeVoice:
    """Stands in for PiperVoice: records what it was asked to say."""

    def __init__(self):
        self.said = []

    def synthesize_wav(self, text, wav):
        self.said.append(text)
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(22050)
        wav.writeframes(b"\0\0" * 2205)


def test_main_writes_manifest_and_clips(tmp_path, monkeypatch):
    fake = FakeVoice()
    monkeypatch.setattr(build_audio.PiperVoice, "load", staticmethod(lambda _p: fake))
    monkeypatch.setattr(build_audio, "spoken_forms", lambda: (["bé", "chá"], ["dvacet"]))
    monkeypatch.setattr(build_audio, "to_mp3", lambda wav, mp3: Path(mp3).write_bytes(b"mp3"))

    build_audio.main("/x/cs_CZ-jirka-medium.onnx", str(tmp_path))

    manifest = json.loads((tmp_path / "manifest.json").read_text())
    assert manifest["meta"]["voice"] == "cs_CZ-jirka-medium"
    assert set(manifest["letters"]) == {"bé", "chá"}
    assert set(manifest["numbers"]["dvacet"]) == {"m", "f"}
    for rel in list(manifest["letters"].values()) + list(manifest["numbers"]["dvacet"].values()):
        assert (tmp_path / rel).read_bytes() == b"mp3"
    assert fake.said == ["bé.", "chá.", "dvacet,", "dvacet."]


@pytest.mark.parametrize("text", ["a", "ypsilon", "dlouhé ú s čárkou"])
def test_slug_round_trip_is_stable(text):
    assert build_audio.slug(text) == build_audio.slug(text)


def test_human_recordings_replace_synthesis(tmp_path, monkeypatch):
    fake = FakeVoice()
    monkeypatch.setattr(build_audio.PiperVoice, "load", staticmethod(lambda _p: fake))
    monkeypatch.setattr(build_audio, "spoken_forms", lambda: (["bé"], ["dvacet"]))
    monkeypatch.setattr(
        build_audio, "to_mp3", lambda src, mp3: Path(mp3).write_bytes(Path(src).name.encode())
    )
    rec = tmp_path / "rec"
    rec.mkdir()
    (rec / "L01.wav").write_bytes(b"human")
    (rec / "N01f.mp3").write_bytes(b"human")

    build_audio.main("/x/voice.onnx", str(tmp_path / "out"), str(rec))

    manifest = json.loads((tmp_path / "out" / "manifest.json").read_text())
    assert (tmp_path / "out" / manifest["letters"]["bé"]).read_bytes() == b"L01.wav"
    assert (tmp_path / "out" / manifest["numbers"]["dvacet"]["f"]).read_bytes() == b"N01f.mp3"
    assert fake.said == ["dvacet,"]


def test_prompts_are_unique_and_cover_everything():
    rows = build_audio.prompts(["a", "bé"], ["nula", "dvacet"])
    assert len({r[0] for r in rows}) == len(rows) == 2 + 2 * 2
    assert rows[0] == ("L01", "letter", "a.")
    assert ("N02m", "number", "dvacet,") in rows and ("N02f", "number", "dvacet.") in rows
