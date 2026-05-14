# Follow-ups

Items discovered during work but deferred to keep current scope focused.
Add new items at the top. Strike through items as they're shipped.

## Open

### TDS save-confirmation indicator on KPI target editing
Discovered: 2026-05-14

User feedback from Xime via Loom 2026-05-14. When creating or editing KPI targets on a user's profile, there's no visible feedback that the save succeeded. The data does persist correctly, but the user has to navigate away and back to verify, creating uncertainty about whether actions registered. Two sub-issues:

1. No "Saving..." or "Saved" indicator during/after the target save action — user is uncertain whether their click registered
2. After switching between targets and returning to one, the form sometimes appears empty until clicked again — the saved values exist but don't auto-populate

Direct quote from Xime: "that's where I would prefer if it showed me like saving or if it just said saved."

Fix shape: add a brief save state indicator (likely "Saving..." → "Saved" pattern, fading after ~2 seconds), and ensure target form re-populates from state when switching between targets rather than requiring a click. Estimated 30-45 min.

Status: open, low-priority Phase 2 polish — UX improvement, not a functional bug.

### TDS Firestore rules not in source control
Discovered: 2026-05-14

During the chat history persistence diagnosis (2026-05-14), confirmed that TDS's Firestore rules are managed only in the Firebase console — no `firestore.rules` file exists in the repo. This creates several gaps:

- No git history of rules changes
- No code-review pass on rules edits
- No staging-vs-production parity guarantee once a staging environment exists
- No rollback target if the console gets accidentally edited
- Diagnostic work in this repo can't read the live rules directly

Fix shape (when prioritized): extract current rules from Firebase console into `firestore.rules` at repo root; set up `firestore.indexes.json` similarly if not already present; ensure `.firebaserc` correctly identifies the TDS project; deploy rules going forward via `firebase deploy --only firestore:rules`. Matches BLT Planner's established pattern.

Pursue before TDS staging environment is set up so rules-management discipline is in place from the start. Estimated 1-2 hours.

Status: open, technical debt.

## Done

(strike through items here as they're shipped)
