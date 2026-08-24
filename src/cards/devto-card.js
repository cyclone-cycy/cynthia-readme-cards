/**
 * @module DevToCard
 * @description Visual renderer for Dev.to article cards.
 */

// @ts-check

// Card is 400px wide, title starts at x=20 -- ~360px of usable width.
// At 14px sans-serif, average glyph width is ~7-7.5px, so this is the
// safe ceiling before a title needs truncating to avoid running off
// the edge (the SVG has no wrap/ellipsis of its own).
const MAX_TITLE_CHARS = 46;

/**
 * Escapes characters that would break XML/SVG text content.
 *
 * @param {string} text Raw text to escape.
 * @returns {string} XML-safe text.
 */
const escapeXml = (text) =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

/**
 * Truncates a title to fit the card, appending an ellipsis if cut.
 *
 * @param {string} title Title to fit.
 * @returns {string} Title guaranteed to be MAX_TITLE_CHARS or shorter.
 */
const fitTitle = (title) => {
  if (title.length <= MAX_TITLE_CHARS) {
    return title;
  }
  return `${title.slice(0, MAX_TITLE_CHARS - 1).trimEnd()}…`;
};

/**
 * Renders the Dev.to article card SVG.
 *
 * @param {object} post The article data from Dev.to API.
 * @returns {string} SVG markup for the article card.
 */
const renderDevToCard = (post) => {
  if (!post) {
    return "";
  }

  // DEVTO_TITLE_OVERRIDE lets a short, card-friendly title be shown here
  // while the real dev.to post keeps its full, SEO-friendly title --
  // set/change/clear it from Vercel's env vars, no commit needed. Falls
  // through to the real title (still safely fit below) when unset.
  const rawTitle = process.env.DEVTO_TITLE_OVERRIDE || post.title;
  const displayTitle = escapeXml(fitTitle(rawTitle));

  return `
    <svg width='400' height='120' viewBox='0 0 400 120' fill='none' xmlns='http://www.w3.org/2000/svg'>
      <rect width='400' height='120' rx='8' fill='#0d1117' stroke='#53F7AE' stroke-width='0.5' stroke-opacity='0.3'/>
      <text x='20' y='30' fill='#53F7AE' font-family='sans-serif' font-weight='bold' font-size='16'>Articles</text>
      <text x='20' y='60' fill='#fff' font-family='sans-serif' font-size='14'>${displayTitle}</text>
      <text x='20' y='90' fill='#8b949e' font-family='sans-serif' font-size='12'>Tags: ${post.tags.join(", ")} • ${post.reading_time} min read</text>
    </svg>
  `;
};

export { renderDevToCard };
export default renderDevToCard;
