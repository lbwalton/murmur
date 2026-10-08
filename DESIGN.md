# murmur design

How murmur looks and moves, for anyone building it. The rules here are binding, and CLAUDE.md points at this file. When the two ever disagree, CLAUDE.md wins and this file gets fixed.

## Night studio

The ground. Every renderer and website color is a token in `src/renderer/tokens.css`, and the design lint fails raw hex anywhere else in `src/renderer` and `site`. A few colors live outside its reach and mirror tokens by hand, so change them together: the window background in `src/main/index.ts`, the default accent in `src/main/overlay/index.ts`, the belt colors and founder gold in `shared/cosmetics.json`, and the fallback colors passed to `tokenColor`.

| Token | Role |
| --- | --- |
| ink | The background. |
| panel, panel-lift | Cards and raised surfaces. |
| text, text-dim | Words, and quieter words. |
| brand (gold) | Headlines, micro-labels, static highlights, and dried paint. |
| amber | Live only: the pill while you speak, wet paint. Always brighter than gold. |
| red | Record and error. Never decorative. |
| ok | Success states. |
| founder-gold | Founder identity marks only. |
| smoke | Background brushwork. |
| rice | Chalky strokes and paper grounds. |
| ember | Splatter and celebration. Never an error. |

Type in the app: the system UI face (Inter where present) and a mono face for equipment-style micro-labels. Bricolage Grotesque, condensed and heavy, appears only on the website, in the film, and on the share card, because a font file is a binary and the repo carries none.

## Brushwork

LaBroi's art direction from 2026-10-01: expressive brush paintings, a sharp calm figure in the middle and explosive brushwork around it. murmur's calm figure is the pill. **Your voice is the brush**: speaking paints a stroke, letting go flicks it, and the paint lands where your words land.

Where paint goes:

| Surface | Paint |
| --- | --- |
| Website hero | Full: paints in once, then the visitor can paint and save a poster. |
| Logo and app icon | The ensō pill (US-075). Brushed at 64 px and up (the splat from 128 px); a clean drawn version below 64 px, in the tray, the favicon, and the site header. |
| Journey, promotions, share card | Full. |
| The pill | The ink waveform styles, earned one per belt. |
| Launch film | Full. |
| Settings | Small touches where something happened, from LaBroi's app refresh picks (2026-10-02): the Home stroke, ink analytics, the wrap-up painting, empty-state marks, the waveform tiles, and the painted insignia and tab marker. Controls and forms stay clean; the waveform tiles are the one exception, because each is a live preview of the pill. |
| Errors | None. Clean red, never splatter. |
| Tray icon | None. |

Rules that never bend:

- Every mark is drawn by code from a seed, so the same seed paints the same mark and no painted image ever enters the repo.
- Marks stack in the order they start painting, while animating and after. Nothing jumps layers when an animation settles.
- Errors are clean red with no bristles. Paint is for progress and celebration.
- Reduced motion shows a still, finished painting, never a blank space.
- Paint never covers words or controls a person is reading or using.

## Paint in the window

The settings window is where people work, so paint appears only where something happened. LaBroi's picks from the app refresh preview, 2026-10-02:

| Where | The touch | Story |
| --- | --- | --- |
| Look | Waveform tiles: each style as a live mini pill; locked ones dimmed with the belt that unlocks them. | US-084 |
| Home | One gold stroke under back today, today against a typical day; the last note row. | US-085, US-082 |
| Every tab | Its own title; the how-to block stays on Home only for the first few dictations. | US-086 |
| Analytics | The fourteen days as brush dabs, the activity wall as blots. Numbers unchanged. | US-087 |
| Wrap-up | The day as a small painting, one stroke per dictation, with Save card. | US-088 |
| Empty states | One dry grey scrape and a sentence with the real hotkey. | US-089 |
| Header | A painted belt insignia and a short gold stroke under the current tab. | US-090 |
| Journey | Painted belt, road, gates, and ink stamps. | US-076 |

Paint in the window is static unless the moment moves (a promotion, a live preview tile), seeded by something stable like the date, so a mark keeps its shape across opens.

## Motion

Four verbs, used everywhere paint moves:

| Verb | What it means | Timing |
| --- | --- | --- |
| Load | The key goes down and the brush gathers paint. | 120 ms, ease in. |
| Stroke | Bristles drag at your voice's pressure. | Follows the voice; 80 ms attack. |
| Flick | Paint flies to where it lands. | 280 to 420 ms, cubic-bezier(.16, 1, .3, 1). |
| Dry | Wet amber cools to gold and goes still. | 600 ms ease out, one sheen; while processing runs long, a softer sheen every 2 s. |

