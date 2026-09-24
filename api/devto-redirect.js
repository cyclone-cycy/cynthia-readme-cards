/**
 * @module DevToRedirectAPI
 * @description Redirects to the exact Dev.to article URL based on article index or URL slug.
 *
 * This endpoint exists so that article links in the GitHub README stay dynamic.
 * Instead of hardcoding article URLs, the README links to this redirect endpoint
 * which fetches the current article list and 302-redirects to the correct one.
 *
 * QUERY PARAMS:
 *   ?index=1             – 1-based article index (default 1 = most recent)
 *   ?url=<article_url>   – Direct Dev.to article URL (overrides index)
 *   ?username=cynthizo   – Dev.to username (falls back to DEVTO_USERNAME env)
 *   ?pinned=true         – Resolve the pinned article (uses PINNED_ARTICLE_URL or PINNED_ARTICLE_INDEX)
 *   ?card=3              – Resolve card 3 (uses CARD3_ARTICLE_URL or CARD3_ARTICLE_INDEX)
 *
 * ENVIRONMENT VARIABLES:
 *   DEVTO_USERNAME           – Fallback Dev.to username
 *   PINNED_ARTICLE_URL       – Exact Dev.to URL for the pinned card (takes priority over index)
 *   CARD3_ARTICLE_URL        – Exact Dev.to URL for card 3 (takes priority over index)
 *   PINNED_ARTICLE_INDEX     – 1-based index fallback for pinned card
 *   CARD3_ARTICLE_INDEX      – 1-based index fallback for card 3
 *   CARD1_ARTICLE_INDEX      – 1-based index for card 1 (left card)
 *
 * USAGE IN README:
 *   <a href="https://cynthia-readme-cards.vercel.app/api/devto-redirect?pinned=true">
 *     <img src="...card..." />
 *   </a>
 */

/**
 * Redirect handler for Dev.to articles.
 *
 * @param {object} req Express/Vercel request.
 * @param {object} res Express/Vercel response.
 * @returns {Promise<void>} 302 redirect or fallback.
 */
export default async function handler(req, res) {
  const username = req.query.username || process.env.DEVTO_USERNAME;
  const isPinned = req.query.pinned === "true";

  if (!username) {
    return res.redirect(302, "https://dev.to");
  }

  // 1. Explicit ?url= query param — redirect immediately, no API call needed
  if (req.query.url) {
    return res.redirect(302, req.query.url);
  }

  try {
    const response = await fetch(
      `https://dev.to/api/articles?username=${username}&per_page=1000`,
    );
    if (!response.ok) {
      throw new Error(`Dev.to API ${response.status}`);
    }

    const articles = await response.json();
    if (!Array.isArray(articles) || articles.length === 0) {
      throw new Error("No articles");
    }

    // 2. Environment-variable URL (pinned card or card 3) — match by URL
    if (isPinned && process.env.PINNED_ARTICLE_URL) {
      const found = articles.find(
        (a) =>
          a.url === process.env.PINNED_ARTICLE_URL ||
          a.canonical_url === process.env.PINNED_ARTICLE_URL,
      );
      if (found) {
        return res.redirect(302, found.url || process.env.PINNED_ARTICLE_URL);
      }
      // If no match found, redirect directly to the configured URL as a safe fallback
      return res.redirect(302, process.env.PINNED_ARTICLE_URL);
    }

    if (req.query.card === "3" && process.env.CARD3_ARTICLE_URL) {
      const found = articles.find(
        (a) =>
          a.url === process.env.CARD3_ARTICLE_URL ||
          a.canonical_url === process.env.CARD3_ARTICLE_URL,
      );
      if (found) {
        return res.redirect(302, found.url || process.env.CARD3_ARTICLE_URL);
      }
      return res.redirect(302, process.env.CARD3_ARTICLE_URL);
    }

    // 3. Index-based resolution (explicit ?index param or env var)
    let resolvedIndex;
    if (req.query.index) {
      resolvedIndex = req.query.index;
    } else if (isPinned) {
      resolvedIndex = process.env.PINNED_ARTICLE_INDEX || "1";
    } else if (req.query.card === "3") {
      resolvedIndex = process.env.CARD3_ARTICLE_INDEX || "3";
    } else {
      resolvedIndex = process.env.CARD1_ARTICLE_INDEX || "1";
    }
    const index = parseInt(resolvedIndex, 10) - 1;

    const article =
      articles[Math.min(index, articles.length - 1)] || articles[0];
    return res.redirect(302, article.url || `https://dev.to/${username}`);
  } catch {
    return res.redirect(302, `https://dev.to/${username}`);
  }
}
