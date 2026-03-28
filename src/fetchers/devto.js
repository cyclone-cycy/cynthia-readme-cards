/**
 * @module DevToStatsFetcher
 * @description Data fetcher for public Dev.to user statistics.
 */

import https from "https";

const fetchDevToStats = (username) => {
  const devtoUser = process.env.DEVTO_USERNAME || username || "cynthizo";
  return new Promise((resolve) => {
    const options = {
      hostname: "dev.to",
      path: `/api/articles?username=${devtoUser}&per_page=1000`,
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0",
        ...(process.env.DEVTO_API_KEY
          ? { "api-key": process.env.DEVTO_API_KEY }
          : {}),
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
            resolve(Array.isArray(json) ? json.length : 0);
          } catch {
            resolve(0);
          }
        });
      })
      .on("error", () => {
        resolve(0);
      });
  });
};

export { fetchDevToStats };
export default fetchDevToStats;
