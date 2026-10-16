# Journal emails to guests (BlogMailer)

When a new post goes live on the Journal (www.apvillasandresorts.in/blog.html), every guest who gave an email
at e-check-in gets it by email (except anyone who unticked **"Email me new Ujjain travel guides"**),
from apvillasandresorts@gmail.com, within about 15 minutes. Free: it runs inside the same Google Apps Script
as the e-check-in, using the Gmail sending allowance of that account (about 100 emails a day; a longer list
continues automatically the next day, keeping 10 a day free for check-in welcome emails).

Owner's choice (2026-10-16): past guests are included too; the box is ticked by default and the privacy notice says so. Every email has an unsubscribe link (two steps, so
email link-scanners can't unsubscribe anyone by accident).

## Where things are
- Opt-in box: `checkin.html` (step 4), sent as `consent_email`, saved in the **Email updates** column of the E-Check-in sheet.
- Mailer code: `docs/blog-mailer.gs` → a separate file **BlogMailer** in the Apps Script project.
- Main script changes (`docs/echeckin-apps-script.gs`): the `consent_email` column and one line in `doGet` for unsubscribe.
- Log: the **Email updates** tab of the same Google Sheet (new post found, Sent, Failed, Unsubscribed).

## Install / update (once)
1. Open the e-check-in Apps Script project.
2. In the main file: add `['consent_email', 'Email updates'],` as the last entry of `COLUMNS`, and add as the first line of `doGet`:
   `if (e && e.parameter && e.parameter.unsub) return unsubscribe_(e.parameter);`
   (do NOT paste the whole repo file: the live script holds the real caretaker number and Wi-Fi details).
3. Add a new script file **BlogMailer** with the contents of `docs/blog-mailer.gs`.
4. Deploy → Manage deployments → edit the web app → Version: **New version** → Deploy (the URL stays the same).
5. Run `setupBlogMailer` once (approve the permissions). It also adds the Newsletter column (`setupNewsletterColumn` re-does just that). Optionally run `testBlogMail` to get a sample in your inbox.

## Everyday
- Nothing to do: publish a post as usual and the email goes out.
- **Who gets it: the Newsletter column** (last column of the E-Check-in tab). Each guest row shows
  **Subscribed** (green) or **Unsubscribed** (red). Change it from the dropdown on any row of a guest and all
  their rows follow (logged in the Email updates tab as "Owner set"). Guests who unsubscribe by email turn red
  here, and you can switch them back if they ask.
- New check-ins get a status within 15 minutes: Subscribed, unless they unticked the box or unsubscribed before.
- Turn it off: run `stopBlogMailer`. Turn it on again: run `setupBlogMailer` (it never re-sends old posts).
