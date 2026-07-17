# Final verification runs

The complete adversarial suite was executed three times after implementation.

| Run | Hand-authored | Property cases | Hostile inputs | Mutation score | Repeatability | Scale timeouts |
| --- | ---: | ---: | ---: | ---: | --- | ---: |
| 1 | 113/115 | 1,000/1,000 | 23/23 | 100% | stable | 2 |
| 2 | 115/115 | 1,000/1,000 | 23/23 | 100% | stable | 2 |
| 3 | 115/115 | 1,000/1,000 | 23/23 | 100% | stable | 2 |

Run 1 exposed expectation drift in two duplicate-worker invalid-input cases after the engine began rejecting duplicate identifiers safely. The case contracts were corrected to expect the resulting unfilled shift and explicit minimum-coverage evidence. This did not change scheduler behavior or weaken validation.

Runs 2 and 3 were identical at the suite-summary level. The only residual failures were the isolated 250-worker/1,000-shift profile at 30 seconds and the 500-worker/2,000-shift profile at 45 seconds. Both processes were terminated by the harness; neither produced an unsafe schedule.
