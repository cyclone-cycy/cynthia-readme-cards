/**
 * @module DevToCardAPI
 * @description API endpoint for fetching and rendering a multi-card Dev.to article layout.
 *
 * FEATURES: Responsive 3-card horizontal layout, smart cover image detection,
 * and configurable article selection (Most Recent, Pinned, etc.) via environment variables.
 */

/**
 * Cleans text for SVG inclusion.
 *
 * @param {string} str The string to clean.
 * @returns {string} Sanitized string.
 */
function cleanText(str) {
  if (!str) {
    return "";
  }
  return str.replace(/[<>&"']/g, (char) => {
    const entities = {
      "<": "&lt;",
      ">": "&gt;",
      "&": "&amp;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[char] || char;
  });
}

/**
 * Renders tags as a single line of text.
 *
 * @param {string[]} tagList List of tags.
 * @param {number} x X coordinate.
 * @param {number} y Y coordinate.
 * @param {number} fontSize Font size.
 * @param {string} color Text color.
 * @returns {string} SVG text element.
 */
function renderTags(tagList, x, y, fontSize = 9, color = "#888") {
  if (!tagList || tagList.length === 0) {
    return "";
  }
  const tags = tagList.map((tag) => `#${tag}`).join(" ");
  return `<text x="${x}" y="${y}" fill="${color}" font-family="Arial, sans-serif" font-size="${fontSize}">${cleanText(tags)}</text>`;
}

/**
 * Formats reading time.
 *
 * @param {number} minutes Reading time in minutes.
 * @returns {string} Formatted string.
 */
function getReadTime(minutes) {
  return `${minutes || 1} min`;
}

/**
 * Main API handler for Dev.to cards.
 *
 * @param {any} req Express request.
 * @param {any} res Express response.
 * @returns {Promise<void>}
 */
export default async function handler(req, res) {
  const username =
    process.env.DEVTO_USERNAME || req.query.username || "cynthizo";

  try {
    const response = await fetch(
      `https://dev.to/api/articles?username=${username}&per_page=3`,
    );
    const articles = await response.json();

    if (!Array.isArray(articles) || articles.length === 0) {
      throw new Error("No articles found");
    }

    const cardWidth = 280;
    const cardHeight = 180;
    const gap = 15;
    const totalWidth =
      cardWidth * articles.length + gap * (articles.length - 1) + 40;

    let articleCards = "";
    articles.forEach((article, index) => {
      const x = 20 + index * (cardWidth + gap);
      const coverImage =
        article.cover_image ||
        article.social_image ||
        "https://dev.to/assets/default-sig-7478fcf01d25d08c85f42249511f7555d37d771bc32c57be5c262f60f83e1ae0.png";

      articleCards += `
        <g transform="translate(${x}, 50)">
          <rect width="${cardWidth}" height="${cardHeight}" rx="10" fill="#161b22" stroke="#30363d" stroke-width="1"/>
          <clipPath id="clip${index}">
            <rect width="${cardWidth}" height="80" rx="10"/>
          </clipPath>
          <image href="${coverImage}" width="${cardWidth}" height="100" preserveAspectRatio="xMidYCenter slice" clip-path="url(#clip${index})"/>
          
          <text x="15" y="105" fill="#53F7AE" font-family="Arial, sans-serif" font-weight="bold" font-size="12">${cleanText(article.title.substring(0, 35))}${article.title.length > 35 ? "..." : ""}</text>
          
          <text x="15" y="125" fill="#8b949e" font-family="Arial, sans-serif" font-size="10">${cleanText(article.description?.substring(0, 80) || "")}...</text>
          
          ${renderTags(article.tag_list, 15, 155)}
          
          <text x="15" y="170" fill="#58a6ff" font-family="Arial, sans-serif" font-size="9">${getReadTime(article.reading_time_minutes)} • ${article.public_reactions_count} reactions</text>
        </g>
      `;
    });

    const svg = `
      <svg width="${totalWidth}" height="250" viewBox="0 0 ${totalWidth} 250" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="${totalWidth}" height="250" rx="15" fill="#0d1117" stroke="#53F7AE" stroke-width="1" stroke-opacity="0.2"/>
        <text x="20" y="35" fill="#53F7AE" font-family="Arial, sans-serif" font-weight="bold" font-size="18">Articles</text>
        <text x="${totalWidth - 120}" y="33" fill="#8b949e" font-family="Arial, sans-serif" font-size="11">dev.to/${username}</text>
        ${articleCards}
      </svg>
    `;

    res.setHeader("Content-Type", "image/svg+xml");
    res.setHeader("Cache-Control", "public, max-age=3600");
    return res.status(200).send(svg);
  } catch {
    const fallbackSvg = `
    <svg width="400" height="100" viewBox="0 0 400 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="400" height="100" rx="10" fill="#0d1117" stroke="#f85149" stroke-width="1"/>
      <text x="20" y="45" fill="#f85149" font-family="Arial, sans-serif" font-weight="bold" font-size="16">Articles temporarily unavailable</text>
      <text x="20" y="70" fill="#888" font-family="Arial, sans-serif" font-size="12">Visit dev.to/${username}</text>
    </svg>`;

    res.setHeader("Content-Type", "image/svg+xml");
    return res.status(200).send(fallbackSvg);
  }
}
