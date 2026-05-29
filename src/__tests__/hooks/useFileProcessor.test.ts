import { describe, it, expect } from "vitest";
import { cleanText } from "../../hooks/useFileProcessor";

describe("useFileProcessor — cleanText", () => {
  it("trims leading and trailing whitespace", () => {
    expect(cleanText("  hello world  ")).toBe("hello world");
  });

  it("replaces Windows line endings (\\r\\n) with Unix (\\n)", () => {
    expect(cleanText("line1\r\nline2\r\nline3")).toBe("line1\nline2\nline3");
  });

  it("collapses multiple spaces/tabs into single space", () => {
    expect(cleanText("hello    world\t\ttest")).toBe("hello world test");
  });

  it("collapses multiple blank lines into single newlines", () => {
    expect(cleanText("paragraph1\n\n\n\nparagraph2")).toBe("paragraph1\n\nparagraph2");
  });

  it("handles complex mixed input", () => {
    const input = "  Hello\r\n\r\n\r\nWorld  \t Test  \r\n  ";
    const result = cleanText(input);
    expect(result).toBe("Hello\n\nWorld Test");
  });

  it("returns empty string for whitespace-only input", () => {
    expect(cleanText("   \n\t  \r\n  ")).toBe("");
  });

  it("returns empty string for empty input", () => {
    expect(cleanText("")).toBe("");
  });
});