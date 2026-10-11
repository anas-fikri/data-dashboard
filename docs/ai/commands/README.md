# Project commands

Each markdown file here becomes a slash command in every AI tool your team uses
(Claude Code, Codex, OpenCode, Gemini CLI, Qwen Code, Cursor, Copilot, Windsurf) after
`aitk adapters sync`, and an MCP prompt. `aitk prompt` lists them.

Example: docs/ai/commands/deploy-check.md becomes /deploy-check

    ---
    description: Verify a staging deploy before promoting it
    argument-hint: "<version>"
    ---
    Check the staging deploy of $ARGUMENTS:
    1. Run `aitk check` and the smoke tests in scripts/smoke.sh.
    2. Compare the error rate with the previous version.
    3. Report go / no-go with the evidence.

$ARGUMENTS is the text typed after the command. A file named like a built-in command
(aitk-review, aitk-plan, …) replaces it for this project.
