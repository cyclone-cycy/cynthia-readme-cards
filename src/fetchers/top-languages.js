/**
 * @module TopLanguagesFetcher
 * @description Logic-weighted language fetcher for GitHub profiles.
 *
 * LOGIC: This fetcher aggregates language data from Owned repositories,
 * Organization memberships, Collaborations, and Pull Requests.
 * It implements a "Consistency Multiplier" (count_weight) that rewards
 * languages used across a greater number of projects to better represent
 * core technical expertise.
 *
 * FORK LOGIC: Forks are included only if the user has opened at least one
 * Pull Request in that repository, filtering for active contributions.
 */

// @ts-check

import { retryer } from "../common/retryer.js";
import { logger } from "../common/log.js";
import { excludeRepositories } from "../common/envs.js";
import { CustomError, MissingParamError } from "../common/error.js";
import { wrapTextMultiline } from "../common/fmt.js";
import { request } from "../common/http.js";

/**
 * Top languages fetcher object.
 *
 * @param {any} variables Fetcher variables.
 * @param {string} token GitHub token.
 * @returns {Promise<import("axios").AxiosResponse>} Languages fetcher response.
 */
const fetcher = (variables, token) => {
  return request(
    {
      query: `
      query userInfo($login: String!) {
        user(login: $login) {
          # fetch all affiliated repos (we will filter forks in JS)
          repositories(ownerAffiliations: [OWNER, ORGANIZATION_MEMBER, COLLABORATOR], first: 100) {
            nodes {
              name
              isFork
              languages(first: 10, orderBy: {field: SIZE, direction: DESC}) {
                edges {
                  size
                  node {
                    color
                    name
                  }
                }
              }
            }
          }
          # fetch repositories where user has opened PRs
          pullRequests(first: 100) {
            nodes {
              repository {
                name
                isFork
                languages(first: 10, orderBy: {field: SIZE, direction: DESC}) {
                  edges {
                    size
                    node {
                      color
                      name
                    }
                  }
                }
              }
            }
          }
        }
      }
      `,
      variables,
    },
    {
      Authorization: `token ${token}`,
    },
  );
};

/**
 * @typedef {import("./types").TopLangData} TopLangData Top languages data.
 */

/**
 * Fetch top languages for a given username.
 *
 * @param {string} username GitHub username.
 * @param {string[]} exclude_repo List of repositories to exclude.
 * @param {number} size_weight Weightage to be given to size.
 * @param {number} count_weight Weightage to be given to count.
 * @returns {Promise<TopLangData>} Top languages data.
 */
const fetchTopLanguages = async (
  username,
  exclude_repo = [],
  size_weight = 1,
  count_weight = 1,
) => {
  if (!username) {
    throw new MissingParamError(["username"]);
  }

  const res = await retryer(fetcher, { login: username });

  if (res.data.errors) {
    logger.error(res.data.errors);
    if (res.data.errors[0].type === "NOT_FOUND") {
      throw new CustomError(
        res.data.errors[0].message || "Could not fetch user.",
        CustomError.USER_NOT_FOUND,
      );
    }
    if (res.data.errors[0].message) {
      throw new CustomError(
        wrapTextMultiline(res.data.errors[0].message, 90, 1)[0],
        res.statusText,
      );
    }
    throw new CustomError(
      "Something went wrong while trying to retrieve the language data using the GraphQL API.",
      CustomError.GRAPHQL_ERROR,
    );
  }

  let repoNodes = res.data.data.user.repositories.nodes;
  const prNodes = (res.data.data.user.pullRequests?.nodes || [])
    .map((node) => node.repository)
    .filter((repo) => repo && repo.name);

  // Identify all repositories where user has opened PRs
  const prRepoNames = new Set(prNodes.map((n) => n.name));

  // Merge PR repositories into repoNodes, avoiding duplicates
  const existingRepoNames = new Set(repoNodes.map((n) => n.name));
  prNodes.forEach((prRepo) => {
    if (!existingRepoNames.has(prRepo.name)) {
      repoNodes.push(prRepo);
      existingRepoNames.add(prRepo.name);
    }
  });

  /** @type {Record<string, boolean>} */
  let repoToHide = {};
  const allExcludedRepos = [...exclude_repo, ...excludeRepositories];

  // populate repoToHide map for quick lookup
  if (allExcludedRepos) {
    allExcludedRepos.forEach((repoName) => {
      repoToHide[repoName] = true;
    });
  }

  let repoCount = 0;
  const langBreakdown = {};

  repoNodes = repoNodes
    .filter((node) => {
      if (!node || !node.name || repoToHide[node.name]) {
        return false;
      }

      // FORK LOGIC: Only include forks if the user has opened at least one PR in them
      if (node.isFork && !prRepoNames.has(node.name)) {
        return false;
      }
      return true;
    })
    .filter(
      (node) =>
        node.languages &&
        node.languages.edges &&
        node.languages.edges.length > 0,
    )
    // flatten the list of language nodes
    .reduce((acc, curr) => {
      curr.languages.edges.forEach((edge) => {
        if (edge.node && edge.node.name) {
          if (!langBreakdown[edge.node.name]) {
            langBreakdown[edge.node.name] = [];
          }
          langBreakdown[edge.node.name].push({
            repo: curr.name,
            size: edge.size,
          });
        }
      });
      return curr.languages.edges.concat(acc);
    }, [])
    .reduce((acc, prev) => {
      // get the size of the language (bytes)
      let langSize = prev.size;
      let langColor = prev.node.color;

      if (!prev.node || !prev.node.name) {
        return acc;
      }

      // Color Overrides for visibility
      if (prev.node.name === "TypeScript") {
        langColor = "#3178c6";
      } // Lighter Brilliant Sky Blue
      if (prev.node.name === "Go") {
        langColor = "#00ADD8";
      } // Cyan/Light Blue

      // add the size to the language size and increase repoCount
      if (acc[prev.node.name] && prev.node.name === acc[prev.node.name].name) {
        langSize = prev.size + acc[prev.node.name].size;
        repoCount = (acc[prev.node.name].count || 0) + 1;
      } else {
        repoCount = 1;
      }
      return {
        ...acc,
        [prev.node.name]: {
          name: prev.node.name,
          color: langColor,
          size: langSize,
          count: repoCount,
        },
      };
    }, {});

  Object.keys(repoNodes).forEach((name) => {
    // Apply Consistency Multiplier (Weighting)
    repoNodes[name].size =
      Math.pow(repoNodes[name].size, size_weight) *
      Math.pow(repoNodes[name].count, count_weight);
  });

  // Permanently exclude static/noise languages for Cynthia
  const noiseLanguages = [
    "HTML",
    "CSS",
    "Handlebars",
    "SCSS",
    "Jupyter Notebook",
    "PostScript",
  ];
  noiseLanguages.forEach((lang) => delete repoNodes[lang]);

  const topLangs = Object.keys(repoNodes)
    .sort((a, b) => repoNodes[b].size - repoNodes[a].size)
    .reduce((result, key) => {
      result[key] = repoNodes[key];
      return result;
    }, {});

  return topLangs;
};

export { fetchTopLanguages };
export default fetchTopLanguages;
