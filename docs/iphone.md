# murmur on iPhone

murmur for iPhone is a keyboard you talk to: tap the pill in any app, speak, and your words land where your cursor is, cleaned up. It is on its way to the App Store, free, for iPhones running iOS 26 or later, and like murmur on the Mac and Windows, it runs on your own key and collects nothing.

## How do I add my API key on iPhone?

Open murmur, tap the gear at the top right, then Provider and key, paste your key under Transcription, and tap Save key. Then tap Test connection; it should say Works.

1. Under Transcription, pick a provider. Groq is first and is the default. Custom takes any OpenAI-compatible address that starts with https://.
2. Tap Get a Groq key (the link names your provider) to open its key page. Make a key there and copy it.
3. Back in murmur, tap Paste your Groq key, paste, and tap Save key. If the key does not look like one from that provider, a note under the field says so, and you can still save it.
4. Tap Test connection. murmur asks the provider for its list of models, using your key, and answers right there:
   - Works: the key and the address are good.
   - Key rejected: the provider turned the key down. Copy a fresh key and save it again. A code 403 can also mean your account with the provider needs setting up first.
   - No connection: murmur could not reach the provider. Check that the iPhone is online.
   - Anything else is shown in the provider's own words.

Cleanup runs on the same provider unless you choose otherwise. Pick Separate under Cleanup to use another provider for it, with its own key.

Each provider keeps its own key, so switching providers and back never asks for a key twice. For what each provider offers and costs, see [Providers](./providers.md).

## Where does murmur keep my key?

In the iPhone's Keychain, and only there.

- Only the murmur app can read it. The murmur keyboard cannot: the key sits in the app's own part of the Keychain, not in the space the app and the keyboard share.
- It stays on this iPhone. It never syncs through iCloud and never moves to a new iPhone, even from a backup.
- It becomes readable once you unlock the iPhone after it starts, so dictation still works later while the phone is locked.
- murmur never writes the key to its settings, logs, or the clipboard, and the screen only ever shows its last four characters.
- Tap Remove key on the Provider screen to delete it. murmur asks first.

What you say goes only to the provider you picked, straight from your iPhone.

## What happens when a dictation fails on iPhone?

murmur keeps the recording, and you can retry it.

- If your provider cannot be reached, does not answer in time, has a problem on its end, turns down your key, or refuses the audio, murmur says Not transcribed, gives the reason in plain words, and keeps the recording.
- A problem with the server or the network gets one more try by itself before murmur calls the take failed. A refused key or request is never retried by itself.
- The recording waits under Waiting to retry on the Dictate screen. Tap Retry to send it again with the provider and key you have now, or Retry all to send each one in turn.
- A retried take's words show on the screen and go to your clipboard, so they are safe before the recording is deleted.
- To delete a recording, tap Discard, then tap Delete audio? when it turns red. A quick double tap never deletes.
- murmur keeps the 20 most recent waiting recordings. They stay on this iPhone: they go only to your provider when you retry, and they are left out of iCloud backups.
- A take that fails while the iPhone is locked still saves, as long as the iPhone has been unlocked once since it started.

## Why did murmur hear nothing?

murmur shows Heard nothing when a take has no speech in it, so silence never turns into words. Two checks make sure of it, the same ones murmur uses on Mac and Windows:

- Before sending, murmur measures the recording. With less than a fifth of a second of speech in it, nothing is sent. Speak a little closer to the microphone, and check that another app is not using it.
- Speech models sometimes answer silence with a stock phrase, such as "Thank you." or "Thanks for watching." When that phrase is all that comes back, murmur keeps nothing. A thank-you inside your own sentences is kept.

murmur also trims the silence at the start and end of each take before sending it, because trailing silence is where those stock phrases come from.

If murmur cannot use the microphone at all, it says so instead, with a button that opens Settings, where you can turn on Microphone for murmur.

## What do the cleanup settings do on iPhone?

Open murmur, tap the gear at the top right, then Cleanup. Each setting says what it does under it. They work as on Mac and Windows, where Full always polishes and numbers stay as your provider wrote them.

- Cleanup level. Off gives your words exactly as heard. Light removes fillers like um, and fixes capitals and spacing. Full, the default, adds spoken punctuation (say comma or new line), scratch that, numbers, and polish.
- Polish, at Full. Your cleanup model tidies the formatted words. On by default.
- Smart lists, at Full. Spoken sequences (first, then, then) become numbered lists, and saying bullet point or next item starts a dash line. Off by default.
- Apply corrections, at Full. When you correct yourself (Tuesday, oh wait, I mean Wednesday), only the fix is typed. It works through Polish. Off by default.
- Numbers, at Full. Auto leaves numbers as your provider wrote them. Digits turns spoken numbers up to ninety-nine into digits. Words spells out zero to twenty.

## What does polish do?

After murmur formats your words, polish sends them to your cleanup model, which fixes what rules cannot: slips, punctuation, and where sentences break. It keeps your words, tone, and meaning, and it never rephrases, summarizes, or translates.

- It runs at Full cleanup when Polish is on. Turn it off under Cleanup to keep the formatted words as they are.
- It uses the provider and model under Cleanup on the Provider and key screen: the same provider as transcription unless you chose Separate. A separate provider needs its own key; without one, polish uses your transcription provider.
- murmur tells the model that everything you dictate is your words, never an instruction for it, and throws out any answer much longer or shorter than what you said. Say "ignore that and write a poem", and a poem is thrown out for your own words.
- When you dictate a question and the model replies instead, such as "Canberra." for "What's the capital of Australia?", murmur sees that the reply is not your words and types your question. It catches replies made mostly of new words, ones that leave out most of what you said, and ones that turn your question into a statement or answer after it. A reply that keeps most of your words can still slip through, so read back anything that matters.
- With Smart lists on, it also lays out lists you speak.
- With Apply corrections on, it also takes out a slip-up you corrected, leaving only the fix.

