# Design sources

The Workbench layout and stylesheet are an original composition for Adsorption
(2026-09-12 redesign: dark navy sidebar, light blue-grey work surface, pill-shaped
controls, soft-shadow cards; series are identified by coloured file names in the
sidebar and short line swatches in the legend). Visual references:
[Tabler](https://tabler.io/admin-template) for grouped workspace controls and table
hierarchy; [shadcn/ui](https://ui.shadcn.com/) for restrained tabs and controls.
Neither framework's CSS or runtime was imported. The existing Bklit chart
components remain in use.

Third-party assets copied from official repositories on 2026-09-11:

- `icons/{folder-open,device-floppy,file-upload,chart-line}.svg`:
  [Tabler Icons](https://github.com/tabler/tabler-icons/tree/main/icons/outline),
  unchanged SVG files. MIT license: [LICENSE-Tabler.txt](icons/LICENSE-Tabler.txt).
- `fonts/SUIT-Variable.woff2`:
  [SUIT](https://github.com/sun-typeface/SUIT/tree/main/fonts/variable/woff2),
  unchanged font. SIL Open Font License: [LICENSE-SUIT.txt](fonts/LICENSE-SUIT.txt).
  SHA-256: `aa894a204d5a6fbae259dac6868d350cbd373a390caee0313f92946af741df23`.

All assets are served locally. The small chart mark in the application header is
original inline SVG. No external font or icon CDN is needed at runtime.
