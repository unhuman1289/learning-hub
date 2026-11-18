# D · Whole-lesson daily generation

PR fixes the conflicting instructions behind daily jobs on 17–18 November 2026, including `job_26b4856352254952bdd7` and `job_25e173504b1747d983df`.

For OpenAI plan jobs without a listening quota, remove the two general item-count/key-quota lines from the system instructions before sending them. The OpenAI addition explicitly replaces those rules with 5–8 open rubric questions for a primary lesson and 3–6 for an extra lesson, with solutions and whole-lesson grading. The source prompt used by Qwen and Codex retains its original rules. Listening uses its existing branch.

The local save validator also used the old primary item range. Whole-lesson packages now use the agreed ranges when AI size validation applies. Other grading modes retain their ranges.

A fake OpenAI engine exercises a daily job through the runner, schema validation, dry run and committed local database result. It asserts the outgoing instructions contain the replacement and omit both conflicting quotas, verifies the original prompt still has its Qwen/Codex rule, and reads back the saved five-question whole-lesson package.

Validation on 18 November 2026 passed 527 tests, typecheck and lint (two existing warnings in tutor-pet.tsx and ai-controls.ts). Build passed.

Acceptance after deployment belongs to Claude and requires one real request with a saved lesson ID. This PR's execution uses local fixtures.
