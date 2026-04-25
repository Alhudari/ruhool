/**
 * Resend API wrapper. No SDK — we only need /emails POST.
 * Docs: https://resend.com/docs/api-reference/emails/send-email
 */
export interface ResendSendInput {
  apiKey: string;
  from: string;
  to: string[];
  subject: string;
  html: string;
  replyTo?: string;
}

export interface ResendSendResult {
  id: string;
}

export async function sendViaResend(input: ResendSendInput): Promise<ResendSendResult> {
  if (!input.apiKey) throw new Error('Resend API key not configured');
  if (!input.from) throw new Error('Resend "from" address not configured');
  if (!input.to || input.to.length === 0) throw new Error('no recipients');

  const body: Record<string, unknown> = {
    from: input.from,
    to: input.to,
    subject: input.subject,
    html: input.html,
  };
  if (input.replyTo) body.reply_to = input.replyTo;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Resend ${res.status}: ${text.slice(0, 300)}`);
  }

  const j = await res.json().catch(() => ({})) as { id?: string };
  return { id: j.id ?? '' };
}
