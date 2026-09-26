# Releasing murmur

The order matters; each step assumes the previous one held.

1. **Changelog first.** Write the release's section in CHANGELOG.md in user language and flip its heading from `(unreleased)` to the release date. No release exists until its section does; the app's what's new surface and the GitHub release notes both read from this section.
2. **Gates.** `npm run typecheck`, `npm run test`, and `npm run smoke` green (smoke three consecutive runs after main-process changes).
3. **Version.** Bump `package.json`, commit `v<version>` with the changelog flip, push.
4. **Build both platforms on the Mac.** `npm run dist:mac` and `npm run dist:win`. Notarize the dmg itself with `notarytool submit --wait` (credentials from `~/.config/apple-notary/env`), then `stapler staple` and `stapler validate`; a release does not ship until the dmg validates.
5. **Publish.** Create the GitHub release for the tag with the CHANGELOG section as its body, uploading dmg, zip, exe artifacts, their blockmaps, and `latest-mac.yml` and `latest.yml`. Auto-updaters take it from there; the work PC updates itself.
6. **Stable download names.** `npm run release:stable -- publish <version>`. It uploads `murmur-mac.dmg` and `murmur-windows.exe`, byte-identical copies of the release's Mac dmg and its combined Windows installer (the one that picks x64 or arm64 itself), then checks that both match by GitHub's sha256 and that `https://github.com/lbwalton/murmur/releases/latest/download/<name>` serves them. It copies the dmg and exe from `release/` when they are the exact files the release published, and downloads them from the release otherwise. A nonzero exit means the release is not done: the download links in the README and the docs are broken until it passes. `npm run release:stable -- check` rechecks the latest release at any time. The copies are extra uploads, never renames: `latest-mac.yml` and `latest.yml` keep pointing at the versioned files, which is what installed apps update from.
7. **After.** `npm run roadmap` if prd.json changed, and start the next `(unreleased)` section in CHANGELOG.md when work resumes.
