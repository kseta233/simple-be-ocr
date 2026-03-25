# OCR Backend Setup

## Purpose

This service accepts authenticated document uploads, normalizes OCR data, and returns a response that the frontend can review before local save.

## API Contract

See `docs/api-contract.md` for endpoint request/response schemas, errors, and parsing behavior.

## Local Development

1. Copy `.env.example` to `.env`.
2. Set frontend origin, JWT issuer details, and Google Document AI credentials.
3. For `ALLOWED_ORIGIN`, use the exact frontend origin. For multiple frontends, separate with commas.
4. Optional: set `GOOGLE_DOCUMENT_AI_ACCESS_TOKEN` if you want to override automatic auth.
5. Run `npm install` inside `simple-be-ocr`.
6. Start the backend with `npm run dev`.

## Google Document AI

- Supported values for `OCR_PROVIDER` are `google-document-ai`, `google`, and `mock`.
- `_RECEIPT_PROCESS_LINK` is required and is called first for receipt extraction.
- `_DOCUMENT_PROCESS_LINK` is required and is used as fallback when receipt parser does not return total amount.
- `_DOCUMENT_PROCESS_LINK` is also used for bank-notification detection and extraction.
- `GOOGLE_DOCUMENT_AI_ACCESS_TOKEN` is optional. If empty, the backend reads Application Default Credentials (ADC).
- `GOOGLE_APPLICATION_CREDENTIALS` should contain the full service account JSON in both local and Railway.
- Run `gcloud auth application-default login` once for local development to enable ADC.
- An API key is not sufficient for this endpoint; it requires OAuth.

## sourceType Parameter

The backend supports an optional `sourceType` query parameter to optimize document processing:

### Parameter Values

- **sourceType=receipt**: Routes to `_RECEIPT_PROCESS_LINK` for expense/invoice documents
  - Use for: receipts, invoices, expense slips, shopping bills
  - Single pass through expense parser
  
- **sourceType=bank-notification**: Routes to `_DOCUMENT_PROCESS_LINK` for bank messages
  - Use for: bank SMS notifications, transaction messages, account statements
  - Uses document reader + bank notification parser
  
- **No sourceType (default)**: Auto-detects and uses multi-pass strategy
  - First tries `_RECEIPT_PROCESS_LINK`
  - Falls back to `_DOCUMENT_PROCESS_LINK` if receipt parsing fails or returns zero amount
  - Detects bank notification patterns and reclassifies if needed

### Frontend Integration

The frontend passes sourceType when the user explicitly selects the document type:

```bash
curl -X POST "http://localhost:4000/api/v1/ocr/process?sourceType=receipt" \
  -H "Authorization: Bearer test-token" \
  -F "file=@receipt.jpg"

curl -X POST "http://localhost:4000/api/v1/ocr/process?sourceType=bank-notification" \
  -H "Authorization: Bearer test-token" \
  -F "file=@bank-message.jpg"
```

When sourceType is specified, the backend skips auto-detection and routes directly to the specified processor, which can improve accuracy and speed.

## Railway Deployment Auth

- Do not run `gcloud auth application-default login` in Railway.
- Create a Google service account with access to your Document AI processor.
- Put the full JSON key as a single Railway variable in `GOOGLE_APPLICATION_CREDENTIALS`.
- Keep `GOOGLE_DOCUMENT_AI_ACCESS_TOKEN` empty in Railway.
- Set `OCR_PROVIDER=google-document-ai` and the processor URL in `_DOCUMENT_PROCESS_LINK`.

## Local Test

Use a sample file from `samples/`:

```bash
# Default auto-detect
curl -sS -X POST http://localhost:4000/api/v1/ocr/process \
	-H "Authorization: Bearer test-token" \
	-F "file=@./samples/sociola1.jpeg"

# Force receipt parsing
curl -sS -X POST "http://localhost:4000/api/v1/ocr/process?sourceType=receipt" \
	-H "Authorization: Bearer test-token" \
	-F "file=@./samples/sociola1.jpeg"

# Force bank notification parsing
curl -sS -X POST "http://localhost:4000/api/v1/ocr/process?sourceType=bank-notification" \
	-H "Authorization: Bearer test-token" \
	-F "file=@./samples/wa1.json"
```

