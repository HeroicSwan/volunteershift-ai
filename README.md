# VolunteerShift AI

**A nonprofit staffing scheduler for volunteers, paid employees, and supervisors.**
Build a fair, fully-covered, cost-aware weekly schedule in a few clicks — with a transparent, deterministic optimizer you can actually explain to your board.

![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=nextdotjs&logoColor=white)
![React](https://img.shields.io/badge/React-19-149ECA?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss&logoColor=white)
![Tests](https://img.shields.io/badge/tests-Vitest-6E9F18?logo=vitest&logoColor=white)
![License: MIT](https://img.shields.io/badge/License-MIT-A31F34)
![Status](https://img.shields.io/badge/status-work_in_progress-E3A008)

> 🚧 **Work in progress** — this project is under active development and will keep changing.
> It's **free to use, fork, and modify** for any purpose. See [License](#license).

---

## What it does

VolunteerShift AI takes your **team** (who can do what, when they're free, and their weekly limits) and your **shifts** (when, where, which role, how many people, and any staffing rules) and produces a complete weekly schedule that:

- **Covers every shift** it possibly can, prioritizing urgent work first
- **Respects the rules** — role fit, availability, weekly shift/hour limits, no overlaps, required supervisors, and minimum/maximum paid staffing
- **Keeps costs down** — once coverage is safe, it fills routine work with free volunteers and spends paid hours only where a rule or a shortage requires it
- **Explains itself** — every assignment shows a 0–100 match score plus plain-language reasons and warnings. No black-box AI decides who works; the scheduling is 100% deterministic logic.

All data lives in your browser (localStorage) — no account, no server, no database required.

## Pages

| Page | What it does |
|------|--------------|
| **Dashboard** | At-a-glance overview: team size, worker-hours needed, current coverage %, uncovered shifts, and weekly staffing demand. Load the demo workspace or jump straight to generating a schedule. |
| **Workers** | Manage everyone on your team — volunteers, paid employees, and supervisors. Set roles, weekly availability by day/time block, preferred days & roles, reliability score, hourly rate (paid only), and weekly limits. Filter by type or role, and import/export as CSV. |
| **Shifts** | Define each shift: date, time, location, required role, how many workers, priority, whether it **requires a supervisor**, and **min/max paid staff**. Import/export as CSV. |
| **Generate** | One click builds the schedule with the deterministic optimizer and takes you to the results. |
| **Results** | The heart of the app — a monthly **calendar** (supervisors in red, paid staff in blue, volunteers in green, with names and times), plus **coverage %**, **estimated labor cost**, **staffing mix**, **fairness stats**, a **risk panel** flagging any at-risk shifts, and a per-assignment breakdown of match scores and reasons. Export the whole schedule to CSV. |

## How the scheduler works

The optimizer is deterministic and explainable — the same inputs always produce the same schedule, and every decision is traceable.

1. **Hardest shifts first** — urgent/high-priority and scarce, hard-to-fill shifts are staffed before easy ones.
2. **Rules before headcount** — each shift assigns its required supervisor and minimum paid staff *before* filling remaining spots.
3. **Scored matching** — every eligible worker gets a 0–100 score from availability, role fit, preferred days/roles, reliability, and current workload.
4. **Coverage first, then cost** — the engine maximizes covered worker-hours, and only *after* coverage is settled does it minimize labor cost (free volunteers for routine work, paid staff kept for urgent/hard-to-fill shifts and rule requirements).
5. **Repair & rebalance** — a repair pass rescues any coverable gaps and a rebalance pass smooths out overloaded people.

## What it measures

- **Coverage** — covered vs. required worker-hours, plus uncovered and partially-covered shifts
- **Estimated labor cost** — paid hours × rate, per shift and for the whole schedule (volunteers are free)
- **Staffing mix** — how many supervisors / paid employees / volunteers, and whether supervisor and paid-minimum rules are met
- **Fairness** — assigned shifts and hours per person, with utilization against each person's limits
- **Risk** — every shift graded low / medium / high / critical, with the reasons why

## CSV import & export

Bring your existing data in and take schedules out:

- **Import** workers or shifts from CSV, with row-by-row validation, a preview before committing, and clear error messages
- **Export** workers, shifts, or the generated schedule to CSV
- Downloadable **sample templates** so the expected format is obvious

## Tech stack

- [Next.js 16](https://nextjs.org/) (App Router) + [React 19](https://react.dev/)
- [TypeScript](https://www.typescriptlang.org/) (strict)
- [Tailwind CSS 4](https://tailwindcss.com/)
- [React Hook Form](https://react-hook-form.com/) + [Zod](https://zod.dev/) for forms & validation
- [Radix UI](https://www.radix-ui.com/) primitives, [lucide-react](https://lucide.dev/) icons
- [Vitest](https://vitest.dev/) for the scheduler, CSV, and AI-summary test suites

## Getting started

**Requirements:** Node.js 20+

```bash
# install dependencies
npm install

# run the dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), click **Load demo nonprofit** to populate a sample team and week, then **Generate schedule**.

```bash
npm run build   # production build
npm run start   # serve the production build
npm test        # run the test suite
npm run lint    # lint
```

## Configuration (optional)

The Results page can include an AI-written summary of the schedule. It's **entirely optional** — without a key, a built-in assistant produces the same summary offline. To enable the AI version, copy `.env.example` to `.env.local` and add your own OpenAI key:

```bash
OPENAI_API_KEY=your-key-here
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-5.4-mini
```

> The scheduling itself never uses AI — assignments are always deterministic. AI only writes an optional plain-English recap.

## Project structure

```
src/
  app/            # routes: dashboard, workers, shifts, generate, results, api
  components/     # UI, forms, dialogs, calendar, CSV import, results sections
  lib/
    scheduler.ts  # the deterministic, cost-aware optimizer (+ tests)
    csv.ts        # CSV parsing, validation, export (+ tests)
    ai.ts         # optional AI summary with offline fallback (+ tests)
    storage.ts    # localStorage persistence & migration
    sample-data.ts# the demo nonprofit workspace
  types/          # shared TypeScript types
```

## Screenshots

<!-- Tip: open this README in GitHub's editor and drag each screenshot into the slots below —
     GitHub uploads and links them automatically, no commit needed. -->

| Dashboard | Workers | Shifts |
| --- | --- | --- |
| _add screenshot_ | _add screenshot_ | _add screenshot_ |

| Generate | Results & calendar |
| --- | --- |
| _add screenshot_ | _add screenshot_ |

## License

Released under the **MIT License** — you're free to use, copy, modify, and distribute this project, including for commercial use. See [`LICENSE`](LICENSE) for the full text.

---

Built with [Claude Code](https://claude.com/claude-code).
