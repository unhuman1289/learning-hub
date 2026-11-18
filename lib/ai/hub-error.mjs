export class HubError extends Error {
  constructor(status, body) {
    super('Hub API ' + status + (body?.errors ? ' (' + body.errors.map((e) => e.code).join(',') + ')' : ''));
    this.status = status;
    this.body = body;
  }
}
