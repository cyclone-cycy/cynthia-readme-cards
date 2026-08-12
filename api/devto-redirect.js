/**
 * @module DevToRedirectAPI
 * @description Redirects to the exact Dev.to article URL based on article index.
 *
 * This endpoint exists so that article links in the GitHub README stay dynamic.
 * Instead of hardcoding article URLs, the README links to this redirect endpoint
 * which fetches the current article list and 302-redirects to the correct one.
 *
 * QUERY PARAMS:
 *   ?index=1             – 1-based article index (default 1 = most recent)
 *   ?username=cynthizo   – Dev.to username (falls back to DEVTO_USERNAME env)
 *
 * ENVIRONMENT VARIABLES:
 *   DEVTO_USERNAME       – Fallback Dev.to username
 *
 * USAGE IN README:
 *   <a href="https://cynthia-readme-cards.vercel.app/api/devto-redirect?index=1">
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

  // Resolve article index: query param → Vercel env var → default 1
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

  if (!username) {
    return res.redirect(302, "https://dev.to");
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

    const article =
      articles[Math.min(index, articles.length - 1)] || articles[0];
    return res.redirect(302, article.url || `https://dev.to/${username}`);
  } catch {
    return res.redirect(302, `https://dev.to/${username}`);
  }
}