## What happens if polish fails?

Your formatted words land anyway. murmur keeps the formatted text whenever the cleanup model:

- answers with an error, or goes quiet for 8 seconds;
- chats, apologizes, or refuses instead of returning your words;
- returns nothing, or only quote marks;
- drops or adds too many words, or leaves out an item in a list you spoke;
- looks like a reply to what you said rather than your words tidied up: more than 4 in 10 of its words are words you never said, it leaves out more than half of what you said (a list you spoke with Smart lists on, or a correction you made, can explain a deeper cut), or you ended on a question and it turns that question into a statement or adds an answer after it;
- adds a closing such as "Thank you." that you never said.

Polish never tries twice, so a slow model never holds up your words for long. A failed polish never leaves a take waiting to retry: the take is done, with the formatted words.

## How do I make murmur fix my spoken slip-ups on iPhone?

Open murmur, tap the gear at the top right, then Cleanup, and turn on Apply corrections, right under Smart lists. It shows at Full cleanup and works through Polish, so Polish needs to be on too; with Polish off, the line under the switch says it does nothing. With it on, when you say something wrong and then fix it, only the fix is typed:

- "Send the invoice to Mark on Tuesday. Oh wait, actually what I mean is Wednesday." types "Send the invoice to Mark on Wednesday."
- "The budget is fifteen thousand, sorry, fifty thousand for the quarter." types "The budget is fifty thousand for the quarter."
- "I think we should, we should ship on Friday." types "I think we should ship on Friday."

It works for every take, in murmur or from the murmur keyboard. It is off by default, and off means dictation behaves exactly as it always has: your slip-ups stay in the text. It is the same switch as Apply corrections on Mac and Windows (Settings, Dictation), with the same rules.

**What counts as a correction?** A cue word that takes back something you just said: oh wait, wait, actually, I mean, sorry, no, rather, make that, what I meant was, let me rephrase that. The fix can come in the same sentence or the next one, including a No that says the whole thing over: "Let's go to Italy. No, let's go to Japan and stay for a week." types Let's go to Japan and stay for a week. Restarted phrases and stumbled repeats are dropped too.

**Will it remove "actually" or "I mean" when I mean them?** No. When nothing is being taken back, the cue word is part of what you said and stays: "Actually, the tests are passing now" and "I mean, it works, but it could be faster" type exactly as spoken.

**Can it lose words?** Polish still fails open: when the model's answer does not look like a correction, murmur types your formatted words instead. A cut deeper than ordinary cleanup is accepted only when your speech carried a cue word, the cut removed one (a No counts here only between pauses, as in "Monday. No, Wednesday" or "the twelfth, no, the fourteenth", so "no problem", "he said no", a No that opens what you said, a No right after a question, and one right after the first word of a sentence ("Well, no,") never do, and "Sorry, no," counts once), the cut is no bigger than those cues explain (about one wrong phrase each), and every word left is a word you said. A rewrite in new words never earns that deeper cut, and in a take of twelve words or more, no cut may remove more than 60% of what you said (a shorter take may lose at most eight words). Measured on Groq with gpt-oss-120b through these same rules (2026-10-19, 32 test sentences, 5 runs each): every answer that came back fixed its correction and kept all 70 cue words that were meant, 86 of 90 corrections with Smart lists off and 84 of 90 with it on; the provider turned the other tries away for a moment, and those were typed as you said them. An earlier run the same day caught one fix that also dropped real words next to it (for the buttons). A model can rarely drop a real word next to a fix, and no check can tell that from a real fix, so read back anything that matters.

Saying "scratch that" deletes the current sentence at Full cleanup with or without this switch.

## How do I add the murmur keyboard?

Add it once in Settings, turn on Full Access, then pick it with the globe key.

1. Open Settings, then General, then Keyboard, then Keyboards.
2. Tap Add New Keyboard, and pick murmur.
3. Tap murmur in the list, and turn on Allow Full Access.
4. In any text field, hold the globe key and pick murmur. In murmur, the gear at the top right, then Keyboard, has a box to try it in.

The keyboard is a dictation pad: the pill to talk, and globe, space, delete, and return. Tap the pill, speak, and tap it again; your words land where the cursor is. Typing letters stays with your other keyboards. In password and phone number fields, iOS always shows its own keyboard instead.

The first tap opens murmur, which starts a listening session; after that, taps start takes without leaving your app. The answers below explain how.

## Why does murmur need Full Access?

Full Access lets the keyboard and the murmur app share a small drawer. The keyboard leaves a note saying start or stop, and the app leaves your words for the keyboard to type. Without Full Access, iOS walls the keyboard off from the app, so the pill cannot work; the keyboard says so and shows the steps to turn it on.

The keyboard itself never connects to the internet. A test checks that every time murmur is built. Only the app talks to your provider, and only your newest take's words pass through the drawer, cleared as soon as they are typed or when you delete that take in murmur.

## What is Insert last?

If you leave the text field before your words are ready, murmur does not type them into whatever field you moved to. The keyboard shows Insert last instead. Tap it to type your newest take where your cursor is now. A take is typed once: after that, its words are cleared from the keyboard.

## Why does murmur open when I first tap the pill?

