# murmur settings, explained

Everything the settings window can do. For provider setup (base URL, keys, model ids per provider) see [connecting a provider](./providers.md).

## How do I get between the tabs?

The bar at the top of the window (the murmur wordmark with your belt, then home, analytics, wrap-up, journey, and settings) stays put while you scroll, so any tab is one click away from anywhere on a long page. The tab you are on has a short gold brush stroke under its name.

## What is the home view?

The window opens on your transcription log: every dictation, grouped by day, newest first, with the time, word count, and words-per-minute of each take. It updates live as you dictate. Each entry has a copy button, so a dictation that landed in the wrong window is one click from your clipboard. Above the log, once you have dictated at all, a card shows your time back for today (the minutes you did not spend typing, explained under "How does murmur calculate time earned back?") with this month and lifetime beneath it. A gold brush stroke under the number shows today against your typical day: the stroke is today, a dotted line carries on for the rest of a typical day, and a day past typical fills the width. The line under it says it in words, for example "63% of your typical day (41 min)", or "More than double your typical day" on a big one. Your typical day is the middle value (the median) of your time back across the days you dictated in the four weeks before today, so one huge day or one quiet day barely moves it. It needs three days with dictation in those four weeks, not counting today; until then the card says so and draws no stroke. Under your dictations, 1 line says how long they are kept, with a link to Settings, History. A red ✗ next to the settings tab means setup needs attention.

## How is the settings tab organized, and how do I find a setting?

A rail on the left lists every section in three groups. Essentials: Provider and keys, Dictation, Dictionary. Features: Notes, Transform, Time back and recap. App: History, Look, System, murmur Pro. Click a section to scroll to it; the rail marks the section you are reading as you scroll, and a red dot beside a section means a setup check inside it needs you.

The search field at the top of the rail finds any setting by its name, its description, or a common word for it (type shortcut and Hotkey comes up, type log and Diagnostics does). Matches replace the section list while you type. Click one, or press Enter for the first (the arrow keys move between them), and murmur scrolls to that setting and highlights it, opening an Advanced fold if the setting lives inside one. Esc clears the search.

Settings most people never touch sit under a fold at the bottom of their section that says what it holds: Advanced under Provider and keys (base URL, profiles, price refresh, and the Groq defaults), and File layout under Notes. On and off settings are switches; short choices like Hold to talk or Tap to start, tap to stop show every option as a button in a row, all the same width, and the one picked has a gold edge and a check mark.

## How long is my history kept, and where?

History lives only on your machine, in murmur's local data folder. **Keep history for**, in Settings, under History, sets how long. Home says the current rule in 1 line under your dictations, with a link there:

- **30 days, 90 days, a year, or forever.** Entries older than that are removed.
- **24 hours.** The words of a take go after 24 hours, checked every 15 minutes while murmur runs. The numbers stay, so your stats, belts, and paintings keep counting.
- **Don't keep.** No words are saved to disk, only the numbers. This session's takes stay in memory on the home tab, so you can copy one or paste the last one, and their words are gone when you quit murmur, leaving the numbers on each row. A take that reached neither an app nor your clipboard, such as one a locked mic stopped on its own, keeps its recording on the waiting list, so Retry can bring its words back after a quit. That recording goes after 24 hours, the next time murmur runs, or sooner once paste last puts the words in an app. A take left on your clipboard because the paste keystroke failed is not held. Notes are different: they are your own files, so they still land in your notes folder.

Changing this tells you what it will remove first, whichever way you move it. Going to a day limit removes older entries with their numbers, so your totals drop. A take with no words says so on its row, and what you said and report are not available for it. Under 24 hours and Don't keep, a recording waiting to retry goes after 24 hours, the next time murmur runs, since until then it is the only copy of a take that failed. A recording held for a take that reached no app goes the same way, whatever you change this to. Choosing a day limit removes recordings older than it, after asking. At most 20 recordings wait at once, and the oldest go first, except that a held recording whose words are still on the home tab goes before them.

**Clear all** asks first, in place, with the count of everything in your history (for example, Clear all 1,204 entries from your history?), because it cannot be undone: your stats, time back, and belt progress are counted from your history and start over. **keep them** is selected, so Enter or Escape leaves it as it was; click the red **clear** button to empty it. Note files stay in your notes folder, and recordings waiting to retry are not touched. Nothing about your history is ever uploaded anywhere.

## Is my history encrypted?

Yes, by default. The words in your history are encrypted on disk with a key your system's secure storage holds: the Keychain on Mac, and your account's protected storage on Windows. **Encrypt saved words**, beside **Keep history for** in Settings, under History, turns it off and on, and murmur changes the whole file right then.

