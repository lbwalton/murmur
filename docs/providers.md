# Connecting murmur to a provider

murmur is bring-your-own-key. It talks to any service that speaks the OpenAI-compatible API: one endpoint for speech to text (`/audio/transcriptions`) and one for the cleanup pass (`/chat/completions`). Settings, **Provider and keys** has 3 groups:

- **Speech**: the provider, the model that transcribes your voice, and its key. A preset fills in the provider's address; the base URL itself sits under Advanced, at the bottom.
- **Cleanup**: where the model that polishes the transcript runs. **Runs on** is either **Same as speech** (pick the model, and it uses the speech key) or **Its own provider** (its own provider, model, and key).
- **Saved keys**: every key you saved, 1 per provider, with what each is used for right now.

A strip at the top, **running now**, always says which provider and model run speech and which run cleanup. After any change, press **Test** on the Key row: it names the provider that answered and whether it offers your model, for example "Groq answered and offers whisper-large-v3-turbo".

Provider facts below were verified on 2026-09-13 unless a section carries its own date. Model names drift; when in doubt, your provider's models page is the truth.

## Do I need to re-enter my key when I switch providers?

No. Each provider keeps its own key: saving a key files it under the provider you are on, and switching providers automatically switches to that provider's saved key. Every saved key is listed under **Saved keys** by its provider's name, with what it does in the setup running now (speech, cleanup, notes sorting, Transform, or not used), and its own Replace and Remove. A key saved by an older murmur that predates this appears as one unassigned entry you can assign to the current provider or remove; nothing is ever dropped silently.

## Which connection speaks which protocol?

murmur has three connections. Speech and cleanup both speak the OpenAI-compatible API: any endpoint with `/audio/transcriptions` for speech and `/chat/completions` for cleanup. The sort connection, which files brain dump notes into tasks and ideas, speaks either that same chat protocol or a decision model's protocol. A decision model does not generate text; it answers typed questions with probabilities. The one murmur supports is TypeSafe's Jev, below.

## How do I use TypeSafe (a decision model) for sorting?

TypeSafe's Jev is a decision model, not a chat model: you send a state and typed questions, and it returns typed answers with probabilities. For sorting that means a label outside task, idea, and note is not something it declines to emit, it is something it cannot emit, and a reply arrives in well under a second. Verified against docs.typesafe.ai on 2026-09-21: the endpoint is `POST https://api.typesafe.ai/v1/systemone` with a Bearer key, the model alias `jev-latest` resolves to `jev-1.13.0`, and pricing is $0.042 per million input tokens with output tokens free. Access is waitlisted early access; a key comes from the console at console.typesafe.ai once your account is let in.

To use it: under Settings, Notes, set Sort runs on to Separate, set Sort protocol to Decision model, pick the TypeSafe preset (it fills the base URL and `jev-latest`), save your key, and press Test. The test sends the smallest real request the endpoint accepts, so a good key reports connected and a wrong one reports rejected.

One feature does not cross to this connection. Name each note asks the model to write a short name, and a decision model cannot write, so headings carry the date alone while a decision connection is in use; the panel says so where the protocol is chosen. If the decision model does not answer for any reason, a rate limit included, the sort falls back to your cleanup connection's chat model and the diagnostics log says so; choosing the decision model can never be the reason a sort fails.

## How do I run cleanup on a different provider?

Give cleanup its own provider. Groq can transcribe while OpenRouter, DeepSeek, Cerebras, or a local model does the cleanup. With OpenRouter as the example:

