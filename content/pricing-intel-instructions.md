# Pricing intelligence job: instructions for Claude (daily light run; deep run on Monday and Thursday)

You collect PUBLIC demand signals for AP Villas & Resorts (5 whole villas within 2 km of Mahakaleshwar, Ujjain) and write a
short 30-day market outlook. Follow content/research-rules.md (FACT / ESTIMATE / HYPOTHESIS / RECOMMENDATION, never invent
numbers, cite every source with its date). You never see AP Villas' bookings, prices or guests: pricing happens privately in
the Founder OS, which combines your signals with its own data.

## Hard rules
- Read public pages only. No logins, no CAPTCHAs, no bot-detection bypass, honour robots.txt, at most 25 page fetches (light run)
  or 50 (deep run). If a site answers 403/429, stop using it and add a row with `"status": "blocked"` for that signal.
- Do NOT fetch Airbnb, Booking.com, MakeMyTrip, Goibibo, Agoda or Google Hotels pages: their terms forbid automated access.
  Competitor prices from those sites are entered by the owner (Rate check). Never fetch IRCTC.
- StayVista Ujjain listings MAY be read (robots.txt allows it) in the deep run: whole-villa prices for the next 90 days only if the
  page shows a dated price without login; otherwise skip.
- Never perform a booking, form submission or availability search on any site.
- No personal data anywhere (no names of private people, phones, emails).
- A value you cannot find is left out. Never estimate a footfall, price or date and present it as found.

## Output 1: research/signals.json
```json
{
  "collected_at": "YYYY-MM-DD",
  "desk_signals": [
    { "signal_id": "school|events|temple|travel|footfall|holiday|search|calendar", "property": "", "for_date": "YYYY-MM-DD or empty for the whole horizon",
      "index": 1.10, "raw_value": "short fact, e.g. 'MP schools: Diwali break 6–12 Nov'", "source_url": "https://…", "fetched_at": "ISO time of your fetch",
      "status": "live|blocked", "notes": "publisher + publication date; FACT/ESTIMATE label" }
  ],
  "rates": [ "deep run only, StayVista dated prices, same schema as content/market-research-instructions.md, with platform: 'StayVista'" ]
}
```
Index scale (1.00 = a normal night). Use these defaults unless the source gives a reason to differ, and say why in notes:
| Signal | What counts | Index |
|---|---|---|
| `school` | Announced school/college vacation windows in MP, Gujarat, Maharashtra, Rajasthan, UP, Delhi (one row per night of the window) | 1.05–1.10 |
| `events` | Ujjain/Indore events that bring visitors: big conferences, Holkar Stadium matches, government events, wedding muhurat dates; Simhastha 2028 works/road closures that hurt access (index < 1) | 0.90–1.20 |
| `temple` | Official temple notices: crowd control, darshan changes, closures (closure or restrictions < 1), special darshan days (> 1) | 0.85–1.20 |
| `travel` | Special trains or extra coaches to Ujjain/Indore, new flights to Indore (horizon-wide or per date) | 1.02–1.08 |
| `footfall` | News-reported devotee counts for a current or upcoming festival vs the same festival last year (only when both numbers are published) | 0.9–1.2 |
| `holiday` | State holidays in the source states not in Google's national calendar | 1.05–1.15 |
| `search` | Only if TRENDS_AVAILABLE is "true": Google Trends growth for "mahakal darshan", "ujjain hotel", "bhasma aarti booking", "ujjain villa" (last 4 weeks vs previous 4), one horizon-wide row; stop at 80 requests per month | 0.9–1.15 |
| `calendar` | Weekly (deep run): check the next 60 days of festival dates (Mahashivratri, Shravan Mondays, Navratri, Diwali, Vaikunth Chaturdashi, Kartik Purnima, Nag Panchami, Mahakal Sawari) against a published panchang or the temple; add a row ONLY where a festival date differs from what an astronomical calendar would give, with the source | as listed in scripts/signals/calendar.mjs |

Light run: next 14 days, news since yesterday. Deep run: next 90 days plus everything above.

## Output 2: research/outlook.html
A self-contained page (inline CSS, no scripts, no external images), title "30-day Market Outlook — <date>":
1. Three-line summary of the coming 30 days (labelled).
2. Top demand dates (table: date, why, signal, source).
3. Risks (closures, weather, road works, competing events).
4. Suggested actions for an owner of 5 family villas (e.g. "2-night minimum on 23 Nov", "open Shravan dates early"), each
   tied to a FACT, labelled RECOMMENDATION. No prices: the Founder OS sets those.
5. Sources with publication and retrieval dates.

Run `node scripts/market-validate.mjs research/signals.json` and fix every error before finishing.
