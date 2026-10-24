# Module 10 — AI-Based Practical Task Monitoring and Skill Verification

**Status:** Planned (placeholder in hackathon) · **Phase:** 6

## 1. Full workflow diagram
```mermaid
flowchart TD
  A["Expert records reference demo"] --> B["Expert labels steps + weights + must-not-skip"]
  B --> C["Reference reviewed + approved (M6)"]
  C --> D["Trainee watches material, records attempt"]
  D --> E["Job: extract frames"]
  E --> F["OpenCV + MediaPipe detect supported actions"]
  F --> G["Compare order/presence with reference (rules, DTW)"]
  G --> H{"Confident?"}
  H -- no --> I["Flag for expert review"]
  H -- yes --> J["Step results + timestamps"]
  I --> K["Provisional compliance score + critical-step status"]
  J --> K
  K --> L["Feedback + expert confirmation"]
```
## 2. Required tech stack and technologies
Python, OpenCV, MediaPipe, NumPy, DTW (e.g. `dtaidistance` or custom), optional PyTorch pretrained models later, FastAPI jobs, React video player with timeline markers.
## 3. System architecture of this feature
```mermaid
flowchart LR
  FE["features/practical-assessment<br/>Reference editor, Recorder, Review timeline"] --> API["assessment endpoints"]
  API --> JOB["job_runner"]
  JOB --> CV["vision pipeline (OpenCV/MediaPipe)"]
  CV --> CMP["comparison + scoring"]
  CMP --> DB[("reference_demonstrations, assessments,<br/>attempts, step_results")]
```
## 4. Tech flow
```mermaid
sequenceDiagram
  participant T as Trainee
  participant API as FastAPI
  participant J as job
  T->>API: upload attempt video
  API->>J: queue
  J->>J: frames -> landmarks -> step detection
  J->>API: results with confidence
  API-->>T: provisional score + flagged items
```
Score = 100 x sum(w_i c_i) / sum(w_i). Uncertain detections are not failures; critical steps are reported separately.
## 5. Steps
1. One controlled task. 2. Reference + step labelling. 3. Recording workflow. 4. Rule-based detection prototype. 5. Comparison and score. 6. Expert review loop.
## 6. Other information
Measures detected procedural compliance, not part quality. Needs a fixed camera setup and real recordings. Recording retention policy must be defined. **Dependencies:** 00, 03, 06, 09 helpful.
