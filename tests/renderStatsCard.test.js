import { expect, it, describe } from "@jest/globals";
import { renderStatsCard } from "../src/cards/stats.js";
import { CustomError } from "../src/common/error.js";

const stats = {
  name: "Anurag Hazra",
  totalPRs: 300,
  totalPRsMerged: 240,
  mergedPRsPercentage: 80,
  totalReviews: 50,
  totalCommits: 1000,
  totalIssues: 200,
  totalStars: 300,
  totalDiscussionsStarted: 10,
  totalDiscussionsAnswered: 40,
  contributedTo: 61,
  totalArticles: 40,
  totalOrganizations: 0,
  publicGists: 0,
  forkedRepos: 0,
  rank: { level: "A", percentile: 15.317657602813862 },
};

describe("Test renderStatsCard", () => {
  it("should render correct SVG", () => {
    const svg = renderStatsCard(stats);
    expect(svg).not.toContain("Anurag Hazra's GitHub Stats");
    expect(svg).toContain("Total Commits (last year):");
    expect(svg).toContain("1k");
  });

  it("should throw error if all stats and rank icon are hidden", () => {
    expect(() =>
      renderStatsCard(stats, {
        hide: [
          "stars",
          "commits",
          "prs",
          "issues",
          "reviews",
          "articles",
          "discussions_started",
          "discussions_answered",
          "orgs",
          "gists",
          "forks",
          "contribs",
        ],
        hide_rank: true,
      }),
    ).toThrow(
      new CustomError(
        "Could not render stats card.",
        "Either stats or rank are required.",
      ),
    );
  });
});
