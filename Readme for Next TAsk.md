# SUJANA AI / Gurukul AI — Trainee Module Implementation Plan

> **Purpose:** This README defines the scope, architecture expectations, implementation sequence, acceptance criteria, and safety requirements for simplifying and upgrading the Trainee experience for medical-equipment knowledge and training.
>
> **Implementation strategy:** Work in small, independently testable chunks. Audit and reuse the existing codebase before changing it. Preserve all working features unless a change is explicitly required and verified.

---

## 1. Project Overview

SUJANA AI helps capture, organize, validate, and transfer expert knowledge so trainees can learn procedures and troubleshoot equipment with support from approved knowledge sources.

The Trainee module should be focused, simple to navigate, visually polished, interactive, and suitable for medical-equipment training. It should not become a collection of unnecessary pages or duplicate tools.

### Core outcomes

- Give trainees a clean dashboard and a small set of clear destinations.
- Make approved documents and expert knowledge easy to find.
- Provide grounded AI answers with source references and useful conversation context.
- Support audio search and multimodal questions where existing model integrations allow them.
- Teach troubleshooting through interactive, expert-approved decision trees.
- Deliver configurable, step-by-step guided workflows authored by experts.
- Explore machine-sound matching/classification using a documented, labeled dataset and an evaluated model.
- Preserve role-based access, expert approval, versioning, auditability, and existing working functionality.

## 2. Trainee Navigation — Target Structure

Keep these six primary sections:

1. **Dashboard**
2. **Knowledge Library**
3. **AI Tutor**
4. **Troubleshooting**
5. **Guided Workflow**
6. **Audio Matching**

Do not add more top-level Trainee sections unless a concrete user need and implementation requirement justify them. Profile, settings, history, progress, and similar supporting functions should be integrated into the relevant section or a compact account menu when appropriate.

### 2.1 Dashboard

Create a simple, polished dashboard that prioritizes the next useful action rather than excessive analytics.

Expected content:
- A concise welcome and trainee identity/profile summary.
- Continue Learning for an in-progress workflow or training scenario.
- Overall learning progress, completed workflows, and relevant skill progress.
- Recent AI Tutor conversations.
- Quick links to the six core areas.
- Minimal recent activity or notifications when real data exists.

Requirements:
- Use existing backend data and components where practical.
- Do not show fake statistics or hard-coded progress as real user data.
- Avoid duplicate cards, redundant charts, and unnecessary widgets.
- Provide useful loading, empty, and error states.
- Keep the layout responsive and accessible.

### 2.2 Knowledge Library

Provide a single place to discover approved knowledge for supported equipment.

Content may include:
- Manuals, PDFs, SOPs, technical documents, and approved notes.
- Expert-approved images, videos, and procedure references.
- Machine/equipment categories, such as X-ray, CT, MRI, and other equipment that exists in the actual knowledge base.

Expected capabilities:
- Search and filter by supported metadata such as equipment, document type, topic, and approval status where permitted.
- Document preview or open/download actions consistent with current storage permissions.
- Clear source title, version, and approval status where available.
- Reuse the same published knowledge source used by the AI Tutor.
- Respect document-level permissions and role-based access.

Do not build a duplicate document repository if the existing Knowledge Library or knowledge-source system already provides these capabilities. Audit current data types and reuse the existing pipeline.

### 2.3 AI Tutor

AI Tutor must support three core capability groups: grounded RAG answers, audio search, and multimodal interaction.

#### A. Retrieval-Augmented Generation (RAG) answers

Expected behavior:
- Retrieve relevant passages from approved and currently published knowledge.
- Produce clear, useful, appropriately detailed answers grounded in retrieved evidence.
- Show citations/source references that point to the actual supporting documents or chunks.
- Make uncertainty explicit when the available sources do not answer the question.
- Do not fabricate machine specifications, procedures, settings, references, or diagnoses.
- Prefer the existing shared AI orchestrator, retrieval pipeline, embeddings, and vector/database infrastructure where available.
- Apply current publication status and access permissions during retrieval.

#### B. Conversation history and limited memory

