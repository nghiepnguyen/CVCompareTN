import { describe, it, expect } from "vitest";
import { normalizeParsedCV, computeYearsOfExperience } from "../../services/ai/parsedCvNormalize";

describe("parsedCvNormalize — normalizeParsedCV", () => {
  it("returns undefined for null input", () => {
    expect(normalizeParsedCV(null)).toBeUndefined();
  });

  it("returns undefined for non-object input (number)", () => {
    expect(normalizeParsedCV(123)).toBeUndefined();
  });

  it("returns undefined for empty object", () => {
    expect(normalizeParsedCV({})).toBeUndefined();
  });

  it("returns undefined for non-object (string)", () => {
    expect(normalizeParsedCV("hello")).toBeUndefined();
  });

  it("returns undefined for array input", () => {
    expect(normalizeParsedCV([])).toBeUndefined();
  });

  it("defaults missing personal_information to empty strings", () => {
    const result = normalizeParsedCV({ work_experience: [] });
    expect(result).toBeDefined();
    expect(result!.personal_information.full_name).toBe("");
    expect(result!.personal_information.contact.email).toBe("");
    expect(result!.personal_information.summary).toBe("");
  });

  it("includes linkedin and website_portfolio only when non-empty", () => {
    const result = normalizeParsedCV({
      personal_information: {
        full_name: "Alice",
        contact: {
          email: "a@b.com",
          linkedin: "  ", // whitespace only → excluded
          website_portfolio: "https://alice.dev",
        },
      },
    });
    expect(result!.personal_information.contact.email).toBe("a@b.com");
    expect(result!.personal_information.contact).not.toHaveProperty("linkedin");
    expect(result!.personal_information.contact.website_portfolio).toBe("https://alice.dev");
  });

  it("normalises education with numeric graduation_year", () => {
    const result = normalizeParsedCV({
      education: [{ degree: "BSc", institution: "MIT", graduation_year: 2020 }],
    });
    expect(result!.education).toHaveLength(1);
    expect(result!.education[0].graduation_year).toBe(2020);
  });

  it("coerces string graduation_year to number", () => {
    const result = normalizeParsedCV({
      education: [{ degree: "BSc", graduation_year: "2018" }],
    });
    expect(result!.education[0].graduation_year).toBe(2018);
  });

  it("defaults invalid graduation_year to 0", () => {
    const result = normalizeParsedCV({
      education: [{ graduation_year: "invalid" }],
    });
    expect(result!.education[0].graduation_year).toBe(0);
  });

  it("filters non-object entries in education array", () => {
    const result = normalizeParsedCV({
      education: ["not an object", { degree: "MSc" }, null],
    });
    expect(result!.education).toHaveLength(1);
    expect(result!.education[0].degree).toBe("MSc");
  });

  it("normalises work_experience with full duration", () => {
    const result = normalizeParsedCV({
      work_experience: [
        {
          company: "Acme",
          job_title: "Engineer",
          duration: { start: "01/2020", end: "12/2022", is_current: false },
          responsibilities: ["Built API"],
          achievements: ["Reduced latency 40%"],
        },
      ],
    });
    expect(result!.work_experience).toHaveLength(1);
    expect(result!.work_experience[0].duration.start).toBe("01/2020");
    expect(result!.work_experience[0].duration.is_current).toBe(false);
  });

  it("filters non-string values in responsibilities and achievements", () => {
    const result = normalizeParsedCV({
      work_experience: [
        {
          responsibilities: ["valid", 42, null, "also valid"],
          achievements: [123, "award"],
        },
      ],
    });
    expect(result!.work_experience[0].responsibilities).toEqual(["valid", "also valid"]);
    expect(result!.work_experience[0].achievements).toEqual(["award"]);
  });

  it("normalises skills with languages array", () => {
    const result = normalizeParsedCV({
      skills: {
        technical_skills: ["TS", "React"],
        soft_skills: ["Communication"],
        tools_software: ["Git"],
        languages: [
          { language: "Vietnamese", proficiency: "Native" },
          { language: "English", proficiency: "Fluent" },
        ],
      },
    });
    expect(result!.skills.technical_skills).toEqual(["TS", "React"]);
    expect(result!.skills.languages).toHaveLength(2);
    expect(result!.skills.languages[0].language).toBe("Vietnamese");
  });

  it("filters non-string items from skill arrays", () => {
    const result = normalizeParsedCV({
      skills: {
        technical_skills: ["JS", 42, null, "CSS"],
      },
    });
    expect(result!.skills.technical_skills).toEqual(["JS", "CSS"]);
  });

  it("normalises projects", () => {
    const result = normalizeParsedCV({
      projects: [
        {
          name: "Project X",
          description: "A great project",
          tech_stack: ["React", "Node"],
          link: "https://github.com/x",
        },
      ],
    });
    expect(result!.projects).toHaveLength(1);
    expect(result!.projects[0].name).toBe("Project X");
    expect(result!.projects[0].tech_stack).toEqual(["React", "Node"]);
  });

  it("omits empty link in projects", () => {
    const result = normalizeParsedCV({
      projects: [{ name: "P", description: "", tech_stack: [], link: "" }],
    });
    expect(result!.projects[0]).not.toHaveProperty("link");
  });

  it("normalises certifications as string array", () => {
    const result = normalizeParsedCV({
      certifications: ["AWS Certified", "Google Cloud"],
    });
    expect(result!.certifications).toEqual(["AWS Certified", "Google Cloud"]);
  });

  it("normalises ats_evaluation with numeric values", () => {
    const result = normalizeParsedCV({
      ats_evaluation: {
        years_of_experience: 5,
        relevant_score: 85,
        key_match_highlights: ["React", "TypeScript"],
        missing_keywords: ["Docker"],
      },
    });
    expect(result!.ats_evaluation.years_of_experience).toBe(5);
    expect(result!.ats_evaluation.relevant_score).toBe(85);
    expect(result!.ats_evaluation.key_match_highlights).toEqual(["React", "TypeScript"]);
    expect(result!.ats_evaluation.missing_keywords).toEqual(["Docker"]);
  });

  it("coerces string years_of_experience and relevant_score to numbers", () => {
    const result = normalizeParsedCV({
      ats_evaluation: {
        years_of_experience: "7.5",
        relevant_score: "92",
      },
    });
    expect(result!.ats_evaluation.years_of_experience).toBe(7.5);
    expect(result!.ats_evaluation.relevant_score).toBe(92);
  });

  it("defaults invalid ats_evaluation numbers to 0", () => {
    const result = normalizeParsedCV({
      ats_evaluation: {
        years_of_experience: "not-a-number",
        relevant_score: null,
      },
    });
    expect(result!.ats_evaluation.years_of_experience).toBe(0);
    expect(result!.ats_evaluation.relevant_score).toBe(0);
  });

  it("overrides the LLM's years_of_experience with a deterministic sum from work_experience dates", () => {
    const result = normalizeParsedCV({
      work_experience: [
        { duration: { start: "01/2020", end: "12/2022", is_current: false } },
      ],
      ats_evaluation: { years_of_experience: 99 },
    });
    expect(result!.ats_evaluation.years_of_experience).toBe(3);
  });

  it("falls back to the LLM's years_of_experience when no work_experience dates are parseable", () => {
    const result = normalizeParsedCV({
      work_experience: [{ duration: { start: "", end: "", is_current: false } }],
      ats_evaluation: { years_of_experience: 5 },
    });
    expect(result!.ats_evaluation.years_of_experience).toBe(5);
  });
});

