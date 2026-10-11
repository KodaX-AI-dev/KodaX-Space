# Isolated preview samples

These small synthetic files exercise PDF (three pages), animated GIF, PNG,
text, DOCX, XLSX, PPTX, WAV and VP8/WebM previews without reading personal files.
They contain only generated sample text, shapes and a short recording of a
green canvas. Generated on 2026-10-11 with reportlab, Pillow, python-docx,
openpyxl, python-pptx, Python wave and Chromium MediaRecorder.

`artifact-file-preview.spec.ts` uses this directory by default. Set
`KODAX_ARTIFACT_E2E_DIR` to an explicit alternate sample directory when needed.