Expected behavior:
- List recent conversations and allow a trainee to reopen/resume them.
- Persist conversations using the existing history mechanism where available.
- Retain relevant recent context for follow-up questions.
- Keep memory scoped, transparent, and relevant; do not silently mix unrelated trainees' conversations.
- Respect user permissions, retention rules, and any existing privacy controls.
- Ensure restored answers and citations are checked against currently published knowledge if that is part of the existing architecture.

Do not create a separate chat-history system if one already exists. Audit first and close only verified gaps.

#### C. Audio search

Expected behavior depends on existing integrations and supported data:
- Allow supported audio upload/recording paths already implemented by the application.
- Search or retrieve relevant indexed audio-derived transcripts, descriptions, expert notes, or matching knowledge.
- Show useful source information, such as related documents or timestamps, when available.
- Explain when no relevant audio-related knowledge was found.
- Keep audio search distinct from model-based machine-condition classification in the Audio Matching section.

Do not claim to classify a machine's health merely because a transcript or similar recording was retrieved.

#### D. Multimodal interaction

Support available input types according to the actual model and application capabilities:
- Text questions.
- Images or screenshots of equipment, controls, or relevant material.
- Audio input where supported.
- Video or video-derived content only where the current processing pipeline supports it.

Expected behavior:
- Validate file types, size, and duration where applicable.
- Clearly show uploaded inputs and processing/error states.
- Combine input context with approved knowledge when answering.
- Provide citations for knowledge-grounded claims.
- Explain unsupported formats rather than pretending to process them.

Do not replace a working integration or promise model capabilities that the configured provider does not support.

### 2.4 Troubleshooting — Interactive Decision Trees

Create an interactive, graphical troubleshooting experience based on expert-authored scenarios and branches.

Expected trainee flow:
1. Select a supported machine/equipment category.
2. Select a problem or scenario that is actually available.
3. Follow question and decision nodes.
4. Review explanations, approved checks, and the reason for each decision.
5. Reach a terminal outcome containing the approved next steps or escalation guidance.
6. Review the result and, where appropriate, retry or explore the scenario again.

Expected interaction:
- A clear branching diagram with a visible current path.
- Clickable answer choices and nodes.
- Progress indicators and useful transitions/animations.
- Optional points, XP, badges, or completion indicators when they are tied to actual trainee actions.
- Helpful feedback for incorrect choices, including explanations or hints.
- A final summary and completion history when persistence is available.

Expert authoring needs:
- Create and edit scenarios, questions, answers, branches, terminal outcomes, explanations, and hints.
- Reorder nodes and validate the graph before publishing.
- Prevent invalid graphs, broken branches, unreachable nodes, and accidental loops where loops are unsupported.
- Require appropriate expert approval before trainee publication.

Safety:
- Use approved checks and escalation guidance only.
- Do not invent machine-specific instructions or imply that an unverified branch is an authoritative diagnosis.
- Distinguish a learning scenario from actual clinical equipment operation or a confirmed fault diagnosis.

### 2.5 Guided Workflow — Configurable Expert-Led Training

Guided Workflow is a central Trainee feature. It should adapt to the equipment and training objective selected by the trainee and use content configured by an expert.

#### A. Workflow entry questions

Ask the trainee for the minimum information needed to select an appropriate published workflow, such as:
1. Which machine/equipment?
2. What is the training objective? Examples may include operation orientation, setup, alignment, inspection, or another objective explicitly supported by published content.
3. Which model/version, when relevant and known?
4. Experience level or learning goal, only if needed by the workflow.

Example: `X-ray → Alignment → Select an available approved workflow`.

Only offer machine types, models, tasks, and workflows that actually exist in published content. Do not assume every task is available for every machine.

#### B. Expert workflow builder

Authorized experts should be able to create and manage workflows with as many questions as required for the procedure.

Support, as appropriate to the current architecture:
- Question text and answer options.
- Single-choice, multiple-choice, and other input types that the application actually supports.
- Required/optional questions.
- Conditional branching based on answers.
- Next-question or next-step configuration.
- Hints, explanations, safety notes, and source references.
- Ordering, editing, and deletion before publication.
- Draft, review, approval, publication, and version history.

Validation must detect missing required fields, broken references, invalid branch targets, and unreachable steps. Keep authoring permissions separate from Trainee access.

