---
description: Analyse a booking export (CSV/Excel) — growth, revenue, occupancy, ADR, channels — with Founder OS metric definitions
argument-hint: <path to CSV/.xls/.xlsx> [--from YYYY-MM-DD --to YYYY-MM-DD]
---
Analyse the booking report **$ARGUMENTS** following `content/research-rules.md`.

1. If no file was given, ask for one: the Founder OS export (Reports & exports → Excel workbook), an OTA reservations CSV (Booking.com, Airbnb, MakeMyTrip) or any CSV/Excel with check-in/check-out columns. Never commit the file; if it is inside the repo, keep it under `research/`.
2. Run `node scripts/analyse-bookings.mjs <file> [--from … --to …] [--channel Airbnb] --out research/<today>-bookings-<name>.md`. For a comparison of two periods run it twice with explicit dates.
3. Read the output. Start with its data-quality section; if columns were not recognised or many rows were skipped, say so before any conclusion.
4. Add an interpretation section: every statement labelled [FACT] (straight from the computed tables), [ESTIMATE], [HYPOTHESIS] or [RECOMMENDATION]. Growth = this period vs previous period and, where the file covers it, the same dates last year. Use the revenue bridge to say whether change came from availability, occupancy or ADR.
5. Never print or quote guest names or contact details. Report aggregates only.
6. Give me the 3–5 key points and the report path.
