# Choosing the microphone

murmur listens to your computer's default microphone unless you pick one, and it follows that default when it changes: after a mic is unplugged, after the computer or its display wakes, after you dock or undock. Pick a mic under Settings, Dictation, Microphone to keep murmur on it whenever it is plugged in.

## Which microphone does murmur use?

Your computer's default input, unless you picked one. Settings, Dictation, Microphone shows the mic in use right now under the list ("In use now: USB Microphone"). The diagnostics log says it too: each time murmur opens a microphone it writes one line naming it, `capture on USB Microphone`. Only the device's name is written, never anything you said.

## How do I choose the microphone murmur listens to?

Open Settings, Dictation, Microphone and pick from the list.

- **Mac default** (on Windows, **Windows default**) follows whatever your computer calls its default input. This is where murmur starts.
- **A mic by name** keeps murmur on that mic whenever it is plugged in, whatever the default is.

The change takes effect between dictations: murmur never switches microphones in the middle of one. The list comes from murmur's hidden capture window, the only murmur window allowed to use the microphone; the settings window sees the names and nothing else.

## Is the microphone always on?

By default the mic stays ready while murmur runs, so your first word is not cut off. murmur holds the last 300 milliseconds of sound in memory, constantly replacing it, so that a press can start a moment before your finger lands. It is never saved and never sent. Nothing is kept or goes anywhere until you press your hotkey, and then that short moment becomes the start of your take.

To have no mic stream at all between takes, open Settings, Microphone, **Between takes**, and pick **Open the mic only when I press**. Your Mac's orange dot and the Windows mic icon stay off until you press. The cost is a short wait: the mic takes a moment to open, so the listening sound plays once it is live, and you should wait for it before you speak. Settings shows how long your last press took.

Hands-free, notes, and transforms work the same in both.

## What happens when the mic I picked is unplugged?

Your computer's default stands in until it is back. The Microphone row says so ("USB Microphone is unplugged, so your Mac's default input stands in until it is back"), and when you plug the mic back in, murmur moves back to it on its own, between dictations. Your pick is remembered by its id and by its name, so it is still found if the computer hands it a new id.

## Why did murmur stop hearing me after my Mac's display woke or a mic was unplugged?

Because the microphone murmur kept open could land on the wrong input and stay there; murmur now follows the default and moves back on its own (added October 2026).

murmur keeps the microphone open the whole time (a warm mic), so the first syllable of a quick press is already captured. Some USB microphones drop out for a moment when a display wakes or a dock reconnects. The live case: a USB microphone behind a Thunderbolt dock blipped as the display woke, the warm mic reopened on whatever was default in that instant (the dock's headset jack), and nothing moved it back when the USB microphone returned. A jack with nothing plugged into it still carries a faint hiss, so murmur's checks for a dead or silent stream saw a healthy one, and dictations came back empty or as a few garbled words until murmur was restarted.

Now murmur watches for microphones coming and going and for the default changing:

1. When the default moves (or the mic you picked comes back), murmur moves to it, between dictations.
2. When it happens in the middle of a dictation, that dictation finishes on the mic it started on, and the move follows right after it.
3. Every press checks too. A press that finds murmur on the wrong mic moves it underneath the dictation, with the old mic recording until the new one is ready, so the words of that press are kept.
4. A Mac that never fully sleeps (an open microphone can keep it awake) also gets a fresh start of the microphone when you unlock the screen, not only when the computer wakes from sleep.

The log tells the story in plain lines, for example `capture belongs on USB Microphone, not Dock Headset Jack; moving between takes` and then `capture on USB Microphone`.

## Does murmur ever switch microphones in the middle of a dictation?

No, with one exception that protects your words. A move that comes up while you are dictating waits until you finish, because half a sentence on each microphone is worse than either. The exception is the press itself: if the press starts on the wrong microphone, murmur opens the right one underneath the dictation while the old one keeps recording, and switches over once the new one is ready.

## How do I check or change my computer's default microphone?

As of 2026-10-23:

- **macOS**: System Settings, Sound, Input.
- **Windows**: Settings, System, Sound, Input.

If murmur is set to Mac default (or Windows default), changing it there is all it takes; murmur follows within a second, between dictations.
