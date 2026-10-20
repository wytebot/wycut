/** Thrown on the client when an action needs more credits than the account has. The UI turns it into a "Top up" prompt. */
export class TopUpError extends Error {
  readonly code = 'INSUFFICIENT_CREDITS';
  constructor(message: string, public needed?: number, public balance?: number) { super(message); this.name = 'TopUpError'; }
}
