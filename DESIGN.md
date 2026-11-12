# murmur design

How murmur looks and moves, for anyone building it. The rules here are binding, and CLAUDE.md points at this file. When the two ever disagree, CLAUDE.md wins and this file gets fixed.

## Night studio

The ground. Every renderer and website color is a token in `src/renderer/tokens.css`, and the design lint fails raw hex anywhere else in `src/renderer` and `site`. A few colors live outside its reach and mirror tokens by hand, so change them together: the window background in `src/shared/look.ts`, the default accent in `src/main/overlay/index.ts`, the belt colors and founder gold in `shared/cosmetics.json`, and the fallback colors passed to `tokenColor`.

| Token | Role |
| --- | --- |
| ink | The background. |
| panel, panel-lift | Cards and raised surfaces. |
| text, text-dim | Words, and quieter words. |
| brand (gold) | Headlines, micro-labels, static highlights, and dried paint. |
| amber | Live only: the pill while you speak, wet paint. Always brighter than gold. |
| red | Record, error, and the button that confirms a delete (LaBroi, 2026-10-08). Never decorative. |
| ok | Success states. |
| founder-gold | Founder identity marks only. |
| smoke | Background brushwork. |
| rice | Chalky strokes and paper grounds. |
| ember | Splatter and celebration. Never an error. |

Type in the app: the system UI face (Inter where present) and a mono face for equipment-style micro-labels. Bricolage Grotesque, condensed and heavy, appears only on the website, in the film, and on the share cards (the belt card, the painting card, and the week scroll), because a font file is a binary and the repo carries none. On a canvas the condensed width goes on after the font (cardPaint.ts displayFont), since setting the font resets it (US-103).

## Glass over your desktop

LaBroi's direction of 2026-11-08 (round 3 of the Home redesign preview), with his picks of 2026-11-11 and 2026-11-12: night studio moves from flat panels to glass over the desktop, on purpose (US-150).

