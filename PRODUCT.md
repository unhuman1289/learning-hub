# Learning Hub

Private research and learning workspace for Vũ, Ly and Bột. All learners use the same content, notes and progress; no person selector or assigned learning tracks. Initial audience is owner-only; Google Docs sharing and Site sharing are separate.

## Product
Five tracks: AI/coding/deployment; Medical Systems Biology/MTB/sequencing/PGx; Ly's Cardio; German; family and Bột. Today has time-bounded tasks. Learning map contains examples, questions and curated feedback. Project milestones, notes, completed tasks, journal and review dates persist in D1. Manual explicit Save changes protects drafts; export supports recovery; conditional revision writes reject conflicts.

SWARM's intended three-month outcome is reliable deployment and retrospective evaluation with expert input (Ly first, then oncology team). Research plan here does not claim a validated clinical system. No patient data imported. QUEST content is learning guidance, not a live project integration.

Ly: UKSH Lübeck cardiologist; a new implementation combining annular implant and TEER for primary MR. Three-month deliverables: concept, protocol, initial sponsorship. Exact devices, novelty and study design remain unresolved. Existing COMBO literature is linked for comparison. Cardio/ICU knowledge is separate from the study.

German: self-rated A2, B2 work/certificate within one year, C2 long term. Writing/speaking prioritised. Navigation labels and core headings support VI/EN/DE; authored learning material retains its source language. Feedback is curated, no automatic AI grading.

Bột: born 2025-07-04; age derived at display. Priorities are food/sleep, physical development, interaction, confidence and courtesy. No synthetic growth measures or IQ promises. Monthly report is a manual journal template, not a new scheduler.

## Sources and limits
User conversation is authoritative for goals. Earlier directly-read chat supplements inform context, not live connector data. Site does not connect to saved memory, external chats, QUEST/SWARM execution, Google Drive APIs, calendar or automated reports. Google Docs supports manual links with original permissions. Source links are included in each lesson; clinical concepts are teaching/research framing.

## Technical
Vinext React Worker; private Sites dispatch identity; D1 shared workspace with optimistic revision. SQL migration schema-only. No localStorage user records. No uploads, LLM secrets or patient integrations. WebMCP: read_learning_state and stage_completed_tasks; changes are staged and require visible save. Feature detection and abort cleanup. QA uses a browser registry shim because native WebMCP is unavailable in Chrome.

Shared workspace update: platform still controls admitted viewers. On first access, existing owner data is copied atomically into the shared workspace if absent; legacy rows remain intact. All admitted signed-in users read/write the same revision-controlled record.

## Google Docs catalog
Six native Google Docs were created with Google Drive via the author's connected account: overview and five learning notebooks. Source catalog contains verified file IDs/URLs; original Google sharing remains authoritative. These are links, not a live connector. Eligibility discovery for Sites workspace apps is unavailable in this session, so no runtime Google Drive integration or connector manifest declaration was added. Creating/editing through the chat plugin works; Site-to-Docs writes and two-way synchronization remain blocked. Existing user notes and progress are unchanged.
