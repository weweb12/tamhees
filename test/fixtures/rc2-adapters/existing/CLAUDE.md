# My project notes

Keep this line.
<!-- TAMHEES:START -->
<!-- TAMHEES:ORIGIN=EXISTING -->
# Tamhees task lifecycle

Before task work, run `tamhees adapter begin --agent claude --task "<task>"`.
After task work, submit controlled proposals with `tamhees adapter finalize --agent claude --input <finalization.json>`.
Generated context is ephemeral. Never persist secrets, elevate inferred authority, or bypass owner-confirmation boundaries.
<!-- TAMHEES:END -->