- **Always dark to the system.** `nativeTheme.themeSource` is `dark`. A Mac set to its light look would otherwise hand the window the light material, and night studio over a white frost is flat grey with a white title bar (found on LaBroi's Mac, 2026-11-12).
- **The window** shows the desktop through it. On macOS that is Electron's window vibrancy with the `hud` material, the one the system uses for its own floating panels, which lets shapes and color through (`under-window`, the first pick, frosted them away). On Windows 11 22H2 and up it is the `acrylic` background material, built but switched off until it is seen working on a real PC (murmur turns hardware acceleration off on Windows, and acrylic behind a page drawn in software may come out black; `MURMUR_WINDOWS_GLASS=1` turns it on to try). The page lays 1 sheet of ink over it at 50%. This is Clear, LaBroi's pick of 2026-11-12 from real screenshots over his desktop (board 15: Soft, Clear, Clearest); the 18% of round 1 showed nothing.
- **Where it cannot** (Windows for now, Linux) or when the system's Reduce transparency is on, the window is solid ink with a gold glow from the top at 68%, and cards keep 85%. It switches live when that setting changes.
- **1 glass.** Every card, the sidebar and the top bar are the same pane: the panel color at 62% with a light along the top edge. So the eye reads 2 levels, window and card, and nothing else competes (LaBroi, 2026-11-12: 5 shades on Home was too many). The system's material does the blurring, so under a look the app blurs nothing itself; the flat look's 2 fog blurs (Test, the ask-first box) are switched off, because a blur paints black on a see-through window. Finish setup's red edge and the gold ring on the profile in use stay. A take waiting to retry has no red edge: it is a card with a red dot beside its label and in the sidebar.
- **Wells** are a darker pane of the same glass (black at 28% over the card), never a solid hole. Controls (buttons, fields, choices) stay solid and clean.
- **Gold is a thread, by role** (option C, his pick of 2026-11-12). Time back is the 1 card that celebrates and gets the strong gold tint (30%). The sidebar line you are on gets the same gold as a strip, and today's header in Your dictations a lighter one. Text on gold is cream. Names in the sidebar and the top bar are cream until picked; the tab you are on is gold. There is no faint gold wash any more. Other pages get 1 gold card each when they are designed (US-156).
- **The top bar is glass too.** The page scrolls in its own box under the bar (`.page-scroll`), so nothing is ever behind the tabs, and on glass the page fades out over its first 12 px.
- **Text.** `src/shared/look.test.ts` computes every text and surface pair from the tokens, over the material as measured over a white page (the brightest ground the glass can have) and over black, and holds each to 4.5 to 1. Over a white page the bare window is mid grey, where no grey and no gold passes: so helper text straight on the window is cream (`--text-dim-window`), and grey and gold always sit on a card (What's new is a small glass chip for that reason). On cards, grey is 1 step brighter (`--text-dim-surface`) and red is `--red-glass`. The setup badge sits on a solid chip. The mist theme has its own glass tokens, held to the same floor by the same test.
- **Where a control went.** When the sidebar is hidden, Hide words moves beside Home's title, and 1 gold brush loop is drawn around it there, then lifts (`LandRing.tsx`; his pick, drawn with the brush engine). Reduced motion gets the finished loop, still.
- **Unchanged:** amber for live states, red for errors, the brush paint, and the overlay pill, which keeps its own look and stays unfocusable and click-through.
- The other pages (Analytics, Wrap-up, Journey) wear the base glass until their roles are designed page by page (US-156). With no look set at all, the styles are the flat night studio, which is what a Flat choice will use (US-151).

## Brushwork

LaBroi's art direction from 2026-10-01: expressive brush paintings, a sharp calm figure in the middle and explosive brushwork around it. murmur's calm figure is the pill. **Your voice is the brush**: speaking paints a stroke, letting go flicks it, and the paint lands where your words land.

Where paint goes:

| Surface | Paint |
| --- | --- |
| Website hero | Full: paints in once, then the visitor can paint and save a poster. |
| Logo and app icon | The ensō pill (US-075). Brushed at 64 px and up (the splat from 128 px); a clean drawn version below 64 px, in the tray, the favicon, and the site header. |
| Journey, promotions, share card | Full. |
| The pill | The ink waveform styles, earned one per belt. Hands-free (US-117, LaBroi's pick A from the Closing the loop preview, 2026-10-30): when a double-tap locks the mic, one signal amber brush stroke paints the pill's own outline all the way round and a little past its start, closing the loop the icon leaves open, so a locked pill is the logo, closed. Holding draws no loop. In bare the loop goes round the dot and the waveform together. In the last minute before the 12 minute stop it dries to brand gold; reduced motion draws it closed and still. LaBroi's picks from the Fading the loop preview (2026-11-01): the loop paints in at full strength, holds full for 1 second, then fades over 3 seconds (ease in and out) to a resting strength set in Settings, Dictation, Loop once it settles (10% to 100%, default 20%; 10% is the floor so a locked take never looks like a plain hold, 100% never fades), and stays there; in the last minute it dries to gold at that resting strength, never climbing back to full. Reduced motion keeps the fade, since it moves nothing. The lock chime is tap tap: 2 light ticks on one note (1319 Hz), an echo of the double-tap. |
| Launch film | Full. |
| Settings | Small touches where something happened, from LaBroi's app refresh picks (2026-10-02): the Home stroke, ink analytics, the wrap-up painting, empty-state marks, the waveform tiles, and the painted insignia and tab marker. Controls and forms stay clean; the waveform tiles and the loop level tile are the exceptions, because each is a preview of the pill itself (the tiles live, the loop level tile still). |
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
| Dictation | The loop level tile, above the Loop once it settles slider: a still preview of the locked pill (the waveform tiles' mini pill in your look, waveform, and accent, with the red live dot and a timer) with the loop painted round it at the slider's level, following the slider as you drag. LaBroi's pick from the Fading the loop preview, 2026-11-01. | US-117 |
| Home | One gold stroke under back today, today against a typical day; the last note row. | US-085, US-082 |
| Every tab | Its own title; the how-to block stays on Home only for the first few dictations. | US-086 |
| Analytics | The fourteen days as brush dabs, the activity wall as blots. Numbers unchanged. | US-087 |
| Wrap-up | A painting a day: each take adds the next stroke of a seeded subject (fourteen: moon over water, bamboo, plum branch, mountains, pine on a cliff, orchid, chrysanthemum, lotus pond, waterfall, willow by the water, boat on the river, breaking wave, maple branch, snowfall; recipes in src/renderer/settings/paintSubjects.ts) sized to a typical day; the seal when finished, in the color of the belt it was painted at (beltOnInk; ember before the first belt; the coral belts in two halves) and the light of the hours it was painted in (paintLight.ts: dawn 5 to 10, day to 17, dusk to 21, night; a sun or a crescent and stars set in the open sky found from the strokes, under every stroke; a painting with a moon keeps it), then the scene keeps growing, each subject in its own way, one stroke for each take after (up to 60), shaped by that take's words; richer brushwork with rank; plants kept inside a 5 percent margin while ground, cliffs, and limbs from the edge run off it; the paintings of the days before in a strip that opens each one large; a portrait Save card; Save the week, the seven days ending today side by side as one long scroll, its title in the display face (painting.ts paintWeekScroll, 1984 by 432 saved at twice that; a day without takes is one dry mark). | US-098 (replaced US-088's card), US-100, US-101, US-102 |
| Empty states | One dry grey scrape and a sentence with the real hotkey. | US-089 |
| Header | A painted belt insignia and a short gold stroke under the current tab. | US-090 |
| Header, Pro | The Pro mark painted in each day: the first window open of a day lifts it to 2x while 3 or 4 slashing strokes seeded by the date paint its gold in from varied angles; the unfinished brushwork (dry ends, small gaps) stays as the day's badge. See The Pro mark below. | US-107 |
| Journey | Painted belt, road, gates, and ink stamps. | US-076 |

Paint in the window is static unless the moment moves (a promotion, a live preview tile), seeded by something stable like the date, so a mark keeps its shape across opens.

## The Pro mark

A small pill of brand gold with PRO in ink, mono caps (LaBroi's picks from the Pro canvas, https://claude.ai/artifact/ECbNrZm5ArdsGHftMYdAU7, 2026-10-19 and 2026-10-22). One rule: **a filled mark means Pro is yours, an outlined mark (brand edge border, gold text) means Pro offers it.** Never amber, never founder gold; the crown stays the founder's alone.

| Who | Where |
| --- | --- |
| Pro and founding members | Filled: after the wordmark in the header (before the belt), beside murmur Pro in the rail, in the Pro section title, and on the Profiles row. |
| Free, or a parked key | Outlined: the Profiles row, the rail entry, the Pro section title. No header mark. |

- The word is CSS content (`.pro-mark::after`), so search results and section names never read it; `role="img"` names it aloud, except beside a title that already says murmur Pro (the rail, the section title), where it is hidden from screen readers. `src/renderer/settings/ProMark.tsx`, styles under `.pro-mark` in `styles.css`, rules in `src/shared/proMark.ts`.
- The moment you buy: the outlined marks fill with gold once, a beat apart (`pro-mark-leaf`, 0.6 s), and the header mark arrives with its brush fill, which counts as the day's fill.
- The header mark is painted, not filled: the brush engine draws the day's strokes on a canvas at twice the screen density (sharp at 2x), and PRO is drawn on the same canvas, ink wherever paint landed and gold where the ground is bare (`paintLabel`). A blend mode was tried first and left PRO a muddy brown on the darker strokes; measured over 60 days (re-measured with the soft grain, 2026-10-22), at most 0.1 percent of PRO's pixels, about 2 at a letter's edge, fall under 3:1 on the worst day, and the mean is 0.
- The daily moment waits until the window is visible and focused, then 350 ms, grows to 2x (or as far as the room before the tabs allows) from its left edge over 300 ms with a 3 percent overshoot (cubic-bezier(.16, 1, .3, 1)), paints for about 3 s while big, holds 400 ms, and settles over 500 ms with no overshoot (cubic-bezier(.4, 0, .2, 1)). The belt steps aside by the mark's growth, so nothing covers words. The first, shallow stroke runs wet and centered, a solid body under the letters, while the steeper strokes stay dry. The grain is soft (LaBroi's pick on canvas board 7, 2026-10-22): 48 fine bristles per stroke, light and dark bristles only 5 and 10 percent off the gold, and a fuller body (0.55, up from 0.34) under the dry strokes, so the gaps between bristles read soft, like the painting a day's strokes. The first build used 26 bristles at 14 and 30 percent, and the streaks read as wood grain. A click, key, or blur skips to the end (200 ms settle). Settings, murmur Pro, Paint the mark each day turns it off; reduced motion shows the day's brushwork still. Both designers' notes (motion and brand) shaped this; the brand rule it answers to: Pro never moves bigger or more often than the belt's own ceremony.

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