The keyboard is not allowed to use the microphone; only the murmur app is. So the first tap opens murmur, which starts listening at once and starts a session. Everything you say from that moment counts, even before you go back to your app.

While the session runs, murmur keeps the microphone ready in the background, so your next taps start a take right where you are, without opening murmur again.

## How do I get back to my app?

Swipe right along the bottom edge of the screen, the same swipe that switches between your recent apps. murmur shows it along the bottom while it records. Keep talking as you go: the take goes on, and when you tap the pill again your words land in your app.

If iOS shows your app's name as a back link in the top left corner, tapping it works too.

## Why is the orange dot on?

iOS shows an orange dot whenever an app has the microphone on. During a session murmur keeps the microphone ready between takes, so the dot stays on until the session ends.

Between takes murmur keeps nothing: the sound is dropped as it arrives, never saved, and never sent. Only a take, from your tap to your tap, goes to your provider.

## How long does murmur keep listening?

15 minutes after your last take, unless you change it. In murmur, tap the gear at the top right, then Session, and pick 5 minutes, 15 minutes, or 1 hour. The time counts from the end of your last take, so a session lasts as long as you keep dictating.

To end it sooner, tap End session in murmur, tap End on murmur's Live Activity on the Lock Screen, or press and hold the pill in the keyboard and tap End session. A phone call, Siri, or another app taking the microphone ends it too. A take in progress when a session ends still goes through, as if you had tapped stop.

A take started from the keyboard that nobody stops ends at 10 minutes, and murmur drops it without sending it: a take that long is almost always one you walked away from. If you leave the keyboard while a take is listening, after coming back to it from murmur, the take is dropped the same way.

## How much battery does a session use?

Some, because the microphone stays on while a session runs. murmur does no work on the sound between takes: it is dropped as it arrives, and nothing is sent until you tap the pill. A session ends by itself after the length you pick, and End session stops it at once. If you dictate in short bursts, pick 5 minutes.

## What if the keyboard says Open murmur to start?

That means iOS did not let the keyboard open murmur. Check that Allow Full Access is on for murmur in Settings, then General, Keyboard, Keyboards. If it is, open murmur yourself and tap Start session at the top of the home screen. Then go back to your app and tap the pill: it starts a take right there while the session runs.

## How do I change the waveform on iPhone?

In murmur, tap the gear at the top right, then Look, and tap a waveform. The Keyboard screen links to the same place, under The pill. The waveform in use is outlined in gold and says In use. Each tile is the real pill moving to a made-up voice; your microphone is never used for the tiles. The keyboard draws your pick from your next take, and the screen murmur opens to, Dictate, and New note draw it the next time they record.

There are seven waveforms, the same as on the Mac. Two are free, and belts earn the rest, from the takes this iPhone keeps:

- **Bars** is the classic equalizer. Free.
- **Speckle** is a dust field that vibrates with your speech. Free.
- **Pulse** sends rings out from a steady dot as you speak. White belt.
- **Ink dabs** paints a brush dab for each moment of your voice. White belt.
- **Ink flecks** is specks of paint that jitter with your voice and throw drops when you are loud. Blue belt.
- **Ink rings** sends brushed rings out from the dot. Purple belt.
- **Ink ribbon** is one continuous stroke that swells with your voice. Brown belt.

A locked waveform stays on the screen, dimmed, with the belt that earns it; VoiceOver reads it as locked and says how to earn it. A waveform you picked stays yours if Clear all later takes its belt away, as on the Mac.

## How do I change the pill's color on iPhone?

On the same Look screen, pick an accent under Accent. Every accent paints wet while you speak and dries when you stop: signal amber, the original, dries to gold, and every other accent dries to a darker shade of itself.

- **Signal amber** is free.
- **Your belt color** follows your rank, so it changes as you earn belts. White belt.
- **White belt, blue belt, purple belt, brown belt, and black belt** each come with that belt, and the coral and red belts with their degrees.
- **Ember red** comes with a dictation past five minutes, **moonlight** with dictating between midnight and four, and **dawn** with dictating before six in the morning.

A locked accent shows what earns it. If an accent you picked is locked again (after Clear all), the pill paints signal amber until you earn it back, as on the Mac.

## How do I know murmur is hearing me?

Watch the pill. In the murmur app, Dictate and New note show the pill under the record button, in the waveform you chose in Settings, Look. At rest it is small, grey, and still. While a take records, it paints in your color and moves with your voice: the louder you speak, the more it moves, and it goes quiet when you stop talking. If it stays quiet while you speak, murmur is not hearing you: check that no other app is using the microphone and that murmur is allowed it (Settings, Privacy & Security, Microphone). When you tap stop, it dries while your words are transcribed, then settles when they land. With Reduce Motion on, it shows a still picture of each stage, so it cannot show your voice; the clock beside Recording still counts. VoiceOver skips the pill there, since the record button already says what is happening. The keyboard shows the same pill, described below.

## What does the pill show on iPhone?

The pill in the keyboard shows where your take is. The screen murmur opens to shows the same pill while it records, and so do Dictate and New note in the app.

- **At rest**, it is small, grey, and still. It never shows amber at rest, even while a session keeps the microphone ready.
- **Recording**, it is wet amber at your voice's level, cooling toward gold as each moment ages. With another accent, it is wet in that color, cooling toward a darker shade of it.
- **Working**, the paint dries to gold (or a darker shade of your accent) with one sheen, and a softer sheen every 2 seconds if it takes a while, so a long wait never looks frozen.
- **Words added**, it sinks flat.
- **Heard nothing**, it is a dry grey scrape.
- **Failed**, it is plain red. Open murmur to see why and retry.

