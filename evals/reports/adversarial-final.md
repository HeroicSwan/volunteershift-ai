# Adversarial scheduling final report

Generated: 2026-07-22T01:54:39.929Z
Production entry point: `src/lib/scheduler.ts#generateOptimizedSchedule`

## Summary

- Overall: PASS
- Hand-authored scenarios: 115/115
- Seeded property cases: 1000/1000
- Hostile schema checks: 23/23
- Mutation score: 100%
- Performance timeouts: 0
- Repeatable and idempotent: yes

## Hand-authored scenario failures

None.

## Performance

| Size | Workers | Shifts | Runtime | Heap delta | Assignments | Timeout | Unsafe issues |
| --- | ---: | ---: | ---: | ---: | ---: | --- | ---: |
| small | 10 | 20 | 322.54 ms | -5.26 MB | 36 | no | 0 |
| medium | 50 | 100 | 276.1 ms | -5.87 MB | 199 | no | 0 |
| large | 100 | 300 | 928.37 ms | 4.9 MB | 597 | no | 0 |
| very-large | 250 | 1000 | 8821.44 ms | 0.15 MB | 1750 | no | 0 |
| stress | 500 | 2000 | 37263.55 ms | 7.44 MB | 3500 | no | 0 |

