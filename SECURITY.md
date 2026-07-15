# Security policy

## Reporting a vulnerability

Please report suspected vulnerabilities through a private GitHub security advisory for this repository. Do not include API keys, private organizational data, or exploit details in a public issue.

VolunteerShift AI stores scheduling data in the user's local browser or desktop-app storage. The optional AI summary sends only the schedule context requested by the user to the configured OpenAI-compatible endpoint. The deterministic scheduler itself does not call an AI service.

## Current dependency audit

`npm audit --omit=dev` currently reports two moderate findings for [GHSA-qx2v-qp2m-jg93](https://github.com/advisories/GHSA-qx2v-qp2m-jg93). The dependency path is Next.js 16.2.10 to its pinned PostCSS 8.4.31 package.

As of July 15, 2026, Next.js 16.2.10 is the latest stable release and still pins PostCSS 8.4.31. The audit's automated `--force` remediation proposes Next.js 9.3.3, which is a breaking downgrade and is not an acceptable fix.

The affected PostCSS behavior concerns stringifying attacker-controlled CSS containing an unescaped `</style>` sequence. VolunteerShift AI does not accept or stringify user-provided CSS, which limits current exposure. This is a documented upstream risk, not a claim that the dependency is patched.

The dependency should be upgraded when a stable Next.js release adopts a fixed PostCSS version. After that upgrade, rerun type checking, lint, tests, the production build, the standard evaluation suite, and `npm audit --omit=dev`.
