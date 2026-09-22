# Connecting murmur to a provider

murmur is bring-your-own-key. It talks to any service that speaks the OpenAI-compatible API: one endpoint for speech to text (`/audio/transcriptions`) and one for the cleanup pass (`/chat/completions`). You configure three things in Settings under **provider**:

- **Base URL**: where your provider's API lives (the Provider preset dropdown fills it for you)
- **Speech model**: the model that transcribes your voice
- **Cleanup model**: the model that polishes the transcript

After any change, click **Test connection** in the setup panel. Green means your base URL and key work together.

Provider facts below were verified on 2026-09-13 unless a section carries its own date. Model names drift; when in doubt, your provider's models page is the truth.

## Do I need to re-enter my key when I switch providers?

No. Each provider keeps its own key: saving a key files it under the provider you are on, and switching providers automatically switches to that provider's saved key. Every saved key is listed in setup under the key field, labeled with its provider, each with its own Remove. A key saved by an older murmur that predates this appears as one unassigned entry you can assign to the current provider or remove; nothing is ever dropped silently.

## Which connection speaks which protocol?

murmur has three connections. Speech and cleanup both speak the OpenAI-compatible API: any endpoint with `/audio/transcriptions` for speech and `/chat/completions` for cleanup. The sort connection, which files brain dump notes into tasks and ideas, speaks either that same chat protocol or a decision model's protocol. A decision model does not generate text; it answers typed questions with probabilities. The one murmur supports is TypeSafe's Jev, below.

## How do I use TypeSafe (a decision model) for sorting?

TypeSafe's Jev is a decision model, not a chat model: you send a state and typed questions, and it returns typed answers with probabilities. For sorting that means a label outside task, idea, and note is not something it declines to emit, it is something it cannot emit, and a reply arrives in well under a second. Verified against docs.typesafe.ai on 2026-09-21: the endpoint is `POST https://api.typesafe.ai/v1/systemone` with a Bearer key, the model alias `jev-latest` resolves to `jev-1.13.0`, and pricing is $0.042 per million input tokens with output tokens free. Access is waitlisted early access; a key comes from the console at console.typesafe.ai once your account is let in.

To use it: under Settings, notes, set Sort connection to Separate provider, set Sort protocol to Decision model, pick the TypeSafe preset (it fills the base URL and `jev-latest`), save your key, and press Test. The test sends the smallest real request the endpoint accepts, so a good key reports connected and a wrong one reports rejected.

One feature does not cross to this connection. Name each note asks the model to write a short name, and a decision model cannot write, so headings carry the date alone while a decision connection is in use; the panel says so where the protocol is chosen. If the decision model does not answer for any reason, a rate limit included, the sort falls back to your cleanup connection's chat model and the diagnostics log says so; choosing the decision model can never be the reason a sort fails.

## Can I use one provider for speech and a different one for cleanup?

Yes. Set **Cleanup connection** to **Separate provider** in Settings. The cleanup slot gets its own base URL, model, and its own encrypted key, so Groq can transcribe while DeepSeek, Cerebras, OpenRouter, or a local model does the cleanup. The separate connection only takes over once it is fully set up (enabled, base URL, model, and a saved key); anything less and cleanup quietly keeps using your speech provider, so a half-finished setup never costs you the cleanup pass. Speech itself always uses the main provider block.

## What do murmur's cost estimates mean, and where do the rates come from?

The settings panel shows an estimated cost per 1,000 dictated words, computed on your machine from your own average speaking pace (from your history; a typical pace is used before any history exists) and the published rates in murmur's provider catalog. Every rate in the catalog carries the date it was verified against the vendor's own pricing page, and a weekly automated check opens a change for review whenever a vendor's number drifts. With **Price refresh** on (the default), murmur also fetches the newest catalog from the murmur repo at launch: a read-only file download from the same GitHub host updates come from, with nothing about you attached. These are estimates only; your provider bills you directly and murmur never sees it.

## How do I use Groq with murmur? (default)

Groq is murmur's default because Whisper on Groq is extremely fast and inexpensive, which suits dictation.