One orchestrated moment beats scattered effects: the hero paints in once, a promotion has one ceremony, the pill dries once.

## The brush engine

`src/renderer/brush.ts`, shared by every renderer.

- `path(points, step, raw)` resamples a path with normals and arc length; `raw` keeps sharp corners for letterforms.
- `brush(seed, n)` and `cachedBrush(seed, n)` build bristles; keep seeds to a small set so the cache stays small.
- `stroke(ctx, path, bristles, options)` paints: `width`, `rgb`, `dry` (0 wet, 1 runs dry), `core` (the wet body), `pfn` (custom pressure), `i0`/`i1` (paint part of a path), `sOff` (keep a scrolling stroke's texture).
- `splat(seed, x, y, options)` and `drawSplat(ctx, splat, rgb, k)` throw and draw splatter, `k` being how far through its flight.
- `stackOrder(items)` and `paintScene(ctx, items)` give scenes their stacking order; `animateScene(base, fx, items, options)` paints one over time and stacks exactly as `paintScene` does (the website hero's paint-in, the Journey, the ceremony).
- Outside a browser, the same engine paints the brushed icons: `scripts/lib/raster.js` is a small software canvas with just the calls the brush uses, `scripts/lib/enso.js` holds the mark's one geometry (brushed and clean, and as SVG), and `scripts/lib/icons.js` composes the app icons, the tray icons, and the site's home screen icon and link preview. Same bytes on every run with one Node version (trigonometry can differ a hair between versions; nothing generated is committed).

## The ink waveforms

`src/renderer/overlay/InkWave.tsx`: dabs, flecks, rings, and ribbon, unlocked at white, blue, purple, and brown. All four follow one table:

| Phase | Paint |
| --- | --- |
| idle | Small, dry, no color, still. Amber never shows at rest. |
| recording | Wet accent at the voice level, cooling as it ages. |
| processing | Cools to dry color with one sheen, then a softer sheen every 2 seconds until the words land. |
| inserted | Sinks flat. |
| no speech | A dry grey scrape. |
| error | Plain red, no bristles. |

The default accent is signal amber drying to brand gold; a custom accent dries to a darker shade of itself. In the bare look the paint is laid down once per frame with the ink edge, then faded before the canvas edge.

## Design QA

- `MURMUR_INK_SHOTS=<dir> npm run smoke` saves every ink style in every look, plus drying and error, from the hermetic smoke run.
- Settings shots: run `npx electron-vite build`, then `MURMUR_SETTINGS_CAPTURE=<file.png> node_modules/.bin/electron . --murmur-userdata=<scratch dir>`. It saves a shot of the settings window and exits. Add `MURMUR_SETTINGS_PAGE` (home, analytics, wrap-up, or journey; anything else fails the run), `MURMUR_SETTINGS_ANCHOR`, `MURMUR_SETTINGS_SEARCH`, `MURMUR_SETTINGS_SCROLL` (a CSS selector scrolled to the top of the open tab; the activity wall also scrolls to its newest days), `MURMUR_SETTINGS_CLICK` (a CSS selector focused and clicked last, to open a dialog such as the share card or a hover note; several joined by `||` are clicked in turn, such as a confirm and then its yes), or `MURMUR_SETTINGS_PROBE` (an expression whose value is printed just before the shot, for state a picture hides) to choose what shows. Seed the scratch dir with a `settings.json` holding `{"onboarding": {"completed": true}}` (without it the setup wizard covers everything) and a `history.jsonl` of made-up sessions so the screens look real. The path is used exactly as given, so never pass the real profile, and the run starts the keyboard hook for a few seconds.
- Previews: the brushwork preview (https://claude.ai/artifact/FjUpgYveR15wSUGaVC2Zx2), approved by LaBroi 2026-10-01, and the app refresh preview (https://claude.ai/artifact/Cvnj1BjTPuLwavwjJdchnM), picked by LaBroi 2026-10-02 (all yes; the stories are US-082 to US-091). Their source holds working prototypes of the hero, the Journey, the ceremony, the share card, and the film animatic.
- The launch film lives outside the repo in `~/Projects/murmur-film` (HyperFrames; `scripts/build.sh` re-renders).
