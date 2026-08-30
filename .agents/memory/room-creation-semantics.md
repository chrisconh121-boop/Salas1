---
name: Room creation semantics
description: Distinguish creating a new room from editing an existing room and enforce ownership limits server-side.
---

The UI must make “new room” an explicit mode; opening the saved room remains an edit flow, while a new-room save must omit the existing room ID. The server remains the authority for per-player room limits.

**Why:** Loading the latest room by default makes a generic save ambiguous and can overwrite the previous room when the player intended to create another.

**How to apply:** Preserve separate create and update messages, reset editor state when entering new-room mode, and validate the owner’s room count before accepting creation.