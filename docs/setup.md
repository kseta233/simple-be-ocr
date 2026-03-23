# OCR Backend Setup

## Purpose

This service accepts authenticated document uploads, normalizes OCR data, and returns a response that the frontend can review before local save.

## Local Development

1. Copy `.env.example` to `.env`.
2. Set frontend origin, JWT issuer details, and OCR provider credentials.
3. Run `npm install` from the repository root.
4. Start the backend with `npm run dev:be`.

## Current State

- The service currently ships with a mock OCR processor so the end-to-end flow can be wired before the third-party provider is chosen.
- Replace `processOCRDocument` with the actual provider call once credentials and request format are settled.

