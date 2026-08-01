/**
 * @module GitHubStats
 * @description API endpoint for fetching comprehensive GitHub statistics.
 *
 * LOGIC: Fetches lifetime commits, PRs, and issues. Implements weighted
 * language detection to accurately identify primary technical expertise
 * by accounting for project consistency and organization work.
 */

import { renderStatsCard } from "../src/cards/stats.js";
import { logger } from "../src/common/log.js";
import { FALLBACK_STATS_SVG } from "../src/common/fallbackStats.js";

/**
 * Serves the static fallback stats card so visitors never see a visibly
 * broken/error card. The SVG carries an HTML comment marker (invisible when
 * rendered) and this response also sets X-Stats-Source: fallback, so the
 * degraded state is only detectable by view-source or checking response
 * headers — never by looking at the rendered card.
 *
 * @param {any} res Express response.
 * @param {string} reason Internal reason for logging only.
 * @returns {void}
 */
function serveFallbackStats(res, reason) {
  logger.error(`Serving fallback stats card: ${reason}`);
  res.setHeader("Content-Type", "image/svg+xml");
  res.setHeader("Cache-Control", "public, max-age=300");
  res.setHeader("X-Stats-Source", "fallback");
  res.status(200).send(FALLBACK_STATS_SVG);
}

/**
 * Simple rank calculation function.
 *
 * @param {object} stats User stats data.
 * @returns {object} Calculated rank level and score.
 */
function calculateRank(stats) {
  const { totalCommits, totalRepos, prs, issues } = stats;
  const score =
    totalCommits * 0.8 + totalRepos * 2 + (prs || 0) * 3 + (issues || 0) * 1;

  if (score >= 1000) {
    return { level: "A+", score };
  }
  if (score >= 500) {
    return { level: "A", score };
  }
  if (score >= 200) {
    return { level: "B+", score };
  }
  if (score >= 100) {
    return { level: "B", score };
  }
  if (score >= 50) {
    return { level: "C+", score };
  }
  return { level: "C", score };
}

/**
 * Main API handler for GitHub Statistics.
 *
 * @param {any} req Express request.
 * @param {any} res Express response.
 * @returns {Promise<void>}
 */
