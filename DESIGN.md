# SUJANA AI Guided Learning Design System

## Direction

Build a calm, encouraging learning journey for technical training. The experience should feel warm and progressive while keeping approved procedure content authoritative and easy to read. The path is a winding road on a deep navy surface: large rounded checkpoints sit on the road, the travelled part of the road lights up, and a finish line waits at the end. Take the feeling of a playful learning path, never another product's characters, brand, or exact screens.

## Design tokens

| Token | Value | Use |
| --- | --- | --- |
| Canvas | `#F5F8FC` | Main learning surface |
| Surface | `#FFFFFF` | Hero, step viewer, and media panels |
| Ink | `#17324D` | Headings, primary text, and the roadmap surface |
| Road edge | `#0B1D2E` | Shadow edge under the road |
| Road unlit | `#2A4866` | Road ahead that is not yet unlocked |
| Road lit | `#FFFFFF` | Road travelled up to the next eligible checkpoint |
| Body text | `#344B60` | Instructions and supporting content |
| Muted text | `#536779` | Secondary descriptions |
| On-road text | `#FFFFFF` / `#B8C7D6` | Node titles / node descriptions on navy |
| Border | `#DCE6F0` | Panel outlines and separators |
| Path accent | `#176E8A` | Primary actions, progress, and the current step on light surfaces |
| Completed node | `#36B3A8` | Completed checkpoints on the navy road (always paired with a check icon) |
| Path tint | `#E8F1F4` | Soft accent backgrounds |
| Safety | Amber | Safety warnings, stop conditions, and critical-step badges only |
| Error | Rose | Load and save errors |

Use one accent family for progress. Reserve amber for safety meaning and rose for errors. Never communicate step status with color alone: every state also has an icon and a text label.

## Typography

- Use the existing Plus Jakarta Sans stack for headings, instructions, and interface text.
- Use JetBrains Mono for machine identifiers, versions, and compact numeric progress.
- Use short uppercase section labels with modest letter spacing. Keep body copy at 14px or larger with comfortable line height, a reading width near 68ch, and preserved line breaks in approved instructions and warnings.

## Layout and components

- **Hero:** procedure title, machine name and code, approved version, description, `Step X of N`, a percentage from real run data, an animated progress bar, and one Continue action that opens the next eligible step.
- **Road:** nodes alternate between 30% and 70% of the road width and are joined by smooth vertical-tangent curves. Labels sit on the open side of each node (step number, title, two-line summary, content icons, status). The same layout works from phone to desktop because geometry is measured from the container.
- **Node states:** completed (mint fill and check), next eligible (white with a soft halo and a Start/Continue tag), selected (outline ring), locked (dim navy with a lock), and critical (small amber shield badge). There is no optional state because procedure data does not define one.
- **Finish line:** a trophy marker at the end of the road lights up only after the server confirms the run is complete.
- **Desktop:** road column on the left (sticky, scrolls on its own) and the focused step viewer on the right. **Mobile:** the road and the step viewer are separate views, with a clear "Back to learning path" action.
- **Step viewer order:** safety first (warning, stop condition, review flag), then instructions, tools and materials, this step's own attachments grouped as images, video, audio, and documents, expected observation, checklist, expert note, shared procedure materials, the record-checkpoint form, then Previous and Next.
- Make controls touch-friendly with a minimum target height of 44px. Preserve visible focus rings and descriptive accessible names; node names include their status and content types.
- Show loading skeletons shaped like the road, machine-specific empty states, and actionable errors in the same visual language.

## Workflow rules the UI must preserve

- Progress comes only from the procedure run returned by the backend. Completed steps stay open for review, and later steps unlock only after the current one is recorded.
- Before recording a step, sync the run's `current_step_order` through `PATCH /procedures/runs/{id}/current-step` when it differs; the backend refuses completions for any other step.
- A step with a checklist cannot be recorded until every listed check is ticked, on top of the existing performed, verification, and safety acknowledgements.
- Procedure completion is shown only after the server reports `COMPLETED` with a completion time.

## Procedure media

- Use the existing authorized procedure asset endpoint and display only references verified for the selected machine.
- Steps list their own attachments in `details.asset_ids`. Show every attachment the API returns on its step: verified items carry "Verified for this machine", others carry "Not yet verified · attached by the workflow author". Never hide attachments silently: show a loading skeleton, an error with Retry when the request fails, and a count of attachment IDs the API did not return.
- A machine can have several workflows. With more than one, trainees pick from searchable cards (category, step count, approval, Resume progress); authors also get Details, Edit steps (saved as a new workflow), Duplicate, Archive, and Restore.
- References not attached to any step are shown as shared procedure materials on every step.
- Present media by type, in this order: **images** as a gallery (a large 16:10 framed preview on a dark backdrop with `object-contain` so annotated diagrams are never cropped, thumbnails when there are several, and a full-screen viewer with Previous/Next, arrow keys, and Escape); **video** in a dark 16:9 cinematic frame with native controls and a caption bar; **audio** in a navy player card with a large play/pause button, a seek slider, elapsed and total time, and a small playing indicator (decoration only, never a fake waveform); **documents** in a framed card with an inline preview for PDFs.
- Always offer an open or download action. When a preview fails, replace it with a fallback that keeps the open action.
- Do not invent captions, media metadata, source content, or machine instructions that the API does not provide.

## Motion

- Use the existing Framer Motion dependency for short opacity and transform transitions: staggered node reveal, the road lighting up to the next checkpoint, a step-content fade on navigation, and a single pop and ring when a checkpoint is saved.
- Keep local transitions between roughly 150–350ms. The road fill may take up to 900ms with an ease-out curve. The only continuous motion is the soft halo on the next eligible node.
- Respect `prefers-reduced-motion`: remove movement, looping, and celebratory effects, and show final states immediately.
- Never make animation necessary to understand progress, validation, or step availability.

## Anti-patterns

- No mascot or copied Duolingo illustrations, logos, or exact screen layouts.
- No fake completion percentages, sample procedures, placeholder media URLs, or invented technical guidance.
- No admin-dashboard card grid for the learning sequence, dense small text, or path labels that overlap on mobile.
- No color-only status, hidden focus states, excessive bounce, autoplay, sound effects, or motion that blocks reading.
- No claims of captions, optional steps, or per-step media unless the underlying data supports them.
