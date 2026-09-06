# Connecting murmur to a provider

murmur is bring-your-own-key. It talks to any service that speaks the OpenAI-compatible API: one endpoint for speech to text (`/audio/transcriptions`) and one for the cleanup pass (`/chat/completions`). You configure three things in Settings under **provider**:

- **Base URL**: where your provider's API lives
- **Speech model**: the model that transcribes your voice
- **Cleanup model**: the model that polishes the transcript

After any change, click **Test connection** in the setup panel. Green means your base URL and key work together.

Provider facts below were verified on 2026-09-05. Model names drift; when in doubt, your provider's models page is the truth.

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

## How do I use OpenAI with murmur?

1. Create a key at [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
2. Save it as your API key in murmur's setup panel
3. Set the provider fields:

| Field | Value |
| --- | --- |
| Base URL | `https://api.openai.com/v1` |
| Speech model | `gpt-transcribe` (OpenAI's recommended default), `gpt-4o-transcribe`, `gpt-4o-mini-transcribe` (cheaper), or `whisper-1` |
| Cleanup model | any chat model you have access to, a small fast one is plenty (see [their models page](https://platform.openai.com/docs/models)) |

## Can I run murmur against a local or self-hosted server?

Yes. Any server that exposes OpenAI-compatible `/audio/transcriptions` and `/chat/completions` endpoints works, for example a local Whisper server such as [Speaches](https://github.com/speaches-ai/speaches) (formerly faster-whisper-server) or a gateway like LiteLLM.

| Field | Value |
| --- | --- |
| Base URL | wherever your server listens, e.g. `http://localhost:8000/v1` |
| Speech model | whatever model id your server registers |
| Cleanup model | whatever chat model your server hosts |
| API key | whatever your server expects; murmur always sends one, so use a dummy value if the server ignores it |

Local servers keep audio entirely on your machine, which is the strongest privacy posture.

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
