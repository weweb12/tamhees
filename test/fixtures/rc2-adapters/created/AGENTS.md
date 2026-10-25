<!-- TAMHEES:START -->
<!-- TAMHEES:ORIGIN=CREATED -->
# Tamhees task lifecycle

Before task work, run `tamhees adapter begin --agent codex --task "<task>"`.
After task work, submit controlled proposals with `tamhees adapter finalize --agent codex --input <finalization.json>`.
Generated context is ephemeral. Never persist secrets, elevate inferred authority, or bypass owner-confirmation boundaries.
<!-- TAMHEES:END -->
