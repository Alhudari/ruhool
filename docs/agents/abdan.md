# عبدان — Research specialist

**Transliteration:** Abdan
**Prompt file:** `apps/api/src/prompts/specialists/abdan.ts`

## Purpose
Open-web and corpus research. Given a question, he plans queries, pulls
evidence, and returns a structured brief with citations.

## Inputs
- Topic or question (AR/EN).
- Optional corpus constraints (PDFs under `papers/`, note selections).

## Outputs
- Markdown brief with inline citations and a Sources section.
- Optional BullMQ research workflow kick-off payload.

## Tools
- Web fetch (rate-limited).
- PDF parse (`files/pdf.ts`).
- Temporal research workflow (`workflows/research-workflow.ts`) when enabled.

## Memory tier
- `conversation` for the active brief; writes long-term findings to
  `papers/` when asked.

## Model
- Claude Sonnet. Fallback OpenAI gpt-4o.

## Cost budget
- ≤ 12k tokens/task, ≤ 20 web calls.

## Eval criteria
- Citation coverage (every claim has a source).
- No hallucinated URLs.

## Known limitations
- No per-domain scraping policy; relies on site robots/ToS manually.
- Arabic-language sources underweighted by current retriever.
