# Troubleshooting

Short answers first, details after. If a problem is not listed here, open an issue at github.com/lbwalton/murmur/issues.

## How do I send diagnostics when something goes wrong?

Settings, setup, Diagnostics, **Save report**. That writes one plain text file you can open and read before deciding to share it: the app version, your OS, whether the hotkey hook is running, a summary of your settings (counts of dictionary and expansion entries, never their contents), and the recent activity log. The log records what happened to each dictation (captured, no speech with the measured input level, transcription failure with its status, delivered or left on the clipboard) but never your words and never key material. Nothing is ever sent automatically: the report exists only where you save it and goes only where you send it. **Open log folder** shows the live log file itself.

## Why did murmur hear nothing even though my mic works everywhere else?

Audio software that manages your microphone (Wave Link, Loopback, VoiceMeeter and friends) can reconfigure the device underneath murmur's always-warm capture stream without any signal the OS passes along, leaving murmur receiving pure digital silence while every meter elsewhere moves. murmur now detects this: a dictation that measures dead-zero input (a `nospeech` log line with a peak near 0.000) triggers an immediate capture rebuild, so your very next press records normally, no relaunch needed. If you see repeated near-zero peaks in the log even after that, check the mic's own hardware mute and gain.

## Why did murmur stop hearing me after my computer went to sleep?

Since v0.1.5 it recovers on its own. When a computer sleeps, the operating system tears down the audio stack, and for a few seconds after waking the microphone can refuse to open at all. murmur watches its own capture stream continuously: the microphone proves it is alive by delivering audio data many times a second, and the moment that flow stops for more than a few seconds, murmur rebuilds the capture pipeline and keeps retrying until the microphone answers again. This covers laptop lid closes, desktop sleep, Windows modern standby, unplugged microphones, and audio driver resets. You do not need to restart the app.

If dictation still comes up empty after a wake, check two things:

1. The overlay pill. If it reacts to your hotkey but shows an error state, murmur is running and recovering; give it five to ten seconds and press the hotkey again.
2. The microphone itself. If you dock or undock, your default microphone may have changed. macOS: System Settings, Sound, Input. Windows: Settings, System, Sound, Input.

## What does murmur do while recovering the microphone?

Every few seconds it checks that audio data is still flowing. If the flow has stalled it rebuilds the capture pipeline from scratch. A rebuild attempt that fails (common in the first seconds after wake, while the system's audio devices are still coming back) is retried automatically until one succeeds. A dictation that was in progress when the pipeline died is not thrown away: whatever was captured before the outage is still transcribed when you release the hotkey. One line is written to the log per outage, at userData/logs/murmur.log, so a persistent problem is visible without the log flooding.

The recovery behavior shipped in v0.1.5 (2026-09-09) and is exercised by murmur's automated test suite, which reproduces the outage on every build: the capture pipeline is killed silently, the first rebuild attempts are forced to fail the way a waking audio stack fails, and recording must come back unaided.
