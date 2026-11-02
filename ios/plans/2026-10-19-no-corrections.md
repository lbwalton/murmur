# A spoken No that takes back the last sentence (IOS-030 fix)

**Found:** LaBroi's first IOS-030 try on build 493 (2026-10-19). With Apply corrections on, "Let's go to Italy. No, let's go to Japan and stay for a week." typed unchanged.

**Root cause, measured** (live probe, gpt-oss-120b on Groq through OpenRouter, the shipped prompt):

1. The model: no example shows a bare No opening the next sentence and saying the plan again, so it fixed his sentence 3 and 5 times in 10 (Smart lists off and on), and three held-out sentences like it 0 times in 15 each. Every answer passed validation; the model just left the slip-up in.
2. The validator: no is a prompt cue only (US-105's review took it out of correctionCues, since no problem is everyday speech). With an example added, the model fixes all four, but the three whose fix cuts past 40% (Put the meeting on Monday. No, put it on Wednesday after lunch: 12 words to 7) fall back on the length ratio, since no dropped cue earns the deeper floor.

**Fix:**

1. shared/polish.json correctionsPrompt gains one example in that shape, worded unlike every probe case: Let's take the train to Boston. No, let's drive to Boston and leave early. becomes: Let's drive to Boston and leave early.
2. shared/polish.json gains pausedCorrectionCues ["no"] and correctionPause ",.;:!": a paused cue counts toward the deeper floor only as a whole word followed straight away by one of those marks and then nothing but marks (No, / no. / "No,"). No problem, no way, nobody, and No? never count. It adds to the correctionCues count; the cap (4 + 8 per dropped cue) and the only-spoken-words rule stay as they are.
3. Desktop (src/main/formatter/llm.ts) and MurmurCore (Polish.swift) count paused cues the same way: lowercase as JavaScript does, curly apostrophes made straight, split on JavaScript whitespace, skip leading marks, then the cue, a pause mark, and no letter or number after it.

**Tests first:**

- llm.test.ts: a No, correction earns the deeper floor; the same cut without the comma does not; No? does not; nobody, does not; a No answer the model kept leaves the strict floor in place. The existing no problem test stays.
- polish-shared.test.ts: paused cues and the pause marks come from the shared file (mock values differ from the real ones).
- shared/polish-vectors.json: new paused-cue cases written by desktop (MURMUR_WRITE_VECTORS), run by MurmurCore.
- PolishTests: the Swift rules read the two new keys; the vectors count rises.
- corrections.probe.test.ts: four held-out No corrections (his sentence and three like it) and three traps where No is an answer or ordinary content; misses now name their fallback reason, which showed parallel runs hit HTTP 429.

**Done when:** the probe (one run at a time) fixes the four No cases with all traps kept and no old case lost, every gate is green, the review gate passes, and docs (docs/settings.md, ios/docs/iphone.md) say when no counts. Then a TestFlight build, on LaBroi's yes.

**Review gate (2026-10-19, pass one), all taken:**

1. should-fix: the answer side was judged by punctuation, so a model that kept No and dropped its comma was credited with a drop. Now a paused cue counts as dropped only as often as the answer says the word fewer times as a spoken word.
2. should-fix: a paused No that answers a question, opens the take, follows a word (Oh no,), or ends a statement (he said no.) unlocked the deeper floor. Now it counts only right after a piece that ends in a correctionPause mark. Left open on purpose: a No after a statement that reports a question (You asked whether we can move it to Monday. No, we can't) reads the same as a fix, which the docs' read back advice covers.
3. should-fix: stacked cues multiplied the cap. A run of paused cues counts once, and paused cues count only when every listed cue stayed, so Sorry, no, is one take-back, as it was before this change. Builder's call, since it keeps the old cap for those inputs.
4. to 9. stale comments, comment wording (anything but letters and numbers), the probe labels his sentence tuned (the example mirrors it) and gains two traps of twelve words or more, No. Put in the vectors, no-break space and emoji vectors, and quoted examples in the docs.

The fuzz generator's random numbers had collapsed into a short cycle (about 450 distinct cases per 30,000), so it was replaced (mulberry32) and rerun: 90,000 distinct sentences, each with corrections on and off, 0 differences, the paused rule deciding 1,064 of the focused ones.

**Review gate, pass two, all taken:**

1. should-fix: a kept No still earned credit when an everyday no (no idea, no budget) left the answer. Now the paused count is the input's paused cues less every time the answer still says the word.
2. should-fix: a piece of marks alone (...) counted as the pause before. The piece before must now have a letter or number.
3. should-fix (docs) and an optional narrowing called LaBroi's: Well, no, or Unfortunately, no, after a question still counted. Taken in code, since it only fails open more: a No never counts after a word that opens a sentence (the first piece, or one after a sentenceEnd mark, ".!?" in shared/polish.json). A one-word opener corrected in place (Monday, no, Tuesday) cuts too little to need the deeper floor, so it costs almost nothing.
4. nit: comment wording (the input's paused cues; exactly zero).

Verified after: every new condition has a vector and was broken on purpose (5 desktop, 2 Swift), the direct count compared on 180,000 strings (0 differences, 27,396 with a counted No), and the probe: every answer that came back was right (86 and 84 of 90 corrections, the rest HTTP 429), 70 of 70 traps kept both ways.

**Review gate, pass three:** clean. Deferred nits, both at the strict edge: a closing quote or bracket after a question mark hides the sentence end (She asked "is it ready?" Well, no,), and a two-word opener (Um, well, no,) still counts; the docs say one right after the first word of a sentence.
