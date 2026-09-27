# Troubleshooting

Short answers first, details after. If a problem is not listed here, open an issue at github.com/lbwalton/murmur/issues.

## How do I send diagnostics when something goes wrong?

Settings, System, Diagnostics, **Save report**. That writes one plain text file you can open and read before deciding to share it: the app version, your OS, whether the hotkey hook is running, a summary of your settings (counts of dictionary and expansion entries, never their contents), and the recent activity log. The log records what happened to each dictation (captured, no speech with the measured input level, transcription failure with its status, delivered or left on the clipboard) but never your words and never key material. Nothing is ever sent automatically: the report exists only where you save it and goes only where you send it. **Open log folder** shows the live log file itself.

## What happens when a dictation fails, and how do I retry it?

murmur keeps the recording, and it waits on the home tab under **waiting to retry**. Fix whatever stopped it (most often: save your key in the API keys list under Settings, Provider and keys), then click **retry** beside the take, or **retry all** when several are waiting.

A take waits there when its transcription failed: no API key was saved, the provider did not accept the key, murmur could not reach the provider, the provider did not answer in time or had a problem on its end, or it refused the audio or the model name. The pill shows an error when this happens. A cleanup model that misbehaves never lands a take here: cleanup fails open, and your words arrive without it.

What a retry does: it sends the saved audio to your provider with your current settings and runs the same cleanup as a live dictation. Where the words go depends on what you were doing when you spoke:

- **A dictation** lands in your log at the time you spoke it, marked retried, and on your clipboard. The app you were typing into no longer has your cursor, so nothing is pasted for you: click where the words belong and press your paste-last shortcut (settings tab, dictation, Paste last dictation), or paste normally.
- **A note** is filed into your notes folder like any note, under the day and time you spoke it, sorting included.
- **A transform** keeps your spoken instruction in the log. The text you had selected is gone, so nothing is changed.

If a retry fails again, the take stays with the new reason. A take that turns out to hold no speech says so; **discard** asks once (delete audio?) and then deletes it. A retried dictation counts toward your stats on the day you spoke it.

The audio never leaves your computer except to your own provider when you retry, exactly as for a live dictation. It lives in the recovery folder inside murmur's data folder, and murmur keeps the 20 most recent takes.

## Why did murmur hear nothing even though my mic works everywhere else?

Audio software that manages your microphone (Wave Link, Loopback, VoiceMeeter and friends) can reconfigure the device underneath murmur's always-warm capture stream without any signal the OS passes along, leaving murmur receiving pure digital silence while every meter elsewhere moves. murmur catches this in two places. A dictation that measures dead-zero input (a `nospeech` log line with a peak near 0.000) triggers an immediate capture rebuild, so your very next press records normally. And every freshly built capture stream, that rebuild included, has to prove itself: if it flows for a few seconds without ever carrying sound (a quiet room's noise floor counts), it is rebuilt again on its own, up to five times, so a device that hands back a dead stream more than once is still fixed before you press again. No relaunch needed either way.

A stream that has proven itself is trusted from then on. Going quiet later is not treated as a fault, because noise-gated microphone paths (NVIDIA Broadcast, Krisp, macOS Voice Isolation) can output pure digital zero between words, and rebuilding on every pause would churn them; a stream that truly dies mid-session is caught at your next dictation as above. The unprompted rebuilds are budgeted: after five in a row murmur stops trying until sound arrives, you press the hotkey, or the computer wakes, so a microphone with its hardware mute engaged does not keep the app churning. The press counts on its own: a press that lands on a stream that has never carried sound rebuilds capture underneath the dictation, keeping the old stream recording until the new one is ready, so the words of that very press are captured (the log reads `press found a silent stream; rebuilding capture under the take`). That case leaves a telltale pair in the log, `audio capture is silent` followed by `stayed silent after 5 re-arms`; if you see it with no managed audio software involved, check the mic's own hardware mute and gain first.

## Why did murmur stop hearing me after my computer went to sleep?

It recovers on its own. When a computer sleeps, the operating system tears down the audio stack, and for a few seconds after waking the microphone can refuse to open at all, or, the sneakier case, open fine and deliver nothing but silence. murmur watches its own capture stream two ways. The microphone proves it is alive by delivering audio data many times a second; the moment that flow stops for more than a few seconds, murmur rebuilds the capture pipeline and keeps retrying until the microphone answers again (since v0.1.5). And a rebuilt stream has to carry sound: one that flows for a few seconds without ever doing so is rebuilt again, up to a budget, so a silent wake-up stream is fixed before your first press instead of costing you one (added after a live wake on 2026-09-17 lost two presses this way). You no longer need to wait before the first press: a press that lands on a stream that has not carried sound yet rebuilds capture underneath that dictation and records your words into the same take (live-found 2026-09-24, when an exhausted rebuild budget still cost the first press after every wake or idle spell). If the rebuilt stream is silent too, the press comes up as no speech and a further rebuild follows right after it. This covers laptop lid closes, desktop sleep, Windows modern standby, unplugged microphones, and audio driver resets. You do not need to restart the app.

If dictation still comes up empty after a wake, check two things:

1. The overlay pill. If it reacts to your hotkey but shows an error state, murmur is running and recovering; give it five to ten seconds and press the hotkey again.
2. The microphone itself. If you dock or undock, your default microphone may have changed. macOS: System Settings, Sound, Input. Windows: Settings, System, Sound, Input.

## What does murmur do while recovering the microphone?

Every few seconds it checks two things: that audio data is still flowing, and that a freshly built pipeline has started carrying sound. If the flow has stalled it rebuilds the capture pipeline from scratch. A rebuild attempt that fails (common in the first seconds after wake, while the system's audio devices are still coming back) is retried automatically until one succeeds. If a fresh pipeline flows for a few seconds without ever carrying sound, it is rebuilt too, up to five times in a row before waiting for a hotkey press or a wake to try again, and that press rebuilds it underneath the dictation it starts; a pipeline that has carried sound is trusted from then on, and the sound check never rebuilds underneath a dictation in progress (a pipeline that has actually died mid-dictation is still rebuilt, and everything captured before it died is kept). A dictation that was in progress when the pipeline died is not thrown away: whatever was captured before the outage is still transcribed when you release the hotkey. One line is written to the log per outage (`audio capture stalled` or `audio capture is silent`), plus one if the silent budget runs out, at userData/logs/murmur.log, so a persistent problem is visible without the log flooding.

The stall recovery shipped in v0.1.5 (2026-09-09) and the silent-stream recovery followed the live wake incident of 2026-09-17. Both are exercised by murmur's automated test suite on every build: the capture pipeline is killed silently with its first rebuild attempts forced to fail the way a waking audio stack fails, and separately the live pipeline is swapped for one that flows nothing but digital silence. Recording must come back unaided in both. A third check exhausts the silent budget on dead pipelines and then presses: that press must capture sound.
