# Scheduling engine evaluations

The `/evals` harness exercises the real deterministic scheduler exported by `src/lib/scheduler.ts`. It does not contain a second scheduler or a simplified test implementation. Every scenario calls `generateOptimizedSchedule()` with production `Worker`, `Shift`, and `ScheduleAssignment` shapes.

## What the harness tests

The standard suite covers 29 realistic contract scenarios. The adversarial reliability suite adds 115 hand-authored cases across categories A–J, 1,000 deterministic property schedules, 23 hostile-schema checks, 20 validator mutations, five isolated scale profiles, and 50-run repeatability/idempotence checks. Together they cover normal scheduling, availability, dense overlaps, weekly limits, volunteer limits, employee overtime, supervisor coverage, scarce roles and certifications, capacity shortages, overstaffing caps, conflicting preferences, cancellations, existing assignments, invalid input, fairness, paid/volunteer interactions, and opening/closing boundaries.

Independent validators inspect the generated assignments for:

- worker availability and assignment boundaries;
- overlapping, double-booked, and duplicate assignments;
- weekly shift and hour limits;
- six-hour volunteer and eight-hour paid assignment limits;
- paid employee overtime above 40 hours;
- continuous and daily-roster minimum coverage;
- required roles or certifications;
- required supervisors and paid-staff minimums or caps;
- invalid dates and time ranges;
- missing worker or shift references;
- worker-type snapshot mismatches;
- required and forbidden evaluation assignments;
- correct uncovered output for partial and impossible schedules.

Each issue is structured with severity, a stable machine-readable code, a human-readable explanation, worker and shift IDs when relevant, and expected versus actual values.

## Repository integration

- Production engine entry point: `src/lib/scheduler.ts#generateOptimizedSchedule`
- Production domain types: `src/types/index.ts`
- Production browser persistence: `src/lib/storage.ts`
- UI invocation: `src/components/data-provider.tsx`
- Existing scheduler validation: `validateFinalSchedule()` in `src/lib/scheduler.ts`
- Test framework: Vitest
- Package manager: npm (`package-lock.json`)
- TypeScript: strict mode, bundler module resolution, `@/*` mapped to `src/*`

The scheduling algorithm is not mixed with database code; v1 persistence is isolated in localStorage. The client data provider does mix orchestration concerns—reading current UI data, invoking the scheduler, timestamping the run, and saving assignments—but the scheduling decisions themselves remain in `src/lib/scheduler.ts`. Results pages call scheduler reporting helpers to recalculate coverage, fairness, cost, and risk for display.

## Running evaluations

Install dependencies, then run:

```bash
npm run eval
npm run eval:verbose
npm run eval:case -- normal-community-services-week
npm run eval:adversarial
```

The runner also supports category filtering directly:

```bash
npx tsx evals/runner.ts --category availability
```

The standard run prints a terminal summary and writes:

- `evals/reports/latest.json` for machine processing and the development dashboard;
- `evals/reports/latest.md` for a readable, detailed audit trail.

The adversarial run writes:

- `evals/reports/adversarial-final.json` and `.md`;
- `evals/reports/failures.json`, including exact failing property seeds and fixtures;
- `evals/reports/mutation-results.md`;
- `evals/reports/performance-results.md`;
- `evals/reports/flaky-tests.md`;
- `evals/reports/regressions.md`.

Use `npm run eval:adversarial:baseline` only before production scheduler changes when establishing a new repair baseline. The checked-in `evals/RULE_AUDIT.md` records which product rules are enforced, soft, ambiguous, or absent from the current model.

Every case runs in an isolated child process. A per-case timeout catches a hung scheduler without stopping the rest of the suite. The runner fixes `Math.random` to seed `20260914`; the current engine is deterministic without randomness, but the seed protects future randomized tie-breakers.

A required evaluation failure returns a nonzero exit code, making `npm run eval` suitable for CI.

## Development dashboard

