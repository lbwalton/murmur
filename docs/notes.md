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

## Where is the sorting, the to-do list, the reminders?

Coming as their own stories. This page covers capture: your words, verbatim after cleanup, in a file you own. The next step files a dump into tasks, ideas, and notes without rewording it, and after that come optional reminders. See the roadmap for status.
