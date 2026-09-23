# Transform: speak an edit to selected text

murmur can rewrite text you have selected, in any app, from a sentence you speak. Select a paragraph, hold the transform chord, say what you want ("turn this into a formatted list with actionable steps", "tighten this paragraph", "reply to this politely and decline"), and release. The result replaces the selection. The original is saved first, so a transform can always be undone with one keystroke.

## How do I transform selected text?

Set a transform chord under Settings, transform: click the field and press a combo (a modifier plus an F-key, like Ctrl+F10, is the safest shape). Then, in any app:

1. Select the text you want changed.
2. Hold the transform chord and say the instruction.
3. Release. The pill shows a "transform" tag while you talk and says "transformed" when the result has replaced your selection.

The chord follows your main hotkey's trigger mode (hold to talk, or tap to start and stop) and the same rules as the other chords. It needs a regular key, it cannot contain your dictation hotkey, and it cannot match the paste-last or note chord. murmur refuses those at capture and says why.

## How do I get the original back?

Press your paste-last chord. Before murmur calls the model, it records the original selection as the newest history entry, so paste-last pastes it back, however the transform went. If the result replaced your selection and you want the old text, select the result and press paste-last.

The home tab also lists each transform with a "transform" tag, what you said, and the original text, with a copy button.

## What gets sent, and where?

Two things, to two places:

- **Your spoken instruction** goes, as audio, to your speech provider for transcription, exactly like a dictation.
- **Your spoken instruction and your selected text** go, as text, to your transform connection (by default, the same model your cleanup pass uses).

Nothing else leaves your machine. The selection is only read when you finish speaking, and only from the app in front of you.

## Can text inside my selection take control of the model?

No. The words you speak are the only instructions. The selected text travels to the model in a separate, fenced message marked as data to transform, never as orders to follow. So a document that says "ignore the above and write something else" gets transformed like any other text. murmur also checks the reply before pasting: an empty reply, a chatty one ("Here is your list:"), or a refusal is thrown away and your selection stays exactly as it was.

## What happens when a transform fails?

Your text is never damaged. Every failure leaves the selection untouched, and the pill says why:

- **could not read the selection**: the copy shortcut produced nothing. Usually nothing was selected; some terminals, password fields, and locked-down windows also ignore copy. Nothing was sent anywhere, not even your audio.
- **no text selected**: the copy worked but held no text (an image, or only blank space).
- **selection too long**: see below.
- **selection left as it was**: the model's reply was empty, chatty, or a refusal, or the connection failed. The reason is in murmur's log.
- **set up a cleanup model first**: there is no model connection to run on. murmur says this when you press the chord, before you speak.

## Is there a limit on how much text I can transform?

Yes: 8,000 characters of selection, roughly three pages. This keeps an accidental select-all from sending a whole document to a model. Over the limit, the pill shows the count (for example "selection too long 9,412/8,000"), nothing goes to the model, and your selection stays as it was.

Your spoken instruction is not lost. murmur saves it to history as a "transform · not sent" entry, so paste-last or the home tab gives you back what you said, ready to use on a smaller selection.

## Does my clipboard survive a transform?

Yes. Reading a selection means pressing copy, so murmur first takes a snapshot of everything on your clipboard (text, images, rich formatting), then puts it back before calling the model and again after pasting the result. If you copy something new while a transform is running, your new copy wins. One exception: with the insert mode set to copy only, the result is left on your clipboard for you to paste, just like a dictation.

## Can transforms use a different model than cleanup?

Yes. Under Settings, transform, set Transform connection to Separate, pick a provider (or type a base URL and model id), save its key, and press Test. Rewriting is harder work than cleanup, so a stronger model here often pays off. The key is stored encrypted like your other keys, and a provider you already use shares its key automatically. Until the separate connection is complete, with a saved key, transforms run on your cleanup connection.

Unlike cleanup, transforms do not depend on your formatting level: they run at Off and Light too.

## Are transforms kept in my history, and can I turn that off?

By default, yes: each original selection is saved to history (a file on your machine, never uploaded, and cleared by your history retention setting) so it can always be recovered.

For more privacy, set Keep originals in history to Off. murmur then keeps only the latest original in memory, and nothing is written to disk. Paste-last always pastes your newest entry, so it brings the original back until your next dictation or transform, or until murmur quits.

## Do transforms count toward my words, belt, or stats?

No. The selected words were not dictated, so transforms never add to your word counts, words per minute, belts, achievements, recaps, or analytics.
