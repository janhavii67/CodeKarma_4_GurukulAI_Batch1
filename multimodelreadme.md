Gurukul AI: Multimodal AI Integration Specification

Status: Planning document. Nothing here has been built, executed, or tested.

Verification: I did not run live checks on model availability, licenses, or pricing for this response. Items marked [CONFIRM] must be verified before purchase or commitment. I give no prices, because they change often. Claude model identifiers come from Anthropic’s current product information. All other model identifiers are from my knowledge and need confirmation.

Notes on your documents:

Your files use both “SUJANA AI” and “Gurukul AI”. I use Gurukul AI here, as in your prompt. Please confirm the final name before it appears in code or docs.
Your prompt skips section 2. I assumed it covers expert voice recordings and cover that under speech-to-text.
1. Core architecture decision

You said you want a multimodal system, not a PDF chatbot. The most important decision is this:

Do not try to put every modality into one shared AI model or one shared vector space. Convert each modality into text plus metadata plus provenance. Retrieve over that, and keep audio similarity as a separate, cautious pipeline.

Modality	What AI produces	Where it is stored
PDF / scan	Text blocks, tables, structured candidates	Chunks with page, section, and bounding box
Expert voice	Timestamped transcript, structured candidates	Segments with start and end time
Image	Caption, OCR text, visible components	Text linked to machine and component
Video	Transcript plus frame observations merged on a timeline	Timeline entries with timestamps
Machine sound	Audio embedding, nearest reference recordings	Audio vector index, separate from text

Everything that comes out of AI is an extraction candidate. It stays out of search and the assistant until an expert approves it through your existing Feature 6 approval flow.

Source asset → Extract → Candidates (with provenance) → Expert review → Approved knowledge → Chunk + embed → Hybrid retrieval → Grounded answer with citations

This respects your rules: AI output stays separate from expert-approved content, and only approved content reaches trainees.

2. Document understanding (PDF, scans, SOPs)
Recommended pipeline
Page triage. For each page, check whether it has a usable text layer. Born-digital pages and scanned pages take different paths.
Born-digital pages. Use PyMuPDF for text, page numbers, and bounding boxes, and Docling for layout, headings, and tables.
Scanned pages. Render the page image, then run PaddleOCR (PP-OCR series) for text. Use Docling’s layout analysis on the result.
Hard pages. For complex tables, diagrams with callouts, or low OCR confidence, send the page image to the vision LLM (section 6) and mark the result “VLM-read, needs review”.
Chunking. Split by section heading, not by fixed size. Each chunk keeps document_id, version, page_start, page_end, section_path, bbox, and extraction_method.
Structured extraction. The LLM reads chunks and returns candidate machine components, operating steps, warnings, faults, troubleshooting items, and expert tips.
Comparison
Tool	Role	Strengths	Concern
PyMuPDF	Text, bounding boxes, page rendering	Fast, accurate for born-digital PDFs	License is AGPL or commercial. Needs legal review for an internal company product [CONFIRM]. Permissive alternative: pypdfium2
Docling	Layout, tables, reading order	Good table handling, open source (MIT [CONFIRM])	Heavier. Run it in a background worker
PaddleOCR	OCR for scans	Strong accuracy, Apache 2.0 [CONFIRM], runs locally	Setup and GPU dependencies can be fiddly
Vision LLM	Fallback for hard pages	Handles diagrams and messy tables	Costs money and sends page images to a cloud provider
Traceability rule (important)

Every extracted claim must include a verbatim source_quote. After the LLM responds, your backend must check in code that the quote actually appears in the cited chunk. If it does not, reject that candidate. This is the cheapest way to catch fabricated claims.

json
{
  "candidate_type": "warning",
  "text": "Disconnect power before opening the guard.",
  "source": {
    "document_id": "doc_123",
    "document_version": 3,
    "page": 14,
    "section_path": ["4 Maintenance", "4.2 Guard removal"],
    "bbox": [72, 310, 520, 345],
    "source_quote": "Disconnect power before opening the guard."
  },
  "extraction_method": "pymupdf",
  "model": "claude-sonnet-5-5",
  "status": "pending_review"
}
3. Expert voice and speech-to-text

Recommendation: faster-whisper running locally, with model large-v3 (Systran/faster-whisper-large-v3 [CONFIRM]).

