import { Marked } from "marked";
import { escapeHtml } from "./html";

const SAFE_URL = /^(https?:|mailto:|\/|#)/i;

const md = new Marked({
  gfm: true,
  breaks: false,
  renderer: {
    html() {
      return ""; // never pass raw HTML through
    },
    link({ href, title, tokens }) {
      const text = this.parser.parseInline(tokens);
      if (!SAFE_URL.test(href)) return text;
      const t = title ? ` title="${escapeHtml(title)}"` : "";
      const ext = /^https?:/i.test(href) ? ' rel="noopener nofollow" target="_blank"' : "";
      return `<a href="${escapeHtml(href)}"${t}${ext}>${text}</a>`;
    },
    image({ href, title, text }) {
      if (!SAFE_URL.test(href)) return "";
      const t = title ? ` title="${escapeHtml(title)}"` : "";
      return `<img src="${escapeHtml(href)}" alt="${escapeHtml(text)}"${t} loading="lazy">`;
    },
  },
});

export function renderMarkdown(src: string): string {
  return md.parse(src ?? "", { async: false }) as string;
}
