# Scheduling rule audit

This audit describes the production model and `src/lib/scheduler.ts` as they existed at the adversarial baseline. It distinguishes enforced rules from interface-only behavior and missing product decisions. The evaluation harness must not treat a missing product decision as an implemented hard constraint.

## Production boundaries

- Entry point: `src/lib/scheduler.ts#generateOptimizedSchedule`.
- Domain types: `src/types/index.ts` (`Worker`, `Shift`, and `ScheduleAssignment`).
- Browser persistence: `src/lib/storage.ts`, using one localStorage document. There is no database, transaction layer, server-side schedule persistence, or multi-user concurrency model.
- UI orchestration: `src/components/data-provider.tsx` loads the local document, calls the production scheduler, and saves the returned assignments.
- Forms and CSV imports validate user-entered values before persistence. The scheduler itself receives TypeScript objects and has no runtime input schema at the baseline.

## Existing enforced hard rules

| Rule | Production behavior |
| --- | --- |
| Availability | An assignment must fit wholly inside one availability block for the shift's local calendar weekday. |
| Weekly assignment limit | `maxShiftsPerWeek` is checked per Monday–Sunday week. |
| Weekly hour limit | Actual assignment duration is accumulated per Monday–Sunday week. |
| Paid overtime | Paid employees and supervisors are capped at the smaller of configured maximum hours and 40 hours. |
| Volunteer hours | Volunteers use their configured weekly maximum and may work no assignment longer than six hours. |
| Paid assignment length | Paid employees and supervisors may work no assignment longer than eight hours. |
| Required role/certification | `Shift.requiredRole` must be an exact, case-sensitive member of `Worker.roles`. Roles are the only certification representation. |
| Overlaps | A worker cannot hold assignments whose times overlap on the same date. Touching endpoints are allowed. |
| Minimum coverage | Continuous shifts are checked in 30-minute scheduling slots. Daily rosters use required headcount plus configured worker-hours. |
| Maximum coverage | Continuous shifts cannot exceed `requiredWorkers`; daily rosters cannot exceed `maxDailyWorkers` or the required headcount. |
| Supervisors | Required supervisor positions can only be filled by `workerType: "supervisor"`; volunteers with a manager-like role do not count. |
| Paid staffing | `minPaidStaff` is filled before remaining coverage. `maxPaidStaff` is treated as a cap unless exceeding it is the only safe way to protect minimum coverage, in which case a warning is attached. |
| Priorities | Urgent/high and scarce shifts are considered before easier work. Final plans are compared by coverage, weighted priority coverage, risk, cost, and spread. |
| Fairness | Desired-hours utilization, same-day hours, adjacent days, and current assignments affect candidate ordering. These are soft preferences. |
| Worker preferences | Preferred days and roles increase match scores but never override hard eligibility. |
| Paid-versus-volunteer behavior | Routine work favors volunteers/cost efficiency; urgent or hard-to-fill work favors paid reliability. Volunteers never count as supervisors. |
| Impossible schedules | The engine returns the best valid partial result and reports uncovered/partial shifts. It is not allowed to fabricate role, availability, overlap, or overtime compliance. |

## Existing behavior that is not a hard rule

- `desiredHoursPerWeek` is a target used for scoring and fairness. It is not a minimum-hours guarantee.
- Consecutive days receive a score penalty. There is no maximum consecutive-day rule.
- Full-time and part-time labels affect preferred block length and scoring. They do not create statutory employment rules beyond the configured limits and the global 40-hour paid cap.
- Reliability scores affect ranking and warnings. They do not make a worker ineligible.
- Shift notes and worker notes are display-only.
- Locations are displayed and exported but do not constrain assignments or travel.
- Seeded `ScheduleInput.assignments` are accepted as existing assignments. The model has no `locked` flag, so the product does not define whether repair/rebalance may move them.
- Cancellation is represented only by removing a worker before scheduling in the evaluation harness. There is no production repair transaction or cancellation event model.

## Interface requirements not independently enforced by the scheduler

- Form validation requires nonempty names, emails, roles, locations, dates, and positive staffing counts. Direct or corrupted stored input can bypass those forms.
- CSV parsing validates column values before import. The scheduler does not call the CSV schemas.
- localStorage normalization migrates older shapes but does not perform full Zod validation or reject duplicate IDs.
- The UI says daily operations use staggered blocks. The baseline daily-roster implementation constructs those blocks directly and therefore needs independent boundary validation.

## Missing product decisions

The current types cannot express these rules. Adversarial reports list them as product limitations, not silently assumed constraints:

- separate certifications, expiry, revocation, multiple required certifications, or location-scoped credentials;
- minimum rest between shifts, opening-to-closing rest, meal/rest breaks, or split-shift premiums;
- time zones, daylight-saving transitions, or overnight shifts spanning two dates;
- travel time, distance, or incompatible simultaneous locations beyond ordinary time overlap;
- seniority, union rules, pay periods other than Monday–Sunday, or approved overtime;
- requested time off distinct from ordinary availability;
- opening/closing responsibility flags;
- explicit locked/manual assignments and override authority;
- minimum weekly hours as a hard guarantee;
- database transactions, concurrent administrators, network retries, or server-side idempotency.

## Ambiguities requiring a product decision

1. Whether `maxPaidStaff` is an absolute hard cap or may be exceeded to avoid an uncovered shift. Production currently allows a warned override.
2. Whether daily-roster supervisor requirements mean total managers assigned that day or managers continuously present throughout operating hours.
3. Whether an existing assignment is immutable, preferred, or freely repairable.
4. Whether role names should be case-sensitive and whether aliases are allowed.
5. Whether sub-30-minute work is supported; production scheduling uses 30-minute decision slots.
6. Whether daily-roster `requiredWorkers` is a total roster headcount or a simultaneous minimum throughout the entire window.
