/**
 * Shared between the client form component and the server actions that verify
 * it, so the two can't drift.
 *
 * Its own module because `admin-session.ts` imports `node:crypto`: a client
 * component importing one constant from there pulls the whole module into the
 * browser bundle, which webpack rejects outright.
 */
export const CSRF_INPUT_NAME = 'csrf';
