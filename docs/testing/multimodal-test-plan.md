# Multimodal Test Plan & Asset Inventory

> **Document Version**: 1.0  
> **Status**: Active  
> **System**: Gurukul AI Industrial Knowledge & AI Assistant Platform  
> **Test Fixtures Directory**: `backend/tests/fixtures/multimodal/`

---

## 1. Overview & Objectives

This test plan defines the validation matrix for multimodal inputs across the Gurukul AI manufacturing knowledge pipeline. It inventories synthetic test fixtures, maps each asset to its corresponding backend API endpoint, specifies validation rules, and defines explicit pass/fail criteria for automated and manual verification.

All fixtures are synthetic demonstration files containing fake machine names (`Machine A / SYNTH-001`) and non-proprietary procedural steps. No confidential manufacturing IP or real-world parameters are used.

---

## 2. Test Fixture Inventory

The following test fixtures are stored in [`backend/tests/fixtures/multimodal/`](file:///c:/Users/sonaw/GurukulAI/backend/tests/fixtures/multimodal):

| Fixture File | Modality | Format / Specs | Purpose |
| :--- | :--- | :--- | :--- |
| `sample_text.md` | Document / Text | Markdown (`.md`), 729 bytes | 4-step Machine A setup note for knowledge capture & folder ingestion. |
| `sample_doc.pdf` | Document / PDF | Adobe PDF v1.4, 2,189 bytes | PDF SOP document with headings, metadata, and 4 sequential steps. |
| `sample_image.png` | Image / Vision | PNG (640x360, RGB), 13,994 bytes | Shopfloor gauge inspection test: *"SAMPLE PART - Gauge reads 12.5 mm"*. |
| `sample_voice.wav` | Audio / Speech | WAV (16kHz, 16-bit PCM Mono, 2.0s), 64,078 bytes | Spoken procedure capture simulation for Module 04 Voice-to-Knowledge. |
| `sample_sound.wav` | Audio / Acoustic | WAV (44.1kHz, 16-bit PCM Mono, 3.0s, 1kHz sine), 264,678 bytes | Machine acoustic anomaly / steady-state sound baseline for Module 07. |
| `sample_video.mp4` | Video / Motion | MP4 (H.264/AAC, 640x360 @ 24fps, 3.0s), 71,458 bytes | Machine operation video clip for step media attachments & range streaming. |
| `bad_file.exe` | Disallowed Type | Plain text disguised with `.exe` extension, 110 bytes | Negative testing: Executable rejection and MIME spoofing prevention. |
| `oversized_file` | Boundary Limit | Binary payload (104,858,624 bytes = 100 MB + 1 KB) | Negative testing: HTTP 413 Payload Too Large enforcement. |

---

## 3. Modality Test Matrix & Pass Criteria

### Modality 1: Technical Documents & Text (`.md`, `.pdf`)

- **Target Endpoints**:
  - `POST /api/v1/knowledge/{id}/versions/{version_id}/media` (Media attachment)
  - `POST /api/v1/assistant/ingest` (Direct knowledge ingestion)
- **Validation Rules**:
  - MIME type verified (`application/pdf`, `text/markdown`).
  - Magic byte inspection for PDF: payload must start with `%PDF-`.
  - File size must not exceed `MAX_INGEST_FILE_BYTES` (50 MB) or `MAX_UPLOAD_BYTES` (100 MB).
- **What a Pass Looks Like**:
  - Endpoint returns HTTP `201 Created` or `200 OK`.
  - Document text is extracted and chunked into `KnowledgeChunk` records with deterministic SHA-256 hashes.
  - Text is retrievable by semantic search and keyword BM25 retrieval (`/api/v1/assistant/chat/stream`).

### Modality 2: Visual & Image Inspection (`.png`, `.jpg`)

- **Target Endpoints**:
  - `POST /api/v1/knowledge/{id}/versions/{version_id}/media`
  - `GET /api/v1/media/{media_id}`
- **Validation Rules**:
  - Magic bytes verified: PNG must begin with `\x89PNG\r\n\x1a\n`.
  - Payload categorized under `KIND_IMAGE`.
- **What a Pass Looks Like**:
  - Endpoint returns HTTP `201 Created` with a unique `media_id` UUID.
  - Image metadata (width, height, file size) is recorded in `MediaAsset`.
  - `GET /api/v1/media/{media_id}` serves the raw image with correct `Content-Type: image/png` and cache headers.

### Modality 3: Spoken Voice Narratives (`.wav`, `.webm`, `.mp3`)

- **Target Endpoints**:
  - `POST /api/v1/voice/upload`
  - `GET /api/v1/voice/jobs/{job_id}`
  - `POST /api/v1/voice/jobs/{job_id}/create-draft`
- **Validation Rules**:
  - Audio container validated (RIFF/WAVE header, WebM EBML, or MP3 sync frame).
  - Minimum file size > 100 bytes (empty audio guard).
- **What a Pass Looks Like**:
  - Upload initiates a background `ProcessingJob` (`HTTP 202 Accepted` or `201 Created`).
  - STT transcription produces ordered `TranscriptSegment` records with valid `start_s` and `end_s` timestamps.
  - Draft creation extracts sequential steps into an editable `KnowledgeVersion` draft.

### Modality 4: Machine Sound Matching & Acoustic Screening (`.wav`)

- **Target Endpoints**:
  - `POST /api/v1/audio/analyze`
  - `POST /api/v1/audio/references`
- **Validation Rules**:
  - Input audio must be a valid PCM audio waveform (WAV/FLAC/OGG).
  - Sampling rate between 8,000 Hz and 48,000 Hz.
- **What a Pass Looks Like**:
  - Audio processing extracts acoustic feature vectors (`FEATURE_VERSION=v1`).
  - Compares features against approved machine acoustic references.
  - Returns similarity score (0.0 to 1.0) and indicates match confidence (`reliable`, `ambiguous`, or `no_match`).

### Modality 5: Video Procedures & Demonstrations (`.mp4`, `.webm`)

- **Target Endpoints**:
  - `POST /api/v1/knowledge/{id}/versions/{version_id}/media`
  - `GET /api/v1/media/{media_id}/stream`
- **Validation Rules**:
  - Container header verified: MP4 must contain `ftyp` box at byte offset 4.
  - MIME type mapped to `KIND_VIDEO`.
- **What a Pass Looks Like**:
  - Upload returns HTTP `201 Created` with `kind: "video"`.
  - Streaming endpoint supports HTTP `206 Partial Content` with `Range: bytes=0-1024` headers, enabling video seek and scrub playback on the frontend.

### Modality 6: Security & Boundary Enforcement (Negative Tests)

#### A. Disallowed Executable Rejection (`bad_file.exe`)
- **Target Endpoints**:
  - `POST /api/v1/knowledge/{id}/versions/{version_id}/media`
  - `POST /api/v1/voice/upload`
  - `POST /api/v1/audio/analyze`
- **Expected Failure**:
  - Server immediately rejects with HTTP `415 Unsupported Media Type` or `422 Unprocessable Content`.
  - No file or temporary artifact is persisted to disk.

#### B. Oversized File Rejection (`oversized_file`)
- **Target Endpoints**:
  - `POST /api/v1/knowledge/{id}/versions/{version_id}/media`
  - `POST /api/v1/assistant/ingest`
- **Expected Failure**:
  - Server rejects with HTTP `413 Payload Too Large`.
  - Error response body returns machine-readable error code `payload_too_large` with clear size limits.

---

## 4. Execution Guidelines

1. **Provider Isolation**: Automated unit and CI tests MUST run with `LLM_PROVIDER=mock` and `DEMO_MODE=true` to guarantee fast, deterministic execution without consuming external API quotas.
2. **Live Testing**: Live tests against external models (e.g., Gemini Flash Lite) require explicit opt-in via `@pytest.mark.live` and use credentials securely loaded from `.env`.
3. **Secret Protection**: API keys and tokens must NEVER be printed, logged in test outputs, or committed to version control.

---

## 5. Automated Test Suites & Real Results

### Task MM-1: Text and Document Input (`test_multimodal_text_and_doc.py`)
- **Suite**: `app/tests/test_multimodal_text_and_doc.py`
- **Results**: 4 passed in 1.86s
  - `test_question_answered_by_sample_doc_pdf_cites_valid_source`: **PASS** (Cites chunk ID from `sample_doc.pdf`)
  - `test_question_not_in_any_document_returns_insufficient_evidence`: **PASS** (`insufficient_evidence=True`, no hallucination)
  - `test_draft_or_withdrawn_document_is_never_cited`: **PASS** (Strict eligibility filtering excludes drafts/withdrawn)
  - `test_document_prompt_injection_is_not_obeyed`: **PASS** (Delimited prompt preserves system prompt confidentiality)

### Task MM-2: Visual & Image Input (`test_multimodal_image.py`)
- **Suite**: `app/tests/test_multimodal_image.py`
- **Results**: 6 passed in 5.66s
  - `test_image_upload_and_gauge_reading_observational_disclaimer`: **PASS** (States visible 12.5 mm reading and flags it as image observation, not approved measurement; tests `/upload-image` + `/chat` and `/chat/media`)
  - `test_image_tolerance_refusal_without_procedure`: **PASS** (Refuses to decide tolerance from visual media alone; states tolerance must come from approved procedure; `insufficient_evidence=True`)
  - `test_image_tolerance_with_procedure_cites_procedure`: **PASS** (Cites approved procedure chunk for tolerance criteria)
  - `test_corrupt_image_and_wrong_extension_rejected`: **PASS** (Rejects `.exe` and corrupt image bytes with HTTP 415/422 and descriptive error)
  - `test_image_content_is_data_not_instructions`: **PASS** (`sample_injection_image.png` with override text is treated strictly as passive data; system prompt is not leaked)
  - `test_live_gemini_smoke_image_input` (`@pytest.mark.live`): **PASS** (Live Gemini API call verifies image parts and returns observational reading)