Why local: Expert recordings contain confidential manufacturing detail. Local transcription avoids sending them to a third party, which is easier to get approved by IT and quality teams.
Settings to use:
Word-level timestamps.
Voice-activity detection to skip silence.
A glossary passed as the initial prompt with machine names, part numbers, and abbreviations from your machines table.
Hardware: A GPU is strongly recommended. CPU-only works for testing but is slow for long recordings.
Languages: If experts speak Hindi, Marathi, or mix languages with English, test on real recordings before committing. Whisper accuracy drops for some languages and for technical terms. Do this evaluation early.
Numbers and units: Flag every number, unit, and negation in the transcript for mandatory review. A transcription error there changes the instruction.
Alternative: A hosted speech API [CONFIRM provider and data terms] if no GPU is available.
4. Machine sound recognition and similarity matching
Honest framing

A general audio model such as YAMNet or PANNs was trained on everyday sounds. It does not diagnose industrial faults. Its realistic value for you is:

Gating: Is this even a machine sound?
Embeddings: Turning audio into vectors so recordings can be compared with your reference recordings.

The system finds the nearest reference recordings and shows what experts verified about them. It never says “bearing failure” because of similarity.

Recommended combination for the initial use case
Stage	Technology	Purpose
1. Quality gate	Signal processing (librosa, soundfile): duration, clipping, silence ratio, estimated SNR	Reject unusable recordings
2. Not-a-machine gate	YAMNet (TF Hub, Apache 2.0 [CONFIRM])	Reject speech-only, music, or silence
3. Embedding	PANNs CNN14 (2048-d, via panns_inference) as the primary choice	Compare recordings
4. Optional second embedding	LAIONCLAP (e.g., laion/clap-htsat-unfused [CONFIRM])	Evaluate against PANNs on your own data. Only needed if you want text-to-audio search
5. Handcrafted features	Log-mel statistics, spectral centroid, RMS, MFCC summary	Sanity check and explainable display (spectrogram)
6. Matching	k-nearest-neighbour with cosine distance, scoped per machine and operating state	Find closest verified references

Start with PANNs, and run a small bake-off against CLAP and YAMNet embeddings on your own recordings. Choose whichever separates your reference classes best. Do not decide this on theory.

Anomaly-detection approaches that learn only “normal” sounds (autoencoders or Mahalanobis distance on embeddings) are for Phase 2, once you have many normal recordings per machine under documented conditions.

How embeddings and matching work
Convert the recording to mono at the model’s sample rate. Slice it into windows (for example, 1 to 10 seconds depending on the model).
Compute one embedding per window, then average or keep the set.
Store the vector in pgvector in a separate table from text embeddings. Audio and text vectors are never compared with each other.
At query time, filter references by same machine and operating state first, then run the nearest-neighbour search.
Report the top 3 to 5 references with distances, expert labels, review status, and a link to play them.
Choosing thresholds (calibrate, do not guess)

Do not hard-code a threshold. Calibrate it per machine from your own reference set.

Collect: For each machine and state, gather multiple recordings across different days, load levels, and microphone positions. Ten recordings made in one session are not enough.
Measure: Using leave-one-out, compute each recording’s distance to its nearest same-class neighbour. Also compute distances to the nearest different-class recordings.
Set bands. These are starting ideas to validate, not final values:
Match: Distance at or below roughly the 95th percentile of same-class distances, and a clear margin over the second-best class.
Possible match: Between the match band and the point where wrong-class neighbours begin to appear.
Unknown: Beyond that.
Validate on recordings that were never used for calibration, including deliberate “other machine” and “not a machine” tests.
Gate by data volume: If a class has too few independent references, do not allow the “match” outcome. Show “closest references, insufficient data to match”. Decide the minimum count with your experts after the bake-off.
The six outcomes, and how to produce them
Outcome	Rule
Insufficient quality	Fails the quality gate (too short, clipped, silent, very low SNR). Stop; no matching is attempted
Not a machine sound	Passes quality but YAMNet is dominated by speech, music, or other non-machine classes
Unsupported machine	Selected machine has no approved reference set, or too few references
Matches a known reference	Within the match band, with a margin over other classes, and the reference is expert-approved
Possible match, needs verification	Within the possible band, or too small a margin between classes
Unknown sound	Beyond the possible band

Every outcome includes a plain-language limitation notice and a “request expert review” action.