Every waveform follows these stages; an error is always plain red, never paint. Your iPhone gives a light tap when a take starts and when it stops. With Reduce Motion on (Settings, then Accessibility, then Motion), each stage is a still picture, and so is every tile on the Look screen. VoiceOver reads the pill as a button with its stage: Start dictation, Recording, Working, Words added, Heard nothing, or Failed, retry in murmur.

## How do I set up murmur on iPhone?

Open murmur once; it walks you through three steps and a practice take. Each step says why murmur needs it, and any step can be skipped. What you skip waits on murmur's home screen under Finish setting up.

1. **Allow the microphone.** Tap Allow the microphone, then Allow. If you said no before, tap Open Settings and turn on Microphone.
2. **Add your key.** Pick who transcribes, paste your key, and tap Done; Done saves a pasted key. See How do I add my API key on iPhone?
3. **Add the murmur keyboard.** Tap Open Settings, tap Keyboards, turn on murmur, then turn on Allow Full Access and tap Allow; both switches are on the same page. Come back, tap the box, and pick murmur with the globe key: the keyboard tells murmur it is ready, and the step checks itself. murmur needs Full Access to get your take from the keyboard, so the step waits until it is on. The keyboard sends nothing anywhere and only types the words you dictate.
4. **Try your first take.** Tap the box, pick murmur with the globe key, tap the pill, say a sentence, and tap the pill again. Your words land in the box.

In other apps, when no session is running, your first tap opens murmur. Swipe right along the bottom edge to go back, and keep talking.

## Where is my history kept on iPhone?

Only on your iPhone, in murmur's own storage. Your history is left out of iCloud backups and never goes to your provider or anyone else. The murmur keyboard never sees it: only your newest take's words pass through the drawer the keyboard shares, cleared as soon as they are typed or when you delete that take. Because your history is left out of backups, it does not move to a new iPhone.

murmur's home screen shows your takes, newest first, with their words, when you spoke them, and how long they ran. Tap a take to copy its words.

## How do I delete my history on iPhone?

On murmur's home screen, swipe left on a take and tap Delete, then Delete take. To delete everything, tap Clear all above your takes; murmur asks first and says how many takes will go. Deleting murmur from your iPhone deletes your history too.

## How do I teach murmur a word on iPhone?

In murmur, tap the gear at the top right, then Dictionary and expansions. Under Words, tap Add. In When murmur hears, type what murmur writes wrong (la broy), and in Write it as, type it your way (LaBroi), then tap Save.

murmur writes the word your way wherever you say it, with your casing kept even at the start of a sentence. It also offers your provider the spelling as a hint, so a speech model that takes hints gets it right more often to begin with. A provider that refuses the hint still hears your take, just without it. Tap a word to change it; swipe left on it to delete it, and murmur asks first.

## How do expansions work on iPhone?

An expansion turns a short thing you say into longer text. In murmur, tap the gear, then Dictionary and expansions. Under Expansions, tap Add, type the trigger (my address) and the text (1 Main Street, Springfield), and tap Save. Say the trigger on its own or in a sentence, and murmur writes the text in its place. Expansions run last, after cleanup, so the text comes out exactly as you typed it.

## How do I send diagnostics from my iPhone?

In murmur, tap the gear at the top right, then Diagnostics, then Save report. murmur shows you the whole report first. Tap Share to send it by Mail, Messages, or any app you choose, or tap Done to keep it to yourself. murmur never sends a report by itself.

The report is one plain text file. It holds the murmur version, your iPhone model and iOS version, whether the murmur keyboard has reported with Full Access, your session length, your settings as names and counts (your provider and models, how many dictionary words and expansions you have, whether a key is saved; a model id you typed in yourself shows only how long it is), and the recent activity log.

The activity log is one short line for what happened to each take: captured with its loudness, heard nothing with its loudness, failed with the kind of failure and its error number, cancelled before it was sent, the number of words it came back as, and whether the keyboard typed the words or offered them as Insert last. It never holds your words, your dictionary or expansions, a custom provider address, or your key. It stays in murmur's own storage on your iPhone, out of iCloud backups, and keeps only its most recent lines: at most 128 KB, a couple of thousand lines, with older lines dropped.

## How do I start murmur from Control Center or the Action Button?

murmur has a control called Start murmur. One tap starts a session without opening murmur: the microphone is ready, so a tap on the murmur keyboard's pill in any app starts a take at once.

- **Control Center:** open Control Center, touch and hold an empty spot (or tap the plus at the top left) to edit it, tap Add a Control at the bottom, and pick Start murmur.
- **Lock Screen:** touch and hold the Lock Screen, tap Customize, then Lock Screen. Tap the minus by one of the two controls at the bottom, tap the plus, and pick Start murmur.
- **Action Button:** open Settings, then Action Button, swipe to Controls, tap the button under it, and pick Start murmur.
- **Shortcuts:** murmur adds Start a murmur session and End the murmur session to the Shortcuts app.

These steps follow Apple's iPhone User Guide, checked 2026-10-13.

The first time, open murmur once and allow the microphone: a control has no screen to ask from, so until then Start murmur starts nothing. Starting this way also needs Live Activities on for murmur (Settings, then murmur, then Live Activities), because iOS keeps the microphone for a session started from a control only while murmur shows one. In Shortcuts, Start murmur says why when it cannot start.

## What does murmur show on the Lock Screen?

