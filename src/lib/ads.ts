/**
 * Ad configuration, read from environment rather than hardcoded.
 *
 * Everything ad-related is inert until these are set, which is the point: the
 * site has to be approved before it can serve, and shipping a half-wired
 * `<ins>` tag or a loader script for a publisher id that does not exist yet is
 * both useless and a bad look to a reviewer.
 *
 * `NEXT_PUBLIC_*` values are inlined at build time, so setting them requires a
 * redeploy — see docs in README.
 */

/** Publisher id, e.g. `ca-pub-0000000000000000`. Empty until approved. */
export const ADSENSE_CLIENT = process.env.NEXT_PUBLIC_ADSENSE_CLIENT ?? '';

/** The single in-content slot id on the dashboard. */
export const ADSENSE_SLOT_MAIN = process.env.NEXT_PUBLIC_ADSENSE_SLOT_MAIN ?? '';

export const adsEnabled = ADSENSE_CLIENT !== '';
