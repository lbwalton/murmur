# Connecting murmur to a provider

murmur is bring-your-own-key. It talks to any service that speaks the OpenAI-compatible API: one endpoint for speech to text (`/audio/transcriptions`) and one for the cleanup pass (`/chat/completions`). You configure three things in Settings under **provider**:

- **Base URL**: where your provider's API lives (the Provider preset dropdown fills it for you)
- **Speech model**: the model that transcribes your voice
- **Cleanup model**: the model that polishes the transcript

After any change, click **Test connection** in the setup panel. Green means your base URL and key work together.

Provider facts below were verified on 2026-09-13. Model names drift; when in doubt, your provider's models page is the truth.

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
| Test connection says `key rejected (401)` | Wrong key, or a key from a different provider than the base URL | Regenerate the key at the provider that matches your base URL |
| Test connection says `network error` or `timed out` | Typo in the base URL, or a local server that is not running | Check the URL ends with the provider's version path (usually `/v1`) |
| Dictation shows the red error state | The speech model id is not valid at your provider | Copy the exact id from the provider's models page |
| Transcripts appear but cleanup never changes anything | The cleanup model id is invalid, so murmur fails open to its built-in formatting | Fix the cleanup model id; murmur never blocks your dictation on it |
| Everything worked yesterday, fails today | Provider outage or a retired model id | Check the provider's status page, then their models page |

A failed transcription never loses your audio: murmur saves the recording under its data folder in `recovery/` so nothing you said disappears.
