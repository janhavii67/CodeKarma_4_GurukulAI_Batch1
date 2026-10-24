# Module 07 — Machine Sound Analysis (similarity search)

**Status:** Planned (placeholder in hackathon) · **Phase:** 5

## 1. Full workflow diagram
```mermaid
flowchart TD
  A["Expert uploads reference sound + label + report"] --> B["Review + approve (M6) as reference"]
  C["Trainee records/uploads machine sound"] --> D["Quality check (clipping, noise, length)"]
  D --> E["Extract features (MFCC, spectral)"]
  E --> F["Compare with APPROVED references of same machine"]
  F --> G{"Reliable match?"}
  G -- yes --> H["Show similar references, expert explanations,<br/>approved troubleshooting links"]
  G -- no --> I["Inconclusive: escalate to Expert"]
  H --> J["Labelled: similarity, NOT a diagnosis"]
```
## 2. Required tech stack and technologies
Python, librosa, NumPy, soundfile, PostgreSQL (feature vectors as arrays; pgvector later), React with waveform/spectrogram display (wavesurfer.js), protected storage.
## 3. System architecture of this feature
```mermaid
flowchart LR
  FE["features/sound-analysis"] --> API["sound endpoints"]
  API --> JOB["job_runner"]
  JOB --> AUD["audio_features (librosa)"]
  JOB --> SIM["similarity_service"]
  SIM --> DB[("machine_sound_recordings, labels,<br/>references, analysis_runs")]
  SIM --> KG["links to M5 / M8"]
```
## 4. Tech flow
```mermaid
sequenceDiagram
  participant T as Trainee
  participant API as FastAPI
  participant J as job
  T->>API: upload sound
  API->>J: queue analysis
  J->>J: features, cosine similarity vs references
  J->>API: top matches + scores + limits
  API-->>T: report (similarity score, quality, "not a diagnosis")
```
## 5. Steps
1. Reference library with review. 2. Upload + quality checks. 3. Feature extraction. 4. Similarity with thresholds validated on real recordings. 5. Report and escalation.
## 6. Other information
Needs real recordings from the same machine and microphone setup; without them results are not meaningful. Four separate numbers are shown: audio quality, classification score, reference similarity, expert-verified outcome. **Dependencies:** 00, 06 (05 and 08 optional).
