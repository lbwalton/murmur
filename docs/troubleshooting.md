# Troubleshooting

Short answers first, details after. If a problem is not listed here, open an issue at github.com/lbwalton/murmur/issues.

## Why did murmur stop hearing me after my computer went to sleep?

Since v0.1.5 it recovers on its own. When a computer sleeps, the operating system tears down the audio stack, and for a few seconds after waking the microphone can refuse to open at all. murmur watches its own capture stream continuously: the microphone proves it is alive by delivering audio data many times a second, and the moment that flow stops for more than a few seconds, murmur rebuilds the capture pipeline and keeps retrying until the microphone answers again. This covers laptop lid closes, desktop sleep, Windows modern standby, unplugged microphones, and audio driver resets. You do not need to restart the app.

If dictation still comes up empty after a wake, check two things:

1. The overlay pill. If it reacts to your hotkey but shows an error state, murmur is running and recovering; give it five to ten seconds and press the hotkey again.
2. The microphone itself. If you dock or undock, your default microphone may have changed. macOS: System Settings, Sound, Input. Windows: Settings, System, Sound, Input.

## What does murmur do while recovering the microphone?

Every few seconds it checks that audio data is still flowing. If the flow has stalled it rebuilds the capture pipeline from scratch. A rebuild attempt that fails (common in the first seconds after wake, while the system's audio devices are still coming back) is retried automatically until one succeeds. A dictation that was in progress when the pipeline died is not thrown away: whatever was captured before the outage is still transcribed when you release the hotkey. One line is written to the log per outage, at userData/logs/murmur.log, so a persistent problem is visible without the log flooding.

The recovery behavior shipped in v0.1.5 (2026-09-09) and is exercised by murmur's automated test suite, which reproduces the outage on every build: the capture pipeline is killed silently, the first rebuild attempts are forced to fail the way a waking audio stack fails, and recording must come back unaided.
