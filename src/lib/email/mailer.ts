export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface Mailer {
  send(m: MailMessage): Promise<void>;
}

export class ResendMailer implements Mailer {
  constructor(
    private apiKey: string,
    private from: string,
    private fetchFn: typeof fetch = (...a) => fetch(...a),
  ) {}

  async send(m: MailMessage): Promise<void> {
    const res = await this.fetchFn("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: this.from, to: [m.to], subject: m.subject, html: m.html, text: m.text }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Resend error ${res.status}: ${body.slice(0, 300)}`);
    }
  }
}

/** Development mailer: logs instead of sending, so login links are visible in the terminal. */
export class ConsoleMailer implements Mailer {
  async send(m: MailMessage): Promise<void> {
    console.log(`\n[email] to=${m.to} subject="${m.subject}"\n${m.text}\n`);
  }
}