While a session runs, murmur shows a Live Activity on the Lock Screen and in the Dynamic Island: the pill, Ready or Recording, the time left in the session, and End. iOS redraws it only now and then, so the pill there stands still and never moves with your voice; the keyboard's pill is the one that listens. End there ends the session at once. If you turn off Live Activities for murmur, a session you start in murmur or from the keyboard still runs as usual; only Start murmur needs them.

If murmur closes while a session runs (you swipe it away, or iOS stops it), the session ends and the orange dot goes out. The Live Activity can stay a while; once its time runs out it says Ended. Tap End or open murmur to clear it.

## How do belts work on iPhone?

The same way as on the Mac: the same ladder of belts and stripes (white, blue, purple, brown, and black, each with four stripes, then the black belt degrees, the coral belts, and the red belt), with the same two gates for each. A belt needs both enough words dictated and enough different days you dictated on, so one long day never skips a belt. What every belt and stripe takes is in the [Journey guide](./journey.md), under What are the exact requirements for each belt and stripe?

On iPhone, the Journey row on Home shows your belt. Tap it to see your stripes, your words and your days against what the next belt needs, your level (one more for every hundred thousand words), and the day you earned each belt.

Your iPhone counts only the takes it keeps in its own history. Deleting takes there lowers your count, as clearing history does on the Mac. For now your iPhone and your Mac each keep their own belt; one Journey across your devices comes with the murmur account.

## What is the Journey on iPhone?

The Journey is where your practice shows, painted the way it is on the Mac, by the same brush code. Tap the Journey row on Home to open it. It shows:

- **Your belt,** painted with its stripes, with its name, its title, and your level.
- **The road:** every rank from white belt to red, left to right, painted as far as your words and days have taken you, with your words over your spot. Swipe it sideways to see the whole ladder. The gold ring is your next promotion.
- **The two gates** toward the next belt: a brush stroke for your words, and tally marks for the days you dictated. Both must close.
- **Achievements,** as ink stamps: the first take, three, seven, thirty, and a hundred days in a row, a thousand, five thousand, and ten thousand words in one day, a hundred and a thousand takes, a take past five minutes, dictating after midnight or before six in the morning, and coming back after a week away. Earned stamps are inked; the rest show what earns them.
- **Your promotions,** each with the day you earned it.

When you earn a new belt, the Journey holds the ceremony the next time you open it: one big stroke in the new belt's color, splatter, and your new rank set large. Tap to continue. A new stripe slaps its tape onto your belt instead. Each promotion plays once.

With Reduce Motion on (Settings, Accessibility, Motion), every painting appears finished at once, with no strokes drawing on. Every word on the Journey is ordinary text, so it follows your text size, and VoiceOver reads your belt, where you stand on the road, each gate, and each achievement.

The paintings are made on your iPhone by a small page inside murmur that can load nothing else and reach nothing on the internet.

## What can I earn on iPhone?

Everything murmur gives for practice is earned by dictating and never bought, and none of it changes what murmur does: your words, cleanup, and the keyboard work the same at every belt. On iPhone you earn:

- **Belts, stripes, and levels,** from the words and days you dictate (see How do belts work on iPhone?).
- **Fourteen achievements,** inked as stamps on the Journey: your first take; three, seven, thirty, and a hundred days in a row; a thousand, five thousand, and ten thousand words in one day; a hundred and a thousand takes; a take past five minutes; dictating between midnight and four; dictating before six in the morning; and coming back after a week away. A new one shows on the Journey the next time you open it; the iPhone sends no notification for it.
- **Waveform styles** for the pill: pulse and ink dabs at white belt, ink flecks at blue, ink rings at purple, and the ink ribbon at brown (see How do I change the waveform on iPhone?).
- **Accent colors** for the pill: your belt color and each belt's own color with that belt, and ember red, moonlight, and dawn with the take past five minutes, dictating after midnight, and dictating before six (see How do I change the pill's color on iPhone?).
- **Your belt card,** painted from your last 30 days (see How do I share my belt card on iPhone?), and **a painting a day.**

Locked styles and accents stay on the Look screen with what earns them, and locked achievements on the Journey. The Mac's window themes, like morning mist at blue belt, color the Mac's settings window; the iPhone keeps murmur's night studio look. Your iPhone counts only the takes it keeps; one Journey across your devices comes with the murmur account.

## How do I share my belt card on iPhone?

Open the Journey from Home and tap Share card. murmur paints a card from your last 30 days, the same card the Mac paints from the same days: one brush stroke for each day you dictated, longer for more words and heavier for more takes, with your three biggest days in ember, over your painted belt, your rank, its title, your words and days on the mat for those 30 days, and your level.

Tap Save card and the share sheet opens. Save Image puts it in Photos; the first time, iPhone asks to let murmur add to your photos, and murmur never looks at your library. Or send it anywhere the share sheet reaches. The card is painted on your iPhone, and nothing is sent anywhere unless you send it. VoiceOver reads the card's rank, words, days on the mat, and level.

## How does murmur count time back on iPhone?

Time back is the time you did not spend typing: for every take, the minutes typing its words would have taken with your thumbs, minus the minutes you spoke. They add up into today, this month, and lifetime, shown on Home under Back today and in Your numbers.

The formula for one take is `words / typing speed - minutes spoken`, the same as on the Mac. On iPhone the speed is thumbs on glass: murmur starts at 36 words a minute, the average typing speed on phones across 37,370 people in a study of mobile typing (Palin, Feit, Kim, Kristensson, and Oulasvirta, "How do People Type on Mobile Devices?", MobileHCI 2019; checked 2026-10-13). The Mac starts at 40, for a keyboard. At 36, a 400-word take spoken in two minutes is about eleven minutes of typing minus two of speaking: about nine minutes back.

