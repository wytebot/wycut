# WyCut AI Operations — staff-only configuration repository template

Use this folder as the contents of a **separate GitHub repository** such as `wycut-ai-ops`. This repository should contain only `ai-operations.json` and documentation—not WyCut app source, deployment secrets, billing code, or environment files.

## Safe access model

1. Create a new **private** GitHub repository named `wycut-ai-ops` and copy `ai-operations.json` into its root.
2. Invite the AI-operations staff member to **this repository only**. Give them permission to propose changes; keep branch merge rights with the owner if you want final approval. Do not invite them to the main WyCut app repository, Vercel project, Firebase project, Flutterwave dashboard, or app deployment secrets.
3. Create a GitHub fine-grained personal access token restricted to this repository with **Contents: Read-only** and no other permissions. Store it as `AI_OPERATIONS_CONFIG_TOKEN` in the WyCut backend deployment. Never share this token with the staff member.
4. Set `AI_OPERATIONS_CONFIG_URL` to `https://api.github.com/repos/YOUR_ORG/wycut-ai-ops/contents/ai-operations.json`. Leave `GEMINI_MODEL`, `OPENAI_SCRIPT_MODEL`, `OPENAI_TTS_MODEL`, and `DEEPGRAM_TTS_MODEL` blank if you want the operations JSON to control those choices.
5. WyCut validates the config, caches it for five minutes per server instance, and falls back to bundled defaults if the URL is unavailable or malformed. A config change does not grant staff access to app source or secrets. The token is read-only and is used only by the backend.

## What staff can change

- Script provider priority (`gemini`, `openai`)
- Script model identifiers and temperature
- Safe system instruction and writing-guidance text
- TTS model identifiers and bounded concurrency (1–4)

## What staff cannot change through this repository

- React/UI, API routes, billing or payment verification code
- Google/Firebase credentials, Flutterwave secrets, provider API keys
- Credit balances, security policy, deployment configuration

This is a configuration boundary, not a folder permission inside the app repository. GitHub permissions are repository-level; they do not securely limit a collaborator to one directory in the same repository. Do not place secrets in this repo.
