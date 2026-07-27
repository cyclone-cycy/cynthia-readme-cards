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
 * Fallback fetcher used when the combined query above is rejected outright
 * (e.g. a specific org's token policy blocks the whole request). Splits the
 * ask into independent per-source queries so one blocked org can't take
 * down every other org/personal repo's language data.
 *
 * @param {string} username GitHub username.
 * @param {string} token GitHub token.
 * @returns {Promise<{repoNodes: any[], prNodes: any[]}>} Merged repo/PR nodes from every source that succeeded.
 */
const fetchPerSourceFallback = async (username, token) => {
  const headers = { Authorization: `token ${token}` };
  const languageFields = `
    isFork
    languages(first: 10, orderBy: {field: SIZE, direction: DESC}) {
      edges { size node { color name } }
    }
  `;

  /**
   * @param {string} query GraphQL query string.
   * @param {any} variables Query variables.
   * @returns {Promise<any>} The response's data field.
   */
  const run = (query, variables) =>
    request({ query, variables }, headers).then((res) => {
      if (res.data.errors) {
        throw new Error(res.data.errors[0]?.message || "GraphQL error");
      }
      return res.data.data;
    });

  // Personal repos + org list. COLLABORATOR affiliation is included because
  // it's normally safe, but if the user was ever added as a direct
  // collaborator (not just an org member) on a repo in a blocked org, even
  // this could fail — so fall back further to OWNER-only if it does.
  let personal;
  try {
    personal = await run(
      `query userInfo($login: String!) {
        user(login: $login) {
          repositories(ownerAffiliations: [OWNER, COLLABORATOR], first: 100) {
            nodes { name ${languageFields} }
          }
          organizations(first: 100) { nodes { login } }
        }
      }`,
      { login: username },
    );
  } catch (personalErr) {
    logger.error(
      `Personal+collaborator repo query failed, falling back to owned repos only: ${/** @type {any} */ (personalErr)?.message || personalErr}`,
    );
    personal = await run(
      `query userInfo($login: String!) {
        user(login: $login) {
          repositories(ownerAffiliations: [OWNER], first: 100) {
            nodes { name ${languageFields} }
          }
          organizations(first: 100) { nodes { login } }
        }
      }`,
      { login: username },
    );
  }

  let repoNodes = personal?.user?.repositories?.nodes || [];
  const orgLogins = (personal?.user?.organizations?.nodes || []).map(
    (/** @type {any} */ node) => node.login,
  );

  // PRs are fetched separately and independently: unlike the query above,
  // this can touch any repo the user has ever opened a PR against —
  // including private repos in a blocked org (e.g. hngprojects). If that
  // happens, skip PR-based repos entirely rather than failing everything.
  let prNodes = [];
  try {
    const prData = await run(
      `query userPRs($login: String!) {
        user(login: $login) {
          pullRequests(first: 100) {
            nodes { repository { name ${languageFields} } }
          }
        }
      }`,
      { login: username },
    );
    prNodes = (prData?.user?.pullRequests?.nodes || [])
      .map((/** @type {any} */ node) => node.repository)
      .filter((/** @type {any} */ repo) => repo && repo.name);
  } catch (prErr) {
    logger.error(
      `Skipping PR-based repos in language stats: ${/** @type {any} */ (prErr)?.message || prErr}`,
    );
  }

  // Query each org independently. If one org's policy blocks this token
  // (e.g. hngprojects rejecting the token type), only that org's repos are
  // skipped — every other org and personal repos still come through.
  const orgResults = await Promise.allSettled(
    orgLogins.map((/** @type {string} */ org) =>
      run(
        `query orgRepos($login: String!) {
          organization(login: $login) {
            repositories(first: 100) {
              nodes { name ${languageFields} }
            }
          }
        }`,
        { login: org },
      ).then((data) => ({
        org,
        nodes: data?.organization?.repositories?.nodes || [],
      })),
    ),
  );

  orgResults.forEach((result, i) => {
    if (result.status === "fulfilled") {
      repoNodes = repoNodes.concat(result.value.nodes);
    } else {
      logger.error(
        `Skipping org "${orgLogins[i]}" in language stats: ${result.reason?.message || result.reason}`,
      );
    }
  });

  return { repoNodes, prNodes };
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

  let repoNodes;
  let prNodes;

  if (res.data.errors) {
    logger.error(res.data.errors);

    // A missing user is a real error — no fallback can fix that.
    if (res.data.errors[0].type === "NOT_FOUND") {
      throw new CustomError(
        res.data.errors[0].message || "Could not fetch user.",
        CustomError.USER_NOT_FOUND,
      );
    }

    // Otherwise, this is very likely a single org's token policy rejecting
    // the whole combined query (e.g. an org blocking this token type).
    // Fall back to querying personal repos + each org separately, so that
    // one blocked org doesn't take down every other org/personal repo's
    // language data.
    logger.log(
      "Combined language query failed, falling back to per-source queries.",
    );
    try {
      const fallback = await fetchPerSourceFallback(
        username,
        // @ts-ignore
        process.env.PAT_1,
      );
      repoNodes = fallback.repoNodes;
      prNodes = fallback.prNodes;
    } catch (fallbackErr) {
      logger.error(fallbackErr);
      throw new CustomError(
        wrapTextMultiline(
          res.data.errors[0].message ||
            "Something went wrong while trying to retrieve the language data using the GraphQL API.",
          90,
          1,
        )[0],
        res.statusText || CustomError.GRAPHQL_ERROR,
      );
    }
  } else {
    repoNodes = res.data.data.user.repositories.nodes;
    prNodes = (res.data.data.user.pullRequests?.nodes || [])
      .map((/** @type {any} */ node) => node.repository)
      .filter((/** @type {any} */ repo) => repo && repo.name);
  }

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