#### C. Guided workflow player

Each published workflow should provide:
- Clear step title, explanation, and instructions.
- Progress indicator and current-step status.
- Previous/next navigation where appropriate.
- Interactive checkpoints, questions, and confirmation steps.
- Relevant references, safety notes, and expected outcomes.
- Save/resume support if the existing persistence model permits it.
- A completion summary and history where supported.

#### D. Optional media and graphics

- If an expert attaches an image, show it in the relevant step.
- If an expert attaches a supported video, show it in the relevant step with appropriate playback controls.
- If no media is attached, provide well-structured text, checklists, and available diagrams or simple UI graphics.
- Do not create broken or misleading empty media placeholders.
- Handle missing, inaccessible, or unsupported media gracefully.

#### E. Simulation and safety

Provide an interactive training simulation when appropriate, for example by asking the trainee to choose the next step and showing the result. Make it clear when an interaction is a software simulation rather than control of a real machine.

Do not connect to or operate physical equipment unless a separate, explicitly authorized and safety-reviewed integration exists. Do not invent machine settings, alignment values, exposure parameters, maintenance procedures, or safety instructions. Use the approved procedure applicable to the equipment model and version.

### 2.6 Audio Matching — Machine-Sound Analysis

Audio Matching is separate from the AI Tutor's audio search. It is intended to compare an uploaded machine recording with a labeled dataset and, if evidence supports it, return a model-generated class or anomaly indication.

#### A. Dataset discovery and verification

Before downloading or training:
- Search for a legally downloadable dataset relevant to the intended sound classes.
- Prefer medical-equipment sound data if it is available and appropriately licensed.
- Verify the source, license, permitted use, labels, machine/domain, recording conditions, and limitations.
- Record the dataset name, source URL, license, version/date, class labels, and preprocessing requirements in project documentation.
- Do not describe general industrial-machine audio as medical-equipment audio.
- If a suitable medical-equipment dataset cannot be found, document that limitation and ask for a decision before representing any substitute as relevant to medical equipment.

Do not download an arbitrary dataset and assume it supports MRI, CT, X-ray, or any other specific machine-condition claim.

#### B. Model selection and baseline

Evaluate an appropriate existing/pretrained audio model or a lightweight classifier suitable for the verified dataset. Choose the model only after examining the task and labels.

Possible task types:
- **Classification:** predict among known, labeled classes.
- **Anomaly detection:** flag audio that differs from a suitable reference distribution.
- **Similarity matching:** retrieve acoustically similar labeled examples.

These are different tasks. Do not conflate similarity with fault diagnosis or classification with verified machine condition.

Document:
- Model name/version and license.
- Input format and preprocessing.
- Class labels and intended scope.
- Training/validation/test split.
- Evaluation metrics and results.
- Known limitations and conditions under which the model should abstain.

Avoid training a model from scratch unless justified. Keep model and dataset artifacts out of source control when large or restricted; follow the repository's established artifact-storage convention.

#### C. Processing pipeline

Expected pipeline:
1. Validate audio format, size, duration, and sample rate.
2. Preprocess consistently with training/evaluation.
3. Run the selected classifier, anomaly detector, or similarity search.
4. Apply confidence/abstention rules appropriate to measured model performance.
5. Return structured results and record the model/dataset version used.

#### D. Result interface

Show only information supported by the actual model output, such as:
- Predicted label or anomaly indication.
- Confidence/probability only when it is genuinely produced and correctly interpreted by the model.
- Similar reference recordings and their labels when available.
- Short explanation of the model's scope and limitations.
- A clear `Unknown / Insufficient evidence / Needs expert review` state for unsupported or low-confidence inputs.

Never fabricate confidence values, matches, or diagnoses. Do not present an unvalidated model output as a confirmed machine fault. Sound-based results are preliminary indicators and must not replace qualified inspection or manufacturer-approved diagnostics.

#### E. Model evaluation

Use separate training, validation, and test sets; avoid leakage between recordings from the same source/session when that would inflate performance. Report suitable metrics for the task, including per-class performance where relevant. Test invalid files, silent/noisy audio, unseen classes, and low-confidence inputs.

