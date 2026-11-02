# Notes follow-ups from LaBroi's live check (IOS-023)

**Goal:** The four fixes LaBroi asked for on build 479 (2026-10-18): a note receipt that opens the note, Note as a checkmark switch, picking the murmur folder itself, and folder wording that says which folder to pick.

**Spec:** ios/prd.json IOS-023, acceptance 9 to 11 (added 2026-10-18), and LaBroi's answers in the session: the note opens in Obsidian (his pick), and in murmur "if the user doesn't have Obsidian".

## Global constraints

- Public APIs only. The keyboard opens links through its window scene, as it already opens murmur.
- murmur is lowercase everywhere. No em dashes or double hyphens in copy.
- Gold for iPhone action rows; red only for record, error, and delete confirms.
- A link never starts murmur listening (IOS-023 ruling). The note link only shows a file, and only an inbox day file murmur wrote.
- iOS CI is Swift 6.3.3: no Binding(get:set:) closures, split long expressions.

## Review focus

1. A vault name or file path with spaces, slashes, `&`, `#`, or `?` must reach Obsidian intact: every reserved character percent-encoded, `/` as `%2F` (Obsidian's help, checked 2026-10-18).
2. A link from another app naming a file outside the inbox, or with `..`, opens nothing.
3. A folder named murmur that is itself a vault (has `.obsidian`) still nests, so it matches the Mac.
4. Obsidian missing: the open fails and the note opens in murmur, from the app and from the keyboard.
5. The keyboard's Open note goes away when the next take starts, as Insert last does.

## Task 1: Note is one switch with a checkmark

- `Pad.noteMenu` stays "Note"; `Pad.typeMenu` goes. The keyboard's menu item is `UIAction(title: Pad.noteMenu, image: note.text, state: armed ? .on : .off)`.
- Test (PadTests or NotePadTests): `theNoteSwitchIsOneItemWithACheck`, through a pure `Pad.noteItem(armed:)` returning title, symbol, and on.

## Task 2: Picking the murmur folder itself

- `NoteStore.inside: Bool`: the picked folder is murmur's own folder, so `url(_:)` drops the layout's leading `murmur` component.
- `NoteStore.picked(_ url: URL) -> NoteStore` decides it: the folder is named murmur (any case) and holds no `.obsidian` folder. `NotesFolderChoice.store()` uses it, so the pick LaBroi already made takes effect without picking again.
- Tests (NoteFolderTests): `pickingTheMurmurFolderWritesIntoIt`, `aVaultNamedMurmurStillNests`, `anyOtherFolderNests`.

## Task 3: Links to a note

- `NoteStore.vault: URL?`: the Obsidian vault the notes are in. Either the picked folder holds `.obsidian`, or its path runs through `iCloud~md~obsidian/Documents/<vault>`.
- Shared `NoteLink`:
  - `obsidian(vault:file:) -> URL?` builds `obsidian://open?vault=<name>&file=<path from the vault root>`, every reserved character encoded.
  - `murmur(file:scheme:) -> URL?` builds `<scheme>://note?file=<relative>`.
  - `file(in:scheme:) -> String?` parses it back.
- `NoteStore.obsidianLink(_ relative:) -> URL?` joins them.
- Tests:
  - `aNoteInAnICloudVaultLinksToObsidian`
  - `aVaultFolderLinksToObsidian`
  - `theMurmurFolderInAVaultLinksWithItsPath`
  - `aFolderOutsideAVaultHasNoObsidianLink`
  - `reservedCharactersAreEncoded`
  - `theMurmurLinkRoundTrips`
  - `aLinkOutsideTheInboxOpensNothing`

## Task 4: The receipt opens the note in murmur

- New note's receipt row becomes a button. It opens the Obsidian link when there is one; when the open is refused, or there is no link, it shows the day's file (NoteFileScreen).
- murmur's `note` link opens a sheet with NoteFileScreen, only for a file in `notes.folder.inboxDays`.
- Test: `NoteReceiptTarget.first(...)` picks Obsidian or murmur. Render the noted state at accessibility5.

## Task 5: The keyboard's Open note

- `keepNote` returns `NoteKept(place:file:obsidian:)`.
- The mailbox entry carries `notedFile` and `notedLink`.
- The keyboard shows Open note, a gold button in Insert last's place, while the receipt shows. A tap opens the Obsidian link and falls back to murmur's link when that fails, or opens murmur's link at once when there is no Obsidian link.
- Tests:
  - NoteKeyboardTests: `aNoteTakeIsSavedNotTyped` expects the file and link.
  - Pad: `Pad.noteOpen(entry)` gives the links in order.
  - Render the pad with Open note at the keyboard's largest text.

## Task 6: Words, docs, records

- The folder footer says which folder to pick.
- ios/docs/iphone.md: opening a note, the checkmark, the murmur folder, and notes from the keyboard without leaving the app during a session.
- prd notes for the 2026-10-18 live run, `npm run roadmap`, and HANDOFF re-check steps.
