// @ts-check

/**
 * The part every repository check script shares.
 *
 * Extracted on the trigger `docs/DECISIONS.md` → "Перевірка шляхів у конфігах
 * тулінгу" set in advance: **the third check script**, not the next small edit.
 * `generate-toc.mjs` is that third one, and hardening it would have produced a
 * third verbatim copy of `formatCause` plus a third copy of the libuv comment.
 *
 * Deliberately small. The `report` function in each caller stays where it is —
 * the three differ in message, signature and success line, and folding them
 * together would trade real duplication for a parameter bag nobody can read.
 * What lives here is only what was byte-identical.
 */

/**
 * Renders a thrown value as a one-line cause. `catch` binds `unknown`, and a
 * non-Error throw would otherwise print as `undefined` and destroy the only
 * diagnostic the operator had.
 *
 * @param {unknown} cause - whatever was thrown
 * @returns {string} a printable description
 */
export function formatCause(cause) {
  return cause instanceof Error ? cause.message : String(cause);
}

/**
 * Marks the run failed without tearing the process down.
 *
 * `exitCode`, not `exit(1)`: exiting outright kills the process while stderr is
 * still draining, which aborts with a libuv assertion on Windows — where this
 * repository is developed, so it is the default platform, not an edge case.
 *
 * @returns {void}
 */
export function markFailed() {
  process.exitCode = 1;
}