describe("parsedCvNormalize — computeYearsOfExperience", () => {
  it("returns null when work_experience is empty", () => {
    expect(computeYearsOfExperience([])).toBeNull();
  });

  it("returns null when no entry has a parseable date", () => {
    expect(
      computeYearsOfExperience([
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { duration: { start: "not-a-date", end: "", is_current: false } } as any,
      ])
    ).toBeNull();
  });

  it("sums a single non-overlapping range in MM/YYYY format", () => {
    const years = computeYearsOfExperience([
      {
        company: "Acme",
        job_title: "Engineer",
        duration: { start: "01/2020", end: "12/2022", is_current: false },
        responsibilities: [],
        achievements: [],
      },
    ]);
    expect(years).toBe(3);
  });

  it("merges overlapping/concurrent roles instead of double-counting", () => {
    const years = computeYearsOfExperience([
      {
        company: "A",
        job_title: "Dev",
        duration: { start: "01/2018", end: "01/2020", is_current: false },
        responsibilities: [],
        achievements: [],
      },
      {
        company: "B",
        job_title: "Freelance",
        duration: { start: "06/2019", end: "06/2021", is_current: false },
        responsibilities: [],
        achievements: [],
      },
    ]);
    // Merged range 01/2018-06/2021 = 42 months = 3.5 years, not 2y + 2y = 4y.
    expect(years).toBe(3.5);
  });

  it("sums two fully separate ranges", () => {
    const years = computeYearsOfExperience([
      {
        company: "A",
        job_title: "Dev",
        duration: { start: "01/2015", end: "12/2016", is_current: false },
        responsibilities: [],
        achievements: [],
      },
      {
        company: "B",
        job_title: "Dev",
        duration: { start: "01/2020", end: "12/2021", is_current: false },
        responsibilities: [],
        achievements: [],
      },
    ]);
    expect(years).toBe(4);
  });

  it("treats is_current roles as running through the injected `now` date", () => {
    const years = computeYearsOfExperience(
      [
        {
          company: "Acme",
          job_title: "Engineer",
          duration: { start: "01/2022", end: "", is_current: true },
          responsibilities: [],
          achievements: [],
        },
      ],
      new Date(2024, 0, 1) // Jan 2024
    );
    // Inclusive month counting (01/2022..01/2024 = 25 months) → 2.1 years.
    expect(years).toBe(2.1);
  });

  it("skips entries where end predates start", () => {
    expect(
      computeYearsOfExperience([
        {
          company: "A",
          job_title: "Dev",
          duration: { start: "12/2022", end: "01/2020", is_current: false },
          responsibilities: [],
          achievements: [],
        },
      ])
    ).toBeNull();
  });
});