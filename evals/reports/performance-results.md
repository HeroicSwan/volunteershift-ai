# Performance results

All profiles invoke the production scheduler in an isolated process with a hard timeout.

| Profile | Workers | Shifts | Runtime | Heap delta | Assignments | Timeout | Error |
| --- | ---: | ---: | ---: | ---: | ---: | --- | --- |
| small | 10 | 20 | 322.54 ms | -5.26 MB | 36 | no |  |
| medium | 50 | 100 | 276.1 ms | -5.87 MB | 199 | no |  |
| large | 100 | 300 | 928.37 ms | 4.9 MB | 597 | no |  |
| very-large | 250 | 1000 | 8821.44 ms | 0.15 MB | 1750 | no |  |
| stress | 500 | 2000 | 37263.55 ms | 7.44 MB | 3500 | no |  |

