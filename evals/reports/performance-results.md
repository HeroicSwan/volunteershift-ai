# Performance results

All profiles invoke the production scheduler in an isolated process with a hard timeout.

| Profile | Workers | Shifts | Runtime | Heap delta | Assignments | Timeout | Error |
| --- | ---: | ---: | ---: | ---: | ---: | --- | --- |
| small | 10 | 20 | 528.01 ms | -5.43 MB | 36 | no |  |
| medium | 50 | 100 | 1435.63 ms | 1.81 MB | 199 | no |  |
| large | 100 | 300 | 18729.94 ms | 5.91 MB | 597 | no |  |
| very-large | 250 | 1000 | 30000 ms | 0 MB | 0 | yes | Exceeded 30000ms timeout. |
| stress | 500 | 2000 | 45000 ms | 0 MB | 0 | yes | Exceeded 45000ms timeout. |