### 2.7 Expert and Admin capabilities

Reuse the existing Expert/Admin areas and permissions wherever possible. Add only the authoring or review functions needed for the Trainee features.

Required capabilities, subject to the existing role model:
- Upload, review, approve, publish, and version knowledge sources.
- Create and edit guided workflows, questions, conditional branches, media, and checkpoints.
- Create and validate troubleshooting decision trees and scenarios.
- Review audio dataset metadata, model versions, and analysis results as appropriate.
- Maintain approval history and audit logs.

Do not build a parallel Expert/Admin application if the current one can be extended safely.

---

## 3. Shared UX and UI Requirements

The interface should feel like a polished, modern medical-technology training product, not a generic dashboard template.

### Design principles
- Simple information architecture and clear visual hierarchy.
- Consistent typography, spacing, component behavior, and icon usage.
- A restrained, professional visual system appropriate for medical equipment and technical learning.
- Interactive diagrams and meaningful motion where they improve understanding.
- Responsive layouts for desktop, tablet, and mobile.
- Clear focus states, keyboard navigation, semantic labels, and adequate contrast.
- Consistent loading, empty, success, validation, and error states.
- Useful feedback for every action; no decorative buttons that do nothing.
- Reuse the existing design system and component library when sound.

Avoid:
- Too many cards or unnecessary analytics.
- Duplicate navigation or overlapping features.
- Hard-coded sample data presented as real data.
- Placeholder buttons, fake progress, or simulated AI results in production.
- Unnecessary dependency additions or full rewrites.

## 4. Architecture and Implementation Principles

The repository's actual architecture is the source of truth. Inspect it before making architectural decisions.

The existing project documentation identifies or suggests the following technology patterns:
- **Frontend:** React.
- **Backend:** FastAPI/Python.
- **Data:** PostgreSQL.
- **Knowledge retrieval:** RAG, embeddings, and a vector database already selected by the project.
- **Speech processing:** an existing speech-to-text pipeline such as Whisper where configured.
- **Audio analysis:** Python audio tooling and an appropriate evaluated model.
- **Media:** existing file/object storage.

These are not instructions to replace the current stack. Use the technologies already present in the repository unless there is a verified, necessary reason to change them.

### Required engineering practices
- Audit routes, pages, components, services, database models, migrations, APIs, tests, role permissions, and feature flags first.
- Identify which requirements are already implemented, partially implemented, broken, or missing.
- Reuse working components, APIs, orchestrators, data models, and integrations.
- Prefer small, backward-compatible changes.
- Keep API contracts and existing database records compatible.
- Add migrations only when needed and make them safe for existing data.
- Enforce authorization in backend/API handlers, not just by hiding frontend navigation.
- Validate uploaded files and protect against unauthorized access to private content.
- Avoid exposing secrets, credentials, private file paths, or internal errors to clients.
- Add logging that helps debugging without recording unnecessary sensitive content.
- Use configuration/environment variables for secrets and service configuration.
- Document any new environment variables and setup steps.
- Do not silently swallow errors or fall back to fabricated content.

## 5. Role-Based Access and Publication Rules

Check the application's existing role definitions and preserve them.

At minimum:
- Trainees can access only trainee-permitted pages, published content, and their own permitted history/progress.
- Experts can manage content only within their authorized permissions.
- Admin capabilities remain restricted to the existing authorized roles.
- Draft and unapproved knowledge/workflows/scenarios must not be exposed to ordinary Trainees.
- APIs must validate role and resource ownership on every protected operation.
- Frontend route guards and navigation must align with backend authorization.
- Test direct URL access and direct API requests, not only visible menu items.

Do not invent a new role system if the repository already has one. Extend the existing access-control model only where necessary.

## 6. Implementation Plan — Small Chunks

Complete each chunk, test it, report the result, and only then proceed to the next chunk. Do not attempt a full application rewrite in one pass.

### Chunk 1 — Repository audit and Trainee scope cleanup
- Map the current architecture and identify the six target sections.
- Audit existing functionality, role guards, routes, and duplicated pages.
- Produce a brief gap report before destructive changes.
- Simplify Trainee navigation and dashboard without deleting underlying working features.
- Verify role access and run relevant tests.