The speed is yours to set: in murmur, tap the gear, then Time back and recap, then Typing speed, anywhere from 10 to 200 words a minute. Nothing is stored per take, so a new speed counts every day again, past ones included. A take where you spoke longer than typing its words would have taken counts against the day, but a day never shows below zero.

Home also sets today against your typical day: one gold brush stroke, as long as today's time back is against the middle day of the four weeks before today, with a dotted line for the rest of a typical day. It needs three days with takes in those four weeks, and says so until then.

## What do my numbers show on iPhone?

On Home, tap Your numbers under Back today. It shows, as the Mac's analytics do and from the same math:

- **This month:** minutes dictated, words, takes, time back, and the estimated cost at the rates murmur knows for your models, assuming the cleanup pass runs. Your provider bills you directly; murmur never sees it.
- **The last 14 days** as brush dabs, one for each day, as tall as its words against your biggest day, today in gold.
- **The activity wall,** getting active: a blot for every day you dictated, deeper paint for more words, a column a week from Sunday, since your first take or a year back, whichever is earlier. Swipe it sideways for earlier months.
- **Lifetime:** minutes, words, takes, average words a minute, time back, and the estimated cost.

Your iPhone counts the takes it keeps. VoiceOver reads each number, every day of the fourteen, and the wall's total and busiest day.

## How do I get a daily recap on iPhone?

In murmur, tap the gear, then Time back and recap, and turn on Daily recap. murmur asks to send notifications only then; if you say no, the recap stays off and the screen says where to turn notifications on. Pick the time it arrives (5:30 PM until you change it). Each day at that time one notification reads your day: "4 takes, 12 minutes, 1,240 words today. 22 minutes back." A day with no takes gets a quiet one. Send one now shows how it reads right away, even with murmur open.

The recap's words are set as each take lands, so today's recap says your day up to its time; a take after the recap time shows in Your numbers, not in that day's recap. murmur keeps the coming week's recaps ready, so they still arrive on days you do not open it; after a week away they pause until you open murmur or dictate again. Turn Daily recap off and none arrive.

## How does the painting a day work on iPhone?

The same way as on the Mac, painted by the same code. Each day gets one ink painting, and every take you dictate that day adds its next stroke. Tap the painting row on Home to open today's painting; the newest stroke paints itself in.

- **Its subject** is new each day, picked from fourteen (a moon over water, bamboo, a plum branch, mountains, a pine on a cliff, an orchid, a chrysanthemum, a lotus pond, a waterfall, a willow by the water, a boat on the river, a breaking wave, a maple branch, and snowfall), never the same as the day before or after.
- **Its size** is about the number of takes on a typical day for you, from 6 to 36 strokes. Once it has that many it is finished, and takes after that keep adding small marks.
- **Its seal** stamps on when it finishes, in the color of the belt you held when the day's first take landed.
- **Its light** comes with the seal: a dawn sun, a pale day sun, a setting sun, or a crescent moon and stars, from the hours you dictated in.
- **Its detail** grows with your belt: washes from blue, splatter from purple, a second motif from brown, the heaviest from black. Levels add a bird or two.

Earlier days wait under it in a strip; tap one to open it large. Save card saves a portrait card of the day (1080 by 1350) with its name, how far it got, and who painted it. Save the week, there once two of the last seven days have paintings, saves the seven days as one long scroll. Both open the share sheet, where Save Image puts them in Photos; murmur only adds to your photos and never looks at your library.

A painting is made from its takes: deleting a take takes its stroke away, and Clear all clears the paintings too, as on the Mac. Your iPhone keeps its own paintings, from the takes it keeps, and its seed is its own, so the same takes on your iPhone and your Mac paint different subjects until one murmur account joins them. With Reduce Motion on (Settings, Accessibility, Motion), the painting appears finished at once.

## How do I take a note by voice on iPhone?

Tap New note on murmur's Home screen and talk. When you stop, the words are kept as a note instead of offered to copy, and murmur says Noted to inbox. An iPhone has no hotkey, so murmur gives you three quicker ways in, each opening New note already listening:

- **The murmur icon:** touch and hold murmur's icon on the Home Screen and tap New note.
- **Control Center or the Action Button:** add the New note control, the one with a pencil on a square, the same way as Start murmur (see How do I start murmur from Control Center or the Action Button?). Start murmur, the waveform, starts a session and records nothing by itself; New note opens a note. On an iPhone with an Action Button, one press opens a note.
- **Shortcuts:** murmur adds New murmur note to the Shortcuts app.

From any app, use the murmur keyboard: press and hold the pill and tap Note. Note shows a checkmark, and under the pill it says Next take is a note. Tap the pill and talk as usual: when you stop, nothing is typed, and the line under the pill says Noted to inbox. Note is for the next take only; the take after it types again. To change your mind before you talk, press and hold the pill and tap Note again to clear the checkmark.

With a session running, the note is taken without leaving the app you are in. With none, murmur opens to listen, as it does for any take, since an iPhone keyboard cannot use the microphone itself, and you swipe back when you are done (see How do I start murmur from Control Center or the Action Button?).

Every note lands first in that day's inbox file, under the time you said it, word for word as cleanup left it, the same file a Mac writes (murmur/inbox/2026-10-14.md for a note on October 14, unless you change File layout; see How do I make my iPhone save notes where my Mac does?). The take is in your takes on Home too, as every take is. If murmur cannot write the note, the keyboard types the words instead, so a note is never lost.

## How do I open a note right after I say it on iPhone?

