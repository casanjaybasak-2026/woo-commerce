import { renderMarkdown } from "../src/lib/markdown";

test("renders markdown and strips raw HTML and javascript: links", () => {
  const html = renderMarkdown("# Hi\n\n<script>alert(1)</script>\n\n[x](javascript:alert(1)) [ok](https://a.test)\n\n<img src=x onerror=alert(1)>");
  expect(html).toContain("<h1");
  expect(html).not.toContain("<script");
  expect(html).not.toContain("onerror");
  expect(html).not.toContain("javascript:");
  expect(html).toContain('href="https://a.test"');
});
