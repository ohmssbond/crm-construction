import { describe, expect, test } from "vitest";
import { projectUpdateEmailHtml } from "./email";

describe("projectUpdateEmailHtml", () => {
  test("escapes tenant/user text to prevent HTML injection", () => {
    const html = projectUpdateEmailHtml({
      projectName: "A & B <Co>",
      title: '<script>alert(1)</script>',
      body: "1 < 2 & 3 > 0",
      link: "https://x.test/my-projects/1",
    });
    expect(html).toContain("A &amp; B &lt;Co&gt;");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).toContain("1 &lt; 2 &amp; 3 &gt; 0");
    expect(html).toContain('href="https://x.test/my-projects/1"');
  });

  test("truncates a long body to 240 chars + ellipsis", () => {
    const body = "x".repeat(300);
    const html = projectUpdateEmailHtml({ projectName: "P", title: null, body, link: "l" });
    expect(html).toContain("x".repeat(240) + "…");
    expect(html).not.toContain("x".repeat(241));
  });

  test("omits the title block when there is no title", () => {
    const html = projectUpdateEmailHtml({ projectName: "P", title: null, body: "hi", link: "l" });
    expect(html).not.toContain("font-weight:600;font-size:15px");
  });
});
