# Releasing murmur

The order matters; each step assumes the previous one held.

1. **Changelog first.** Write the release's section in CHANGELOG.md in user language and flip its heading from `(unreleased)` to the release date. No release exists until its section does; the app's what's new surface and the GitHub release notes both read from this section.
2. **Gates.** `npm run typecheck`, `npm run test`, and `npm run smoke` green (smoke three consecutive runs after main-process changes).
3. **Version.** Bump `package.json`, commit `v<version>` with the changelog flip, push.
4. **Build both platforms on the Mac.** `npm run dist:mac` and `npm run dist:win`. Notarize the dmg itself with `notarytool submit --wait` (credentials from `~/.config/apple-notary/env`), then `stapler staple` and `stapler validate`; a release does not ship until the dmg validates.
5. **Publish.** Create the GitHub release for the tag with the CHANGELOG section as its body, uploading dmg, zip, exe artifacts and their blockmaps. Auto-updaters take it from there; the work PC updates itself.
6. **After.** `npm run roadmap` if prd.json changed, and start the next `(unreleased)` section in CHANGELOG.md when work resumes.
