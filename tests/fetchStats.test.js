import { afterEach, describe, expect, it } from "@jest/globals";
import axios from "axios";
import MockAdapter from "axios-mock-adapter";
import { fetchStats } from "../src/fetchers/stats.js";
import { calculateRank } from "../src/calculateRank.js";

const mock = new MockAdapter(axios);

afterEach(() => {
  mock.reset();
});

const data = {
  data: {
    user: {
      name: "Anurag Hazra",
      login: "anuraghazra",
      repositoriesContributedTo: { totalCount: 61 },
      contributionsCollection: {
        totalCommitContributions: 100,
        restrictedContributionsCount: 0,
      },
      pullRequests: { totalCount: 300 },
      mergedPullRequests: { totalCount: 0 },
      reviews: { totalPullRequestReviewContributions: 0 },
      openIssues: { totalCount: 100 },
      closedIssues: { totalCount: 100 },
      followers: { totalCount: 100 },
      repositoryDiscussions: { totalCount: 0 },
      repositoryDiscussionComments: { totalCount: 0 },
      organizations: { totalCount: 0 },
      gists: { totalCount: 0 },
      forks: { totalCount: 0 },
      repositories: {
        totalCount: 5,
        nodes: [
          { stargazers: { totalCount: 100 } },
          { stargazers: { totalCount: 100 } },
          { stargazers: { totalCount: 100 } },
          { stargazers: { totalCount: 0 } },
          { stargazers: { totalCount: 0 } },
        ],
        pageInfo: {
          hasNextPage: false,
          endCursor: "cursor",
        },
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

describe("fetchStats", () => {
  it("should fetch correct stats", async () => {
    mock.onPost("https://api.github.com/graphql").reply(200, data);
    mock
      .onGet("https://api.github.com/search/commits?q=author:anuraghazra")
      .reply(200, { total_count: 1000 });
    mock
      .onGet("https://dev.to/api/articles?username=anuraghazra")
      .reply(200, Array(40).fill({}));

    let stats = await fetchStats("anuraghazra");

    const rank = calculateRank({
      all_commits: false,
      commits: 1000,
      prs: 300,
      reviews: 0,
      issues: 200,
      repos: 5,
      stars: 300,
      followers: 100,
    });

    expect(stats).toStrictEqual({
      contributedTo: 61,
      name: "Anurag Hazra",
      totalCommits: 1000,
      totalIssues: 200,
      totalPRs: 300,
      totalPRsMerged: 0,
      mergedPRsPercentage: 0,
      totalReviews: 0,
      totalStars: 300,
      totalDiscussionsStarted: 0,
      totalDiscussionsAnswered: 0,
      totalArticles: 40,
      totalOrganizations: 0,
      publicGists: 0,
      forkedRepos: 0,
      rank: {
        ...rank,
        percentile: 22.609324269480524,
      },
    });
  });

  it("should stop fetching when there are repos with zero stars", async () => {
    mock.onPost("https://api.github.com/graphql").reply(200, data);
    mock
      .onGet("https://api.github.com/search/commits?q=author:anuraghazra")
      .reply(200, { total_count: 100 });
    mock
      .onGet("https://dev.to/api/articles?username=anuraghazra")
      .reply(200, Array(40).fill({}));

    let stats = await fetchStats("anuraghazra");

    expect(stats.totalStars).toBe(300);
  });

  it("should throw error when user not found", async () => {
    mock.onPost("https://api.github.com/graphql").reply(200, errorData);
    await expect(fetchStats("anuraghazra")).rejects.toThrow(
      "Could not fetch user",
    );
  });

  it("should throw error when graphql api fails", async () => {
    mock.onPost("https://api.github.com/graphql").reply(500);
    await expect(fetchStats("anuraghazra")).rejects.toThrow(
      "Could not fetch user",
    );
  });

  it("should fetch additional stats when requested", async () => {
    mock.onPost("https://api.github.com/graphql").reply(200, {
      data: {
        user: {
          ...data.data.user,
          mergedPullRequests: { totalCount: 240 },
        },
      },
    });
    mock
      .onGet("https://api.github.com/search/commits?q=author:anuraghazra")
      .reply(200, { total_count: 100 });
    mock
      .onGet("https://dev.to/api/articles?username=anuraghazra")
      .reply(200, Array(40).fill({}));

    let stats = await fetchStats("anuraghazra", true, [], true);

    expect(stats.totalPRsMerged).toBe(240);
    expect(stats.mergedPRsPercentage).toBe(80);
  });
});
