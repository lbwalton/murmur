# Incident response plan

What to do when something goes wrong with murmur's security: a leaked key, a taken-over GitHub account, or a bad release. LaBroi Walton owns every step. This is an operating plan, not legal advice: for anything involving personal data, talk to a lawyer before sending a notice.

**Last reviewed: 2026-11-06.** Review it every year, and after every incident.

## What is at risk?

murmur has no server and no accounts, so a breach here does not expose dictations: they stay on each person's device and go to the provider that person chose. What can go wrong is trust in what we ship.

- **Signing and publishing:** a stolen signing key, or a taken-over GitHub account, could ship a bad update to every installed copy. This is the worst case.
- **The website:** a taken-over Cloudflare account could change the download links.
- **Purchase records:** Stripe holds the orders, and a private file on LaBroi's Mac lists the licenses issued. A leak of either exposes names, email addresses, and orders.
- **Support mail:** support@ and security@ forward to a personal inbox.

## How serious is it?

| Level | What it looks like | Start |
|---|---|---|
| SEV1 | A bad or tampered build reached people, a signing key or the GitHub account is in someone else's hands, or personal data was reached | Now |
| SEV2 | A secret leaked with no sign of use, or a hole that could expose data but has not been used | Within 4 hours |
| SEV3 | A `security-regression` issue from the weekly check, a high dependency alert, a report with limited impact | Within 2 business days |
| SEV4 | A hardening gap or a scanner false alarm | Next planned story |

When unsure, pick the higher level.

## The first hour

1. Open a private note with the time in UTC, and log each step as you go.
2. Confirm it is real: reproduce it, or find what proves it.
3. Set the level. For anything with personal data, the 72 hour clock starts now.
4. Stop what is still happening, using the runbooks below.
5. Save evidence before it ages out: the GitHub security log, Cloudflare's audit log, Stripe's logs.
6. Work out what was reached: which versions, which people, which dates.
7. Decide who must be told.

## Runbook: a leaked key

Create the new key, put it in use, confirm it works, then revoke the old one. Type secret values in your own terminal, never in chat, an issue, or a commit.

| Secret | If it leaks | What to do |
|---|---|---|
| Apple Developer ID certificate | Someone could sign a Mac app as us | Revoke it in the Apple Developer account, make a new one, ship a release signed with it |
| Apple notary key | Someone could notarize builds under our team | Revoke it in App Store Connect, make a new one |
| License signing key | Someone could mint Pro keys | Make a new key pair, ship a release that trusts the new public key, and reissue keys for existing buyers |
| GitHub token | Depends on its scope; assume it can publish | Revoke it, then read the security log for what it did |
| Stripe key | Someone could read orders or issue refunds | Roll it in the Stripe dashboard, then check recent activity |
| Cloudflare token | Someone could change the site or the DNS | Roll it, then check the audit log and the live download links |

A user's provider key is theirs: it is encrypted on their device and we never hold it. If murmur itself caused a leak of those keys, that is SEV1, and every user should be told to rotate.

## Runbook: a compromised GitHub account

1. Sign in another way and change the password. Turn on or replace 2-factor, and sign out other sessions.
2. Revoke personal access tokens and SSH keys, and remove any OAuth app you do not recognize.
3. Read the security log and the repo's recent activity: commits, tags, releases, workflow changes, repo secrets, and deploy keys.
4. Compare the latest release with the commit it claims to be. Treat any release you cannot account for as a bad release, below.
5. Rotate every secret the repo's workflows could read.
6. If you cannot get in, contact GitHub Support and treat it as a bad release until proven otherwise.

## Runbook: a bad release

Installed copies check GitHub Releases on launch, download the newest version on their own, and install it when they quit. Stop the release first.

**Stop it reaching more copies.** Set the release back to a draft: `gh release edit vX.Y.Z --repo lbwalton/murmur --draft`. The updater then sees the release before it as the newest one. Copies that already downloaded it will still install it on quit.

**Fix the copies that have it.** The updater does not move backward, so a release cannot be undone by republishing an older one. Ship a fix with a higher version number. If the build itself is hostile, say so publicly and tell people to delete the app.

**The website.** Roll back to the last good deployment in Cloudflare Pages, and check that the download links point at a good version.

**iPhone.** Remove the app from sale in App Store Connect, then ask for an expedited review of the fix.

## Who must be told, and by when?

Check each of these on the day. Deadlines change.

- **People affected:** without undue delay, and within 72 hours of confirming that personal data was reached. Post plainly on the site and in the GitHub release notes for a bad build.
- **EU and UK:** the regulator within 72 hours of becoming aware, unless the breach is unlikely to harm anyone.
- **US states:** deadlines vary, and many also require telling the Attorney General.
- **Stripe, Apple, or GitHub:** when their systems or keys were involved.
- **A reporter:** a reply within 3 business days, as `SECURITY.md` promises.

## Yearly check

Once a year, confirm who can publish a release. Review the GitHub account's access, tokens, and SSH keys, the repo's collaborators and secrets, the Apple Developer team, the Cloudflare members and tokens, and the Stripe team. Remove anything not in use, and confirm 2-factor is on everywhere. Update the date at the top of this file.

## After an incident

Within 5 business days, write down the cause, why it was not caught earlier, and what changes so it cannot happen again: a test, a check, or a story.
