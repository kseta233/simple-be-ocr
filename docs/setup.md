# OCR Backend Setup

## Purpose

This service accepts authenticated document uploads, normalizes OCR data, and returns a response that the frontend can review before local save.

## Local Development

1. Copy `.env.example` to `.env`.
2. Set frontend origin, JWT issuer details, and Google Document AI credentials.
3. For `ALLOWED_ORIGIN`, use the exact frontend origin. For multiple frontends, separate with commas.
4. Optional: set `GOOGLE_DOCUMENT_AI_ACCESS_TOKEN` if you want to override automatic auth.
5. Run `npm install` inside `simple-be-ocr`.
6. Start the backend with `npm run dev`.

## Google Document AI

- Supported values for `OCR_PROVIDER` are `google-document-ai`, `google`, and `mock`.
- `GOOGLE_DOCUMENT_AI_PROCESSOR_ENDPOINT` should be the full processor `:process` URL.
- `GOOGLE_DOCUMENT_AI_ACCESS_TOKEN` is optional. If empty, the backend reads Application Default Credentials (ADC).
- `GOOGLE_APPLICATION_CREDENTIALS` should contain the full service account JSON in both local and Railway.
- Run `gcloud auth application-default login` once for local development to enable ADC.
- An API key is not sufficient for this endpoint; it requires OAuth.

## Railway Deployment Auth

- Do not run `gcloud auth application-default login` in Railway.
- Create a Google service account with access to your Document AI processor.
- Put the full JSON key as a single Railway variable in `GOOGLE_APPLICATION_CREDENTIALS`.
- Keep `GOOGLE_DOCUMENT_AI_ACCESS_TOKEN` empty in Railway.
- Set `OCR_PROVIDER=google-document-ai` and the processor URL in `GOOGLE_DOCUMENT_AI_PROCESSOR_ENDPOINT`.

## Local Test

Use a sample file from `samples/`:

```bash
curl -sS -X POST http://localhost:4000/api/v1/ocr/process \
	-H "Authorization: Bearer test-token" \
	-F "file=@./samples/sociola1.jpeg"
```

