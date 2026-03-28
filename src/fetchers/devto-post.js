/**
 * @module DevToPostFetcher
 * @description Data fetcher for authenticated Dev.to article details.
 */

import https from "https";

/**
 * Fetches the featured Dev.to post for the authenticated user.
 *
 * @returns {Promise<object|null>} The post data or null on failure.
 */
const fetchFeaturedPost = () => {
  const result = new Promise((resolve) => {
    if (!process.env.DEVTO_API_KEY) {
      return resolve(null);
    }
    const options = {
      hostname: "dev.to",
      path: "/api/articles/me",
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0",
        "api-key": process.env.DEVTO_API_KEY,
      },
    };

    https
      .get(options, (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          try {
            const json = JSON.parse(data);
            if (!Array.isArray(json) || json.length === 0) {
              return resolve(null);
            }
            const latest = json[0];
            return resolve({
              title: latest.title,
              tags: latest.tag_list,
              reading_time: latest.reading_time_minutes,
            });
          } catch {
            return resolve(null);
          }
        });
      })
      .on("error", () => {
        return resolve(null);
      });
    return undefined;
  });
  return result;
};

export { fetchFeaturedPost };
export default fetchFeaturedPost;
