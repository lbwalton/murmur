# One Pro, both devices (IOS-025 follow-up) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** What LaBroi decided on 2026-10-19 is what murmur says and what he can do: desktop Pro buyers get iPhone Pro free with an App Store offer code, iPhone buyers get a desktop key free, and he can confirm an iPhone purchase from its order id before issuing that key.

**Architecture:** `scripts/lib/app-store-order.js` builds the App Store Server API token and reads a Look Up Order ID answer into one plain verdict; `scripts/app-store-order.js` calls Apple with LaBroi's In-App Purchase key from the environment and prints the verdict and the `issue-license.js` line to run. `ProCopy.founders` becomes one line for both directions; `ios/docs/iphone.md` and `docs/pro.md` answer both questions.

**Tech Stack:** Node 22 (`node:crypto` ES256, `fetch`), vitest, SwiftUI copy, Swift Testing.

**Spec:** ios/prd.json IOS-025, criteria 4 and 7 as LaBroi changed them on 2026-10-19 (its notes: "Still to change: ProCopy.founders and the iphone.md answer").

## Global Constraints

- Apple's Look Up Order ID, checked 2026-10-22: `GET https://api.storekit.apple.com/inApps/v1/lookup/{orderId}`, production only (no sandbox); a JWT signed ES256 with an In-App Purchase key (`kid`), claims `iss` (the team's issuer id), `iat`, `exp` (at most 60 minutes later), `aud` `appstoreconnect-v1`, `bid` (the bundle id); the answer is `{ status: 0 | 1, signedTransactions?: [JWS] }`, each transaction's payload carrying `bundleId`, `productId`, `purchaseDate`, and `revocationDate` once refunded.
- The key never enters the repo or a log; the script reads `APP_STORE_IAP_KEY` (path to the .p8), `APP_STORE_IAP_KEY_ID`, and `APP_STORE_IAP_ISSUER` (falling back to `APPLE_API_ISSUER`, the same team), and never prints them.
- The script only confirms; issuing the key stays `issue-license.js`, run by LaBroi.
- A desktop license key never unlocks anything on iPhone (criterion 5), and the copy never asks for one.
- murmur lowercase; no em dashes or double hyphens; digits for numbers.
- Gates before any commit: `npm run typecheck`, `npm run test`, `npm run ios:test`, `npm run ios:smoke`.

## Review Focus

1. An order holding several purchases, only one of them murmur Pro: confirmed on the Pro one, whatever its place.
2. A refunded Pro purchase (`revocationDate` set): not confirmed, saying it was refunded.
3. Another app's transaction under the same order id (another bundle id): not confirmed.
4. `status: 1`, an empty list, a 401, a 404, or a 429: each says what happened in plain words and exits non-zero.
5. A transaction whose payload is not valid base64url JSON: not confirmed, never a crash that hides the order.

---

### Task 1: Reading an order

**Files:**
- Create: `scripts/lib/app-store-order.js`, `scripts/lib/app-store-order.test.js`, `scripts/app-store-order.js`

**Interfaces:**
- Produces: `serverToken({ keyPem, keyId, issuer, bundleId, now }) -> string`; `orderVerdict(answer, { bundleId, productId }) -> { confirmed: boolean, reason: string, purchased?: string, transactionId?: string }`.

- [ ] **Step 1: Write the failing tests.** `serverToken` with a key made by `generateKeyPairSync('ec', { namedCurve: 'P-256' })`: header `{ alg: 'ES256', kid, typ: 'JWT' }`, claims `iss`, `iat`, `exp` 20 minutes on, `aud: 'appstoreconnect-v1'`, `bid`, and the signature verifies with the public key (`dsaEncoding: 'ieee-p1363'`). `orderVerdict` over hand-made JWS strings (header and payload base64url, any signature): confirmed for one Pro purchase, naming its date; confirmed when Pro is the second of 3; not confirmed for a refund, for another bundle id, for another product only, for `status: 1`, for an empty list, and for a payload that is not JSON.
- [ ] **Step 2: Run** `npx vitest run scripts/lib/app-store-order.test.js`. Expected: FAIL, no module.
- [ ] **Step 3: Write** both functions, then the script: reads the order id from argv, the bundle id and product id from `ios/project.yml` (`MURMUR_BUNDLE_ID`, product id `<bundle>.pro`), the key from the environment, calls Apple with a 30 second timeout, maps 401, 404, 429, and 5xx to plain sentences, and on a confirmed order prints the verdict and `node scripts/issue-license.js <order id> <buyer email>`.
- [ ] **Step 4: Run** the tests. Expected: PASS. Run the script with no key set: it names the missing variable and exits 1, printing no secret.
- [ ] **Step 5: Commit** with the gates.

### Task 2: The words, in the app and the docs

**Files:**
- Modify: `ios/App/Pro/ProCopy.swift`, `ios/AppTests/ProStoreTests.swift`, `ios/docs/iphone.md`, `docs/pro.md`

- [ ] **Step 1: Write the failing test:** `ProCopy.founders` (renamed `bothDevices`) names support@murmurapp.app, says a Mac or Windows Pro gets a free code here, and says Pro bought here gets a desktop key from the order id on Apple's receipt; it never says license key unlocks anything here.
- [ ] **Step 2: Run** `npm run ios:test`. Expected: FAIL on the new test.
- [ ] **Step 3: Write** the line and the docs: iphone.md's How do I get murmur Pro on iPhone? (the founders paragraph becomes the free code for every desktop buyer, founding members' code keeping Founding member), Does my desktop Pro carry over to iPhone? (not by itself; email support with your order id for a free code), and a new Do I get murmur Pro on my Mac or PC too? (yes: email the order id from Apple's receipt); docs/pro.md answers Does murmur Pro cover my iPhone too? both ways.
- [ ] **Step 4: Run** the tests. Expected: PASS. Render the Pro screen at accessibility5 and read the footer.
- [ ] **Step 5: Commit** with the gates.

### Task 3: HANDOFF, notes, review gate, push

- [ ] HANDOFF gains LaBroi's steps: make an In-App Purchase key in App Store Connect (Users and Access, Integrations, In-App Purchase), keep the .p8 beside the notary key and export the three variables the way `~/.config/apple-notary/env` does; set up the two free offers (founders, and one for every other desktop buyer); to answer an iPhone buyer, run `node scripts/app-store-order.js <order id>`, then the printed line.
- [ ] IOS-025's notes say what was built; `passes` stays false (criterion 8 is live).
- [ ] The review gate over the diff; fixes test first; push; CI; memory.
