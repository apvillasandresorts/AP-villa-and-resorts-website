# E-Check-in: connect the form to your Google Sheet (one-time, about 5 minutes, free)

The form at **www.apvillasandresorts.in/checkin.html** sends every check-in to a Google Sheet in your account and saves the ID photos in a private Google Drive folder. You also get an email for each check-in. Until this is set up, the form still works: guests are sent to WhatsApp with their details filled in, and they attach their IDs in the chat.

## Steps (on a laptop, signed in to apvillasandresorts@gmail.com)
1. Open https://sheets.new and name the sheet **AP Villas E-Check-in**.
2. Click **Extensions → Apps Script**. Delete everything in the editor.
3. Open `docs/echeckin-apps-script.gs` from this repo (or ask Claude to show it), copy all of it, paste it into the editor, and click **Save** (💾).
4. In the function menu at the top choose **setup**, click **Run**, then **Review permissions → choose your account → Advanced → Go to project (unsafe) → Allow**. (This warning is normal for your own scripts.)
5. Click **Deploy → New deployment →** the gear icon **→ Web app**.
   - Description: `E-check-in`
   - Execute as: **Me**
   - Who has access: **Anyone**
   Click **Deploy** and copy the **Web app URL** (it ends in `/exec`).
6. Send that URL to Claude. Claude puts it in `checkin.html` (`window.ECHECKIN_ENDPOINT = '...'`) and ships the site.

## Using the data
- Each check-in is one row in the **E-Check-in** tab: booking source, villa, dates, guests, address, ID type and last 4 digits, link to the ID folder, payment, purpose of visit, how they found you, consent.
- ID photos: Google Drive → **AP Villas E-Check-in IDs** → one folder per reference number. These are private to your account.
- Analytics ideas: Insert → Pivot table → rows "Booked through", values "Nights" (sum) for occupancy by channel; "Found us via" for marketing; "Purpose" by month.
- Send guests the link with their booking prefilled: `https://www.apvillasandresorts.in/checkin.html?villa=Rudrangan%20Suites&source=Booking.com&id=4523119876`

## Good practice (DPDP Act 2023 and Aadhaar rules)
- The form asks for **masked Aadhaar** (only the last 4 digits visible) or another photo ID, and stores only the last 4 digits as text.
- Keep the Drive folder private; never share the sheet publicly. Delete ID copies you no longer need for the register.
- Foreign nationals: the form collects passport and visa details for **Form C** (submit at https://indianfrro.gov.in within 24 hours of arrival).
- If you update the script later: Deploy → Manage deployments → edit → Version: New version → Deploy (the URL stays the same).
