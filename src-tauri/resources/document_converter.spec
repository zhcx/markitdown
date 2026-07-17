# -*- mode: python ; coding: utf-8 -*-
"""Version-controlled PyInstaller recipe for the Windows converter sidecar."""

from pathlib import Path

from PyInstaller.utils.hooks import collect_all


resource_dir = Path(SPECPATH)
datas = []
binaries = []
hiddenimports = []

for package in (
    "markitdown",
    "magika",
    "mammoth",
    "pdfminer",
    "pdfplumber",
    "pptx",
    "openpyxl",
    "pandas",
):
    package_datas, package_binaries, package_hiddenimports = collect_all(package)
    datas += package_datas
    binaries += package_binaries
    hiddenimports += package_hiddenimports

analysis = Analysis(
    [str(resource_dir / "document_converter.py")],
    pathex=[str(resource_dir)],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=2,
)
pyz = PYZ(analysis.pure)

exe = EXE(
    pyz,
    analysis.scripts,
    analysis.binaries,
    analysis.datas,
    [],
    name="document_converter",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