json
{
  "outcome": "possible_match_needs_verification",
  "quality": {"passed": true, "snr_db_est": 18.2, "clipping": false},
  "machine_id": "M-014",
  "operating_state": "load_50",
  "closest_references": [
    {"reference_id": "ref_88", "distance": 0.31, "expert_label": "normal operation", "review_status": "approved"},
    {"reference_id": "ref_91", "distance": 0.37, "expert_label": "rattle, cause unconfirmed", "review_status": "approved"}
  ],
  "model": {"embedding": "panns_cnn14", "version": "..."},
  "statement": "Similarity to reference recordings does not confirm a fault. Follow the approved troubleshooting guide or request expert inspection."
}
Data to store with every recording

Machine ID, component, operating state, load or speed, microphone type and position, background noise notes, date, recorder, expert annotations with time ranges, review status, and the model and version used for each analysis. This lines up with the tables already defined in your Feature 7 document.

5. Image understanding

Recommendation: use the same primary LLM family with vision (section 6) for scene understanding, with OCR run first for text.

Task	Approach
Nameplates and labels	PaddleOCR first, then the vision LLM verifies and structures the fields (model number, serial number, ratings). Check the result against your machines table
Error displays	OCR the code, then look it up in approved documents. The vision LLM only interprets if the code is not found
Component photos	The user selects the machine first, which narrows candidates. The vision LLM describes visible parts and proposes component matches, each marked “suggested”
Diagrams and scanned illustration pages	Vision LLM describes. Store the description as text next to the page reference
Linking to knowledge	Embed the OCR text and the description with the text embedding model, then run normal hybrid retrieval over approved manuals and expert knowledge

Rules:

The output must include identified: true/false and a confidence_note. If the image is blurry, partial, or ambiguous, the model must say “cannot identify” and ask for a clearer photo. Enforce this in the JSON schema and prompt.
Visual observations are never treated as diagnoses.
Original images are kept unchanged. Derived text is stored separately.

Options compared:

Claude vision models: One vendor for text and vision, good at document-style images and following strict JSON rules.
GPT and Gemini vision models: Viable alternatives [CONFIRM current model names and pricing]. Gemini is also worth testing for native video input.
Open-source vision-language models (for example, Qwen-VL class [CONFIRM]): Consider only if cloud processing of images is not permitted. They need a GPU server and more engineering.
6. Primary LLM
Disclosure

I am a Claude model, so my recommendation of Claude carries an obvious bias. I base it on your requirements below. Please run a bake-off on your own documents before committing.

Recommendation
Primary: Claude Sonnet 5.5 (claude-sonnet-5-5). Use it for expert-knowledge extraction, structured procedures, grounded question answering, conflict detection, and page or image reading. These tasks need reliable instruction-following, strict JSON, and a willingness to say “insufficient evidence”.
Same-family cheap tier: Claude Haiku 5.5 (claude-haiku-5-5). Use it only for high-volume, low-risk tasks such as routing, tagging, and query rewriting. This is not a second expensive model. It is a cheaper tier of the same provider, and the work it does is clearly separate.
Alternative: Gemini, which is the one worth evaluating if you want native video understanding or if cost matters most [CONFIRM model names and pricing]. An open-weight model on your own server is the alternative if confidential data may not leave the premises.
Not recommended initially: Opus-class or higher tiers, unless the bake-off shows Sonnet fails on a specific task.
Required behavior, and how to enforce it in code
Rule	Enforcement
Answer only from retrieved evidence	System prompt, plus the model receives only retrieved chunks. Nothing else is injected
Never invent settings, tolerances, or safety steps	Prompt rule, plus a post-check: every number and unit in the answer must appear in a cited chunk, otherwise block the answer or flag it
Separate SOP from expert observation	Every chunk carries source_type (sop, expert_note, ai_candidate_approved). Answers label them separately
Identify contradictions	A schema field conflicts: []. When sources disagree, show both and send the user to the document owner
Abstain when evidence is insufficient	A required field answerable: true/false. When false, show the “no approved source found” state and the escalation button
Structured JSON	Use the API’s structured-output or tool-use mechanism, then validate with Pydantic
Verifiable citations	Return chunk IDs only. The backend builds the displayed citation (title, version, page, timestamp). The model never writes citation text itself

