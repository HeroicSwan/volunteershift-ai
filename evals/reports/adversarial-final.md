# Adversarial scheduling final report

Generated: 2026-07-14T17:12:04.716Z
Production entry point: `src/lib/scheduler.ts#generateOptimizedSchedule`

## Summary

- Overall: FAIL
- Hand-authored scenarios: 115/115
- Seeded property cases: 1000/1000
- Hostile schema checks: 23/23
- Mutation score: 100%
- Performance timeouts: 2
- Repeatable and idempotent: yes

## Hand-authored scenario failures

None.

## Performance

| Size | Workers | Shifts | Runtime | Heap delta | Assignments | Timeout | Unsafe issues |
| --- | ---: | ---: | ---: | ---: | ---: | --- | ---: |
| small | 10 | 20 | 528.01 ms | -5.43 MB | 36 | no | 0 |
| medium | 50 | 100 | 1435.63 ms | 1.81 MB | 199 | no | 0 |
| large | 100 | 300 | 18729.94 ms | 5.91 MB | 597 | no | 0 |
| very-large | 250 | 1000 | 30000 ms | 0 MB | 0 | yes | 0 |
| stress | 500 | 2000 | 45000 ms | 0 MB | 0 | yes | 0 |