export default async function handler(req, res) {
  const username =
    req.query.username || process.env.GITHUB_USERNAME || "CynthiaWahome";
  const devtoUsername = process.env.DEVTO_USERNAME || "cynthizo";

  const showIcons = req.query.show_icons !== "false";
  const theme = req.query.theme || "dark";

  try {
    let githubStats = {};

    if (process.env.GITHUB_STATS_TOKEN) {
      try {
        const query = `
          query($username: String!) {
            user(login: $username) {
              contributionsCollection {
                totalCommitContributions
                totalPullRequestContributions
                totalPullRequestReviewContributions
                restrictedContributionsCount
              }
              repositories {
                totalCount
              }
              organizations {
                totalCount
              }
            }
          }
        `;

        const graphqlResponse = await fetch("https://api.github.com/graphql", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.GITHUB_STATS_TOKEN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ query, variables: { username } }),
        });

        const data = await graphqlResponse.json();

        if (data.errors || !data.data?.user) {
          throw new Error(
            data.errors
              ? `GraphQL error: ${data.errors.map((e) => e.message).join("; ")}`
              : "GraphQL returned no user data (check GITHUB_STATS_TOKEN validity/scopes).",
          );
        }

        const [
          issuesResp,
          reviewsResp,
          mergedPRsResp,
          commitsResp,
          userResp,
          forksResp,
          originalReposResp,
          reposResp,
        ] = await Promise.all([
          fetch(
            `https://api.github.com/search/issues?q=author:${username}+type:issue&per_page=1`,
          ),
          fetch(
            `https://api.github.com/search/issues?q=reviewed-by:${username}+type:pr&per_page=1`,
          ),
          fetch(
            `https://api.github.com/search/issues?q=author:${username}+type:pr+is:merged&per_page=1`,
          ),
          fetch(
            `https://api.github.com/search/commits?q=author:${username}&per_page=1`,
          ),
          fetch(`https://api.github.com/users/${username}`),
          process.env.FORK_ORG_NAME
            ? fetch(
                `https://api.github.com/orgs/${process.env.FORK_ORG_NAME}/repos?per_page=100`,
                {
                  headers: {
                    Authorization: `Bearer ${process.env.GITHUB_STATS_TOKEN}`,
                  },
                },
              )
            : fetch(
                `https://api.github.com/search/repositories?q=user:${username}+fork:true&per_page=1`,
              ),
          fetch(
            `https://api.github.com/search/repositories?q=fork:false+user:${username}&per_page=1`,
          ),
          fetch(`https://api.github.com/users/${username}/repos?per_page=100`),
        ]);

        const [
          issuesData,
          reviewsData,
          mergedPRsData,
          commitsData,
          userData,
          forksData,
          originalReposData,
          reposData,
        ] = await Promise.all([
          issuesResp.json(),
          reviewsResp.json(),
          mergedPRsResp.json(),
          commitsResp.json(),
          userResp.json(),
          forksResp.json(),
          originalReposResp.json(),
          reposResp.json(),
        ]);

        const allRepos = [
          ...(Array.isArray(reposData) ? reposData : []),
          ...(Array.isArray(originalReposData.items)
            ? originalReposData.items
            : []),
        ];
        const langStats = {};

        allRepos.forEach((repo) => {
          if (repo.language) {
            if (!langStats[repo.language]) {
              langStats[repo.language] = { size: 0, count: 0 };
            }
            langStats[repo.language].size += repo.size || 1;
            langStats[repo.language].count += 1;
          }
        });

        const weightedLangs = Object.keys(langStats)
          .map((name) => {
            const score =
              langStats[name].size * Math.pow(langStats[name].count, 1.0);
            return { name, score };
          })
          .filter(
            (l) => !["HTML", "CSS", "Handlebars", "SCSS"].includes(l.name),
          );

        const topLanguage = weightedLangs.sort((a, b) => b.score - a.score)[0];

        if (data.data?.user) {
          const user = data.data.user;
          githubStats = {
            totalContributions:
              user.contributionsCollection.totalCommitContributions +
              user.contributionsCollection.restrictedContributionsCount,
            totalRepos: user.repositories.totalCount,
            pullRequests:
              user.contributionsCollection.totalPullRequestContributions,
            pullRequestsMerged: mergedPRsData.total_count || 0,
            reviews: reviewsData.total_count || 0,
            issues: issuesData.total_count || 0,
            commits: commitsData.total_count || 0,
            followers: userData.followers || 0,
            publicGists: userData.public_gists || 0,
            forks:
              forksData.total_count ||
              (Array.isArray(forksData) ? forksData.length : 0),
            topLanguage: topLanguage ? topLanguage.name : "Python",
            totalOrganizations: user.organizations?.totalCount || 0,
          };
        }
      } catch (error) {
        return serveFallbackStats(res, `GitHub API error: ${error.message}`);
      }
    } else {
      return serveFallbackStats(res, "GITHUB_STATS_TOKEN is not set");
    }

    let articleCount = 0;
    try {
      const devtoResponse = await fetch(
        `https://dev.to/api/articles?username=${devtoUsername}&per_page=100`,
      );
      const articles = await devtoResponse.json();
      articleCount = Array.isArray(articles) ? articles.length : 0;
    } catch (error) {
      logger.error("Error fetching Dev.to articles:", error);
    }

    const stats = {
      name: username,
      totalStars: 0,
      totalCommits: githubStats.totalContributions,
      totalIssues: githubStats.issues,
      totalPRs: githubStats.pullRequests,
      totalPRsMerged: githubStats.pullRequestsMerged,
      mergedPRsPercentage:
        githubStats.pullRequests > 0
          ? Math.round(
              (githubStats.pullRequestsMerged / githubStats.pullRequests) * 100,
            )
          : 0,
      totalReviews: githubStats.reviews,
      totalOrganizations: githubStats.totalOrganizations,
      totalDiscussionsStarted: 0,
      totalDiscussionsAnswered: 0,
      contributedTo: githubStats.totalRepos,
      totalArticles: articleCount,
      publicGists: githubStats.publicGists,
      forkedRepos: githubStats.forks,
      rank: calculateRank({
        totalCommits: githubStats.totalContributions,
        totalRepos: githubStats.totalRepos,
        prs: githubStats.pullRequests,
        issues: githubStats.issues,
      }),
    };

    const hideParams = req.query.hide
      ? req.query.hide.split(",")
      : ["stars", "discussions_started", "discussions_answered", "orgs"];
    const svg = renderStatsCard(stats, {
      show_icons: showIcons,
      theme,
      title_color: req.query.title_color || "53F7AE",
      text_color: req.query.text_color,
      icon_color: req.query.icon_color,
      ring_color: req.query.ring_color,
      bg_color: req.query.bg_color,
      hide_border: req.query.hide_border === "true",
      include_all_commits: true,
      hide: hideParams,
      number_format: "long",
      custom_title:
        req.query.custom_title === undefined
          ? "GitHub Stats"
          : req.query.custom_title,
    });

    res.setHeader("Content-Type", "image/svg+xml");
    res.setHeader("Cache-Control", "public, max-age=1800");
    return res.status(200).send(svg);
  } catch (error) {
    return serveFallbackStats(res, `Unexpected error: ${error.message}`);
  }
}
