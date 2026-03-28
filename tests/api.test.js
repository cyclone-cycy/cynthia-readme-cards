// @ts-check

import { afterEach, describe, expect, it, jest } from "@jest/globals";
import axios from "axios";
import MockAdapter from "axios-mock-adapter";
import api from "../api/index.js";
import { calculateRank } from "../src/calculateRank.js";
import { renderStatsCard } from "../src/cards/stats.js";
import { renderError } from "../src/common/render.js";
import { CACHE_TTL, DURATIONS } from "../src/common/cache.js";

/**
 * @type {import("../src/fetchers/stats").StatsData}
 */
const stats = {
  name: "Anurag Hazra",
  totalStars: 100,
  totalCommits: 200,
  totalIssues: 300,
  totalPRs: 400,
  totalPRsMerged: 320,
  mergedPRsPercentage: 80,
  totalReviews: 50,
  totalDiscussionsStarted: 10,
  totalDiscussionsAnswered: 40,
  contributedTo: 50,
  totalArticles: 40,
  totalOrganizations: 0,
  publicGists: 0,
  forkedRepos: 0,
  rank: { level: "DEV", percentile: 0 },
};

stats.rank = calculateRank({
  all_commits: false,
  commits: stats.totalCommits,
  prs: stats.totalPRs,
  reviews: stats.totalReviews,
  issues: stats.totalIssues,
  repos: 1,
  stars: stats.totalStars,
  followers: 0,
});

const data_stats = {
  data: {
    user: {
      name: stats.name,
      repositoriesContributedTo: { totalCount: stats.contributedTo },
      commits: {
        totalCommitContributions: stats.totalCommits,
      },
      reviews: {
        totalPullRequestReviewContributions: stats.totalReviews,
      },
      mergedPullRequests: { totalCount: stats.totalPRsMerged },
      openIssues: { totalCount: stats.totalIssues },
      closedIssues: { totalCount: 0 },
      followers: { totalCount: 0 },
      repositoryDiscussions: { totalCount: stats.totalDiscussionsStarted },
      repositoryDiscussionComments: {
        totalCount: stats.totalDiscussionsAnswered,
      },
      repositories: {
        totalCount: 1,
        nodes: [
          {
            name: "test-repo",
            isFork: false,
            languages: { edges: [] },
            stargazers: { totalCount: 100 },
          },
        ],
        pageInfo: {
          hasNextPage: false,
          endCursor: "cursor",
        },
      },
      pullRequests: {
        totalCount: stats.totalPRs,
        nodes: [],
      },
    },
  },
};

const errorData = {
  errors: [
    {
      type: "NOT_FOUND",
      path: ["user"],
      locations: [],
      message: "Could not fetch user",
    },
  ],
};

const mock = new MockAdapter(axios);

// @ts-ignore
const faker = (query) => {
  const req = {
    query: {
      username: "anuraghazra",
      ...query,
    },
  };
  const res = {
    setHeader: jest.fn(),
    send: jest.fn(),
    status: jest.fn().mockReturnThis(),
    redirect: jest.fn(),
  };

  return { req, res };
};

describe("Test /api/", () => {
  afterEach(() => {
    mock.reset();
  });

  it("should test the request", async () => {
    const { req, res } = faker({});

    mock.onPost("https://api.github.com/graphql").reply(200, data_stats);
    mock
      .onGet("https://api.github.com/search/commits?q=author:anuraghazra")
      .reply(200, { total_count: stats.totalCommits });
    mock
      .onGet("https://dev.to/api/articles?username=anuraghazra")
      .reply(200, Array(40).fill({}));

    await api(req, res);

    expect(res.setHeader).toHaveBeenCalledWith("Content-Type", "image/svg+xml");
    expect(res.send).toHaveBeenCalledWith(
      renderStatsCard(stats, { ...req.query }),
    );
  });

  it("should render error card when user does not exist", async () => {
    const { req, res } = faker({ username: "not-found" });

    mock.onPost("https://api.github.com/graphql").reply(200, errorData);

    await api(req, res);

    expect(res.setHeader).toHaveBeenCalledWith("Content-Type", "image/svg+xml");
    expect(res.send).toHaveBeenCalledWith(
      renderError({
        message: "Could not fetch user",
        secondaryMessage:
          "Make sure the provided username is not an organization",
      }),
    );
  });

  it("should render error card when upstream API fails", async () => {
    const { req, res } = faker({ username: "anuraghazra" });

    mock.onPost("https://api.github.com/graphql").reply(500);

    await api(req, res);

    expect(res.setHeader).toHaveBeenCalledWith("Content-Type", "image/svg+xml");
    expect(res.send).toHaveBeenCalledWith(
      renderError({
        message: "Could not fetch user",
        secondaryMessage:
          "Make sure the provided username is not an organization",
      }),
    );
  });

  it("should have proper cache headers", async () => {
    mock.onPost("https://api.github.com/graphql").reply(200, data_stats);
    mock
      .onGet("https://api.github.com/search/commits?q=author:anuraghazra")
      .reply(200, { total_count: stats.totalCommits });
    mock
      .onGet("https://dev.to/api/articles?username=anuraghazra")
      .reply(200, Array(40).fill({}));

    const { req, res } = faker({ username: "anuraghazra" });

    await api(req, res);

    expect(res.setHeader.mock.calls).toContainEqual([
      "Content-Type",
      "image/svg+xml",
    ]);
    expect(res.setHeader.mock.calls).toContainEqual([
      "Cache-Control",
      `max-age=${CACHE_TTL.STATS_CARD.DEFAULT}, s-maxage=${CACHE_TTL.STATS_CARD.DEFAULT}, stale-while-revalidate=${DURATIONS.ONE_DAY}`,
    ]);
  });
});
