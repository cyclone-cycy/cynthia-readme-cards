/**
 * @module DevToCard
 * @description Visual renderer for Dev.to article cards.
 */

// @ts-check

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

  return `
    <svg width='400' height='120' viewBox='0 0 400 120' fill='none' xmlns='http://www.w3.org/2000/svg'>
      <rect width='400' height='120' rx='8' fill='#0d1117' stroke='#53F7AE' stroke-width='0.5' stroke-opacity='0.3'/>
      <text x='20' y='30' fill='#53F7AE' font-family='sans-serif' font-weight='bold' font-size='16'>Articles</text>
      <text x='20' y='60' fill='#fff' font-family='sans-serif' font-size='14'>${post.title}</text>
      <text x='20' y='90' fill='#8b949e' font-family='sans-serif' font-size='12'>Tags: ${post.tags.join(", ")} • ${post.reading_time} min read</text>
    </svg>
  `;
};

export { renderDevToCard };
export default renderDevToCard;