1. Open Settings, **Provider and keys**, and find the **Cleanup** group.
2. Set **Runs on** to **Its own provider**.
3. Pick **OpenRouter** as the Provider. It fills in `https://openrouter.ai/api/v1` and its suggested model, `openai/gpt-6-luna`. Picking any provider puts in its own suggested model, or leaves the model empty when it has none, so a model from another provider never stays behind.
4. Paste your OpenRouter key (from [openrouter.ai/keys](https://openrouter.ai/keys)) in the Key row and press Save.
5. Press **Test**. It should say "OpenRouter answered and offers openai/gpt-6-luna". If it says OpenRouter does not list the model, check the model id.
6. The **running now** strip at the top should say Cleanup: OpenRouter · openai/gpt-6-luna.

OpenRouter's suggested cleanup models, with rates checked on [openrouter.ai/models](https://openrouter.ai/models) on 2026-11-08, per million tokens in and out:

| Model | In | Out |
|---|---|---|
| `openai/gpt-6-luna` (suggested) | $0.10 | $0.50 |
| `openai/gpt-oss-120b` | $0.015 | $0.055 |
| `anthropic/claude-haiku-5.5` | $0.10 | $0.50 |

OpenRouter's rates can move during a day as it routes between hosts; its models page has the current ones. Any other model id OpenRouter offers works too: type it in the Model field.

Its own provider only takes over once it is fully set up: a base URL, a model, and a saved key. Until then cleanup keeps running on your speech provider, and the running now strip says so, so a half-finished setup never costs you the cleanup pass. Speech always uses the Speech group. Notes sorting and Transform use the cleanup connection too, unless you give them their own under Notes or Transform; the line under the Cleanup group says which.

## Can I use one provider for speech and a different one for cleanup?

Yes. See [How do I run cleanup on a different provider?](#how-do-i-run-cleanup-on-a-different-provider) above: set the Cleanup group's **Runs on** to **Its own provider**.

## How do I switch between whole provider setups?

With murmur Pro, save each setup as a **profile** and switch with 1 click. Each profile is a card at the top of Provider and keys that names what it runs, for example "Groq for everything" and "Groq speech, Luna cleanup":

- **What a profile saves:** the speech provider, base URL, and model; whether cleanup runs on speech or on its own provider, with that provider's base URL and model; and the notes sorting and Transform connections.
- **What it never saves:** keys. Keys stay under Saved keys, 1 per provider, so switching to a profile uses that provider's saved key without pasting it again.
- **Switching:** click a card. Every setting it holds changes at once, and the card gets a gold edge and a check.
- **Changing a setting:** the change works right away, the active card says changed, and a bar offers **Save** (into this profile), **Save as new** (a new profile, leaving this one as it was), and **Undo** (back to what the profile saved). Clicking another card while a change is unsaved asks first, since switching would lose it.
- **Saving the setup you have:** the last card, **+ Save this setup as a profile**, asks for a name.
- **Deleting:** every card has Delete under it, and it asks first. Deleting the active profile keeps its setup running, and your keys always stay.
- **Profiles saved by murmur 0.1.17 or earlier** held speech only. They still apply their speech settings and leave cleanup as it is, and their card says cleanup is not saved yet until you save them again.

Without Pro, the top of Provider and keys offers profiles, and everything below works as 1 setup.

## What do murmur's cost estimates mean, and where do the rates come from?

Provider and keys shows an estimated cost per 1,000 dictated words, computed on your machine from your own average speaking pace (from your history; a typical pace is used before any history exists) and the published rates in murmur's provider catalog. Every rate in the catalog carries the date it was verified against the vendor's own pricing page, and a weekly automated check opens a change for review whenever a vendor's number drifts. With **Price refresh** on (the default, under Advanced), murmur also fetches the newest catalog from the murmur repo at launch: a read-only file download from the same GitHub host updates come from, with nothing about you attached. These are estimates only; your provider bills you directly and murmur never sees it.

## How do I use Groq with murmur? (default)

Groq is murmur's default because Whisper on Groq is extremely fast and inexpensive, which suits dictation.

1. Create a free key at [console.groq.com/keys](https://console.groq.com/keys)
2. Paste it into Settings, Provider and keys, Speech, **Key**, and press Save
3. Leave the provider fields at their defaults:

| Field | Value |
| --- | --- |
| Base URL | `https://api.groq.com/openai/v1` |
| Model (Speech) | `whisper-large-v3-turbo` (fastest) or `whisper-large-v3` (highest accuracy) |
| Model (Cleanup) | `openai/gpt-oss-120b` (thorough) or `openai/gpt-oss-20b` (fastest) |

**Silence scores:** the Groq Whisper models send a score for each stretch of speech, and murmur uses them to drop words the model invented on a silent take (verified 2026-11-01 against [console.groq.com/docs/speech-to-text](https://console.groq.com/docs/speech-to-text)). On `whisper-large-v3-turbo` the no-speech score is about 0 on everything, so it never drops anything there, and murmur's check before upload is what guards that model (verified 2026-11-05: a quiet hands-free take on it logged `noSpeech=0.00`; the model scored about 1e-10 on speech in [faster-whisper issue 1028](https://github.com/SYSTRAN/faster-whisper/issues/1028) and on pure silence in [Rapid-MLX pull request 980](https://github.com/raullenchai/Rapid-MLX/pull/980)).

Current model list: [console.groq.com/docs/models](https://console.groq.com/docs/models). Note: Groq decommissioned `llama-3.3-70b-versatile` and `llama-3.1-8b-instant` on 2026-08-16 ([deprecations](https://console.groq.com/docs/deprecations)); murmur migrates old settings to the replacements automatically.

**Do I pay Groq anything on the free tier?** No. Groq's free tier bills nothing and asks for no card; it enforces rate limits instead. The console still shows dollar-equivalent usage, which can look like a bill accumulating, but on the free tier nothing is ever charged. If you upgrade to their developer tier, which needs a payment method, you are billed at the end of each month or sooner when your total usage reaches 1, 10, 100, 500, and 1,000 dollars ([billing FAQs](https://console.groq.com/docs/billing-faqs), verified 2026-10-03).

## How do I use OpenAI with murmur?

1. Create a key at [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
2. Save it in the **Key** row under Provider and keys, Speech
3. Set the provider fields:

| Field | Value |
| --- | --- |
| Base URL | `https://api.openai.com/v1` |
| Model (Speech) | `gpt-transcribe` (OpenAI's recommended default), `gpt-4o-transcribe`, `gpt-4o-mini-transcribe` (cheaper), or `whisper-1` |
| Model (Cleanup) | any chat model you have access to, a small fast one is plenty (see [their models page](https://platform.openai.com/docs/models)) |

**Silence scores:** only `whisper-1` sends them. The `gpt-transcribe` and gpt-4o transcribe models answer in plain json, so murmur's guard against invented words on a silent take does not apply to them (OpenAI API reference, verified 2026-11-05; `whisper-1` is deprecated and shuts down 2027-02-26).

## How do I use Mistral with murmur?

Mistral runs a real `/v1/audio/transcriptions` endpoint with its Voxtral speech models, making it the strongest accuracy-per-dollar alternative to Groq for speech (Voxtral Mini Transcribe: 0.003 dollars per audio minute, roughly 4 percent word error rate, verified 2026-09-13 at [mistral.ai/pricing/api](https://mistral.ai/pricing/api/)).

1. Create a key at [console.mistral.ai](https://console.mistral.ai)
2. Save it in the **Key** row under Provider and keys, Speech
3. Set the provider fields (or pick the Mistral preset):

| Field | Value |
| --- | --- |
| Base URL | `https://api.mistral.ai/v1` |
| Model (Speech) | `voxtral-mini-latest` |
| Model (Cleanup) | `mistral-small-latest` (note: Mistral prices chat models in euros) |

## Which providers work for the cleanup connection only?

These speak OpenAI-compatible chat but host no Whisper-style speech endpoint, so they fit cleanup on its own provider (Cleanup, **Runs on**, Its own provider) (verified 2026-09-13 unless an entry says otherwise):

- **DeepSeek**: base URL `https://api.deepseek.com`, model `deepseek-flash`. Billed from a prepaid balance; rates halve during Beijing-time off-peak hours ([pricing](https://api-docs.deepseek.com/quick_start/pricing)).
- **Cerebras**: base URL `https://api.cerebras.ai/v1`. Extremely fast inference; the model lineup moves quickly, so copy a current model id from Cerebras's docs.
- **OpenRouter**: base URL `https://openrouter.ai/api/v1`. One key routes to hundreds of models (ids look like `vendor/model`), billed through prepaid credits. Suggested model `openai/gpt-6-luna`, with 2 more in [How do I run cleanup on a different provider?](#how-do-i-run-cleanup-on-a-different-provider) (verified 2026-11-08).

Providers with proprietary speech APIs (Deepgram, AssemblyAI, ElevenLabs) and Gemini's non-standard audio path are not supported directly; a gateway like LiteLLM can translate in between.

## Can I run murmur against a local or self-hosted server?

Yes. Any server that exposes OpenAI-compatible `/audio/transcriptions` and `/chat/completions` endpoints works, for example a local Whisper server such as [Speaches](https://github.com/speaches-ai/speaches) (formerly faster-whisper-server) or a gateway like LiteLLM.

| Field | Value |
| --- | --- |
| Base URL | wherever your server listens, e.g. `http://localhost:8000/v1` |
| Model (Speech) | whatever model id your server registers |
| Model (Cleanup) | whatever chat model your server hosts |
| API key | whatever your server expects; murmur always sends one, so use a dummy value if the server ignores it |

**Silence scores:** murmur asks Whisper-named models for `verbose_json` segments, which is how it drops words invented on a silent take. If your server returns them, you get the guard; if it refuses that format, murmur notices and asks for plain json automatically (checked 2026-11-05). A local server running `whisper-large-v3-turbo` sends a no-speech score of about 0 on everything, the same as Groq's, so there murmur's check before upload is what guards against invented words (verified 2026-11-05).

**Why does murmur warn me about an http address?** Plain http is not encrypted, so your API key and what you say would travel in the open, and a 1 letter typo in a base URL is enough to cause it. murmur sends nothing to an http address until you confirm it, under the field where you typed it. Your own computer (`localhost`, `127.0.0.1`) never asks, since that traffic stays on the machine. A server on your home network works once you confirm it, and each host only asks once. The same hold covers a redirect, so an https address that sends murmur to an unconfirmed http one stops there. To take a confirmation back, press Stop under the field while it points at that host.

Local servers keep audio entirely on your machine, which is the strongest privacy posture. The Local preset fills `http://localhost:8000/v1` (the speaches default); for a local cleanup model, point the separate cleanup connection at Ollama (`http://localhost:11434/v1`) or LM Studio (`http://localhost:1234/v1`) and use any model id your server has pulled.

## What about other AI labs and gateways?

If the provider advertises an OpenAI-compatible API and hosts a Whisper-class speech model, it works: set its base URL, its model ids, and your key. Providers that only offer proprietary transcription APIs (different request shapes) are not supported directly, but a gateway like LiteLLM can translate in between.

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| The connection test says `key rejected (http 401)` | Wrong key, or a key from a different provider than the base URL | Regenerate the key at the provider that matches your base URL |
| The connection test says `key rejected (http 403)` | The provider blocked the request: an account restriction, region rule, or network in between | Check your provider account status and try without a VPN |
| The connection test says `network error (...)` or `timed out` | Typo in the base URL, or a local server that is not running | Check the URL ends with the provider's version path (usually `/v1`) |
| The connection test says `network error (net::ERR_CERT_AUTHORITY_INVALID)` | A work network that inspects secure traffic presented a certificate your computer does not trust | See [Troubleshooting](troubleshooting.md): IT installs the company's root certificate |
| Dictation shows the red error state | The speech model id is not valid at your provider | Copy the exact id from the provider's models page |
| Transcripts appear but cleanup never changes anything | The cleanup model id is invalid, so murmur fails open to its built-in formatting | Fix the cleanup model id; murmur never blocks your dictation on it |
| Everything worked yesterday, fails today | Provider outage or a retired model id | Check the provider's status page, then their models page |
| Dictation errors right after switching providers | Your saved key belongs to the previous provider; every provider needs its own key | Paste the new provider's key in the Speech group's Key row, then Test |
| Any error you cannot place | The diagnostics log names every transcription failure | Open `logs/murmur.log` in murmur's data folder: the `[transcribe]` line carries the status, model, and base URL |

A failed transcription never loses your audio: murmur saves the recording under its data folder in `recovery/` so nothing you said disappears.
