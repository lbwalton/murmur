# Notes: speak a thought into your vault

murmur can send a dictation to a markdown file instead of your cursor. Hold a second chord, talk, release: the words land in a file inside a folder you pick once, with a timestamp, formatted exactly like a normal dictation. This is the brain dump feature. Nothing leaves your machine except what your providers already receive: the audio for transcription, and the text for cleanup when your formatting level is Full.

## How do I speak a note instead of pasting it?

Set two things under Settings, notes: a note chord (click the field, press a combo) and a notes folder (Choose folder). Then, from any app, hold the chord and speak. The pill shows a gold edge and a small "note" tag while you talk, says "noted" when the file is written, and your cursor never moves. The chord follows the same trigger mode as your main hotkey: hold to talk, or tap to start and stop.

The chord follows the paste-last chord's rules. It needs a regular key (a modifier plus an F-key, like Ctrl+F11, is the safest shape), it cannot contain your dictation hotkey, and it cannot be the same combo as another chord. murmur refuses those at capture and says why.

## Does this work with Obsidian?

Yes, and it needs no plugin, account, or setup inside Obsidian. An Obsidian vault is a plain folder on your disk where Obsidian keeps your notes as markdown files (Obsidian's own help says exactly this at help.obsidian.md/vault, checked 2026-09-18), and Obsidian shows whatever appears in that folder, even files written while it is closed. Point the notes folder at your vault and every note shows up there seconds after you finish speaking.

The same holds for anything that reads a folder of markdown: Logseq, iA Writer, a synced iCloud Drive or Dropbox folder, or a plain directory you grep.

## Where does the note go?

By default, each day gets one file at `murmur/inbox/YYYY-MM-DD.md` inside your notes folder, and every note appends under a time heading:

```
## 10:32

Call the dentist about Thursday and move the standup to nine.

## 14:05

Idea: the onboarding wizard could ask for the vault path on first run.
```

The date and time are your local time, so a note at 11 pm lands in today's file, not tomorrow's. Subfolders are created as needed. Writes are append-only, so a vault synced by iCloud, Dropbox, or Obsidian Sync never sees a whole-file rewrite it could conflict on.

## Can I change the file name, the folder layout, or how each note looks?

Yes. Under Settings, notes, File layout, two templates control everything, and a preview line shows today's resolved path as you type.

**File path** is relative to your notes folder. The default is `murmur/inbox/{date}.md`. To append to an Obsidian daily note you already keep, set it to your daily note's path, for example `Daily/{date}.md`. To keep one file per month, `murmur/{year}-{month}.md`.

**Entry** is how each note is written into the file. The default is a `## {time}` heading, a blank line, the text, and a blank line. For one line per note, `- {time} {text}`. Leave a blank line at the end of the template to space entries out; end it with a single line break to keep them tight (list-style templates want this).

Tokens, all rendered in your local time:

| Token | Renders as | Notes |
| --- | --- | --- |
| `{date}` | `2026-09-18` | |
| `{time}` | `10:32` | inside a path this becomes `10-32`, since Windows cannot store a colon in a file name |
| `{datetime}` | `2026-09-18 10:32` | same colon rule inside a path |
| `{year}` `{month}` `{day}` | `2026` `09` `18` | zero-padded |
| `{text}` | what you said | entry template only; inside a path it stays literal |

Reset to default puts both templates back.

## What happens if my template is wrong?

A path template must stay inside your notes folder (no `..`, no absolute paths, no `~`), end in `.md` or `.txt`, avoid characters Windows refuses (`< > : " | ? *`), and avoid Windows device names (CON, PRN, AUX, NUL, COM1 to COM9, LPT1 to LPT9). The preview line tells you the moment a template breaks one of these rules, as you type. If a broken template is saved anyway, the note still lands, in the default layout, and the diagnostics log says `path template failed` with the reason. An entry template with no `{text}` in it would lose your words, so murmur uses the default entry instead, says so under the field, and logs `entry template has no {text}`. Either way the note is written.

## Does a note go through cleanup like a dictation?

Yes. A note runs through the exact pipeline a dictation does: your custom dictionary, the deterministic formatter at your chosen level, the cleanup model if your level is Full, and your text expansions. One pipeline produces one kind of text everywhere, so a note reads the way your pasted dictations read. And like a dictation, the whole stage fails open: if the cleanup model errors or misbehaves, the raw transcript is what gets written, never nothing.

## What if my notes folder is unreachable?

You never lose a word. If the folder cannot be written (an unmounted drive, a renamed vault, a permissions change), the note is appended to `notes/` inside murmur's own data folder, in the same layout, and the diagnostics log records the redirect: `notes folder unreachable reason=...; redirecting to the data folder`. murmur creates subfolders inside your notes folder but never the folder itself, so a renamed vault or an unplugged drive is treated as unreachable instead of being quietly recreated as an empty folder. The Last note line under the notes folder setting says "saved to murmur's data folder" so you notice, and Open today's inbox opens the copy in your notes folder when it exists and the data folder copy otherwise. Every note is also kept in your history on the home tab, so even the copy on disk is not the only one.

If you press the note chord before choosing a folder, the pill says "set a notes folder in settings" and plays the soft no-speech cue. Nothing records until a folder is set.

## How do I open today's inbox?

Two ways: the tray menu has Open today's inbox whenever a notes folder is set, and the notes section in settings has the same button. It opens today's file in whatever app your system uses for markdown (Obsidian, if you have told your system so, or your editor). Before today's first note exists, it opens the folder instead.

## Do notes count toward my belts and history?

Yes. A note is a dictation: it appears on the home tab with a small "note" mark, its words count toward your daily and lifetime totals, your belts, and your recap, and the paste-last chord will paste it if it was your most recent dictation.

## Can murmur sort my notes into tasks and ideas?

Yes, when you turn it on. Under Settings, notes, set Sort into tasks and ideas to On. From then on, after a note lands in the inbox and the pill has said noted, murmur runs a background pass that labels each sentence of the note as a task, an idea, or a note, and copies the tasks and ideas into two more files in your notes folder:

- `murmur/todo.md` gets each task as a checkbox line: `- [ ] Call the dentist about Thursday. ([10:32](inbox/2026-09-20.md))`
- `murmur/ideas.md` gets each idea as a dash line: `- The wizard could ask for the vault on first run. ([10:32](inbox/2026-09-20.md))`

Both files group by day, so a long list stays navigable instead of running together:

```
## 2026-09-20
- [ ] Call the dentist about Thursday. ([10:32](inbox/2026-09-20.md))
- [ ] Email Bob the deck. ([10:32](inbox/2026-09-20.md))
- [ ] Book the flight. ([14:05](inbox/2026-09-20.md))

## 2026-09-21
- [ ] Renew the domain. ([09:12](inbox/2026-09-21.md))
```

Every dump that day joins the heading already there, and the heading is written once per file. Group under, in File layout, sets it: the default is `## {date} {topic}`, the time tokens work in it, and clearing the field turns headings off for one flat list.

## Can the headings say what a note was about?

Yes, with Name each note set to On. The sort model then names each note in at most five words and that name lands in the `{topic}` part of the heading, in both files:

```
## 2026-09-20 domain and blog
- [ ] Renew the domain before the 30th. ([09:12](inbox/2026-09-20.md))

## 2026-09-20 dentist and travel
- [ ] Call the dentist about Thursday. ([10:32](inbox/2026-09-20.md))
- [ ] Book the flight. ([10:32](inbox/2026-09-20.md))
```

Each note gets its own named group, and tasks and ideas from the same note sit under the same name in their own files, so a glance at either list tells you what a block is about.

This is the one place a model's own words reach a file, so it is fenced in. The name goes in the heading and nowhere else, your sentences are still copied exactly as you said them, and a name that is too long, carries markdown, or comes back empty is dropped rather than used, leaving the date standing alone. The note still files either way.

It is off by default, because it sends nothing you did not already send and costs nothing extra, but it does let the model write. Turn it on when the date alone stops being enough to find things.

The inbox note keeps a time heading rather than a topic. Your words are written to disk before any model runs, which is what makes them impossible to lose, and the topic does not exist yet at that moment.

The link in each line points back to the inbox note it came from, relative to the file, so it works in Obsidian and in any markdown reader. The inbox entry itself is never changed: it is your log, exactly as you said it, and todo.md is your working list. A task therefore appears in both places, on purpose. Both file paths can be changed under File layout, under the same rules as the inbox path, and Reset to default restores them.

Sorting is off by default. With it off, murmur writes the inbox and nothing else.

## How does sorting work without rewording anything?

The model never writes a word of your note. murmur splits the note into numbered sentences (a dictated list stays one line per item) and sends the numbered list. The model replies with a small JSON object that assigns each number one label: task, idea, or note. murmur then copies the original sentences, untouched, into the right files. Rewording is impossible by construction.

A sentence can still hold several items, because a brain dump speaks in comma runs: "tomorrow we are getting groceries, getting tacos, and going to the playground." murmur handles that without ever asking the model for text. It finds the places the sentence could be cut itself: at a comma or semicolon followed by a space (so 1,000 is never a cut), and at the words and, then, and also between two runs of words, with a compound like ", and then" counting as one cut. A cut is never offered inside a quote or a parenthesis, and never where one side would be only a joining word. Each possible cut is numbered and shown to the model with its two sides, and the model only votes whether that cut separates two things you would act on separately. murmur cuts at the cuts that came back yes and removes only the joining words, so every word you said lands on exactly one line, in order:

```
- [ ] Tomorrow we are getting groceries ([22:32](inbox/2026-09-20.md))
- [ ] getting tacos ([22:32](inbox/2026-09-20.md))
- [ ] going to the playground. ([22:32](inbox/2026-09-20.md))
```

Only tasks and ideas are cut; a note stays as one sentence in the inbox anyway. A sentence with no possible cut, one the model voted to keep whole, or a vote that names a cut that does not exist files as one line, and the rest of the note is unaffected. "Eggs and bacon" in a sentence about shopping becomes two items; "rock and roll" stays one, because the model votes on meaning while murmur owns the words. A list you dictated as a list is already one line per item and is never cut again. A list's heading, the line ending in a colon right above its items ("I need to buy:" over eggs, milk, and bread, which is how Smart lists writes a spoken list), is never sent to the model: it names the items rather than being a task or an idea, so it stays in the inbox and the items file on their own.

The reply is checked strictly before anything is written: every sentence must be labeled exactly once, only those three labels count, and anything else (chatter around the JSON with numbers missing, an invented sentence number, a label that is not one of the three, a reply that is not JSON at all) rejects the whole sort. The cut votes are checked per sentence: a vote that is not a list of numbers, or names a cut that does not exist, means that one sentence stays whole while the others still split. The relation votes are checked the same way: a malformed vote, or one naming an item that is not in the list, means new for that line only, so a bad reply can never hide a line. Sorting works best at Full formatting, where sentences arrive punctuated; at Off, an unpunctuated ramble is one long sentence and gets one label.

## What happens when a sort is rejected or fails?

Nothing is written until the whole labeling has passed, and both files are opened for writing before either receives a line, so a rejected labeling, a model that could not be reached, or a file that cannot be opened all leave todo.md and ideas.md exactly as they were. Your note is still in the inbox, where it already was. The one failure that can land after that point is a disk filling mid-write; then the Last note line says exactly which lines landed so you can check the files. The diagnostics log records every outcome with its reason and the model that answered (`[sort] rejected reason=missing sentences`, `[sort] failed reason=timeout`, `[sort] filed tasks=2 ideas=1 notes=1 split=1`, where split counts the sentences that were cut), and the Last note line in settings shows the same. Sort again re-runs the sort on your newest note after a rejection or a failure, which is the retry: nothing retries on its own, one sort runs at a time, and a note whose lines already landed is never filed twice.

## Which model does the sorting, and can I change it?

By default the sort connection is Same as cleanup: it uses whatever your cleanup pass uses, which is your speech provider unless you set a separate cleanup connection. Choose Separate provider under Sort connection to run the sort elsewhere, with its own base URL, model id, and key. The key is stored encrypted under that base URL like every other key, and a base URL you already use for speech or cleanup shares that connection's key automatically. Provider setup, model ids, and pricing are on the [providers page](./providers.md). Sorting adds one small model call per note, which the cost estimate on the analytics tab does not include.

## Can I sort with a decision model instead of a chat model?

Yes. Under Sort connection choose Separate provider and set Sort protocol to Decision model; the TypeSafe preset fills in the rest. A decision model does not write text at all. murmur sends the note's numbered sentences as state (with the list of items already filed beside them, when there are any), one typed question per sentence over the three labels, one yes/no question per cut, and, when there are filed items, a relation question and an item-number question per sentence, and gets back typed answers with probabilities in one round trip. Three things follow. A label outside task, idea, and note cannot occur, so the strict reply checks the chat path needs never fire. It answers in about a tenth of a second. And it bills input tokens only, at a fraction of a cent per note (see the [providers page](./providers.md) for the verified rate and the waitlist).

The one thing it gives up is naming: Name each note needs a model that can write, so on a decision connection the heading carries the date alone, and the panel says so. If the decision model does not answer, whether a rate limit, a network fault, or a missing answer, murmur falls back to your cleanup connection's chat model for that note and logs `[sort] decision failed reason=...; falling back to the chat sorter`. The filed log line names which protocol answered.

## Why did a line stay in the inbox after a sort?

On a decision connection, the model reports how sure it is of each label, and a line it is not sure of is held: it stays in the inbox exactly as you said it, files nowhere, and the Last note line says how many were held. A held line is never marked up on disk; the inbox stays the verbatim record. The threshold is the Confidence threshold row under the sort connection rows, shown only for a decision connection, with a default of 0.5 (Balanced): a line files when the model is at least half sure of its label. Lower it to file more, raise it to hold more.

Sort again then sends only the unsure lines back for another look, never the ones that already landed, so a line can never file twice; that holds even when a write fails part way, because whatever landed is remembered and only the rest is sent again. A line held as a duplicate or a completion is not re-sent: it waits for its buttons. A note the model is unsure of throughout behaves as a rejected sort: nothing is written and the log says `[sort] held every line reason=low confidence`. You can also file a held line by hand, since it is sitting in your inbox already.

A chat model has no honest confidence to report and asserts a label either way, so the threshold never applies on a chat connection: there, a sort is all or nothing, as before.

## What happens when I say something that is already on my list?

The sort compares before it files. The items already in your tasks and ideas files (the most recent sixty of each, ticked ones included) ride along with your new sentences, and for each new sentence the model votes one relation: new, the same as an item, or a report that an item is finished. It votes with numbers only; it writes nothing. A task or an idea can be either kind of match. A note can only be a completion: "I finished the deck for Bob" is a statement, and the model labels it a note, but it still holds the deck item for you to tick. A note is never a duplicate, because a note files nowhere; it stays in the inbox and nothing is held. New lines file as always. A line tied to an item is held in the inbox, exactly as you said it, and the notes panel lists it with the item quoted from your file:

- "looks like a duplicate of: Call the dentist about Thursday"
- "sounds like you finished: Renew the domain"
- "you finished this before: Book the flight", when the match is already ticked

Each held line offers only actions that keep every write a click of yours. File it anyway lands that one line with its link, once. Skip leaves it in the inbox and nothing else. A completion whose match is a checkbox in your tasks file also offers Tick it, which marks that item done. A held note, which is what a completion usually is, offers Tick it and Skip only, since a note has nowhere to file. A held line is resolved by those buttons, not by Sort again, which only re-sends lines the model was unsure of. Nothing is ever merged: two lines that say the same thing become one by skipping the second, never by rewriting either. The checkbox is the only truth about completion, and murmur never ticks one on its own. A wrong vote costs you one click, never a word.

A duplicate can sit inside a list you spoke in one breath, for example "pay the gas bill, and call the vet" when the vet is already on your list. The model votes on the sentence as spoken, so it would hold the whole sentence for the one item that matches. murmur handles this by cutting first: when the same reply also confirmed cuts in that sentence, the pieces are sent back on their own in a second, smaller request against the same items, and only the pieces that match are held, each with its own buttons. The gas bill files, the vet is held with your earlier line quoted. The log reads `[sort] compared pieces=2 of=1 held=1`. If that second request cannot be answered, the whole sentence is held as before, and File it anyway lands it cut, one line per item.

## Is Tick it safe?

It is the one edit murmur makes inside a file it did not write that moment, so it is kept narrow. The matched line's `[ ]` becomes `[x]` and every other byte of the file stays exactly as it was, line endings included. The write goes to a temporary file and is renamed into place. A copy of the file as it was is kept in murmur's data folder under `notes-backups` for a day. And if the file changed in place since murmur read the match (you edited or reordered it, or a sync landed), Tick it is refused with a reason, even if murmur itself appended lines in between; tick it by hand or dump again. A file holding bytes that are not UTF-8 is refused too, rather than rewritten. The next reminder reads the file the same way and sees the tick the moment it lands.

## I keep raw notes for my own tools. Can I turn sorting off?

Yes, and it starts off. With Sort into tasks and ideas off, murmur writes each note to the inbox and touches nothing else, so your own agents and scripts can read the raw notes and do whatever you like with them. Turn sorting on when you want the to-do list and the ideas file to happen inside murmur.

## Can murmur remind me what is still open?

Yes, with Task reminders. The row appears once a notes folder is set. Set it to On and pick up to three times of day; clearing a time switches that one off, so one reminder a day is as valid as three. At each time murmur reads your tasks file as it stands at that moment and shows a notification with the open count and as many of the items as fit: "2 open tasks: Call the dentist about Thursday.; Renew the domain." Clicking it opens the list.

It is off by default and it stays quiet rather than nagging. A file where everything is ticked fires nothing. A tasks file that does not exist yet fires nothing and says why. Turning reminders on part way through a day does not deliver that morning's reminder retroactively, and neither does editing a time to one that has already passed. A time you set for later today does arrive, even in a slot that already ran this morning. A machine that was off all day comes back to one readout rather than three notifications a minute apart.

Test fires one immediately from the real file without using up a scheduled one, which is the quickest way to confirm notifications are allowed to reach you. If your system is blocking them, Test says so instead of appearing to work.

Every outcome reaches the diagnostics log with the time that was due: `[reminder] due=08:30 outcome=shown open=3`, `outcome=empty` when nothing is open, and `outcome=missing reason=folder-unreachable` when the vault is not mounted, which reads differently from `reason=no-file` when you simply have no tasks file yet.

murmur only reads this file. Ticking a checkbox in your editor is what closes an item, and that is the count the next reminder uses.
