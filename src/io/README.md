# `src/io` — export

CSV/XLSX export (SheetJS, `sheets.ts` + `exportRows.ts`) and downloadable
SVG/PNG chart images (`chartExport.ts`) for the visualizations panel.

Every export embeds the parameters used and the tool version — an exported
number that can't be traced back to the settings that produced it isn't
publishable.

No portable project file yet (analysis state persists to IndexedDB, which
is reload-safe but not exportable/importable between machines) — see the
top-level README's "Known limitations."
