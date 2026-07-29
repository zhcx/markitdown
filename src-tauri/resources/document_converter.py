#!/usr/bin/env python3
"""Tauri sidecar entry point for Microsoft MarkItDown."""

from __future__ import annotations

import json
import os
import platform
import sys
from pathlib import Path

MODULE_ID = "document-converter"
MODULE_VERSION = Path(__file__).with_name("converter_version.txt").read_text(encoding="utf-8").strip()
PROTOCOL_VERSION = 1
SUPPORTED_FORMATS = [
    "pdf",
    "docx",
    "pptx",
    "xlsx",
    "xls",
    "html",
    "htm",
    "xhtml",
    "csv",
    "json",
    "jsonl",
    "xml",
    "rss",
    "atom",
    "zip",
    "epub",
    "jpg",
    "jpeg",
    "png",
    "wav",
    "mp3",
    "m4a",
    "mp4",
    "msg",
    "ipynb",
    "txt",
    "text",
    "md",
    "markdown",
]
IMAGE_FORMATS = {".jpg", ".jpeg", ".png"}


def fail(message: str) -> None:
    print(json.dumps({"ok": False, "error_code": "conversion_failed", "message": message}, ensure_ascii=True), file=sys.stderr)
    raise SystemExit(1)

def target_triple() -> str:
    machine = platform.machine().lower()
    if sys.platform == "win32" and machine in ("amd64", "x86_64"):
        return "x86_64-pc-windows-msvc"
    if sys.platform == "darwin" and machine in ("arm64", "aarch64"):
        return "aarch64-apple-darwin"
    if sys.platform == "darwin" and machine in ("amd64", "x86_64"):
        return "x86_64-apple-darwin"
    if sys.platform.startswith("linux") and machine in ("amd64", "x86_64"):
        return "x86_64-unknown-linux-gnu"
    return f"{sys.platform}-{machine}"


def image_fallback(source: Path) -> str:
    """Return useful local Markdown when no LLM/exiftool image text is available."""
    def table_cell(value: object) -> str:
        return str(value).replace("|", "\\|").replace("\r", " ").replace("\n", " ")

    lines = [f"# {source.stem}", "", f"![{source.name}]({source.resolve().as_uri()})"]
    try:
        from PIL import ExifTags, Image

        with Image.open(source) as image:
            metadata = [
                ("Format", image.format or source.suffix.lstrip(".").upper()),
                ("Dimensions", f"{image.width} × {image.height}"),
                ("Color mode", image.mode),
            ]
            exif = image.getexif()
            for key, value in exif.items():
                name = ExifTags.TAGS.get(key, str(key))
                if name in {"DateTime", "DateTimeOriginal", "Make", "Model", "Software", "Artist", "Copyright"}:
                    metadata.append((name, str(value)))
        lines.extend(["", "## Image metadata", "", "| Field | Value |", "| --- | --- |"])
        lines.extend(
            f"| {table_cell(name)} | {table_cell(value)} |"
            for name, value in metadata
        )
    except Exception:
        # The image reference is still a valid and useful Markdown conversion.
        pass
    return "\n".join(lines)


def main() -> None:
    if sys.argv[1:] == ["--version-json"]:
        print(json.dumps({
            "module_id": MODULE_ID,
            "version": MODULE_VERSION,
            "protocol_version": PROTOCOL_VERSION,
            "target": target_triple(),
            "supported_formats": SUPPORTED_FORMATS,
        }, ensure_ascii=True))
        return

    if len(sys.argv) in (2, 3):
        # Positional arguments: <local-file> [markdown-output-file]
        source = Path(sys.argv[1])
        output = Path(sys.argv[2]) if len(sys.argv) == 3 else None
    else:
        fail("Usage: document_converter <local-file> [markdown-output-file]")

    if not source.is_file():
        fail(f"The selected path is not a file: {source}")

    try:
        from markitdown import MarkItDown
    except ImportError:
        fail(
            "Microsoft MarkItDown is not installed for the Python interpreter "
            "used by MarkitDown. Install it with: "
            "python -m pip install "
            "'markitdown[audio-transcription,docx,outlook,pdf,pptx,xls,xlsx]'"
        )

    try:
        # convert_local avoids treating user supplied paths as URLs.
        result = MarkItDown(enable_plugins=False).convert_local(str(source))
        markdown = getattr(result, "text_content", None) or getattr(result, "markdown", None)
        if (not isinstance(markdown, str) or not markdown.strip()) and source.suffix.lower() in IMAGE_FORMATS:
            markdown = image_fallback(source)
        if not isinstance(markdown, str):
            fail("MarkItDown returned no Markdown content.")
        if output is not None:
            output.parent.mkdir(parents=True, exist_ok=True)
            temporary_output = output.with_suffix(output.suffix + ".partial")
            temporary_output.write_text(markdown, encoding="utf-8")
            os.replace(temporary_output, output)
            print(json.dumps({
                "ok": True,
                "protocol_version": PROTOCOL_VERSION,
                "output_path": str(output),
                "warnings": [],
            }, ensure_ascii=True))
        else:
            # Kept for command-line diagnostics. The desktop application always
            # uses a file result to avoid duplicating large documents in memory.
            print(json.dumps({"markdown": markdown}, ensure_ascii=True))
    except Exception as error:
        fail(f"Conversion failed: {error}")


if __name__ == "__main__":
    main()
