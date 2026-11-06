---
id: T-3xgk
title: 'CI GitHub Actions: lint, typecheck, unit test per PR'
status: in_progress
profile: standard
tags:
  - ci
created: "2026-11-06T09:29:30Z"
updated: "2026-11-06T09:40:07Z"
created_by: claude-code
workers:
  - claude-code
branch: claude/cool-babbage-t5yojt
base: c0fdc24ef61ec27d14d6bc18e09c3577b7d03ac4
evidence:
  check:
    cmd: npm run check
    exit_code: 0
    duration_ms: 163785
    summary: |-
      …t
      > npm audit --audit-level=high --omit=dev && npm audit --audit-level=critical

      found 0 vulnerabilities
      # npm audit report

      minimatch  7.0.0 - 11.0.0
      Severity: moderate
      minimatch has potential denial of service via globparts amplification - https://github.com/advisories/GHSA-g3hv-75wg-m249
      fix available via `npm audit fix --force`
      Will install typescript-eslint@8.36.0, which is a breaking change
      node_modules/@typescript-eslint/typescript-estree/node_modules/minimatch
        @typescript-eslint/typescript-estree  >=6.16.0
        Depends on vulnerable versions of minimatch
        node_modules/@typescript-eslint/typescript-estree
          @typescript-eslint/parser  >=6.16.0
          Depends on vulnerable versions of @typescript-eslint/typescript-estree
          node_modules/@typescript-eslint/parser
            @typescript-eslint/eslint-plugin  >=6.16.0
            Depends on vulnerable versions of @typescript-eslint/parser
            Depends on vulnerable versions of @typescript-eslint/type-utils
            Depends on vulnerable versions of @typescript-eslint/utils
            node_modules/@typescript-eslint/eslint-plugin
            typescript-eslint  *
            Depends on vulnerable versions of @typescript-eslint/eslint-plugin
            Depends on vulnerable versions of @typescript-eslint/parser
            Depends on vulnerable versions of @typescript-eslint/typescript-estree
            Depends on vulnerable versions of @typescript-eslint/utils
            node_modules/typescript-eslint
          @typescript-eslint/type-utils  >=6.16.0
          Depends on vulnerable versions of @typescript-eslint/typescript-estree
          Depends on vulnerable versions of @typescript-eslint/utils
          node_modules/@typescript-eslint/type-utils
          @typescript-eslint/utils  >=6.16.0
          Depends on vulnerable versions of @typescript-eslint/typescript-estree
          node_modules/@typescript-eslint/utils

      7 moderate severity vulnerabilities

      To address issues that do not require attention, run:
        npm audit fix

      To address all issues (including breaking changes), run:
        npm audit fix --force
    at: "2026-11-06T09:40:07Z"
    tree: b258146ac9d4b1877103a5677c097c8c6a046ebf431cec2054978fd40c1cf823
---

## Objective
(describe the outcome in one paragraph)

## Acceptance criteria
- [ ] Given PR ke main, when dibuka/di-push, then workflow menjalankan lint + typecheck + vitest dan gagal bila ada yang merah

## Risk
(Required for strict profile. Impact:, Security (STRIDE):, Rollback:, Validation:)

## Notes
