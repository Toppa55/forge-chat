# Forge Chat

Forge Chat is a responsive, browser-based personal AI workspace built for desktop and iPhone.

## What it includes

- OpenAI model selection with GPT-6 Astra, Sol, and Luna
- Chat powered by the Responses API
- Session-only API key entry (keys are never committed to source)
- Exact token tracking and local cost estimates
- Optional organization-cost lookup with an OpenAI Admin API key
- iPhone-friendly push-to-record speech-to-text using `gpt-transcribe`
- Desktop IDE layout with file explorer, editable code, line numbers, and live preview
- Real-time workspace context so chat follows manual code edits
- AI-assisted project rewrites with automatic restore points
- Fixed factory restore point plus manual checkpoints
- Installable web-app manifest

## Run locally

Serve this folder with any static web server, then open it in a modern browser. For example:

```bash
python -m http.server 4173
```

Open `http://localhost:4173`, enter an OpenAI API key in Settings, and choose a model.

## Security model

API and Admin keys are stored in `sessionStorage`, so they are scoped to the current browser tab and cleared when the tab session ends. Keys are sent directly from the browser to OpenAI and are not included in this repository.

For a multi-user production deployment, move OpenAI requests behind an authenticated server and store the shared key in a server-side secret manager. The current build is intentionally a personal bring-your-own-key application.

## Usage display

The standard API key provides per-response token counts, which Forge tracks locally and uses for cost estimates. Exact organization costs require an OpenAI Admin API key. “Remaining” is measured against the app budget configured in Settings; it is not a prepaid-credit-balance endpoint.
