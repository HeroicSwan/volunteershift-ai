# Adversarial scheduling baseline report

Generated: 2026-07-14T16:45:29.437Z
Production entry point: `src/lib/scheduler.ts#generateOptimizedSchedule`

## Summary

- Overall: FAIL
- Hand-authored scenarios: 107/115
- Seeded property cases: 876/1000
- Hostile schema checks: 23/23
- Mutation score: 100%
- Performance timeouts: 4
- Repeatable and idempotent: yes

## Hand-authored scenario failures

### c-duplicate-shift-identifiers

- 1 unexpected hard issues exceed 0
- `DUPLICATE_SHIFT_ID`: Shift IDs must be unique.
- `ASSIGNMENT_OUTSIDE_SHIFT`: Assignment extends outside the shift opening and closing times.

### d-overlapping-availability-order-1

- status=partial; expected success
- unfilled=[d-overlap-shift-1]; expected []
- 1 unexpected hard issues exceed 0
- `MINIMUM_COVERAGE_NOT_MET`: D Overlap Shift 1 falls below minimum coverage during at least one period.

### d-overlapping-availability-order-2

- status=partial; expected success
- unfilled=[d-overlap-shift-2]; expected []
- 1 unexpected hard issues exceed 0
- `MINIMUM_COVERAGE_NOT_MET`: D Overlap Shift 2 falls below minimum coverage during at least one period.

### d-overlapping-availability-order-3

- status=partial; expected success
- unfilled=[d-overlap-shift-3]; expected []
- 1 unexpected hard issues exceed 0
- `MINIMUM_COVERAGE_NOT_MET`: D Overlap Shift 3 falls below minimum coverage during at least one period.

### i-existing-assignment-over-hours-1

- overtimeUsageHours=2 exceeds 0
- `MAX_WEEKLY_HOURS_EXCEEDED`: I Hours Worker 1 exceeds the configured weekly hour limit.

### i-existing-assignment-over-hours-2

- overtimeUsageHours=2 exceeds 0
- `MAX_WEEKLY_HOURS_EXCEEDED`: I Hours Worker 2 exceeds the configured weekly hour limit.

### j-duplicate-shift-id-1

- 1 unexpected hard issues exceed 0
- `DUPLICATE_SHIFT_ID`: Shift IDs must be unique.
- `ASSIGNMENT_OUTSIDE_SHIFT`: Assignment extends outside the shift opening and closing times.

### j-duplicate-shift-id-2

- 1 unexpected hard issues exceed 0
- `DUPLICATE_SHIFT_ID`: Shift IDs must be unique.
- `ASSIGNMENT_OUTSIDE_SHIFT`: Assignment extends outside the shift opening and closing times.

## Performance

| Size | Workers | Shifts | Runtime | Heap delta | Assignments | Timeout | Unsafe issues |
| --- | ---: | ---: | ---: | ---: | ---: | --- | ---: |
| small | 10 | 20 | 558.59 ms | -0.96 MB | 36 | no | 0 |
| medium | 50 | 100 | 10000 ms | 0 MB | 0 | yes | 0 |
| large | 100 | 300 | 20000 ms | 0 MB | 0 | yes | 0 |
| very-large | 250 | 1000 | 30000 ms | 0 MB | 0 | yes | 0 |
| stress | 500 | 2000 | 45000 ms | 0 MB | 0 | yes | 0 |