**Exit criteria:** Six core sections are reachable by authorized Trainees; unnecessary top-level navigation is removed; existing APIs/data remain intact; no regression in other roles.

### Chunk 2 — Dashboard and Knowledge Library
- Polish the simple dashboard using real data.
- Integrate existing knowledge search, filters, document previews, and approval/version metadata.
- Add empty/error/loading states and verify permissions.

**Exit criteria:** Dashboard shows real or explicitly empty states; published documents are discoverable; restricted/draft content remains protected.

### Chunk 3 — AI Tutor RAG, history, and memory
- Trace the existing AI orchestrator and retrieval pipeline.
- Verify published-source filtering, citations, follow-up context, history persistence, and resume behavior.
- Fix verified gaps rather than replacing working systems.

**Exit criteria:** Answers are grounded where sources exist, citations resolve to actual sources, unknowns are handled honestly, and history/context are isolated per authorized user.

### Chunk 4 — AI Tutor audio search and multimodal
- Audit current audio search, upload validation, speech/transcript processing, and multimodal integrations.
- Implement missing support based on actual provider capabilities.
- Test supported formats, invalid files, errors, and source grounding.

**Exit criteria:** Supported inputs work end-to-end; unsupported inputs fail clearly; existing text RAG and history still work.

### Chunk 5 — Troubleshooting decision-tree engine and UI
- Define/reuse the scenario and branch data model.
- Implement authoring, graph validation, trainee traversal, feedback, and completion tracking.
- Add meaningful gamification only when it is backed by actual progress.

**Exit criteria:** Valid scenarios are traversable, invalid branches are rejected, outcomes use approved content, and access is enforced.

### Chunk 6 — Guided Workflow expert builder
- Implement machine/task selection using available published workflows.
- Support expert-configured questions, answer types, conditional branches, media, references, checkpoints, drafts, approval, and versioning.
- Validate workflows before publication.

**Exit criteria:** Experts can create and publish a valid multi-question workflow without code changes; invalid branch references are blocked; Trainees see only published versions.

### Chunk 7 — Guided Workflow trainee player
- Implement the entry questionnaire, workflow step player, media display, progress, checkpoints, completion, and resume where supported.
- Provide a text-first fallback when media is absent.
- Clearly label simulations.

**Exit criteria:** A trainee can complete a published workflow from start to finish; media failures degrade gracefully; no physical machine is controlled.

### Chunk 8 — Audio dataset, baseline model, and evaluation
- Research and verify a downloadable dataset and license.
- Document dataset suitability and limitations before training.
- Build reproducible preprocessing and train/evaluate an appropriate baseline.
- Add API integration and honest result states.
- If no suitable medical-equipment dataset exists, document the blocker and do not mislabel substitute data.

**Exit criteria:** Dataset provenance and license are documented; model evaluation is reproducible; output includes a safe abstention path; no fabricated labels or results are shown.

### Chunk 9 — Integration and regression
- Test all six sections together.
- Test all relevant roles and direct API/page access.
- Run unit, integration, and end-to-end tests available in the repository.
- Test responsive layouts, accessibility basics, file validation, error states, and existing feature regressions.
- Update developer documentation and report known limitations.

**Exit criteria:** Relevant tests pass, role isolation is verified, and remaining limitations are explicitly reported.

---

## 7. Definition of Done for Every Chunk

Before marking a chunk complete, the coding agent must:

1. Inspect relevant existing code and identify what is already working.
2. Implement only the scoped change.
3. Avoid unrelated refactors and broad rewrites.
4. Run applicable tests, linting, type checks, and builds available in the repository.
5. Test both successful and failure/empty cases.
6. Verify role-based access on the frontend and backend where applicable.
7. Check that the chunk did not break existing features.
8. Summarize:
   - What changed.
   - Files/modules changed.
   - Tests and commands run, including failures.
   - Existing functionality preserved.
   - Any migration, configuration, or environment changes.
   - Known limitations and the next recommended chunk.

Do not report tests as passed if they were not run. Do not claim a feature is complete if it is only a UI mock or uses fake data.

## 8. Testing Checklist

