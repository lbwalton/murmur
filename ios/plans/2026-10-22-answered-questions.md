# Polish catches an answer to a short question (IOS-032) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The cleanup pass rejects a model that answers the dictation instead of cleaning it up, on desktop and iPhone alike, while every good cleanup the live probe returned still passes.

**Architecture:** One new check, `answered`, at the end of `validatePolish` (src/main/formatter/llm.ts) and `Polish.validate` (MurmurCore), after every existing check so no existing rejection changes its reason. It compares the answer's spoken words with the input's as multisets (desktop's `spokenWords`): words added, words dropped, and whether the input's question marks survived. Its numbers and word lists live in shared/polish.json (`answer`, `questionMarks`, `numberWords`). The rule's shape and numbers come from the live probe, recorded below.

**Tech Stack:** TypeScript and Vitest (desktop), Swift and Swift Testing (MurmurCore), the live probe through OpenRouter pinned to Groq.

**Spec:** ios/prd.json, IOS-032 (eight acceptance criteria).

## The measurement (2026-10-22)

`src/main/formatter/answers.probe.test.ts` runs 70 sentences through desktop's formatter and polish, one call at a time, with Smart lists and Apply corrections in all four combinations, 2 runs each (560 cleanups), and asks the same model to answer the 32 questions and requests outright (64 answers). Through OpenRouter pinned to Groq:

- openai/gpt-oss-120b (the default): with the cleanup prompt it never answered; asked outright, 25 answers passed today's checks.
- openai/gpt-oss-20b (Groq's other cleanup choice): with the real cleanup prompt it answered 6 times and today's checks typed all 6 ("Canberra." for What's the capital of Australia?, "joyful" for Give me a synonym for happy, "Could you please provide the text you'd like me to refine?" for Make this sound more professional.); asked outright, 28 more.
- Good cleanups that changed words: at most 2 new words (They're ... weather for Their ... whether, 2 of 9), merges (twenty-first), and cuts the corrections and smart lists rules already judge. The deepest cut outside those rules dropped 3 of 9 (Email Jordan, no, text Jordan ... with Apply corrections off).

The rule that came out of it, swept over both models' 1046 answers:

- `added`: words in the answer the speaker never said. Rejected when added > max(answer.slack, answer.addedShare × answer words). Safe range 0.25 to 0.55 for addedShare; the closest good cleanup sits at 0.22, the closest answer at 0.57 ("Good morning" in Spanish is "Buenos días."). Chosen: slack 1, addedShare 0.4.
- `dropped`: words the speaker said that the answer left out, unless the smart lists floor or the corrections rule earned the cut. Rejected when dropped > max(answer.slack, answer.droppedShare × input words). Safe from 0.35 up; every answer caught here dropped everything, the closest good cleanup dropped 0.33. Chosen: droppedShare 0.5.
- `question`: the input holds more question marks (questionMarks) than the answer, and any word changed. Catches "The capital of Australia is Canberra." (2 new of 6, under the share) and "96." for What's twelve times eight?.
- Spoken numbers written as digits: when the answer adds a word holding an ASCII digit and drops a word in numberWords, neither the digit words nor those number words count. "It is 3 PM in Tokyo." drops no number word, so its 3 counts.

With slack 1, addedShare 0.4, droppedShare 0.5: 59 of 59 answers caught (45 by added, 9 by dropped, 5 by question), 0 of 987 good cleanups turned away.

## Global Constraints

- shared/polish.json is the single source for the rule's numbers and word lists; desktop and MurmurCore read them, polish-shared.test.ts proves desktop follows swapped values.
- Fails open: a rejected answer types the formatted text; the fallback reason is `answered`, never the words.
- Desktop is otherwise unchanged: every existing llm.test.ts case, every existing vector's answer, the llmFormatter smoke check, and the corrections probe stay as they were.
- shared/polish-vectors.json expected answers are written by desktop (`MURMUR_WRITE_VECTORS=1`); MurmurCore must match all of them.
- iOS CI runs Swift 6.3.3; Swift string handling follows the JS helpers already in Polish.swift (UTF-16 words, JS.regex).
- murmur is lowercase; no em dashes or double hyphens in copy, comments, or commits.
- Gates before any commit: `npm run typecheck`, `npm run test`, `npm run ios:test`, `npm run ios:smoke`, and `npm run smoke` for llm.ts.

## Review Focus

1. A take of one or two words: one changed word must never reject it alone (slack 1), and Thanks. answered You're welcome! is still caught (2 new words).
2. A question the speaker dictated that the model returns as a question: no new words and the question mark kept, so it passes even when the model fixes one slip.
3. Spoken numbers turned to digits in a short take (Two hundred and fifty. becomes 250.): not rejected.
4. A list or a correction cut: the dropped part never applies when that rule earned the cut, and the added part still catches a list padded with words never said.
5. JS and Swift parity on curly apostrophes, edge punctuation, fullwidth question marks, and digits from other scripts (only ASCII 0 to 9 counts as a digit).

---

### Task 1: Desktop's answered check

**Files:**
- Modify: `shared/polish.json` (answer, questionMarks, numberWords, comment)
- Modify: `src/main/formatter/llm.ts` (`answeredBy`, called last in `validatePolish`)
- Test: `src/main/formatter/llm.test.ts` (a new describe block), `src/main/formatter/polish-shared.test.ts` (mock gains the fields; desktop follows them)

**Interfaces:**
- Produces: `validatePolish(...)` may return `{ ok: false, reason: 'answered' }`. polish.json gains `"answer": { "slack": 1, "addedShare": 0.4, "droppedShare": 0.5 }`, `"questionMarks": "?？"`, `"numberWords": [...]`.

- [ ] **Step 1: Write the failing tests** in a new `describe('validatePolish catches an answer (IOS-032)')`: rejects (reason answered) for "It is 3 PM in Tokyo." to What time is it in Tokyo?, "I'll send you the report by Friday." to Can you send me the report by Friday?, "Canberra." and "The capital of Australia is **Canberra**." to What's the capital of Australia?, "96." to What's twelve times eight?, "Joyful." to Give me a synonym for happy., "Hello! How can I help you today?" to Hello., "You're welcome!" to Thanks.; keeps "They're going to be late because of the weather.", "Let's meet at noon.", "Grab 2 coffees on the way in.", "250." for Two hundred and fifty., "Can you send me the report by Friday?" unchanged, "What time is it in Tokyo?" for the same words without a question mark, a list with smart lists on, and Let's go to Japan and stay for a week. with corrections on; and every existing test unchanged.
- [ ] **Step 2: Run** `npx vitest run src/main/formatter/llm.test.ts`. Expected: the new rejects FAIL (ok true), the keeps pass.
- [ ] **Step 3: polish-shared.test.ts**: the mock gains `answer`, `questionMarks`, `numberWords` with other values, and a test shows desktop follows them (a swapped question mark and number word). Run it: FAIL until llm.ts reads them.
- [ ] **Step 4: Implement** `answeredBy(input, countable, text, floorEarned)` in llm.ts and the polish.json fields; call it after the appended chatter check.
- [ ] **Step 5: Run** `npx vitest run src/main/formatter` . Expected: PASS, every earlier test untouched.
- [ ] **Step 6: Commit** with the gates green.

### Task 2: Shared vectors

**Files:**
- Modify: `shared/polish-vectors.json` (new validate cases)
- Test: `src/main/formatter/polish-vectors.test.ts`

- [ ] **Step 1:** Append cases: the real answers from the probe (both models, including gpt-oss-20b's six typed through the cleanup prompt) and the Task 1 rejects and keeps, with Smart lists and Apply corrections on and off, plus parity cases (a curly apostrophe, a fullwidth question mark, Arabic-Indic digits that are not ASCII digits).
- [ ] **Step 2:** `MURMUR_WRITE_VECTORS=1 npx vitest run src/main/formatter/polish-vectors.test.ts`, then `git diff shared/polish-vectors.json`. Expected: only added cases; no existing case's answer moves.
- [ ] **Step 3:** Commit.

### Task 3: MurmurCore's answered check

**Files:**
- Modify: `ios/MurmurCore/Sources/MurmurCore/Polish.swift` (PolishRules gains `answer`, `questionMarks`, `numberWords`; `validate` calls the check last)
- Test: `ios/MurmurCore/Tests/MurmurCoreTests/PolishTests.swift` (the vector count floor rises; a test that an answer falls back with reason answered)

- [ ] **Step 1:** Raise `theSharedFilesLoad`'s count to the new total and add `anAnswerToTheDictationFallsBack`. Run `npm run ios:test`. Expected: the new vectors and test FAIL.
- [ ] **Step 2:** Implement in Swift with the existing `spokenWords` ([[UInt16]]) and multiset counts.
- [ ] **Step 3:** `npm run ios:test`. Expected: all vectors pass.
- [ ] **Step 4:** Commit with all gates.

### Task 4: The probe's final run, docs, and the Cleanup line

**Files:**
- Modify: `src/main/formatter/answers.probe.test.ts` (asserts no answer is typed and no good cleanup is turned away by answered)
- Modify: `docs/settings.md`, `ios/docs/iphone.md`, `ios/App/Cleanup/CleanupCopy.swift` and its test if the line changes
- Modify: `ios/prd.json` notes, `HANDOFF.md` (criterion 8's live check), `ROADMAP.md` via `npm run roadmap`

- [ ] **Step 1:** Run the probe live on both models with the rule in place; record counts and any miss in IOS-032's notes for LaBroi.
- [ ] **Step 2:** Run the corrections probe (both list settings) and confirm its earlier numbers.
- [ ] **Step 3:** Docs: what polish catches, phrased as the question users ask; drop the iPhone line that says a short answer can still get through.
- [ ] **Step 4:** Review gate, fixes, push, wait for CI.
