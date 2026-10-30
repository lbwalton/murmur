# New note control and note file layout (IOS-023 re-check on build 482)

LaBroi's re-check of build 482 (2026-10-18): steps 1 to 4 pass. Two findings:

1. **The New note control does not open murmur.** Tapping it in Control Center highlights it for a few seconds, the session's mic and 15-minute countdown show, nothing records, and there is no stop.
2. **The iPhone writes `murmur/inbox/<date>.md`; his Mac writes `murmur/notes/<date>.md`.** The Mac's default has always been `murmur/inbox/{date}.md` (src/shared/notes.ts since US-050, abf8406), so his Mac's Settings, Notes, File layout, Inbox file was changed. The iPhone has no such setting. He picked "Same settings on iPhone": the Mac's Inbox file, Tasks file, and Ideas file rows come to iPhone Settings, Notes.

## Root cause of 1

Apple's "Configuring the runtime behavior of your app intents" (checked 2026-10-18): "For WidgetKit controls in a Widget extension, the system runs the control's app intent from the extension in the background", whatever `supportedModes` says; `OpenIntent`, `LiveActivityIntent`, and a few others are configured to run in the foreground. Apple's "Creating controls to perform actions across the system": to open the app from a control, use an intent that conforms to `OpenIntent`, with the intent in both the app and the widget extension. `NewNoteIntent` is a plain `AppIntent` with `supportedModes = .foreground`, built into both targets, so iOS ran it from the widget extension, where `NoteControl.open()` is a stub. The countdown he saw is the session he started in step 4. Start murmur works because `StartSessionIntent` is a `LiveActivityIntent`.

## Fix 1: New note is an OpenIntent

- `ios/Live/NoteIntent.swift`: `NewNoteIntent: OpenIntent` with `@Parameter(title: "Screen", default: .newNote) var target: NoteScreen`, where `NoteScreen: String, AppEnum` has the one case `newNote`. Drop `supportedModes` (OpenIntent sets the foreground). Keep `allowedExecutionTargets = .main` for iOS 27. Fix the comments in NoteIntent.swift and Widgets/SessionControlStub.swift that said iOS runs it in murmur.
- Test (AppTests/SessionControlTests): `newNoteIsAnOpenIntent`: a generic `opens<T: OpenIntent>(_: T.Type)` helper compiles only for an OpenIntent, and `NewNoteIntent().target == .newNote`. The existing `theNewNoteIntentOpensNewNote` keeps the perform path.
- Live check only: Control Center, the Action Button.

## Fix 2: the file layout on iPhone

MurmurCore (ios/MurmurCore/Sources/MurmurCore/NoteFiles.swift):
- `NotePathProblem: String, Error` with `empty, absolute, escapes, extension, characters, reserved`, and `NotePath.resolve(_ template:, at: NoteMoment) -> Result<String, NotePathProblem>`: desktop's `resolveNotePath` (src/shared/notes.ts), time tokens filename-safe (10-32), backslashes as slashes, the same checks in the same order.
- `NoteLayout { inbox, tasks, ideas }` with `applied(to: SorterRules, at: NoteMoment) -> SorterRules`: each template resolved at the moment, falling back to the bundled default when it cannot be used, as desktop's `resolveTemplateOrDefault` does. `SorterRules.layout` becomes `var` and `Layout` gets a public init, so a copy can carry the resolved paths.
- `NoteFiles.inbox` unchanged: a resolved path has no tokens left to render.
- Shared vectors: desktop's `notes-vectors.test.ts` gains `paths`, `resolveNotePath` over 20-odd templates at 10:32 on 2026-09-18 (ok, every problem, tokens, backslashes, trimming, unicode), written with `MURMUR_WRITE_VECTORS=1`; `NotesVectorTests.pathsResolveAsOnDesktop` must give the same answers. `layoutFallsBackPerFile` covers `applied`.

App:
- `NotesSettings` gains `inboxFile`, `tasksFile`, `ideasFile` (`String?`, nil is the default; keys `notes.inboxFile`, `notes.tasksFile`, `notes.ideasFile`) and `layout(_ rules:) -> NoteLayout?`, nil when nothing is changed.
- `Notes` takes `layout: @MainActor () -> NoteLayout?` (default `{ nil }`); the stored rules become `base`, `rules` is `rules(at: .now)`, and `save` uses the rules at the note's moment for the inbox and the sort, as desktop resolves the tasks and ideas files at the note's time. `live()` reads `NotesSettings.load().layout(rules)`; its reminders closure uses the live rules.
- `NoteStore.inboxDays` lists files with the inbox's own extension (md or txt).
- Settings, Notes, a File layout section: Inbox file always, Tasks file and Ideas file while sorting is on (desktop shows them only then). Each a monospaced field, no capitals or autocorrect, saved on Return or when it loses focus; empty puts the saved value back; the default saves as nil. Footer per field: where today's file is (`Today: murmur/notes/2026-10-18.md`) or `Falls back to the default because ...` with desktop's reasons. A Use the defaults button while anything is changed. The folder footer stops naming murmur/inbox as fixed.
- `NotesSettingsScreen(defaults:)` so previews and renders show the changed and broken states.

Tests (AppTests): `NotesTests.aChangedInboxFileIsWhereNotesLand` (murmur/notes/{date}.md, file and receipt "notes"), `aBrokenInboxFileFallsBack`, `theTasksFileFollowsTheLayout` (sort files into the changed tasks file), `NoteFolderTests.inboxDaysFollowTheLayout` (txt, folder), `NotesSettingsTests` (load/save round trip, default saves nil, layout nil when unchanged). Renders: NotesSettingsScreen at accessibility5, screen and full page, default, changed, and broken.

## Docs and spec

- ios/docs/iphone.md: "How do I make my iPhone save notes where my Mac does?" with the File layout rows and the Mac's path to the same rows; the New note control opens murmur.
- ios/prd.json IOS-023: acceptance items for the control opening murmur and the file layout; notes for this run. passes stays false.
- HANDOFF: re-check step 5 and a file layout step on the next build.

## Review focus

1. A path the user types that resolves today but writes outside the folder: the guard runs on every resolve, and NoteStore keeps its own `.`/`..` guard.
2. The keyboard's note, a session take, and New note all land in the changed inbox (they all go through `Notes.save`).
3. A Tasks file equal to the Inbox file (desktop allows it: filed lines follow the note).
4. Changing the layout mid-sort: the sort keeps the rules it started with.
5. The App Shortcut phrase for New note still runs with the target's default.