1. Create a free key at [console.groq.com/keys](https://console.groq.com/keys)
2. Paste it into Settings, setup, **Groq API key**, and Save
3. Leave the provider fields at their defaults:

| Field | Value |
| --- | --- |
| Base URL | `https://api.groq.com/openai/v1` |
| Speech model | `whisper-large-v3-turbo` (fastest) or `whisper-large-v3` (highest accuracy) |
| Cleanup model | `openai/gpt-oss-120b` (thorough) or `openai/gpt-oss-20b` (fastest) |

Current model list: [console.groq.com/docs/models](https://console.groq.com/docs/models). Note: Groq decommissioned `llama-3.3-70b-versatile` and `llama-3.1-8b-instant` on 2026-08-16 ([deprecations](https://console.groq.com/docs/deprecations)); murmur migrates old settings to the replacements automatically.

**Do I pay Groq anything on the free tier?** No. Groq's free tier bills nothing and asks for no card; it enforces rate limits instead. The console still shows dollar-equivalent usage, which can look like a bill accumulating, but on the free tier nothing is ever charged. If you upgrade to their developer tier, billing starts only once lifetime usage passes 50 cents, then lands at 1, 10, 100, 500, and 1,000 dollar thresholds ([billing FAQs](https://console.groq.com/docs/billing-faqs), verified 2026-09-13).

## How do I use OpenAI with murmur?

1. Create a key at [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
2. Save it as your API key in murmur's setup panel
3. Set the provider fields:

| Field | Value |
| --- | --- |
| Base URL | `https://api.openai.com/v1` |
| Speech model | `gpt-transcribe` (OpenAI's recommended default), `gpt-4o-transcribe`, `gpt-4o-mini-transcribe` (cheaper), or `whisper-1` |
| Cleanup model | any chat model you have access to, a small fast one is plenty (see [their models page](https://platform.openai.com/docs/models)) |

## How do I use Mistral with murmur?

Mistral runs a real `/v1/audio/transcriptions` endpoint with its Voxtral speech models, making it the strongest accuracy-per-dollar alternative to Groq for speech (Voxtral Mini Transcribe: 0.003 dollars per audio minute, roughly 4 percent word error rate, verified 2026-09-13 at [mistral.ai/pricing/api](https://mistral.ai/pricing/api/)).

1. Create a key at [console.mistral.ai](https://console.mistral.ai)
2. Save it as your API key in murmur's setup panel
3. Set the provider fields (or pick the Mistral preset):

| Field | Value |
| --- | --- |
| Base URL | `https://api.mistral.ai/v1` |
| Speech model | `voxtral-mini-latest` |
| Cleanup model | `mistral-small-latest` (note: Mistral prices chat models in euros) |

## Which providers work for the cleanup connection only?

These speak OpenAI-compatible chat but host no Whisper-style speech endpoint, so they fit the separate **Cleanup connection** slot (all verified 2026-09-13):

- **DeepSeek**: base URL `https://api.deepseek.com`, model `deepseek-flash`. Billed from a prepaid balance; rates halve during Beijing-time off-peak hours ([pricing](https://api-docs.deepseek.com/quick_start/pricing)).
- **Cerebras**: base URL `https://api.cerebras.ai/v1`. Extremely fast inference; the model lineup moves quickly, so copy a current model id from Cerebras's docs.
- **OpenRouter**: base URL `https://openrouter.ai/api/v1`. One key routes to hundreds of models (ids look like `vendor/model`), billed through prepaid credits.

Providers with proprietary speech APIs (Deepgram, AssemblyAI, ElevenLabs) and Gemini's non-standard audio path are not supported directly; a gateway like LiteLLM can translate in between.

## Can I run murmur against a local or self-hosted server?

Yes. Any server that exposes OpenAI-compatible `/audio/transcriptions` and `/chat/completions` endpoints works, for example a local Whisper server such as [Speaches](https://github.com/speaches-ai/speaches) (formerly faster-whisper-server) or a gateway like LiteLLM.

| Field | Value |
| --- | --- |
| Base URL | wherever your server listens, e.g. `http://localhost:8000/v1` |
| Speech model | whatever model id your server registers |
| Cleanup model | whatever chat model your server hosts |
| API key | whatever your server expects; murmur always sends one, so use a dummy value if the server ignores it |

Local servers keep audio entirely on your machine, which is the strongest privacy posture. The Local preset fills `http://localhost:8000/v1` (the speaches default); for a local cleanup model, point the separate cleanup connection at Ollama (`http://localhost:11434/v1`) or LM Studio (`http://localhost:1234/v1`) and use any model id your server has pulled.

## What about other AI labs and gateways?

If the provider advertises an OpenAI-compatible API and hosts a Whisper-class speech model, it works: set its base URL, its model ids, and your key. Providers that only offer proprietary transcription APIs (different request shapes) are not supported directly, but a gateway like LiteLLM can translate in between.

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Test connection says `key rejected (http 401)` | Wrong key, or a key from a different provider than the base URL | Regenerate the key at the provider that matches your base URL |
| Test connection says `key rejected (http 403)` | The provider blocked the request: an account restriction, region rule, or network in between | Check your provider account status and try without a VPN |
| Test connection says `network error` or `timed out` | Typo in the base URL, or a local server that is not running | Check the URL ends with the provider's version path (usually `/v1`) |
| Dictation shows the red error state | The speech model id is not valid at your provider | Copy the exact id from the provider's models page |
| Transcripts appear but cleanup never changes anything | The cleanup model id is invalid, so murmur fails open to its built-in formatting | Fix the cleanup model id; murmur never blocks your dictation on it |
| Everything worked yesterday, fails today | Provider outage or a retired model id | Check the provider's status page, then their models page |
| Dictation errors right after switching providers | Your saved key belongs to the previous provider; every provider needs its own key | Paste the new provider's key in setup (the key field names the active provider), then Test connection |
| Any error you cannot place | The diagnostics log names every transcription failure | Open `logs/murmur.log` in murmur's data folder: the `[transcribe]` line carries the status, model, and base URL |

A failed transcription never loses your audio: murmur saves the recording under its data folder in `recovery/` so nothing you said disappears.
