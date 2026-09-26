# Downloading and installing murmur

Short answers first, details after.

## How do I download murmur?

Pick your computer:

- **Mac:** [murmur-mac.dmg](https://github.com/lbwalton/murmur/releases/latest/download/murmur-mac.dmg)
- **Windows:** [murmur-windows.exe](https://github.com/lbwalton/murmur/releases/latest/download/murmur-windows.exe)

Both links always serve the newest release, so they are safe to bookmark and share. murmur is free to download and open source (GPL-3.0). You bring your own transcription key; the setup wizard walks you through getting a free one. Every version, with its release notes, is also listed on the [releases page](https://github.com/lbwalton/murmur/releases).

## How do I install murmur on a Mac?

Open `murmur-mac.dmg`, drag murmur into Applications, then open murmur from Applications. macOS asks once whether you want to open an app downloaded from the internet; click Open. murmur is signed and notarized by Apple, so there is nothing else to get past. It lives in the menu bar, and the setup wizard opens on first launch.

## Which Macs does murmur run on?

Macs with Apple silicon (M1 and later). The current download does not open on Intel Macs; a single download that runs on both is planned.

## How do I install murmur on Windows?

Run `murmur-windows.exe`. It picks the right version for your PC (standard Intel and AMD PCs, or ARM PCs) by itself, installs for your Windows account only with no administrator prompt, and opens murmur when it finishes. murmur lives in the tray at the bottom right of the taskbar; if you do not see it, click the small up arrow there. The setup wizard opens on first launch.

## What does "Windows protected your PC" mean when I install murmur?

It means Windows does not recognize the installer yet, not that anything was found in it. Windows shows this blue screen for any app that is not signed with a code-signing certificate, and murmur's Windows installer is not signed yet. To continue:

1. Click **More info**.
2. Click **Run anyway**.

The screen names the publisher as unknown; that is the missing signature, and it is expected. Install only from the links above or the releases page, where every file comes straight from murmur's public source. Signing the Windows installer as Eze Media LLC is planned, and this page will change when it ships.

On a work or school PC, your organization's settings can hide Run anyway entirely. If so, murmur cannot be installed on that PC without your IT team's help.

Verified 2026-09-26 against Microsoft's [SmartScreen reputation guide for app developers](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation).

## What if Windows says Smart App Control blocked murmur?

Some Windows 11 PCs have Smart App Control turned on. It blocks apps that are not signed and offers no way to allow a single app, so there is no Run anyway button. Until murmur's installer is signed, murmur runs on these PCs only with Smart App Control off: open Windows Security, go to App & browser control, then Smart App Control settings, and choose Off. Smart App Control checks apps each time they start, not just when they install, so turning it back on stops murmur from opening again.

That is a real trade: Smart App Control is one of several protections Windows runs (Microsoft Defender keeps scanning either way). If you would rather keep it on, the signed installer will run with it on.

Verified 2026-09-26 against Microsoft's [Smart App Control FAQ](https://support.microsoft.com/en-us/windows/security/threat-malware-protection/smart-app-control-frequently-asked-questions).

## Do I need to download murmur again to update it?

No. Installed copies update themselves; see [how murmur updates itself](./quickstart.md#how-does-murmur-update-itself). The download links are only for a first install or a new computer.
