# Journal emails to guests (BlogMailer)

When a new post goes live on the Journal (www.apvillasandresorts.in/blog.html), every guest who ticked
**"Email me new Ujjain travel guides from the AP Villas Journal"** on the e-check-in form gets it by email,
from apvillasandresorts@gmail.com, within about 15 minutes. Free: it runs inside the same Google Apps Script
as the e-check-in, using the Gmail sending allowance of that account (about 100 emails a day; a longer list
continues automatically the next day, keeping 10 a day free for check-in welcome emails).

Only guests who ticked the box are emailed (the check-in form promises their details are used for the guest
register, so guests who did not opt in are never added). Every email has an unsubscribe link (two steps, so
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
5. Run `setupBlogMailer` once (approve the permissions). Optionally run `testBlogMail` to get a sample in your inbox.

## Everyday
- Nothing to do: publish a post as usual and the email goes out.
- Turn it off: run `stopBlogMailer`. Turn it on again: run `setupBlogMailer` (it never re-sends old posts).
- Remove someone: add a row in the **Email updates** tab with Type `Unsubscribed` and their email.
