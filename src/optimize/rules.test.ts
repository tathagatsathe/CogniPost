import { describe, it } from "node:test";
import assert from "node:assert";
import { checkHardRules, scoreSoftRules, appendHashtags } from "./rules.js";
import type { AppConfig } from "../config/types.js";

const baseConfig: AppConfig = {
  topic: {
    mode: "trending",
    manualTopic: "",
    hybridPrefer: "trending",
    sources: ["google"],
    woeid: 23424977,
    xSearch: {
      query: "(AI OR tech)",
      maxResults: 10,
      minLikes: 50,
      langFilter: true,
    },
    filter: {
      includeKeywords: [],
      excludeKeywords: ["politics"],
      maxHashtagsFromTrend: 2,
    },
    fallbackTopics: ["science"],
  },
  schedule: {
    timezone: "America/New_York",
    preferredHourLocal: 9,
  },
  content: {
    drafts: 5,
    style: "fact",
  },
  posting: {
    allowUrls: false,
    dryRun: false,
  },
};

describe("checkHardRules", () => {
  it("rejects tweets over 280 chars", () => {
    const long = "a".repeat(281);
    const result = checkHardRules(long, baseConfig, []);
    assert.equal(result.passed, false);
  });

  it("rejects URLs when allowUrls is false", () => {
    const result = checkHardRules(
      "Check this https://example.com fact",
      baseConfig,
      []
    );
    assert.equal(result.passed, false);
  });

  it("passes valid tweet", () => {
    const text =
      "Honey never spoils. Archaeologists have eaten 3000-year-old honey found in Egyptian tombs.";
    const result = checkHardRules(text, baseConfig, []);
    assert.equal(result.passed, true);
  });
});

describe("appendHashtags", () => {
  it("appends hashtags within limit", () => {
    const result = appendHashtags("Short fact here.", ["#Science", "#Facts"]);
    assert.ok(result.includes("#Science"));
    assert.ok(result.length <= 280);
  });
});

describe("scoreSoftRules", () => {
  it("gives higher score for sweet-spot length", () => {
    const text =
      "Octopuses have three hearts and blue blood. Two hearts pump blood to the gills, while the third pumps it to the rest of the body. This unusual circulatory system helps them thrive in deep ocean environments.";
    const result = scoreSoftRules(text);
    assert.ok(result.score > 0);
  });
});