Treat all retrieved text as data, not instructions, to resist prompt injection from uploaded documents.

Data-privacy gate

Sending confidential manuals, recordings, and photos to a cloud LLM needs approval from the company’s IT, quality, and legal teams. Check the provider’s data-retention and training terms [CONFIRM]. Your provider layer should make it possible to swap in a local model later.

7. Embeddings and retrieval
Text embeddings

Recommendation: BAAI bge-m3 (BAAI/bge-m3, MIT license [CONFIRM], 1024 dimensions, multilingual, long input). It handles English plus Indian languages better than English-only models and can run locally.

Alternatives: multilingual-e5-large, or a hosted embedding API [CONFIRM]. Keep the embedding model name and version stored on every vector, because changing models later means re-embedding everything.

Can one model cover text, images, and audio?

No, not reliably for your needs.

Text: BGE-M3.
Audio: PANNs or CLAP embeddings, in a separate index. Audio is compared only with audio.
Images: Do not start with image embeddings. Convert images to text (OCR plus description), embed that text with BGE-M3, and retrieve normally. Add an image embedding model such as SigLIP or CLIP later only if you need “find similar photos”.
Cross-modal retrieval without a shared vector space

Link modalities through shared identifiers: machine_id, component_id, procedure_id, and graph relationships (Feature 8). For example:

A sound match returns reference recording #88.
That recording links to machine M-014, component “motor”, and an approved expert report.
The report links to a troubleshooting guide.

This is more reliable than similarity across modalities and keeps everything explainable.

Search stack: PostgreSQL only
Keyword: PostgreSQL full-text search (tsvector with GIN index). It matters for part numbers and machine IDs.
Semantic: pgvector with an HNSW index.
Merge: Reciprocal Rank Fusion (RRF) of both result lists.
Optional later: A reranker such as BAAI/bge-reranker-v2-m3 [CONFIRM], only if evaluation shows poor ranking.
No separate vector database. PostgreSQL is enough for your expected size, and it lets one SQL query apply permissions and approval status.
Permission and approval filtering

Apply filters inside the SQL query, before ranking:

sql
WHERE chunk.status = 'approved'
  AND chunk.version_is_current = true
  AND user_can_access(chunk.access_policy_id, :user_id)

Never filter after retrieval in application code or in the frontend. Chunks from withdrawn or superseded versions are removed from the index (or marked non-current) at the moment of the status change.

8. How everything works together
Ingestion (expert side)
#	Step	Handled by	Output
1	Expert uploads manual, voice recording, and video, and selects the machine	Backend API, file validation	source_assets rows, files in protected storage
2	Jobs are queued	Redis + worker	processing_jobs rows with status
3	Manual extraction	PyMuPDF, Docling, PaddleOCR (+ VLM fallback)	Chunks with page, section, bbox
4	Voice transcription	faster-whisper large-v3	Timestamped segments
5	Video: audio track and frames	FFmpeg, then faster-whisper for audio and the vision LLM for selected frames	Transcript plus frame observations
6	Candidate extraction from each source	Claude Sonnet 5.5, with the machine’s known components as context	JSON candidates, each with a verified quote and a reference to its source
7	Linking to machine and component	Rule-based match against your tables first, LLM suggestion second	Candidate links, marked “suggested”
8	Conflict and uncertainty check	LLM compares new candidates with existing approved knowledge (retrieved), plus rules (for example, a number without a unit)	conflicts and uncertainty_flags on each candidate
9	Expert review	Review screen from Features 4 and 6	Approve, edit, reject. Decision tied to the exact version
10	Publish	Feature 6 approval logic	Approved version, then chunked, embedded, and indexed

Information passes between steps as database records with IDs (never as free text pasted between models). Each model sees only the input for its step, and each output is validated against a schema.

Trainee side
The trainee asks a question about a machine.
The backend identifies the user, machine context, and permissions.
Hybrid retrieval (full-text, pgvector, and graph expansion) returns approved chunks only.
The LLM receives the question plus those chunks and returns structured JSON (answerable, answer, claims each with chunk IDs, conflicts).
The backend validates the JSON, checks numbers against the cited chunks, and builds the citations (document and version, page, video or audio timestamp).
The UI shows the answer, sources, relevant media with timestamp links, and an escalation action.
If the trainee also supplies a machine recording

