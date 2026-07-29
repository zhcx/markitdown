# -*- mode: python ; coding: utf-8 -*-
"""Version-controlled PyInstaller recipe for the Windows converter sidecar."""

from pathlib import Path

from PyInstaller.utils.hooks import collect_all, collect_submodules
import site


resource_dir = Path(SPECPATH)
datas = [(str(resource_dir / "converter_version.txt"), ".")]
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
    "xlrd",
    "olefile",
    "pydub",
    "speech_recognition",
    "PIL",
):
    package_datas, package_binaries, package_hiddenimports = collect_all(package)
    # Exclude test suites to reduce bundle size
    package_hiddenimports = [m for m in package_hiddenimports if '.tests.' not in m and not m.endswith('.tests') and '._testing' not in m]
    datas.extend(package_datas)
    binaries.extend(package_binaries)
    hiddenimports.extend(package_hiddenimports)

hiddenimports.extend(collect_submodules("markitdown.converters"))
hiddenimports.extend(collect_submodules("markitdown.converter_utils.docx"))

analysis = Analysis(
    [str(resource_dir / "document_converter.py")],
    pathex=[str(resource_dir), site.getusersitepackages() or site.getsitepackages()[0]],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    excludes=[],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
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