- **It protects the file, not your screen.** A copied history file or folder cannot be read elsewhere. On a Mac, another program has to ask the Keychain first. On Windows, a program already running as you can still reach the key, so there this guards copies more than programs. Your words still show on the home tab, so turning this on does not hide them while you share your screen or film. [Hide words](#how-do-i-hide-my-words-while-i-share-my-screen-or-film) does that.
- **Your notes stay plain files.** They are your own, so they stay readable in any app. Recordings waiting to retry and your settings are not encrypted either, and the numbers in your history stay readable so your stats, belts, and paintings always work.
- **A history file or folder copied to another machine cannot be read there.** The key stays in this computer's secure storage. On the other machine you keep the numbers, and the rows say their words cannot be opened. Moving your whole account can bring that storage along, such as Migration Assistant, a Time Machine restore, or a roaming Windows profile, and then your words read as before.
- **If your system loses the key,** such as after a Keychain reset, the same is true here: rows keep their numbers and say their words cannot be opened. Those words stay in the file, so they read again if the key comes back, until Clear all or a 24 hours or Don't keep limit removes them. The line beside the switch counts them.
- **If secure storage is not available,** murmur keeps working, keeps your words as plain text, and says so beside the switch. It encrypts them once it can.
- **Older copies stay as they were.** Backups made before this was on still hold plain text.

## How do I hide my words while I share my screen or film?

Turn on **Hide words**. Your dictated words stop showing in murmur's windows, and it stays on after a restart, so restarting mid-recording reveals nothing. The switch is on the home tab, just above your history, in Settings, under History, and in the tray menu (the menu bar menu on a Mac). They are the same setting. The one exception to hidden words is a text field in murmur itself, such as the settings search or a dictionary entry: dictate into one and your words show there, so keep your cursor in another app.

- **What stays:** the time, word count, pace, and status of every take, and every number, belt, and painting.
- **What is hidden:** your takes on the home and wrap-up tabs, what you said, the last note's first line, and lines held in Notes. The words are left out of the window entirely, so hovering or selecting a row shows nothing. A row says Words hidden.
- **Copy and paste last keep working.** A copy button still copies the words, and your paste last shortcut still pastes them. What you paste shows in that app.
- **Report is off while this is on,** because a report shows your words so you can check them before anything goes. The report button says so. Turn off Hide words to report a take.
- **Try it, the practice box, is off** too, because what you dictate into it would show there.
- **Notifications leave the words out.** A note receipt says where the note went, and a task reminder says how many tasks are open. Those already delivered are different. On a Mac, turning the switch on removes a waiting receipt or reminder from Notification Center. On Windows, it takes back only one murmur showed since it last started, so one from before a restart stays in Action Center until you clear it.

It does not hide what lands in other apps, so a dictation still types into whatever you are sharing. It changes what shows, and nothing about what is saved: use [Keep history for](#how-long-is-my-history-kept-and-where) and [Encrypt saved words](#is-my-history-encrypted) for that. It sends nothing anywhere.

## How do I see what cleanup changed, and get my words back?

Open the home tab. When cleanup changed any of your words, that take shows **what you said**. Click it to see the words as they were heard, with anything removed struck through, then **Copy what you said** to put them on your clipboard. Nothing touches the clipboard until you click. Paste last, your numbers, and your belts stay as they were. Transforms and takes where nothing changed do not offer it.

These are the words your speech provider heard, so if it misheard you, this shows that too.

## What happens on first launch?

A guided wizard walks the whole setup: welcome, provider key with a live connection test, macOS permissions with deep links and live status, hotkey capture, and a test dictation. Each step gates on actually being done, so finishing the wizard means murmur genuinely works. Skip anytime; the settings tab keeps tracking anything unfinished, and Run wizard under Settings, System starts it over whenever you like.

## What do "all set" and the Finish setup card mean?

murmur checks everything it needs to work: your API key saved, the provider connected, the microphone, accessibility, input monitoring (the last three on macOS), and a valid hotkey. When every check passes, setup folds away into a single **all set** badge at the top of the rail. Click the badge to see the checks listed.

When any check fails, a **Finish setup** card opens at the top of the settings column. It lists only what is missing, each with the button that fixes it right beside it: Add key walks you to the key field, Test runs the connection check, Open settings opens the matching macOS permission pane, and Set hotkey walks you to the hotkey. A row of small lamps and a count ("4 of 6 ready") show how far along you are, and a Ready line names what already works. A check that waits on another says so (the connection test runs by itself once a key is saved). Right after launch, while the first connection test is still running, the badge reads checking and the card stays closed. Once the last item passes, the card folds back into the all set badge.

## How do I set my API key?

Under Settings, Provider and keys, paste your key into the **API keys** list on your provider's line and press Save. It is encrypted with your operating system's secure storage, kept only on your machine, and sent only to that provider. Only a masked form (like `gsk_…OC9g`) is ever displayed, marked **in use**. Replace swaps in a new key; Remove deletes it. The Connection row right below tests it on its own after a save, and its Test button runs the check again: green `connected` proves the key and base URL work together.

Each provider keeps its own key, so the list also shows keys you saved for providers you are not using right now, one per line, each with its own Remove. Switching the Provider preset brings that provider's saved key back into use.

## How do I change the hotkey?

Click the hotkey field, then press the combo you want. Two kinds work:

- **Modifiers plus a key**: press them together, like Ctrl+Shift+M or Alt+Space
- **Modifiers alone**: press and release just the modifiers, like Ctrl+Alt. Hold them to talk, release to stop, exactly like the fn key in other dictation tools

Escape cancels capture. **Reset** restores the platform default. Bare letters and digits are refused on purpose: a hotkey of plain `H` would trigger every time you typed the letter. Function keys (F1 to F24) may stand alone.

## How do I paste my last dictation again?

Set a chord under Settings, Dictation, Paste last dictation. Pressing it pastes your newest history entry wherever your cursor is, through the same insertion pipeline as a live dictation: handy when a busy app missed the original paste, or you want the same text somewhere else. The feature is off until you capture a chord, and Clear disarms it again. It is also how you paste words murmur saved without pasting: a hands-free take that stopped on its own or from the tray's Stop hands-free, and a dictation you retried on Home. Those leave your clipboard alone, so the chord is the way to paste them (or click **copy** on the entry in the log on Home).

Two rules keep the chord trustworthy. It needs a regular key (modifiers alone fire by accident), and it must not contain your dictation hotkey's modifiers (holding Ctrl+Alt+V with a Ctrl+Alt dictation hotkey would start a recording before the V lands), so murmur refuses those at capture and says why. murmur listens globally without swallowing keys, so pick a combo your apps ignore: a modifier plus an F-key (Ctrl+F12) is the safest shape. Holding the chord pastes once, the moment you let go of its modifiers (a paste sent while Ctrl is still down reaches the app as Ctrl+Cmd+V, which is not paste; after a second murmur pastes anyway), and it does nothing while a recording or transcription is in flight. With empty history it plays the soft no-speech cue and touches nothing.

## How do I speak a note instead of pasting it?

Set a note chord and a notes folder under Settings, Notes. Holding the note chord records like a dictation, but the words append to a markdown file in that folder (an Obsidian vault works as is) instead of landing at your cursor. The whole feature, including custom file layouts, the never-lost fallback, and what Obsidian sees, is on its own page: [notes](./notes.md).

## How do I rewrite selected text by speaking?

Set a transform chord under Settings, Transform. Select text in any app, hold the chord, and say what to do ("tighten this paragraph"); the result replaces the selection, and paste-last brings the original back. What gets sent, the 8,000 character limit, the separate connection, and the Keep originals in history switch are on their own page: [transform](./transform.md).

## What is the difference between hold to talk and toggle?

**Hold to talk**: recording runs while the hotkey is held, stops when released. Best for short, frequent dictations. For a long passage, tap the hotkey twice instead and keep talking without holding it; one more tap stops it (see [How do I dictate hands-free?](#how-do-i-dictate-hands-free)). **Tap to start, tap to stop** (toggle): tap once to start, tap again to stop, every time, for anyone who cannot comfortably hold a key or tap it twice. Rapid accidental double-taps are absorbed.

## How do I dictate hands-free?

Tap the dictation hotkey twice, quickly, and keep talking. murmur holds the mic open until you tap the hotkey once more, then your words land at the cursor as usual.

- **Starting**: a tap is a press shorter than 300 ms, and the second tap has to come within 400 ms of letting go of the first. Recording starts on the very first press, so nothing you say is lost while murmur works out whether you are holding or tapping. A press held longer is ordinary hold to talk, exactly as before.
- **Stopping**: one tap of the hotkey ends the take, and the words go through the normal pipeline: pasted at your cursor, or left on the clipboard in Copy only mode. For half a second after the lock murmur ignores the hotkey, so a fumbled third tap cannot end the take early.
- **Cancelling a take**: press Escape on its own. Nothing is uploaded and nothing goes to history; the pill ends with a dry grey brush scrape. The audio is kept on Home under waiting to retry, in case the Escape was meant for the app in front, and a notification says so; press **retry** to get the words, or **discard** to delete it. A take with no speech in it is not kept, and if the audio could not be kept the notification says so. For the split second it takes to save, a press of the hotkey does nothing. Escape still reaches the app in front, as every key does. With a modifier key held it is a different shortcut (Cmd+Option+Escape is Force Quit on the Mac, Ctrl+Escape opens Start on Windows), so the take keeps going.
- **What the pill shows**: the pill's own edge closes into a loop in one amber brush stroke, and the timer shows how long the mic has been open (0:42). The loop starts at full strength, holds for 1 second, then fades over 3 seconds to a fainter ring that stays for the rest of the take. A faint ring still means murmur is holding the mic open. In the last minute before the 12 minute limit, the loop dries from amber to gold and stays at the same faint level. With sound cues on, 2 light ticks on one high note (tap tap, an echo of your double-tap) confirm the lock. With reduced motion on, the loop is drawn whole and still, and the fade still happens, since it only changes how strong the loop is and nothing moves. Holding the hotkey looks exactly as it always has.
- **How faint should the loop get?** Settings, Dictation, **Loop once it settles**, right under Double-tap for hands-free. Drag the slider from 10% to 100% in steps of 5; the default is 20%. The small pill above the slider is your own pill while it records (your overlay look, waveform, and color, with the red dot and a timer) and shows the loop at the level you pick, following the slider as you drag. A take that is already locked changes to match as soon as you let go of the slider. 100% means the loop never fades. 10% is the lowest it goes, so a locked take never looks like a plain hold. The slider is dimmed while the Double-tap switch is off, and it shows only under Hold to talk.
- **Your screen stays awake** while a take is locked, since you are not touching the keyboard or mouse. It goes back to normal the moment the take ends.
- **The tray menu** shows Stop hands-free and Discard while a take is locked. Discard throws the take away for good: nothing is uploaded, kept, or added to history. Stop hands-free saves the words to history without pasting, because clicking the tray can move focus away from the app you were in. Your clipboard is left alone, so Cmd+V (Ctrl+V on Windows) still pastes whatever you copied; press your paste-last chord to paste the words (see [How do I paste my last dictation again?](#how-do-i-paste-my-last-dictation-again)).
- **It stops on its own** after 2 minutes of quiet, when your screen locks, or at 12 minutes, and saves the words without pasting; see [Why did murmur stop my hands-free take?](#why-did-murmur-stop-my-hands-free-take).
- **Notes**: the note chord works the same way, so a long brain dump is one double-tap away. The note files to your inbox and sorts like any other note. **Transform** stays hold only: it reads your selection when the take ends, and a long take could rewrite the wrong text.
- **Modifier-only hotkeys** (a hotkey that is just Ctrl, say) count a tap only when no other key joins it, and the lock and the stop both wait for that clean release. A press joined by another key, like Ctrl+C after a Ctrl tap, is never a tap, a lock, or a stop, so a shortcut can never lock the mic or end a take halfway through.

Prefer hold to talk exactly as it was? Switch off Settings, Dictation, Double-tap for hands-free. The switch is on by default and shows under Hold to talk; Tap to start, tap to stop is unchanged by it.

## Why did murmur stop my hands-free take?

So a mic is never left open by accident, a locked take stops on its own in 3 cases:

- **2 minutes of quiet**: less than 200 ms of speech in the last 2 minutes, so a cough or a key click does not keep the mic open. Sound counts as speech when it reaches the loudness threshold of the speech check that keeps a silent take from being sent.
- **Your screen locked.**
- **12 minutes**, the longest take. murmur uploads 16 kHz mono audio, 32 KB a second, so 12 minutes is about 23 MB, under the 25 MB Groq accepts for an uploaded file (console.groq.com/docs/speech-to-text, checked 2026-10-30).

These takes are transcribed and saved to history, never pasted, because the app in front may have changed while you talked. Your clipboard is left alone: Cmd+V (Ctrl+V on Windows) still pastes whatever you copied before. A notification says why the take stopped and where the words went, and names your paste-last chord (the one under Settings, Dictation, Paste last dictation) so one press pastes them; if you have not set a chord, or the one you set is disarmed (it clashes with another hotkey, and Settings says so beside it), it points you to your history on Home instead. A note is filed as usual. If the transcription fails, the notification says the take is waiting under Retry on Home; if the take could not be saved at all, the notification says that too.

If your computer sleeps, shuts down, or murmur quits (an update restart included) during a locked take, there is no time or network to transcribe it. The take stops, its audio goes on the Retry list on Home, and a notification says so; press Retry when you are back. Nothing is transcribed or copied later on its own, and murmur never installs a downloaded update while a take is locked. On Windows a shutdown does not wait for murmur, so that save is best effort.

## How do I choose which microphone murmur uses?

Settings, Dictation, Microphone. **Mac default** (on Windows, **Windows default**) follows your computer's default input, also after a mic is unplugged or the computer wakes. Picking a mic by name keeps murmur on it whenever it is plugged in; while it is unplugged the default stands in. The row shows the mic in use right now, and murmur only ever switches between dictations. Details: [microphone](./microphone.md).

## What do the insert modes do?

**Paste at cursor** places the finished text wherever your cursor is, then restores whatever your clipboard held before about a second and a half after the paste lands, giving even a busy target app time to read it (an image or file on the clipboard is never destroyed, and anything you copy mid-dictation wins). **Copy only** skips the paste and leaves the text on the clipboard for you to place manually. If pasting ever fails (a revoked permission, an unusual app), murmur falls back to copy so the dictation is never lost.

## What do the formatting levels mean?

- **Off**: the raw transcript, untouched
- **Light**: filler words removed, sentences capitalized
- **Full**: everything in light, plus spoken punctuation commands ("period", "comma", "new line", "new paragraph"), self-corrections ("scratch that", and with Apply corrections on, spoken fixes like "oh wait, I mean Wednesday"), number style, closing punctuation, and the AI cleanup pass through your configured cleanup model

The cleanup pass fails open: if the model is slow, wrong, or chatty, murmur inserts the deterministically formatted text instead. A dictation is never lost or delayed indefinitely because of the cleanup model.

## What is Smart lists, and how do I dictate a list?

Smart lists turns spoken structure into real structure. It is off by default (dictation behaves exactly as it always has) and lives in Settings, Dictation, Smart lists. With it on and formatting at Full, murmur formats lists two ways:

- **Automatically.** Speak a sequence ("first I want to email the team, then update the deck, then send it to the client") and it becomes a numbered list, one step per line. Run through items ("I need to pack socks, shirts, shoes, pants") and it becomes a bulleted list, one item per line. Ordinary prose stays prose; the cleanup model is instructed never to force a list onto normal sentences.
- **By command.** Say "bullet point", "next item", or "next bullet" to start a dash line yourself, the same way "period" and "new line" work today. Commands are deterministic: they work even when the cleanup model is unreachable.

Lists use plain text markers ("- " and "1. "), so they paste correctly everywhere, and markdown apps render them as lists. Automatic list recognition needs the cleanup pass (Full formatting and a working cleanup model); the spoken commands only need Full formatting. Verified against format-spec version 1 (2026-09-13).

## How do I make murmur fix my spoken slip-ups?

Turn on Apply corrections in Settings, Dictation. With it on and formatting at Full, when you say something wrong and then fix it, only the fix is typed:

- "Send the invoice to Mark on Tuesday. Oh wait, actually what I mean is Wednesday." types "Send the invoice to Mark on Wednesday."
- "The budget is fifteen thousand, sorry, fifty thousand for the quarter." types "The budget is fifty thousand for the quarter."
- "I think we should, we should ship on Friday." types "I think we should ship on Friday."
- "The printer is on the second floor, on the third floor by the kitchen." types "The printer is on the third floor by the kitchen."
- "I was thinking we could paint the hallway, you know what, never mind, let's replace the carpet first." types "Let's replace the carpet first."

It is off by default, and off means dictation behaves exactly as it always has: your slip-ups stay in the text.

**What counts as a correction?** 3 shapes, and murmur reads the whole take before deciding:

- A fix with a cue word that takes back something you just said: oh wait, wait, actually, I mean, sorry, no, rather, make that, what I meant was, let me rephrase that. The fix can come in the same sentence or the next one.
- A restatement with no cue word, where you say a phrase and then say it again a better way. The later version stays.
- An abandoned start, where you begin a thought and drop it: forget that, never mind, you know what, hold on, start over, or just trailing off. The dropped thought goes, and what you said next stays. A reversal counts too: say one thing, then the opposite, and only the last one is typed.

Words you stumbled into repeating go as well.

**Will it remove "actually" or "I mean" when I mean them?** No. When nothing is being taken back, the cue word is part of what you said and stays: "Actually, the tests are passing now" and "I mean, it works, but it could be faster" type exactly as spoken. The same goes for "Never mind the rain, the game is still on."

**Can it lose words?** Rarely, so read back anything that matters. The cleanup pass still fails open: when the model's answer does not look like a correction, murmur types your formatted words instead. A cut deeper than ordinary cleanup is accepted only when your speech shows it: every typed word was spoken, in the order you spoke it, the take still ends on your last word, and each cut part ends in a cue word or is said again right after. murmur also refuses an answer that kept only what you said before you changed your mind. These checks catch most bad answers, not all of them: they read words, not meaning, so a model can still drop a fact in ordinary cleanup.

**Does the cleanup model matter?** Yes. Catching a restatement with no cue word takes judgment, and models differ. On murmur's scored test set of made-up messy speech, some cleanup models catch far more than others. See [providers](providers.md) if you want to try a different one.

Corrections need the cleanup pass (Full formatting and a working cleanup model). Saying "scratch that" deletes the current sentence at Full formatting with or without this switch.

## What does the analytics tab show, and how is the cost estimated?

The analytics tab shows your dictation in numbers: minutes, words, sessions, time back, and an estimated cost for this month, the last fourteen days as brush dabs (each as tall as that day's words, today in gold, a day without dictation a faint speck), and lifetime totals. Time back is the minutes you did not spend typing, computed as described under "How does murmur calculate time earned back?" below. The cost figure is an estimate computed locally from your usage at published provider rates (from the provider catalog, `shared/provider-catalog.json`, each rate carrying its own verified-on date): audio time at the speech model's hourly rate, honoring Groq's 10-second minimum per request, plus an approximation of the cleanup model's token usage. Your provider bills you directly; murmur never sees your billing, and no numbers leave your machine. At typical usage, expect the estimate to read in cents, not dollars: that is the point of BYOK.

## How does the custom dictionary work?

The dictionary fixes words the speech model keeps mishearing, names especially. Add a pair in Settings, Dictionary, Custom words: what it is heard as, and what it should be written as. Matching is whole-word and case-insensitive; output uses exactly the casing you typed, even at the start of a sentence, and even after the AI cleanup pass. Multi-word phrases work, and longer phrases win over shorter ones. The dictionary can only ever change words that were actually spoken: an unrelated dictation is never touched, and dictionary content can never leak into your text on its own.

## How do text expansions work?

An expansion turns a spoken trigger phrase into a saved snippet: say "insert my email" and your address appears; say "sign off" and your closing lines appear. Add pairs in Settings, Dictionary, Expansions. Triggers match after formatting, so they work naturally mid-sentence and next to punctuation. Snippets insert exactly as written, line breaks and casing included, and a snippet's own content never triggers another expansion. When two triggers could match at the same spot, the longer one wins.

## What are the waveform styles?

How the overlay pill visualizes your voice while recording. Pick one in Settings, Look, Waveform: each style is a tile showing the real pill, moving to a made-up voice (your microphone is never used for the tiles). Click a tile to use it from your next dictation; the one in use is outlined in gold. Locked styles stay in the grid, dimmed, with the belt that earns them. With the keyboard, tab into the grid, move with the arrow keys, and press Enter or Space to pick. The tiles move only while you can see them, and with reduced motion turned on in your system settings each shows a still frame.

- **Bars** is the classic equalizer.
- **Speckle** is a dust field that drifts when quiet and vibrates with your speech.
- **Pulse** sends rings out from the dot as you speak. It arrives with your white belt.

Four more are painted with a brush, and each arrives with a belt:

- **Ink dabs** (white belt) are brush dabs at your voice level. Fresh paint is wet and bright, and it dries to gold as it scrolls away.
- **Ink flecks** (blue belt) are paint flecks that shiver with your voice and fling a drop on a loud syllable.
- **Ink rings** (purple belt) are dry-brush arcs that ripple out from the dot and break up as they travel.
- **Ink ribbon** (brown belt) is one continuous stroke your voice paints, thick when you are loud and thin when you are quiet.

Every ink style follows the same rules: wet paint while you speak, a sheen as it dries while murmur processes (and a softer one every 2 seconds if processing takes a while, so a long wait never looks frozen), flat once your words are inserted, a dry grey scrape when no speech was heard, and plain red with no brushwork for an error. With a custom accent color, the paint is your accent and it dries to a darker shade of it. Ink styles work in every overlay look, pill, compact, and bare. **Preview**, beside Overlay look, plays the whole cycle anytime without dictating: a few seconds of speaking, five seconds of drying (so you see the sheen repeat), then the words landing.

## How do I make the overlay smaller or less intrusive?

Settings, Look, Overlay look. Three looks:

- **Pill** is the classic: the dot, the waveform, and the timer in a rounded box.
- **Compact** is the same pill at about two thirds, for when the box covers what you are reading.
- **Bare** drops the box and the border entirely: just the waveform, with the timer in small type beneath it. Every bar, dot, and ring carries a faint ink edge that hugs it, so the waveform reads over a white page as well as a dark app, and the speckle, pulse, and ink styles fade out toward their edges instead of stopping at a line. It just appears, more instrument than window.

One rule holds in every look: text that has to be read (a hint such as "set a notes folder in settings", an error, no speech) always comes in the full pill, because a sentence with no backing is unreadable over a busy window. In bare, a note or a spoken edit shows its small mode tag but not the gold edge the pill wears, since there is no edge to color. Preview shows the current look without dictating. The overlay never takes focus and clicks pass straight through it in every look, so it can never steal a keystroke from the app you are dictating into.

## How do I make murmur's window text bigger?

Zoom the window. On a Mac, press Cmd + (or Cmd =) to zoom in, Cmd - to zoom out, and Cmd 0 to go back to actual size; the same three live in the View menu while the murmur window is in front. On Windows, press Ctrl +, Ctrl -, and Ctrl 0.

Each press steps through 80, 90, 100, 110, 125, 150, 175, 200, 250, and 300 percent, like a browser. Past 200 percent, less fits in the window at once, so make the window bigger to see more. Only the settings window zooms: the overlay pill keeps its size, so dictation looks the same wherever you zoom. murmur remembers your zoom, so the window opens at the same size after you quit and reopen it. Text, the brush marks, and the painting all redraw at the new size, so nothing turns blurry.

## How do recaps and the wrap-up work?

Turn on Daily recap under Settings, Time back and recap, and pick a time. At that moment (or on the next wake if the machine was asleep, once per day) murmur sends a notification with your day's numbers, ending with your time back once the day has at least a minute of it: "4 sessions, 12 minutes, 1,240 words today. 19 minutes back." Clicking it opens the wrap-up tab, with today's painting at the top (see the next question), then your dictations and words, your time back at your own typing speed, your longest take, and your best pace, and under it every take from the day. Copy summary puts those two lines on your clipboard. The Test button fires a preview notification immediately without using up the day's recap.

## What is the painting on the wrap-up tab?

A painting a day. Each day murmur sets out a painting, and every take you make adds its next brush stroke (a dictation, a note, or a transform; a transform counts its spoken instruction, and only when Keep originals in history is on, as it is unless you turn it off), in the order a painter would make them: the moon before the water, the stalk before its leaves, the far mountains before the near ones. Longer takes paint bolder strokes. The newest stroke paints itself in when you open the tab.

- **Its size** is a typical day for you: as many strokes as the takes you make on a usual day over the last four weeks (from 6 to 36; 6 until you have three days to go by). A typical day finishes it about half the time, so a busy day finishes it and a quiet one leaves it part way.
- **Its subject** is a surprise, one of fourteen: a moon over water, bamboo, a plum branch, mountains, a pine on a cliff, an orchid, a chrysanthemum, a lotus pond, a waterfall, a willow by the water, a boat on the river, a breaking wave, a maple branch, or snowfall (a few quiet ones stop before the largest sizes, and the waterfall needs at least 8 strokes). It is never the same as the painted day before or after, each is laid out differently every day, and it stays unnamed until its third stroke.
- **It grows richer with your belt:** ink washes from blue belt, splatter from purple, a second motif from brown (a faint moon, far hills, or mist), and the heaviest washes and splatter from black; from purple on, each take paints more marks (two at purple, three at brown, four at black). The belt and level a day starts at stay with that day's painting, counted the way your belts are (dictations and notes). Levels add a bird or two.
- **When it finishes,** it gets murmur's seal, stamped in the color of the belt you painted it at (ember before your first belt; the coral belts split in two, like their blocks), so your collection shows how far you have come. Then it gets a line from the day's own numbers, and it keeps growing: every take after that adds to the scene in its own way, on a schedule that keeps it a painting rather than a pile (leaves down the bamboo, then grass at its foot and leaves drifting down; maple leaves falling across the scene; more snow; ripples and reeds on the water), up to 60 more. Your takes shape it: a longer take grows a bigger mark, and a long one (150 words or more) earns a signature mark, such as a young bamboo stalk, a new bloom, a second boat far off, or a pine on a ledge, up to three a day. So no two people's paintings grow alike. A day you stop early keeps the strokes it has.
- **Its light is the hours you painted it in.** When it finishes, the light comes in with the seal, laid under every stroke the way a painter lays the sky first. It goes by the middle hour of the takes that finished it: a rising sun if that hour falls in the morning (5 to 10 am), a pale sun with a thin cloud by day (10 am to 5 pm), a setting sun with a cloud across it in the evening (5 to 9 pm), or a crescent moon and stars at night (9 pm to 5 am). It goes in the open sky the painting leaves. A painting that already has a moon keeps it: at night it gets the stars, by day an afterglow under the moon. murmur keeps one number for this, the middle hour of those takes, never each take's time.
- **Your paintings** from the last few days (up to six from the past four weeks) line up under it. Click one to open it large, with its numbers and its own Save card. They are kept in murmur's data folder (paintings.json) for about 400 days, as small records of each take's word count (plus the belt a painting was started at and, once it finishes, the middle hour of its takes), never your words, so they outlive the history retention setting; Clear all in Settings, under History, clears them along with your history.
- **Save card** saves a portrait image, 1080 by 1350, for posting: the painting as it stands, its name, how far it got, the date, the rank and level it was painted at and its light (for example, white belt, one stripe, level 1, by moonlight), and the murmur wordmark. It is drawn and saved on your machine and sent nowhere.
- **Save the week** (beside your paintings) saves the last seven days as one long image to post; see below.

## How do I save a week of paintings?

On the wrap-up tab, click **Save the week** beside your paintings. It saves the seven days ending today as one long image, 3968 by 864 pixels, like a handscroll unrolled: the week's title (for example, the week of October 3) and its numbers (5 paintings finished from 84 takes and 7,412 words) along the top; the days side by side with the oldest on the left, each painting as it stands (a finished one with its seal and light), with its weekday under it and its name, or how far it got (4 of 8), under that; a day with no takes shows one dry mark and says a day off; and the murmur wordmark. The button shows once those seven days hold two paintings or more. Like the day's card, it is drawn and saved on your machine and sent nowhere.

## What is the time back milestone notification, and how do I turn it off?

Each time today's time back crosses a 30-minute mark (30 minutes, 1 hour, 1 hour 30 minutes, and so on) murmur shows one notification titled time back, reading for example "30 minutes earned back today." Clicking it opens the wrap-up. It is on by default, like belt promotions and achievement unlocks; unlike those it has a switch: Settings, Time back and recap, Milestone alerts.

The nod is decided on the same whole minutes the home card shows, so it arrives on the take where the card first reads 30 min, never a take later. Each mark is celebrated once per day. A take that jumps two marks at once gets one notification for the higher mark, a slow take that pulls the total back under a mark does not earn the mark again on the way back up, and changing your typing speed never re-fires a mark already shown. If a speed edit itself lifts the total past a mark, that mark is not celebrated that day: the nod is for takes, not edits. A new day starts clean. The number is also in the tray: hover the murmur icon and the tooltip reads "murmur · 42 min back today" once the day has any, plain murmur before that.

## How does murmur calculate time earned back?

Time back is the time you did not spend typing. For every dictation, murmur takes the words that landed, works out how long typing them would have taken at your typing speed, and subtracts the time you actually held the key. Those per-take numbers add up into today, this month, and lifetime, shown on the home card, the analytics tab, and the wrap-up.

The formula for one take is `words / typing speed - minutes spoken`. At the default 40 words per minute, a 400-word dictation spoken in two minutes is ten minutes of typing minus two of speaking: eight minutes back.

The typing speed is yours to set: Settings, Time back and recap, Typing speed, anywhere from 10 to 200 words per minute. 40 is a fair average for a working typist; if you know you type at 70, say so and the number gets honest. Nothing is stored per take, so changing the speed restates every day you have on record, past ones included.

Two rules keep the number truthful. A take where you held the key while thinking and said little counts against the day, because murmur cost that time; but a day never shows below zero. Notes dictated with the note chord count exactly like any other dictation. Spoken edits (the transform chord) never count: the original selection murmur keeps for recovery is a safety copy, not words you spoke, so it stays out of every number murmur keeps.

## Which macOS permissions does murmur need, and why?

| Permission | Why murmur needs it |
| --- | --- |
| Microphone | Recording your dictation. Requested automatically on first use |
| Accessibility | Pressing Cmd+V for you, so text lands at your cursor |
| Input monitoring | Hearing the hotkey while other apps are focused. After granting, quit and reopen murmur |

The macOS permissions list under Settings, System shows live status and deep-links each missing one into System Settings; a missing one also appears on the Finish setup card. murmur never uses these for anything beyond the stated purpose; the code is open source and auditable.

## What do the sound cues mean?

Quiet blips confirm what murmur is doing without you looking: a rising two-tone when recording starts, falling when it stops, 2 light ticks on one high note when a hands-free take locks, a soft ding when text lands, a low note for no speech, and a buzz for errors. All synthesized live, no sound files anywhere. Settings, System, Sounds has the switch and a volume slider.

## Does murmur start automatically at login?

Turn on Start at login under Settings, System, and installed builds register with your OS to open in the tray at login. Development builds deliberately skip registering.

## What happens if murmur crashes?

The error is written to a small rotating log in murmur's data folder under `logs/`, and the app relaunches itself exactly once. If the relaunched instance hits trouble too, it stays running in a visibly degraded state instead of looping, and the log has the story. Your dictation history and settings are untouched by any of this.

## Why does silence never insert anything?

Three guards. Before upload: if the recording contains under about a fifth of a second of voiced audio, murmur discards it locally, and your audio never leaves the machine. A take you did not hold a key through (hands-free, or tap to start and stop) also needs a stretch of about a tenth of a second where the sound holds steady, since key clicks, keystrokes, and desk taps fade too fast to count. After transcription, murmur drops any stretch a Whisper model itself scores as silence (not on `whisper-large-v3-turbo`, whose score is always about 0; see [Why did murmur type words I never said, or words in another language, after a quiet take?](troubleshooting.md)), and empty results and the stock phrases speech models hallucinate on silence ("Thank you.") are recognized and dropped. The pill shows a quiet "no speech" instead.

## Where does my data live?

Settings, history, and analytics live in your platform's application data folder, locally. The API key is encrypted at rest, and by default so are the words in your history. Audio goes only to the provider you configured, only when there is speech, and failed uploads are kept in a local `recovery/` folder so nothing is lost. murmur has no servers of its own.

## What is the "getting active" grid on the analytics page?

A GitHub-style activity wall, painted. Every day you dictated is a small blot of paint; the deeper the color, the more words you dictated that day, scaled against your busiest day in the period. A day with no dictation is a faint dot. Today carries an outline, month and weekday labels frame the grid, hovering a day shows its date and word count, and the line above the wall totals the words for the whole period. Each blot's shape comes from its date, so the same history paints the same wall every time.

The period picker shows lifetime by default (everything since your first dictation, padded back to at least a full year so young walls keep their shape) and can jump to any single calendar year back to your first dictation. Your choice stays until you change it, so the wall opens on the same period every time you come back.

The color picker chooses the fill: vibrant orange (the default), your belt color (follows your rank as you are promoted), or any belt color you have already earned; colors you have passed through stay yours for good. Locked colors list how to earn them. Dark colors like the black belt invert the wall automatically: every day sits on a white square and activity paints darker blots on it, so a dark fill never disappears into the background. Earning the black belt also unlocks the invert checkbox, which flips the wall to the white paper look for any fill color you choose (except near-white ones, which would vanish on paper). Cosmetic only; it changes nothing about what is counted.

## Can my accent color change the rest of the app?

Yes. The accent you pick under Settings, Look (any earned belt color, or the special accents like ember and moonlight) also tints data emphasis in the GUI: the journey's painted gates (the words stroke and the tally marks). The default signal amber stays reserved for live recording states, so choosing it leaves the gates in your belt's own color. The 14-day chart on the analytics tab is painted in ink instead (rice dabs with today in gold) and does not follow the accent.

## Why don't I see murmur notifications on my Mac?

Almost always a macOS permission. The Test button on the Daily recap row (Settings, Time back and recap) fires a real notification through the same pipe as belt promotions and achievements, so use it to check. If nothing appears: open System Settings, then Notifications, find the app in the list, switch Allow Notifications on, and pick the Banners or Alerts style. While running from source the app is listed as Electron; the installed app is listed as murmur. Notifications also stay hidden while a Focus mode is on.

## How do I control when murmur updates?

Settings, System, **Updates** has 3 choices:

- **Automatic**, the default. murmur checks every few hours, downloads quietly, and installs when you quit.
- **Ask first.** murmur checks and tells you when a version is ready. Nothing downloads until you click the notification, or Download in Settings.
- **Off.** murmur asks GitHub for nothing. Security fixes will not reach you, so check the [releases page](https://github.com/lbwalton/murmur/releases) yourself. On a Mac, an update that had already finished downloading still installs when you quit.

The provider list has its own switch, because it is a separate request to GitHub. Both are explained on the [privacy page](https://murmurapp.app/privacy/).

## Where do I see what changed in an update?

The home tab keeps a quiet what's new line; a small amber dot appears when the running version is newer than the last one you looked at. Open it to read the current version's changes in plain language. The same text lives in the repo's CHANGELOG.md and on each GitHub release.

## What is the Price refresh setting?

murmur ships with a provider catalog: presets, model rates, and billing notes, each rate carrying the date it was verified against the vendor. Price refresh lives under Settings, Provider and keys, Advanced. With it on (the default), murmur downloads the newest catalog from the murmur repo once at launch, so the cost estimates stay current between app updates. It is a read-only file fetch from the same GitHub host the auto-updater already contacts, with nothing about you attached. Turn it off and murmur uses the rates this version shipped with. Either way, dictation never waits on it.

## What is the cleanup connection?

By default one provider handles both transcription and the cleanup pass. Setting Cleanup runs on to Separate (under Provider and keys) gives cleanup its own base URL, model, and encrypted key, so you can mix providers (Groq speech, DeepSeek cleanup). Details and per-provider setup live in the [providers guide](providers.md).

## What are provider profiles?

A murmur Pro convenience: save your whole provider setup (base URL, speech model, cleanup model, and the matching API key) under a name, then switch setups in one click from Provider and keys, Advanced, Profiles. Profiles carry the endpoint and models; keys stay in the per-provider key ring, so applying a profile automatically uses that provider's saved key. The free single provider setup is unchanged, profiles are additive.

## What is in the murmur Pro section?

The last section in settings, under App in the rail. What it shows depends on whether Pro is yours:

- **Free:** one block that says why Pro exists (the free app is complete and stays complete; Pro funds it), the 3 extras Pro adds (provider profiles, early access, priority support), a Get Pro button with the one-time price that opens the checkout, and the key field with Activate at the foot. Press Return in the key field to activate.
- **Pro:** Pro is active (or Founding member, with the founding member promise), the date you became a supporter, and Deactivate. Below it, **Paint the mark each day** (on by default) turns the daily brush fill of the header's Pro mark on or off; see [murmur Pro](pro.md#what-happens-to-the-pro-mark-when-i-open-murmur-each-day).
- **Deactivated:** your key is still saved on this machine; Reactivate brings Pro back in one click, and Forget key deletes it.

A small gold PRO mark sits beside murmur Pro in the rail and in the section title: filled when Pro is yours, outlined when it is on offer. The Profiles row under Provider and keys carries the same mark, outlined until Pro is yours, then filled. [Where the mark appears](pro.md#where-does-the-pro-mark-appear-and-what-does-it-mean).
