export type AuthEmail = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

export type ResendBindings = {
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
};

export async function sendAuthEmail(
  bindings: ResendBindings,
  email: AuthEmail,
  fetcher: typeof fetch = fetch,
): Promise<void> {
  const apiKey = bindings.RESEND_API_KEY?.trim();
  const from = bindings.EMAIL_FROM?.trim();
  if (!apiKey || !from) {
    throw new Error("Authentication email delivery is not configured.");
  }

  let response: Response;
  try {
    response = await fetcher("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ...email, from }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new Error("Authentication email provider is unavailable.");
  }

  if (!response.ok) {
    // Do not expose the provider body: it can contain addresses or account data.
    throw new Error(`Authentication email delivery failed (${response.status}).`);
  }
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}
