#!/usr/bin/env python3
"""Tauri sidecar entry point for Microsoft MarkItDown."""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path


def fail(message: str) -> None:
    print(message, file=sys.stderr)
    raise SystemExit(1)


def main() -> None:
    if len(sys.argv) not in (2, 3):
        fail("Usage: document_converter.py <local-file> [markdown-output-file]")

    source = Path(sys.argv[1])
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
        if len(sys.argv) == 3:
            output = Path(sys.argv[2])
            output.parent.mkdir(parents=True, exist_ok=True)
            temporary_output = output.with_suffix(output.suffix + ".partial")
            temporary_output.write_text(markdown, encoding="utf-8")
            os.replace(temporary_output, output)
            # Keep stdout tiny: large Markdown over a process pipe is fragile.
            print(json.dumps({"output_path": str(output)}, ensure_ascii=True))
        else:
            # Kept for command-line diagnostics. The desktop application always
            # uses a file result to avoid duplicating large documents in memory.
            print(json.dumps({"markdown": markdown}, ensure_ascii=True))
    except Exception as error:
        fail(f"Conversion failed: {error}")


if __name__ == "__main__":
    main()
