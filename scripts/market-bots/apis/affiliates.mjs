// Official partner APIs (free programmes, applied for on 25 Oct 2026): Booking.com Demand API and Agoda affiliate API.
// They switch on when their secrets exist (BOOKING_AFFILIATE_ID + BOOKING_API_TOKEN, AGODA_SITE_ID + AGODA_API_KEY).
// Until approval the runner reports them as "awaiting approval" in Signal health; the page bots and Google Hotels cover these OTAs meanwhile.
export function affiliates(env) {
  return {
    booking: env.BOOKING_AFFILIATE_ID && env.BOOKING_API_TOKEN ? 'configured' : 'awaiting approval',
    agoda: env.AGODA_SITE_ID && env.AGODA_API_KEY ? 'configured' : 'awaiting approval',
  };
}
