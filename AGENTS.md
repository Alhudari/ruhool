# Ruhool (رحول) — Agent Taxonomy

Ruhool is the platform itself, named for the lead she-camel (الرحول) that guides
a caravan across the desert. Inside the platform live a manager, an architect,
and a roster of specialist agents. Arabic identifiers are canonical; English
transliterations are provided for code and documentation.

## Roster

| Role | Arabic | Transliteration | Contract |
|---|---|---|---|
| Manager | الراعي | Al-Ra'i ("the shepherd") | [`docs/agents/al-raai.md`](docs/agents/al-raai.md) |
| Architect | المصمم | Al-Musammim | [`docs/agents/al-musammim.md`](docs/agents/al-musammim.md) |
| Research specialist | عبدان | Abdan | [`docs/agents/abdan.md`](docs/agents/abdan.md) |
| Reading helper | شواشة | Shwasha | [`docs/agents/shwasha.md`](docs/agents/shwasha.md) |
| Writing critic | الصفرا | Al-Safra | [`docs/agents/alsafra.md`](docs/agents/alsafra.md) |
| Comparator | رمّانة | Rammana | [`docs/agents/rammana.md`](docs/agents/rammana.md) |
| Content creator | الدبسا | Al-Dabsa | [`docs/agents/aldabsa.md`](docs/agents/aldabsa.md) |
| Tasks agent | مهام | Mahaam | [`docs/agents/mahaam.md`](docs/agents/mahaam.md) |
| Diagnoser | المشخّص | Al-Mushakhkhis | [`docs/agents/al-mushakhkhis.md`](docs/agents/al-mushakhkhis.md) |
| Organizer | المنظّم | Al-Munazzim | [`docs/agents/al-munazzim.md`](docs/agents/al-munazzim.md) |
| Analyst | المحلل | Al-Muhallil | [`docs/agents/al-muhallil.md`](docs/agents/al-muhallil.md) |
| Creative | الكرييتف | Al-Creative | [`docs/agents/al-creative.md`](docs/agents/al-creative.md) |
| Platform root | الرحول (platform) | Ruhool | [`docs/agents/ruhool-platform.md`](docs/agents/ruhool-platform.md) |

See [`docs/agents/`](docs/agents/) for the per-agent contract (Purpose, Inputs,
Outputs, Tools, Memory tier, Model, Cost budget, Eval criteria, Known
limitations). The manager is the only agent users talk to directly by default;
all other agents are invoked via the manager's delegation tool
(`services/agents/manager.ts`).

## Naming invariants (AGT-01 / AGT-02)

- **The platform is "Ruhool / الرحول".** It is *not* an agent.
- **The runtime manager is "الراعي" (Al-Ra'i).** Earlier drafts used "الرحول"
  for the manager; that collision is resolved in favor of the name above.
- **The architect is "المصمم" (Al-Musammim).** Earlier drafts reused "الرحول"
  here; that has been changed.
- Specialist names are fixed and must not drift between prompt files and
  module manifests.
