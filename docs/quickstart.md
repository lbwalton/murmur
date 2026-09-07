# murmur quickstart

Install to first dictation in about five minutes.

1. **Install and launch murmur.** It lives in your tray (macOS: menu bar). The window opens with a guided wizard.
2. **Get a key.** Visit [console.groq.com/keys](https://console.groq.com/keys), create a free account, copy a key.
3. **Paste the key** into the wizard and hit Save and test. Wait for the green `connected`.
4. **Grant permissions** (macOS): the wizard deep-links each one. After granting Input Monitoring, quit murmur from the tray and reopen it.
5. **Pick your hotkey.** Click the field, press your combo. Modifiers alone work: press and release Ctrl+Alt together and holding Ctrl+Alt becomes your push-to-talk.
6. **Say something.** Click the test box, hold the hotkey, speak a sentence, release. The pill shows your voice; your words land in the box.

That is the whole loop. From now on it works in every app: email, docs, chat, code comments. Your dictations appear in the home tab, your numbers in analytics.

## The three commands worth memorizing

Say **"period"**, **"comma"**, or **"new line"** to punctuate. Say **"scratch that"** to erase the sentence you just flubbed and keep going.

## If something misbehaves

The settings tab shows a checklist; anything red is clickable and takes you to the fix. See [settings.md](./settings.md) for every control and [providers.md](./providers.md) for provider issues.

## Is murmur in the Mac App Store?

No, and it never will be. The Mac App Store requires sandboxing, and the sandbox forbids exactly what murmur does: listening for a global hotkey, using Accessibility permission, and typing text into other apps at your cursor. GPLv3 software also conflicts with App Store terms. Instead, murmur for Mac ships as a Developer ID signed and notarized dmg you download directly (verified against Apple's Gatekeeper requirements for macOS 10.15+, 2026-09-06). Windows installers come the same direct way.

## Will there be an iOS app?

Yes, planned as its own phase after the desktop launch. It will be a fresh app built to the same standards as the desktop version.
