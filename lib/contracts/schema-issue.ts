/** Strict object errors from Zod echo keys supplied by the model. */
export function schemaIssueMessage(issue: { code: string; message: string }) {
  return issue.code === 'unrecognized_keys' ? 'Đối tượng có trường ngoài hợp đồng.' : issue.message;
}