### Trainee access and navigation
- [ ] Trainee sees only authorized navigation.
- [ ] All six sections load successfully.
- [ ] Direct route access is protected.
- [ ] Protected APIs reject unauthorized requests.
- [ ] Existing Expert/Admin access still works.

### Dashboard and Knowledge Library
- [ ] Real progress/activity is displayed when available.
- [ ] Empty and error states work.
- [ ] Search and filters return correct published results.
- [ ] Draft or restricted sources are not exposed.
- [ ] Document references and versions are accurate.

### AI Tutor
- [ ] RAG retrieves only permitted, published sources.
- [ ] Citations point to actual evidence.
- [ ] Unsupported questions receive honest responses.
- [ ] Conversation history persists and resumes.
- [ ] Follow-up context is scoped to the correct trainee.
- [ ] Audio search is distinct from condition classification.
- [ ] Supported multimodal inputs work; unsupported inputs fail clearly.
- [ ] Invalid uploads are rejected safely.

### Troubleshooting
- [ ] Published scenarios load.
- [ ] Branches lead to valid next nodes.
- [ ] Invalid or unreachable nodes are detected.
- [ ] Feedback and terminal outcomes match approved content.
- [ ] Completion/progress is stored correctly where implemented.

### Guided Workflow
- [ ] Entry questions list only available machines/tasks/models.
- [ ] Experts can configure multiple questions and branches.
- [ ] Workflow validation blocks invalid references.
- [ ] Drafts are not visible to Trainees.
- [ ] Images/videos display when attached.
- [ ] Text-only workflows remain usable.
- [ ] Progress, checkpoints, and completion work.
- [ ] Simulation is clearly distinguished from real equipment control.

### Audio Matching
- [ ] Dataset source and license are documented.
- [ ] Labels actually match the dataset.
- [ ] Preprocessing matches model requirements.
- [ ] Train/validation/test separation is valid.
- [ ] Metrics and limitations are documented.
- [ ] Invalid, silent, noisy, and unknown audio are handled.
- [ ] Low-confidence or unsupported cases can return an abstention state.
- [ ] No unvalidated prediction is described as a confirmed fault.

### Regression and quality
- [ ] Relevant unit/integration/end-to-end tests pass.
- [ ] Existing working features remain functional.
- [ ] Responsive layout and accessibility basics are checked.
- [ ] Loading, empty, success, and error states are present.
- [ ] No secrets or sensitive information are exposed.
- [ ] Documentation reflects actual implementation.

---

## 9. Non-Negotiable Constraints

1. **Do not delete working features just to simplify navigation.** Remove unnecessary links/pages from the Trainee experience only after checking whether their underlying services are used elsewhere.
2. **Do not rewrite working integrations without evidence of a defect.**
3. **Do not use fake production data or fake model results.**
4. **Do not expose draft or unauthorized knowledge to Trainees.**
5. **Do not invent medical-equipment procedures, settings, or diagnostic claims.**
6. **Do not misrepresent a generic industrial audio dataset as a medical-equipment dataset.**
7. **Do not claim a model works without evaluation on appropriate data.**
8. **Do not proceed to the next chunk while the current chunk has unresolved regressions without documenting and getting direction on the blocker.**
9. **Keep changes focused, testable, and compatible with the current project.**
10. **When uncertain, inspect the codebase and document the uncertainty instead of guessing.**

## 10. Final Expected Result

The finished Trainee module should provide:

- A clean dashboard.
- One approved Knowledge Library.
- One AI Tutor combining grounded RAG, history/context, audio search, and supported multimodal interaction.
- One graphical, interactive, gamified troubleshooting experience.
- One configurable guided-workflow system with expert-authored questions, branches, media, text-first fallback, progress, and clearly labeled simulations.
- One separate Audio Matching feature backed by a documented dataset and an appropriately evaluated model, with honest uncertainty handling.
- Correct role-based access, approval/versioning, responsive UI, and regression coverage.
- No unnecessary duplicate sections and no regressions to working Expert/Admin or shared features.

**Start with Chunk 1 only.** Audit the repository, report current implementation and gaps, then make the smallest safe changes. Do not implement all chunks in one pass.
