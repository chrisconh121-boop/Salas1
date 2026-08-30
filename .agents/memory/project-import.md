---
name: Project import handoff
description: How to preserve source files when moving from a temporary conversation into a persistent project.
---

When a conversation is moved into a project, preserved files may live under `.local/conversation-workspace/files` while the new project root contains only bootstrap files. Restore the product source while leaving platform-managed directories and project metadata intact.

**Why:** Assuming the new root already contains the preserved source can leave the user with a blank scaffold instead of the imported app.

**How to apply:** On the first turn after a handoff, inspect the preservation directory and restore the app packages and shared libraries before starting workflows.