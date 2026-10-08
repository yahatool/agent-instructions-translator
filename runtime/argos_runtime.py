"""Offline entry point frozen into each platform-specific VSIX."""

from __future__ import annotations

import argparse
import os
import re
import sys
import types


class OfflineSentencizer:
    """Small dependency-free sentence splitter for the bundled Markdown use case."""

    def __init__(self, package):
        self.package = package

    def split_sentences(self, text: str) -> list[str]:
        # Keep the punctuation and following whitespace with each sentence. Argos
        # already separates paragraphs before calling this method. A length
        # fallback prevents very long list items from exceeding model limits.
        sentences = [
            part
            for part in re.split(r"(?<=[.!?。！？])(?=\s|$)|(?<=\s)(?=-\s|\d+[.)]\s)", text)
            if part
        ]
        chunks: list[str] = []
        for sentence in sentences or [text]:
            while len(sentence) > 800:
                split_at = sentence.rfind(" ", 0, 800)
                if split_at < 200:
                    split_at = 800
                chunks.append(sentence[:split_at])
                sentence = sentence[split_at:]
            if sentence:
                chunks.append(sentence)
        return chunks


def main() -> int:
    parser = argparse.ArgumentParser(description="Bundled offline Argos translator")
    parser.add_argument("--from-lang", required=True)
    parser.add_argument("--to-lang", required=True)
    args = parser.parse_args()

    if not os.environ.get("ARGOS_PACKAGES_DIR"):
        print("ARGOS_PACKAGES_DIR is not configured", file=sys.stderr)
        return 2

    # Argos imports its optional sentence-boundary packages eagerly. The bundled
    # runtime supplies its own sentencizer, so provide tiny import-compatible
    # placeholders and keep Stanza/PyTorch/MiniSBD out of the frozen executable.
    stanza_stub = types.ModuleType("stanza")
    minisbd_stub = types.ModuleType("minisbd")
    minisbd_stub.SBDetect = object
    minisbd_stub.models = types.SimpleNamespace(cache_dir="")
    sys.modules.setdefault("stanza", stanza_stub)
    sys.modules.setdefault("minisbd", minisbd_stub)

    # Import only after the extension has pointed Argos at bundled read-only models
    # and writable extension storage for caches.
    from argostranslate import translate

    # The official ja<->en packages contain legacy Stanza checkpoints. Current
    # Stanza cannot load those checkpoints and may attempt a network update first.
    # Sentence boundary detection is independent from the CTranslate2 translation
    # model, so replace only that component with a deterministic offline splitter.
    translate.StanzaSentencizer = OfflineSentencizer

    source = sys.stdin.read()
    installed = translate.get_installed_languages()
    source_language = next((language for language in installed if language.code == args.from_lang), None)
    target_language = next((language for language in installed if language.code == args.to_lang), None)
    if source_language is None or target_language is None:
        print(
            f"Bundled model not found for {args.from_lang} -> {args.to_lang}",
            file=sys.stderr,
        )
        return 3

    translation = source_language.get_translation(target_language)
    if translation is None:
        print(
            f"Bundled model not found for {args.from_lang} -> {args.to_lang}",
            file=sys.stderr,
        )
        return 3

    sys.stdout.write(translation.translate(source))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
