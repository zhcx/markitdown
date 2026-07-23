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
SUPPORTED_FORMATS = ["pdf", "docx", "xlsx", "pptx"]


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

    if len(sys.argv) == 6 and sys.argv[1] == "convert" and sys.argv[2] == "--input" and sys.argv[4] == "--output":
        source = Path(sys.argv[3])
        output = Path(sys.argv[5])
    elif len(sys.argv) in (2, 3):
        # Explicit Python fallback retains compatibility with older developer setups.
        source = Path(sys.argv[1])
        output = Path(sys.argv[2]) if len(sys.argv) == 3 else None
    else:
        fail("Usage: document_converter convert --input <local-file> --output <markdown-file>")

    if not source.is_file():
        fail(f"The selected path is not a file: {source}")

    try:
        from markitdown import MarkItDown
    except ImportError:
        fail(
            "Microsoft MarkItDown is not installed for the Python interpreter "
            "used by MarkitDown. Install it with: "
            "python -m pip install 'markitdown[pdf,docx,pptx,xlsx]'"
        )

    try:
        # convert_local avoids treating user supplied paths as URLs.
        result = MarkItDown(enable_plugins=False).convert_local(str(source))
        markdown = getattr(result, "text_content", None) or getattr(result, "markdown", None)
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