The separate sound pipeline from section 4 runs. Its structured result is shown beside the document answer, with the limitation statement. The assistant may explain the result and link to approved guides, but it cannot change the outcome or claim a diagnosis.

9. Video: direct video model or frame sampling?

Start with the frame-sampling pipeline. It is cheaper to control, easier to audit, and gives you timestamps you can verify.

FFmpeg extracts audio (16 kHz mono) for transcription.
Frame selection:
One frame near the start and middle of each transcript segment.
Frames at detected scene changes.
A fallback of one frame every few seconds when the expert is silent.
The vision LLM looks at each selected frame together with the transcript text from that moment, and returns visible components and observations with timestamps.
The primary LLM merges transcript and frame observations into a timeline of candidate steps and observations.

Limitations:

Sampled frames can miss quick actions, fine motions, or things that happen between samples.
Every video-derived candidate is labeled “from sampled frames” and goes to expert review.
This pipeline does not verify that a task was performed correctly. That is Feature 10, which has its own requirements.

Direct video models (for example, Gemini) are worth testing later as a second opinion [CONFIRM]. They add cost and make auditing harder.

10. Final recommended model stack
#	Feature	Recommended technology	Model or identifier	Purpose	Input → Output	Deploy	Why	Alternative
1	PDF and document extraction	PyMuPDF + Docling	pymupdf [license CONFIRM], docling	Text, layout, tables, page and bbox references	PDF → structured chunks	Local	Preserves page and position for citations	pypdfium2 instead of PyMuPDF
2	OCR	PaddleOCR	PP-OCR series [CONFIRM version]	Read scanned pages and nameplates	Image → text + confidence	Local	Strong accuracy, no data leaves the site	Tesseract, or the vision LLM for hard pages
3	Speech-to-text	faster-whisper	large-v3 [CONFIRM repo]	Timestamped expert transcripts	Audio → segments with word times	Local (GPU recommended)	Private, accurate, mature	Hosted speech API [CONFIRM]
4	Expert knowledge extraction	Primary LLM	claude-sonnet-5-5	Candidates for steps, warnings, faults, tips	Chunks or transcript → validated JSON	Cloud	Strict JSON, cautious behavior, strong at long documents	Gemini [CONFIRM], or a self-hosted open-weight model
5	Sound classification and similarity	YAMNet gate, PANNs CNN14 embeddings, optional CLAP, kNN	yamnet, Cnn14 [CONFIRM weights license]	Gate, then find nearest verified references	Audio → embedding → ranked references	Local	Open, well documented, runs on CPU or GPU	CLAP, or anomaly models later
6	Image understanding	OCR first, then vision LLM	claude-sonnet-5-5 (vision)	Describe images, structure nameplate data	Image → JSON with uncertainty	Cloud	Same vendor, strong at document images	Gemini or GPT vision [CONFIRM], open-source VLM
7	Video processing	FFmpeg + sampling pipeline	ffmpeg	Extract audio and frames	Video → audio, frames, timeline	Local	Auditable, controllable cost	Direct video model [CONFIRM]
8	Primary LLM	Claude Sonnet 5.5	claude-sonnet-5-5	Extraction, Q&A, conflict detection	Evidence → structured answer	Cloud	Instruction-following, abstention, JSON	Gemini [CONFIRM] / local open-weight
8b	Low-risk bulk tasks	Claude Haiku 5.5	claude-haiku-5-5	Tagging, routing, query rewriting	Short text → labels	Cloud	Lower cost, same provider	Run these on Sonnet if volume is small
9	Text embeddings	BGE-M3	BAAI/bge-m3 [CONFIRM license]	Semantic retrieval	Text → 1024-d vector	Local	Multilingual, long input, open	multilingual-e5-large, hosted API
10	Vector search	pgvector in PostgreSQL	pgvector HNSW index	Semantic search with SQL filters	Vector → ranked chunks	Local	No new infrastructure	Dedicated vector DB only if scale demands
11	Keyword search	PostgreSQL full-text search	tsvector + GIN	Exact terms, part numbers	Query → ranked chunks	Local	Already in your stack	None needed
12	Background processing	Redis + worker	Celery (or arq)	Long-running extraction jobs	Job → status and result	Local	Retries, monitoring, mature	arq for simpler async
11. Implementation approach
Priority order (matching yours)
Phase	Integration	Depends on
A	Provider abstraction, job infrastructure, provenance schema	Foundation, Feature 1 tables
B	Document ingestion and knowledge extraction	A
C	Expert audio transcription and extraction	A
D	Approved knowledge storage and hybrid retrieval	B or C, Feature 6
E	Source-grounded question answering	D
F	Machine sound matching	Reference recordings, Feature 7 data
G	Image and video intelligence	A, D
H	Cross-modal retrieval via the knowledge graph	D, F, G, Feature 8
Code layout (inside your existing modular monolith)
backend/app/ai/
  providers/
    llm_base.py          # interface: generate_structured(), vision()
    llm_anthropic.py
    embeddings_base.py
    embeddings_bge.py
    stt_base.py
    stt_faster_whisper.py
    ocr_paddle.py
    audio_embedding_panns.py
  pipelines/
    document_ingest.py
    audio_ingest.py
    video_ingest.py
    sound_match.py
  schemas/               # Pydantic models for every AI output
  verification/
    quote_check.py       # verbatim quote must exist in source
    number_check.py      # numbers in answers must exist in cited chunks
