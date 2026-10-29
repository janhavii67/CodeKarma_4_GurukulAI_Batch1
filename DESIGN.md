# SUJANA AI Guided Learning Design System

## Direction

Build a calm, encouraging learning journey for technical training. The experience should feel warm and progressive while keeping approved procedure content authoritative and easy to read. Use a clear sequence, friendly rounded step nodes, and small moments of motion without copying another product's characters or brand.

## Design tokens

| Token | Value | Use |
| --- | --- | --- |
| Canvas | `#F5F8FC` | Main learning surface |
| Surface | `#FFFFFF` | Procedure, step, and media panels |
| Ink | `#17324D` | Headings and primary text |
| Body text | `#344B60` | Instructions and supporting content |
| Muted text | `#536779` | Secondary descriptions |
| Border | `#DCE6F0` | Panel outlines and separators |
| Path accent | `#176E8A` | Current step, completed progress, and primary actions |
| Path tint | `#E8F1F4` | Soft accent backgrounds |
| Safety | Amber | Safety alerts and uncompleted confirmation states |
| Error | Rose | Load and save errors |

Use one accent color for the learning path. Reserve amber for safety meaning and rose for errors; do not use color alone to communicate step status.

## Typography

- Use the existing Plus Jakarta Sans stack for headings, instructions, and interface text.
- Use JetBrains Mono for machine identifiers, versions, and compact numeric progress.
- Use short section labels with modest letter spacing. Keep body copy at readable sizes and line heights; preserve line breaks in approved instructions and warnings.

## Layout and components

- Keep the page centered with a generous desktop maximum width and responsive side padding.
- Put the procedure identity and real progress together at the top of the active path.
- Render the sequence as alternating large nodes on desktop and a centered, single-column path on mobile. Keep labels adjacent to their nodes and allow the user to scroll naturally.
- Use rounded white surfaces with quiet borders and restrained shadows. Keep the step viewer focused on one selected checkpoint and group warnings, observations, listed tools, and materials under clear labels.
- Make controls touch-friendly with a minimum target height of 44px. Preserve visible focus rings and descriptive accessible names.
- Show loading skeletons, machine-specific empty states, and actionable errors in the same visual language.
- Display only progress returned by the existing procedure run. Keep completed steps revisitable and future steps locked until the existing completion rule allows them.

## Procedure media

- Use the existing authorized procedure asset endpoint and display only references verified for the selected machine.
- Support native image, audio, and video controls when the response includes those media types. Offer an open-file action for documents and a fallback when an embedded preview fails.
- The current API exposes procedure-level references, not a per-step attachment relationship. Label those references as procedure materials; do not imply they are attached to the selected step.
- Do not invent captions, media metadata, source content, or machine instructions that the API does not provide.

## Motion

- Use the existing Framer Motion dependency for short opacity and transform transitions, staggered path entry, and a restrained current-step emphasis.
- Keep animations between roughly 150–350ms for local transitions. Avoid layout-shifting animation and continuous motion except for a subtle active-node cue.
- Respect `prefers-reduced-motion`; remove movement and looping effects when it is enabled.
- Never make animation necessary to understand progress, validation, or step availability.

## Anti-patterns

- No mascot or copied Duolingo illustrations, logos, or exact screen layouts.
- No fake completion percentages, sample procedures, placeholder media URLs, or invented technical guidance.
- No admin-dashboard card grid for the learning sequence, dense small text, or path labels that overlap on mobile.
- No color-only status, hidden focus states, excessive bounce, autoplay, or motion that blocks reading.
- No claims of per-step media, captions, or optional-step semantics unless the underlying data supports them.
