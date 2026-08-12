/**
 * @module DevToStatsFetcher
 * @description Data fetcher for public Dev.to user statistics.
 */

import axios from "axios";

const fetchDevToStats = async (username) => {
  const devtoUser = username || process.env.DEVTO_USERNAME || "cynthizo";
  try {
    const response = await axios.get(
      `https://dev.to/api/articles?username=${devtoUser}`,
      {
        headers: {
          "User-Agent": "Mozilla/5.0",
          ...(process.env.DEVTO_API_KEY
            ? { "api-key": process.env.DEVTO_API_KEY }
            : {}),
        },
      },
    );
    return Array.isArray(response.data) ? response.data.length : 0;
  } catch {
    return 0;
  }
};

export { fetchDevToStats };
export default fetchDevToStats;
