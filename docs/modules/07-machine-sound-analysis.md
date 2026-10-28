# Module 07 — Machine Sound Matching

**Status:** Implemented · **Phase:** 5 · **Route:** `/app/sound-analysis`

## Purpose and boundary

Operators record or upload a machine-operation sound and compare it with real, expert-approved reference recordings. Results describe acoustic similarity only. They do not confirm a fault, identify a root cause, estimate fault probability, or determine machine safety. The page displays an expert-authored interpretation only for a published reference and links back to approved knowledge revisions.

Machine-sound matching is separate from Module 04 speech transcription. The waveform is not sent to speech recognition or a general-purpose text LLM. RAG context is retrieved through the existing Module 02 `RetrievalService` and its publication/permission filters; no second knowledge index is created.

## Audio representation and limits

`app.services.audio_service` decodes WAV or FLAC using `soundfile`; FFmpeg decodes MP3, M4A, AAC, AIFF, OGG/Opus, WebM, and audio tracks in MP4, MOV, AVI, FLV, MPEG, WMV, and 3GP video. It uses a system FFmpeg when available and falls back to the bundled `imageio-ffmpeg` binary. Samples are downmixed to mono and normalized to 16 kHz before creating a normalized 48-band mean log-mel spectral profile with NumPy. Reference profiles are saved as JSON with feature version `log_mel_mean_v1`; incompatible profiles are skipped, and if none are usable the API reports a processing/library failure instead of a match. The source recording remains unchanged in protected storage for approved audio references.

The upload byte ceiling reuses `MAX_UPLOAD_BYTES` (100 MiB by default). Decoded recordings must be 0.5–120 seconds, 8–192 kHz, and have at most eight channels. Container signatures are checked before compressed formats are decoded. Empty, malformed, silent, overlong, unsupported, and corrupted recordings produce explicit validation errors. The browser microphone recorder converts its captured audio into PCM WAV before upload. Query media stays in memory for matching; it is stored privately only if the operator submits it for review. If a video is submitted for review, only its extracted audio is retained. Submitted samples can be deleted by their owner or an audio manager.

Similarity uses the normalized cosine similarity of mean log-mel profiles mapped to `[0, 1]`. `AUDIO_MATCH_MIN_SIMILARITY` defaults to `0.82` and `AUDIO_MATCH_AMBIGUITY_MARGIN` defaults to `0.04`. These are initial screening heuristics, not thresholds calibrated on production recordings. A score is not a probability. The library must be validated with representative machine recordings and microphone setups before operational reliance. Ambiguous or below-threshold comparisons are not promoted to a single match.

## Reference review and revisions

An audio manager creates a draft from a decoded real recording, documents only known context, and links at least one current published knowledge version. The recording is stored through the existing protected media storage. The audio reference draft is also a `MACHINE_SOUND_REFERENCE` `KnowledgeItem` revision. Authors submit it into the shared review queue; the existing independent `knowledge.approve` flow checks the source revisions, media, and feature version before publication. Approval makes the reference eligible for matching. Rejection keeps it ineligible. A later published knowledge revision supersedes the previous reference revision, while the knowledge record and review history retain their traceability.

Unmatched operator recordings are only retained after explicit review submission. This creates a private review submission; it is not automatically a reference and contains no generated fault label. An expert can inspect the recording, reject it, or request more information. A separately authored and approved reference is required before it can participate in matching.

Legacy seed baselines were synthetic metadata without decodable recordings. Migration `013_machine_sound_matching` marks them `legacy_unreviewed`, clears their feature vectors, and excludes them. New references require a real file, current feature version, source revisions, and shared approval.

## API

- `GET /api/v1/audio/references` — current published, expert-approved references only.
- `GET /api/v1/audio/references/drafts` — the authenticated author's editable drafts.
- `POST /api/v1/audio/analyze` — multipart supported audio/video comparison; does not retain the query file.
- `GET /api/v1/audio/analysis-jobs/{id}` — caller-owned result, or an audio manager's result.
- `POST /api/v1/audio/analysis-jobs/{id}/submit-review` — owner explicitly submits the same analyzed recording to a private expert queue.
- `GET /api/v1/audio/review-submissions` and `GET /{id}` — audio-manager review queue and detail.
- `POST /api/v1/audio/review-submissions/{id}/decision` — decline or request more context; a sample submission cannot be approved as a published reference.
- `POST /api/v1/audio/references` — create a draft with audio, metadata, and approved source version IDs.
- `POST /api/v1/audio/references/{id}/revisions` — create a new traceable revision under the same knowledge item.
- `PATCH /api/v1/audio/references/{id}` and `POST /{id}/submit` — author edits and submission to shared knowledge review.
- `POST /api/v1/audio/references/{id}/reprocess` — regenerate an incompatible feature profile from its protected recording.
- `GET /api/v1/audio/media/{id}` — private audio streaming for authorized owners/reviewers or visible published references.
- `DELETE /api/v1/audio/analysis-jobs/{id}/submission` — remove an explicitly submitted operator recording.

## Security and integrations

Analysis uses `audio.analyze`; reference authoring and sample-review access use `audio.manage` plus the existing knowledge authoring/submission permissions; publication uses `knowledge.approve` and its anti-self-review rule. Draft and in-review reference media are checked by the knowledge version visibility service. User submissions are accessible only to their uploader and audio managers. Media is streamed with private, no-store cache headers and never receives a public URL.

Matched references expose their linked approved knowledge titles and revision IDs, plus citations from existing RAG retrieval when available. Result fetches recheck that the matched reference and citations are still current; a superseded match is withdrawn from the response and the operator is asked to analyze the recording again. Published workflow/troubleshooting links are attached as version references. Missing citations do not cause the system to invent guidance. Matching does not create a workflow run, troubleshooting case, or real-world fault record.

## Dependencies and verification limits

Python dependencies: `numpy`, `scipy`, `soundfile`, and `imageio-ffmpeg`; the backend Docker image also installs system FFmpeg. No pretrained audio embedding model is configured or required, and no model is trained. The baseline has not been calibrated with production machine recordings. Tests use deterministic generated WAV signals; real microphone and deployment-storage behavior still depend on the browser, host, and configured media backend.
