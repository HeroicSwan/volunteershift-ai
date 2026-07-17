# Mutation results

These output mutations deliberately corrupt a real production-engine result, then verify that the independent validator detects the exact hard-rule violation.

Mutation score: 20/20 (100%)

| Mutant | Expected code | Result |
| --- | --- | --- |
| duplicate-assignment | `DUPLICATE_ASSIGNMENT` | killed |
| missing-worker-reference | `MISSING_WORKER_REFERENCE` | killed |
| missing-shift-reference | `MISSING_SHIFT_REFERENCE` | killed |
| assignment-before-opening | `ASSIGNMENT_OUTSIDE_SHIFT` | killed |
| invalid-assignment-range | `INVALID_ASSIGNMENT_TIME` | killed |
| unavailable-worker | `WORKER_UNAVAILABLE` | killed |
| missing-role | `REQUIRED_ROLE_MISSING` | killed |
| volunteer-shift-over-six-hours | `VOLUNTEER_SHIFT_LIMIT_EXCEEDED` | killed |
| employee-shift-over-eight-hours | `EMPLOYEE_SHIFT_LIMIT_EXCEEDED` | killed |
| weekly-hours-over-limit | `MAX_WEEKLY_HOURS_EXCEEDED` | killed |
| overlapping-assignments | `OVERLAPPING_ASSIGNMENTS` | killed |
| worker-type-snapshot-mismatch | `WORKER_TYPE_REFERENCE_MISMATCH` | killed |
| overstaffed-shift | `SHIFT_OVERSTAFFED` | killed |
| missing-required-supervisor | `REQUIRED_SUPERVISOR_MISSING` | killed |
| minimum-paid-staff | `MINIMUM_PAID_STAFF_NOT_MET` | killed |
| maximum-paid-staff | `MAXIMUM_PAID_STAFF_EXCEEDED` | killed |
| required-assignment-removed | `REQUIRED_ASSIGNMENT_MISSING` | killed |
| forbidden-assignment-added | `FORBIDDEN_ASSIGNMENT_PRESENT` | killed |
| invalid-shift-time | `INVALID_SHIFT_TIME` | killed |
| duplicate-shift-id | `DUPLICATE_SHIFT_ID` | killed |