docs/modules/ai-multimodal.md
Dependencies, credentials, and limits per integration
Integration	Dependencies	Credentials or hardware	Major limitations
PDF and OCR	pymupdf or pypdfium2, docling, paddleocr	None, but CPU or GPU workers	Complex tables and handwritten notes need review
Speech-to-text	faster-whisper, FFmpeg	GPU recommended	Technical terms and accents; numbers need review
LLM and vision	Anthropic SDK	ANTHROPIC_API_KEY in backend env only	Cloud privacy approval; rate limits; cost
Embeddings	FlagEmbedding or sentence-transformers	Local model files	Changing the model means re-embedding
Sound	librosa, panns_inference, tensorflow-hub or torch	Local	Needs enough reference recordings; not a diagnostic tool
Search	PostgreSQL + pgvector	None extra	Index tuning at larger sizes
Failure handling (non-negotiable)
Every job has a status: queued, processing, needs_review, completed, failed, cancelled.
Timeouts, rate limits, and provider outages result in failed or retry_scheduled with the real error stored. Never completed.
Invalid LLM JSON gets one retry, then fails with the raw response stored for debugging.
Use idempotency keys so a page refresh never re-runs a paid job.
Store model name and version, prompt version, and input hash on every AI output.
API keys stay on the backend. The frontend never sees them.
12. Suggested first tasks for Antigravity

I recommend starting with these small tasks, in order. Each should be given its own acceptance criteria and tests when you hand it over. I can write the full eight-part task brief for any of them.

AI-1: Provenance and candidate schema. Add tables source_assets (if not already present), extraction_candidates, source_references, and make sure processing_jobs supports AI statuses. Includes Alembic migration and Pydantic schemas.
AI-2: Provider interfaces. Create the base interfaces and a fake/mock provider for tests. Config through environment variables.
AI-3: Document ingestion (born-digital PDFs only). PyMuPDF or pypdfium2, section-aware chunking, page and bbox metadata, job status. No OCR yet.
AI-4: Quote verification utility. Pure code with unit tests, built before any LLM extraction.
AI-5: LLM candidate extraction from chunks, with schema validation and quote checks.
AI-6: Docling and PaddleOCR for tables and scans.
AI-7: Voice transcription with faster-whisper and the transcript review screen hookup.

Then hybrid retrieval, grounded Q&A, and sound matching, each as its own milestone.

Documentation to create or update
docs/modules/ai-multimodal.md (this specification, once you approve it).
Module registry: add rows for each integration with status planned.
Roadmap: add phases A to H above.
A model registry file listing each model, version, license, and approval status for internal governance.
13. Decisions I need from you

These affect the design, so I would like to settle them before AI-1:

Cloud approval: Is Bio-Rad Medisys willing to send manuals and images to a cloud LLM, or must everything stay on-premises? This decides between the Claude plan and a local open-weight plan.
GPU availability: Will the server have a GPU? This affects Whisper, Docling, and PaddleOCR choices.
Languages: Which languages do experts speak and which languages are the documents in?
Sound data: Do you already have recordings, and how many per machine and state? This decides when the “match” outcome can be enabled.
License review: Who can approve the PyMuPDF license question?

connect the complete frontend and backend