# Desktop code style

Use the same readability principles as the backend's `docs/code-style.md`.
Write code that TNT can follow from top to bottom, with short explanations of
the decisions that are not obvious from the code itself.

## Comments and spacing

- Put a simple one-line comment before nontrivial functions, effects and logical
  blocks. Explain what the operation does or why a safeguard exists.
- Start most separate steps with a comment. Skip obvious assignments, small
  getters, straightforward markup and wrappers whose names already explain them.
- Leave a blank line between functions and separate steps inside a function.
  Keep related statements together; do not space out every line.
- Describe account ownership, request ordering, cache invalidation, cleanup,
  retries, score rules and compatibility quirks where the code handles them.
- Preserve useful existing explanations. Replace misleading comments instead of
  stacking another comment that repeats or contradicts them.
- Describe actual behavior: a selected save is not proof of the active player,
  opening PayPal is not a completed payment, and a verified score submission is
  separate from importing save-file history.
- Keep comments near the logic they explain. Group simple preload or IPC wrappers
  by purpose rather than adding the same explanation above every wrapper.
- Keep product copy out of implementation comments and implementation details out
  of the visible UI unless they help the user make a decision.

## Formatting and behavior

- Use four spaces, semicolons and descriptive names. Keep the surrounding quote
  style and aim for lines that can be read without horizontal scrolling.
- Use explicit braces for new control flow and name complex conditions when that
  makes the rule clearer. Do not rewrite logic during a comments-only pass.
- Preserve API field names, null handling, score comparisons, timing, request order
  and React effect dependencies. Do not move hooks while adding explanations.
- Leave generated output, dependencies and the RockSniffer submodule unchanged.
- Review the diff and run `npm test` and `npm run build:renderer`. For a comments-only
  pass, compare parsed source before and after to confirm the logic is unchanged.
  Native reader and installed-gameplay checks still require Windows.
- Do not build or publish an installer just to deliver a commenting update.
