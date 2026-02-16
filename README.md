# Drive File Analyzer Web App

Single-page web app that sends requests to the n8n webhook:

`https://ben-unconflictive-many.ngrok-free.dev/webhook/drive-chatbot-api`

## Files

- `index.html`: UI structure
- `styles.css`: responsive styling
- `app.js`: form validation, session ID generation, request logic, response rendering, retry/reset/copy

## Run Locally

Option 1:

1. Open `index.html` directly in your browser.

Option 2 (recommended):

1. Start a simple static server from the `webpage/` folder.
2. Open the served URL in your browser.

Example using Python:

```bash
python -m http.server 8080
```

Then visit `http://localhost:8080`.

## Behavior Summary

- `driveFolderId` and `message` are required.
- `sessionId` is generated automatically and included in every request.
- If files are selected, the app sends `multipart/form-data` with `files`.
- If no files are selected, the app sends JSON with `Content-Type: application/json`.
- Responses must be valid flat JSON objects (`key -> primitive/null`) to render.
- Non-JSON, invalid shape, and request failures show a retryable error panel.
- `Run again` resets form, results, errors, and creates a new `sessionId`.
