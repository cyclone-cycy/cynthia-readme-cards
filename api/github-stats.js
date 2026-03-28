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

/**
 * Generates an error card SVG with witty messages.
 *
 * @param {string} title The error category.
 * @param {string} _message The detailed error message.
 * @param {string} theme The theme to use.
 * @returns {string} SVG markup for the error card.
 */
function generateErrorCard(title, _message, theme = "blue-green") {
  const wittyMessages = {
    missing_token: {
      title: "Oops! Token went on vacation 🏖️",
      lines: [
        "Looks like GITHUB_STATS_TOKEN decided to ghost us.",
        "It's probably just hiding behind the couch...",
      ],
    },
    api_error: {
      title: "GitHub is having a moment 🤷‍♀️",
      lines: [
        "The API seems to be playing hard to get today.",
        "Even developers need coffee breaks ☕",
      ],
    },
  };

  const colors = {
    "blue-green": {
      bg: "#0d1117",
      border: "#f85149",
      text: "#e6edf3",
      accent: "#f85149",
    },
    dark: {
      bg: "#151515",
      border: "#f85149",
      text: "#e6edf3",
      accent: "#f85149",
    },
  };

  const color = colors[theme] || colors["blue-green"];
  const errorType =
    title === "missing_token"
      ? wittyMessages.missing_token
      : wittyMessages.api_error;

  return `
    <svg width="467" height="150" viewBox="0 0 467 150" xmlns="http://www.w3.org/2000/svg">
      <style>
        .error-title { font: 600 18px 'Segoe UI', Ubuntu, Sans-Serif; fill: ${color.accent}; }
        .error-message { font: 400 14px 'Segoe UI', Ubuntu, Sans-Serif; fill: ${color.text}; }
        .error-bg { fill: ${color.bg}; stroke: ${color.border}; stroke-width: 1; }
      </style>
      
      <rect class="error-bg" x="0.5" y="0.5" rx="4.5" height="149" width="466"/>
      
      <g transform="translate(25, 25)">
        <path fill="${color.accent}" d="M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM0 8a8 8 0 1116 0A8 8 0 010 8zm9 3a1 1 0 11-2 0 1 1 0 012 0zm-.25-6.25a.75.75 0 00-1.5 0v3.5a.75.75 0 001.5 0v-3.5z"/>
      </g>
      
      <text x="55" y="40" class="error-title">${errorType.title}</text>
      <text x="55" y="70" class="error-message">${errorType.lines[0]}</text>
      <text x="55" y="95" class="error-message">${errorType.lines[1]}</text>
    </svg>
  `;
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
        logger.error("GitHub API Error:", error);
        const errorSvg = generateErrorCard("api_error", error.message);
        res.setHeader("Content-Type", "image/svg+xml");
        return res.status(500).send(errorSvg);
      }
    } else {
      const errorSvg = generateErrorCard(
        "missing_token",
        "GITHUB_STATS_TOKEN is not set",
      );
      res.setHeader("Content-Type", "image/svg+xml");
      return res.status(400).send(errorSvg);
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
    logger.error("Error generating GitHub stats:", error);
    const fallbackUrl = `https://github-readme-stats.vercel.app/api?username=${username}&theme=dark`;
    return res.redirect(302, fallbackUrl);
  }
}
