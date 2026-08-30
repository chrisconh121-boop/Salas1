---
name: Generated API clients
description: Keep generated frontend/API types aligned after restoring the monorepo from source control.
---

After restoring this monorepo from source control, regenerate the API client and validation outputs before checking application types.

**Why:** The repository's frontend imports generated hooks and schemas; a stale workspace copy can make a complete app appear broken even when its source and OpenAPI contract agree.

**How to apply:** Run the repository's API code-generation command after import or any OpenAPI change, then run the full workspace typecheck before restarting services.