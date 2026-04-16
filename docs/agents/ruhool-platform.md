# رحول / الرحول — The platform itself (not an agent)

**Transliteration:** Ruhool

This document exists to make explicit that `الرحول` (the lead she-camel) is
the *name of the platform* and not an agent. Earlier drafts of the code
conflated this with the manager role and the architect role; those
conflations have been resolved (see `AGENTS.md`).

## Purpose
Ruhool is a local-first multi-agent orchestration platform. It hosts the
manager (الراعي), the architect (المصمم), and a roster of specialists. The
platform is responsible for:

- Agent registry and manifest-driven module loading.
- Streaming chat transport (SSE) with delegation tool calls.
- Durable storage (Postgres via Drizzle, JSON file fallback for dev).
- Encryption at rest for provider API keys.
- Activity and audit logging.

## Not an agent
- Users should never "talk to الرحول" directly — it is not a persona.
- System prompts must not answer as الرحول.
- The string `الرحول` may appear in product copy and README only.
