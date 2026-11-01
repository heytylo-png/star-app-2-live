# Shared Bot Handoff Standard

Status: proposed workflow standard; documentation-only branch. No production changes are authorized by this document.

## Purpose
GitHub is the shared source of truth for Star Rai task reports and review evidence. A file saved only in one bot's private workspace is not considered handed off or reviewable by another bot.

## Standard workflow
1. The producing bot completes its assigned task and gathers the deliverables.
2. The bot creates a task-specific branch from the agreed base branch. Never work directly on the production/default branch.
3. The bot commits reports, reproducible calculations/scripts, evidence images, and a manifest to that branch.
4. The bot posts a handoff comment on the relevant GitHub issue containing:
   - branch name;
   - full commit SHA;
   - exact repository paths;
   - manifest path and SHA-256;
   - a concise list of included and missing evidence;
   - scope/approval status and any limitations.
5. The reviewer verifies that the exact commit and files are accessible before beginning review. Reviewers must not rely on a local path from another bot's machine.
6. Reviewers cite exact paths and commit SHA in their findings. If evidence is missing, mark the claim NOT VERIFIABLE; do not reconstruct it from memory.
7. ChatGPT summarizes findings and unresolved decisions for the user.
8. Only the user can authorize production integration. Use a reviewed pull request for proposed code or asset changes; do not merge automatically.

## Branch and change protections
- Use one task-specific branch per handoff, e.g. `research/issue-179-seed-san-evidence`.
- Never push task work directly to `master` or another production branch.
- Do not force-push or rewrite shared history.
- Do not overwrite protected checkpoints or replace existing evidence silently.
- Keep research-only deliverables separate from production assets.
- A documentation/evidence commit is not approval to integrate or use the underlying asset.

## Evidence and manifests
Each handoff should include, where applicable:
- a concise README/report describing purpose, methods, findings, limitations, and approval scope;
- source provenance and pinned revision/commit;
- exact filenames and repository-relative paths;
- file sizes and SHA-256 hashes;
- scripts/calculation notes needed to reproduce reported numbers;
- screenshots/contact sheets at original quality when relevant;
- a manifest that distinguishes included, excluded, and unavailable evidence.

Never claim a file is available to a reviewer until its committed path has been checked from the repository.

## Asset, privacy, and licensing controls
- Do not commit secrets, credentials, personal data, or private account information.
- Do not commit third-party binaries, models, textures, or datasets unless the user has explicitly authorized that specific transfer and the applicable licence permits it.
- Public visibility or a licence label alone does not grant permission for every intended use, including AI training, redistribution, modification, or commercial use.
- Large binaries should use an explicitly approved storage method (for example, Git LFS only after checking repository limits and licensing). Do not silently add large assets to ordinary Git history.
- If approval is unclear or a task exceeded its authorized scope, quarantine the material and disclose the deviation. Do not treat a later report or handoff as retroactive approval.

## Roles
- Producing bot: prepares and commits its own task evidence.
- Handoff coordinator (BlendBro or designated coordinator): checks package completeness and confirms reviewer access.
- Independent reviewer (Claude): verifies the exact committed evidence and challenges unsupported claims.
- ChatGPT: coordinates instructions, compares reviews, and reports decisions needed.
- User: final approver for scope expansion, asset use, and production integration.

## Required handoff comment template
```
Handoff: <task / issue>
Branch: <branch>
Commit: <full SHA>
Evidence manifest: <path>
Manifest SHA-256: <hash>
Included: <paths>
Missing/unavailable: <items or none>
Scope/approval: <authorized scope and any deviations>
Reviewer access: <verified / not verified, with evidence>
```

## Pilot
Use the Reference Library work under GitHub Issue #179 as the pilot. The Seed-san full-file study exceeded the earlier metadata-only approval; its existing evidence must not be redistributed or committed unless the user explicitly authorizes that specific handoff and applicable permissions are confirmed. Until then, use only already-authorized, non-sensitive summaries and metadata, and clearly label any unavailable evidence.