Tap its receipt. In New note, tap Noted to inbox (Noted to notes, say, when File layout's Inbox file is in murmur/notes): the day's inbox file the note landed in opens in Obsidian when your notes folder is in an Obsidian vault and Obsidian is on your iPhone, and in murmur otherwise. Under the pill, tap Open note: murmur opens and does the same, since an iPhone keyboard may open no app but its own (Apple's App Review Guidelines, 4.4.1, checked 2026-10-18).

murmur knows a vault by its place in iCloud Drive, then Obsidian, or by the settings folder Obsidian keeps in every vault, when the folder you picked is the vault itself. Obsidian opens the file by the vault's name and the file's path in it (Obsidian's help, Obsidian URI, checked 2026-10-18). The Notes screen lists every inbox day too.

## How does murmur sort my notes on iPhone?

The same way as the Mac, with the same rules. Sorting is off until you turn it on: tap the gear, then Notes, then Sort into tasks and ideas. On, after a note lands, murmur asks your cleanup connection (Settings, Provider and key) to label each sentence a task, an idea, or a note. Tasks are copied to murmur/todo.md as checkboxes and ideas to murmur/ideas.md (or the Tasks file and Ideas file under File layout), each with a link back to the note; notes stay in the inbox. Nothing is reworded. A run like "I need milk, eggs, and bread" files as one lead line with each item under it.

Only the item itself is filed. In "Oh, and an idea: a rooftop launch party.", the model points at the first and last word worth filing (word numbers, never text), so ideas.md gets "a rooftop launch party." and "Oh, and an idea:" stays in the inbox with everything else you said. A filler on its own, like "Oh" or "um, okay", is never filed as an item. The rules are the Mac's; the [notes page](./notes.md) has the details.

murmur also checks a new task or idea against what is already filed. A line that repeats something filed, sounds like you finished an open task, or repeats something you already finished is held in the inbox instead of filed twice. Notes, under Held for you, shows each held line and what it was tied to, with up to three choices: Tick it marks the finished task done in the tasks file (one box, nothing else in the file changes), File it anyway files it as labeled, and Skip leaves it in the inbox.

With sorting off, notes stay in the inbox only, and the words of a note never leave your phone for sorting. With no cleanup connection, or when the request fails, the note stays in the inbox and Notes offers Sort again. Your iPhone's sorter is a chat; the Mac can also use a decision model, which the iPhone does not.

## Can murmur save my notes to Obsidian on iPhone?

Yes. Your notes are plain markdown files, so any folder works, an Obsidian vault included. Tap the gear, then Notes, then Choose folder, and pick your vault. On iPhone, Obsidian keeps a vault that syncs through iCloud in iCloud Drive, then Obsidian, then your vault's name, and any other vault (Obsidian Sync, for one) in On My iPhone, then Obsidian, then your vault's name (Obsidian's help, checked 2026-10-14). murmur writes there what it writes on a Mac with the same folder: murmur/inbox for each day's notes, murmur/todo.md, and murmur/ideas.md, unless you change File layout. Point the Mac at the same vault, with the same File layout, and both add to the same files.

To share notes with your Mac, pick the vault itself, the folder that has murmur's folder in it, the same one your Mac's notes folder points to. Picking the murmur folder inside it works too: a folder named murmur that is not itself a vault is taken as murmur's own folder, so the notes go straight into it instead of into a second murmur folder inside it. For a vault On My iPhone, though, pick the vault itself if you want notes to open in Obsidian: there murmur can tell a vault only by looking inside the folder you picked.

If both devices add to the same day's file before they sync, a vault in iCloud Drive can keep only one of the two versions. Obsidian Sync merges the two, except when both devices start the same day's file within a couple of minutes of each other, when it keeps one (Obsidian's help, checked 2026-10-14). Either way the words are still in that device's takes. Notes already written stay where they were: switching folders moves nothing. To go back, tap Keep notes in murmur. If murmur can no longer reach the folder, say after the vault moved, Settings, Notes says so, and a note from the keyboard is typed instead until you choose the folder again.

## How do I make my iPhone save notes where my Mac does?

Give both the same notes folder and the same file layout. For the folder, see Can murmur save my notes to Obsidian on iPhone? For the files, open murmur on the Mac, then Settings, Notes, File layout, and look at Inbox file, Tasks file, and Ideas file. On iPhone, tap the gear, then Notes, and type the same three under File layout. Tasks file and Ideas file show while sorting is on, as on the Mac. Both start at murmur/inbox/{date}.md, murmur/todo.md, and murmur/ideas.md. If your Mac's Inbox file says murmur/notes/{date}.md, type that on iPhone, and both write each day's notes to murmur/notes.

The receipt names the inbox's folder, so with murmur/notes it says Noted to notes. If you picked the murmur folder rather than the vault, every file goes inside it, so a path outside murmur/ (Daily/{date}.md, say) lands in murmur/Daily instead of the vault's Daily; pick the vault itself to match the Mac.

Each file is a path inside your notes folder, and can use the Mac's tokens: {date} (2026-10-18), {time} (09-30, since a file name cannot hold a colon), {datetime}, {year}, {month}, and {day}. Folders in the path are made for you, and the file must end in .md or .txt. Under each file murmur says where today's goes. For a path it cannot use, one that leaves the notes folder for one, it says the default is used instead and why. The Mac checks paths the same way, so a path that works on one works on the other. Use the defaults puts all three back. Notes already written stay where they are.

## Where are my notes kept on iPhone?

In murmur's own storage on your iPhone, out of iCloud backups like your takes, unless you choose a folder of your own (see Can murmur save my notes to Obsidian on iPhone?). The Notes screen lists your tasks, your ideas, and every inbox day; open any of them to read it as murmur wrote it, and tap Share to send it as text to Notes, Files, Mail, or anywhere else. The words of a note go to your cleanup connection only when sorting is on. Home's Notes row shows your newest note's first line and where it landed.

## How do task reminders work on iPhone?

Tap the gear, then Notes, and turn on Task reminders. murmur asks to send notifications only then. At each of three times you pick (8:30 AM, 1:00 PM, and 5:30 PM until you change them, as on the Mac), a "murmur tasks" notification says how many tasks are still open in the tasks file (todo.md unless you changed File layout) and names the next few, the way the Mac's reminders do. With nothing open, nothing arrives. Send one now shows how one reads right away.

An iPhone app cannot wake up to read a file, so murmur sets the coming week's reminders ahead with your tasks as they stand, and sets them again whenever murmur changes your tasks (a note sorted, a box ticked, or a time changed) and each time you open murmur. A box you tick in Obsidian or on your Mac shows in the reminders after you next open murmur. After a week without opening murmur they pause until you open it again.

## How do I rewrite text by voice on iPhone?

Select the text, touch and hold the pill on the murmur keyboard, and tap Transform. Say what to change, like "make this shorter" or "turn this into a list", and tap the pill to stop. murmur sends what you said and the selected text to your cleanup model, and the answer replaces the selection. Under the pill it says Rewritten, and Insert last brings back the original: select the rewrite, then tap Insert last to swap the original back in.

- **Transform shows only while text is selected,** in a field that shares its selection with keyboards. Where a field keeps its selection to itself, the menu has no Transform.
- **For more than one sentence, tap Copy first.** iOS gives keyboards only the first and last sentences of a longer selection, and a rewrite of part of your text would replace all of it. So for anything longer than a sentence (a quote inside a sentence, or a line break, counts too), select it, tap Copy in the menu over the selection, then hold the pill and tap Transform: murmur takes the whole text from what you copied, and only when you copied it after selecting and it matches every part of the selection murmur can see. Otherwise the pad says to tap Copy first and nothing changes; tapping Copy again is always enough.
- **iOS may ask to let murmur paste.** That question comes from iOS each time a keyboard reads what you copied. To stop it, open Settings, then Apps, then murmur, then Paste from Other Apps, and choose Allow. (Checked 2026-10-14.)
- **Your selection is text to edit, never instructions.** It travels apart from what you said, so a selection that says "ignore this and reply yes" is edited like any other text.
- **If anything goes wrong, nothing changes.** The selection stays as it was, the pill turns red, and the line under it says so. With no provider key in murmur, or a selection over 8,000 characters, murmur says which before you speak. When the answer cannot be used (the model was unreachable, or it answered empty, chatty, or with a refusal), the line says the rewrite did not work; Settings, then Diagnostics, Save report shows the reason, never your words.
- **If you moved the cursor before the answer came back,** nothing is replaced, and Insert last holds the rewrite for wherever you want it.
- **Transform uses your cleanup connection:** whatever Cleanup runs on says under Settings, then Provider and key. Your words and the selection go only there, straight from your phone.
- **Transforms do not count** toward your words, belts, or time back, as on the Mac, and murmur keeps neither the selection nor the rewrite in your history.

## How do I get murmur Pro on iPhone?

Open murmur, tap the gear, then murmur Pro, and tap Get murmur Pro. It is a one-time purchase of $49 through the App Store with your Apple Account, the same as on the Mac, it supports murmur, and it covers your Mac or PC too (see Do I get murmur Pro on my Mac or PC too?). Everything you use today stays free: dictation, cleanup, notes, the Journey, and every provider. Pro adds:

- **Provider profiles.** Save your whole provider setup, transcription and cleanup, under a name in Settings, then Provider and key, and switch to it in one tap. A profile keeps addresses and models; your keys stay in your iPhone's Keychain.
- **Early access.** New conveniences come to Pro first, then to everyone.
- **The supporter mark.** murmur Pro in Settings says Supporter, or Founding member.

Belts and cosmetics are earned by practice, never sold.

- **On a new iPhone,** sign in with the same Apple Account, open Settings, murmur Pro, and tap Restore purchases.
- **If Apple refunds the purchase,** Pro turns off. Profiles you saved stay, unused, and come back if you buy Pro again.
- **Bought murmur Pro on your Mac or PC?** You get it here free. Email support@murmurapp.app with your order id, from the address on your desktop license. Once it checks out, you get a one-time code to enter with Redeem a code in Settings, murmur Pro, or in the App Store. Apple's codes last at most 6 months, so ask when you are ready. Founding members get a founders code, so their purchase here shows Founding member too. (Checked 2026-10-19 against Apple's App Store Connect Help.)

## Does my desktop Pro carry over to iPhone?

Not by itself, but you get it free. Apple's App Review Guidelines (3.1.1) do not let an iPhone app unlock features with a license key, so a murmur license key never unlocks anything on iPhone, and murmur never asks for one. Instead, email support@murmurapp.app with your desktop order id, and you get a one-time App Store code for murmur Pro on iPhone at no cost, as above. (Checked 2026-10-10 against Apple's App Review Guidelines.)

## Do I get murmur Pro on my Mac or PC too?

Yes. murmur Pro bought on iPhone covers the Mac and Windows app as well. Email support@murmurapp.app with the order id from Apple's email receipt (it is also in your App Store purchase history). Once Apple confirms the purchase, you get a murmur license key by email: in murmur on your computer, open Settings, murmur Pro, paste the key, and click Activate. One purchase, both devices.