In development, open `/admin/evaluations` after running the suite. The page prefers `evals/reports/adversarial-latest.json` and falls back to `latest.json`. It displays pass rate, hard violations, soft-quality metrics, property results, hostile-input results, mutation score, isolated scale profiles, repeatability, scenario status, and expandable evidence.

The page is unavailable outside `NODE_ENV=development`. It does not expose an API endpoint and cannot execute code or start an evaluation run. The displayed scenarios are synthetic evaluation data, never live organizational data.

## Adding a scenario

Add an object to `evals/cases.ts`. Cases are validated at module load by the Zod schema in `evals/schema.ts`.

At minimum, define:

1. identity and category fields;
2. production-shaped workers and shifts;
3. the expected status;
4. required and forbidden assignments;
5. expected unfilled shift IDs and warning fragments;
6. the maximum unexpected hard violations;
7. any soft-quality thresholds that matter to the scenario.

Use stable IDs and fixed ISO dates. Prefer expectations that describe an operational requirement rather than an incidental tie-break. If a scenario intentionally contains invalid input, list its expected hard issue code in `expectedHardViolationCodes`. An explicitly expected unfilled shift automatically permits that shift's `MINIMUM_COVERAGE_NOT_MET` issue, but no other hard failure is waived implicitly.

## Hard constraints and soft preferences

Hard constraints describe unsafe or invalid schedules: unavailable workers, overlap, overtime, missing certifications, missing supervisor coverage, bad references, or insufficient required coverage. Hard violations are counted directly and are never blended into a quality score. Any unexpected hard issue fails its scenario unless the case sets a nonzero `maximumAllowedHardViolations`.

Soft preferences describe schedule quality after safety is satisfied. The harness reports:

- coverage percentage;
- preferred day and role satisfaction;
- fairness using Jain's index over assigned-hours-to-desired-hours utilization;
- overtime hours as a separate zero-is-best metric;
- the spread of weekend, high/urgent, early, and late assignments;
- unfilled shift count;
- scheduler runtime;
- average assignment match score.

Threshold failures are shown separately. They cannot cancel or conceal a hard violation.

## Impossible schedules

An impossible schedule should return the best valid partial result, leave unsafe positions unassigned, identify the affected shift as unfilled, and explain the gap. It must not manufacture coverage with an unavailable, unqualified, overtime, or incorrectly typed worker.

The case's `expectedStatus` should be `impossible` when no shift can be validly staffed, or `partial` when some valid coverage remains. Add every expected gap to `expectedUnfilledShifts`. The validator still checks all assignments that the engine produces.

## Interpreting reports

`PASS` means the status and exact unfilled-shift set matched, required and forbidden assignments were respected, all expected warnings and expected hard issue codes appeared, no unapproved hard violations were found, and all configured soft thresholds passed.

`FAIL` is intentionally strict. Read failure reasons first, then validator evidence. A scenario may show 100% headcount coverage and still fail because that coverage used an unqualified worker, omitted required leadership, or caused overtime. That is a genuine engine failure, not a reporting contradiction.

The report's hard-violation total includes expected invalid-data evidence as well as unexpected production failures. Scenario pass/fail logic distinguishes the two explicitly.

## Known limitations

- The production model represents certifications through `Worker.roles` and `Shift.requiredRole`; there is no separate certification-expiry model.
- Coverage validation uses 30-minute slots, matching the production scheduler's scheduling granularity.
- Fairness is evaluated over all active workers in a case. A future eligibility-aware fairness metric could exclude workers who cannot perform any requested role.
- The harness validates one local scheduling process. It does not test multi-user persistence, database transactions, or live integrations because this app stores v1 data in localStorage.
- Runtime is measured on the local machine and is best used for regression comparison, not as a universal benchmark.
- Mutation testing corrupts real production output and verifies that the independent validator kills each corruption. It does not rewrite scheduler source code automatically.
- Large-suite repair and fairness passes have explicit work budgets. The ordinary nonprofit week remains exhaustive; scale profiles expose when production-sized workloads exceed their configured time limits.
