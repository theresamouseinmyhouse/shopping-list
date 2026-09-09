// The recipe keeper is server-rendered (unlike the (app) SPA shell) — it needs real
// HTML for printing and does not use the offline sync engine. Online-only.
export const ssr = true;
export const prerender = false;
