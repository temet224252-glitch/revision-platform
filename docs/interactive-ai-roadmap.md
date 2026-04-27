# Interactive AI Revision Roadmap

Goal: turn uploaded course PDFs into a persistent, visual, interactive revision workspace.

## Phase 1 — Done
- Clicking a subject opens a large full-page `Parcours de révision` view.
- Creating a subject auto-prepares a `Parcours prêt` state.
- The first generated path is subject/document-aware and no longer hardcodes Pythagore for unrelated subjects.
- The path includes concise lesson content, a generic visual manipulation board, and a matching mini-game.
- Tests cover the user flow.

## Phase 2 — Next
- Add Supabase columns or a new table for generated revision content.
- Extract PDF text server-side, not in the browser.
- Add an AI generation endpoint that returns structured JSON blocks:
  - concise lesson sections
  - visual simulators
  - matching games
  - graph/network exercises
  - replayable animations
- Store generation status: pending, generating, ready, failed.

## Phase 3
- Render generated blocks dynamically.
- Add correction feedback: green when correct, red when wrong.
- Add per-subject progress tracking.

## Backend schema candidate
```sql
create table if not exists public.revision_generations (
  id text primary key,
  subject_id text not null references public.revision_subjects(id) on delete cascade,
  status text not null default 'pending',
  content jsonb not null default '{}'::jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```
