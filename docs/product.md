# Product focus: Flakiness-first reporting

The primary goal of this system is not generic test reporting. It is flake detection and prioritisation.

Engineers should immediately see:
- Which tests waste the most CI time
- Which tests fail unpredictably
- Which tests need fixing first

This is a reliability system, not a test report viewer.

---

## Primary KPI: Flaky Rate

Main metric:

flaky_rate = flaky_runs / total_runs

Where:
- flaky_run = failed at least once AND passed on retry in the same run

This metric measures:
- nondeterminism
- race conditions
- timing sensitivity
- infra sensitivity
- brittle selectors

A flaky test is worse than a failing test. Failing tests get fixed. Flaky tests rot.

---

## Ranking principle

Default ordering everywhere:
1. Highest flaky_rate
2. Then highest flaky_runs
3. Then highest total_runs

This surfaces the most unstable tests with enough data to be meaningful.

---

## Dashboard mental model

Answer quickly:
- Which tests are wasting our CI time?
- Which tests fail randomly and slow PRs down?
- Which tests should be fixed first?

---

## What the system highlights

For each test:
- Flaky rate
- Total flaky runs
- Total retries
- Mean runtime
- Last flaky occurrence
- Failure trend over last N runs

For each PR:
- New flaky tests introduced
- Existing flaky tests that regressed
- Tests that became stable again

---

## Flake classification

- Stable → flaky_rate < 1%
- Suspicious → flaky_rate 1–5%
- Flaky → flaky_rate 5–20%
- Critical → flaky_rate > 20%

Only Flaky and Critical matter day-to-day.

---

## UX rule

Should feel like CI observability, not a test report.

---

## Why this exists

Playwright HTML reports answer: “What failed on this run?”

This system answers: “What is broken in our test suite?”

---

## Summary

This platform exists to:
- surface nondeterminism
- quantify instability
- prioritise reliability work
- reduce CI noise

Flakiness is the product.

