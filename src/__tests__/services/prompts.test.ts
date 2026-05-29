import { describe, it, expect } from "vitest";
import { buildAnalyzePromptVi, buildAnalyzePromptEn } from "../../services/ai/prompts";

const mockJdSection = "<!-- JD: Senior Frontend Developer -->";

describe("prompts — buildAnalyzePromptVi", () => {
  it("returns a non-empty string", () => {
    const result = buildAnalyzePromptVi({ jdSection: mockJdSection });
    expect(result).toBeTruthy();
    expect(typeof result).toBe("string");
  });

  it("contains the JD section text", () => {
    const result = buildAnalyzePromptVi({ jdSection: mockJdSection });
    expect(result).toContain(mockJdSection);
  });

  it("contains Vietnamese instructions", () => {
    const result = buildAnalyzePromptVi({ jdSection: mockJdSection });
    expect(result).toContain("TIẾNG VIỆT");
    expect(result).toContain("chuyên gia tuyển dụng");
  });

  it("contains required JSON structure keys in Vietnamese", () => {
    const result = buildAnalyzePromptVi({ jdSection: mockJdSection });
    expect(result).toContain('"jobTitle"');
    expect(result).toContain('"matchScore"');
    expect(result).toContain('"categoryScores"');
    expect(result).toContain('"fullRewrittenCV"');
    expect(result).toContain('"parsedCV"');
  });

  it("contains Markdown formatting instructions", () => {
    const result = buildAnalyzePromptVi({ jdSection: mockJdSection });
    expect(result).toContain("###");
    expect(result).toContain("GFM");
    expect(result).toContain("gạch đầu dòng");
  });
});

describe("prompts — buildAnalyzePromptEn", () => {
  it("returns a non-empty string", () => {
    const result = buildAnalyzePromptEn({ jdSection: mockJdSection });
    expect(result).toBeTruthy();
    expect(typeof result).toBe("string");
  });

  it("contains the JD section text", () => {
    const result = buildAnalyzePromptEn({ jdSection: mockJdSection });
    expect(result).toContain(mockJdSection);
  });

  it("contains English instructions", () => {
    const result = buildAnalyzePromptEn({ jdSection: mockJdSection });
    expect(result).toContain("ENGLISH");
    expect(result).toContain("ATS (Applicant Tracking System)");
  });

  it("contains required JSON structure keys in English", () => {
    const result = buildAnalyzePromptEn({ jdSection: mockJdSection });
    expect(result).toContain('"jobTitle"');
    expect(result).toContain('"matchScore"');
    expect(result).toContain('"parsedCV"');
    expect(result).toContain('"fullRewrittenCV"');
  });
});