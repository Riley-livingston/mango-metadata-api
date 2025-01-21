const express = require("express");
const router = express.Router();
const { pool } = require("../utils/database"); // Updated import

router.post("/get-card-details", (req, res) => {
  const uniqueIds = req.body.uniqueIds;

  if (!uniqueIds || uniqueIds.length === 0) {
    return res.status(400).send("No uniqueIds provided");
  }

  const placeholders = uniqueIds.map(() => "?").join(",");

  const query = `
    SELECT pcm.unique_id, pcm.name, pcm.number, pcm.rarity, pcm.types
    FROM pkmn_card_metadata pcm
    LEFT JOIN historical_pokemon_card_prices.historical_card_prices hcp
    ON pcm.unique_id = hcp.unique_id
    INNER JOIN (
        SELECT unique_id, MAX(updatedAt) as latestUpdate
        FROM historical_pokemon_card_prices.historical_card_prices
        GROUP BY unique_id
    ) latest_prices ON hcp.unique_id = latest_prices.unique_id AND hcp.updatedAt = latest_prices.latestUpdate
    WHERE pcm.unique_id IN (${placeholders})
  `;

  pool.query(query, uniqueIds, (err, results) => {
    if (err) {
      console.error("Error executing query:", err);
      return res.status(500).json({ error: "An error occurred while fetching card details" });
    }

    const detailsMap = {};
    results.forEach((result) => {
      detailsMap[result.unique_id] = {
        name: result.name,
        number: result.number,
        rarity: result.rarity,
        types: result.types,
      };
    });
    res.json(detailsMap);
  });
});

router.post("/get-card-details-custom-set-click", (req, res) => {
  const uniqueIds = req.body.uniqueIds;

  if (!uniqueIds || uniqueIds.length === 0) {
    return res.status(400).json({ error: "No uniqueIds provided" });
  }

  const query = `
    SELECT unique_id, name, number
    FROM metadata.pkmn_card_metadata
    WHERE unique_id IN (?)
  `;

  pool.query(query, [uniqueIds], (err, results) => {
    if (err) {
      console.error("Error executing query:", err);
      return res.status(500).json({ error: "Internal server error" });
    }

    res.json({ cardDetails: results });
  });
});

router.post("/get-queue-details", (req, res) => {
  const queueValues = req.body.queueValues;

  if (!queueValues || queueValues.length === 0) {
    return res.status(400).json({ error: "No queueValues provided" });
  }

  const uniqueIdCounts = queueValues.reduce((acc, val) => {
    acc[val] = (acc[val] || 0) + 1;
    return acc;
  }, {});

  const likeClauses = queueValues.map((val) => `pcm.unique_id LIKE ?`).join(" OR ");
  const likeValues = queueValues.map((val) => `${val}%`);

  const optcgLikeClauses = queueValues.map((val) => `ocm.unique_id LIKE ?`).join(" OR ");
  const optcgLikeValues = queueValues.map((val) => `${val}%`);

  const query = `
    SELECT 
      pcm.unique_id, 
      s.set_name, 
      s.set_printedTotal, 
      pcm.number, 
      pcm.name, 
      COALESCE(hcp.normal_market, 0) as normal_market, 
      COALESCE(hcp.holofoil_market, 0) as holofoil_market, 
      COALESCE(hcp.reverseHolofoil_Market, 0) as reverseholofoilmarket, 
      COALESCE(hcp.firstEditionHolofoil_Market, 0) as firstEditionHolofoilMarket, 
      COALESCE(hcp.firstEditionNormal_Market, 0) as firstEditionNormalMarket
    FROM metadata.pkmn_card_metadata pcm
    JOIN metadata.sets s ON pcm.set_id = s.set_id
    LEFT JOIN historical_pokemon_card_prices.historical_card_prices hcp
    ON pcm.unique_id = hcp.unique_id
    INNER JOIN (
        SELECT unique_id, MAX(updatedAt) as latestUpdate
        FROM historical_pokemon_card_prices.historical_card_prices
        GROUP BY unique_id
    ) latest_prices ON hcp.unique_id = latest_prices.unique_id AND hcp.updatedAt = latest_prices.latestUpdate
    WHERE ${likeClauses}
    UNION
    SELECT 
      ocm.unique_id, 
      os.set_name, 
      os.set_printedTotal, 
      ocm.number, 
      ocm.name, 
      COALESCE(hcp.normal_market, 0) as normal_market, 
      COALESCE(hcp.holofoil_market, 0) as holofoil_market, 
      COALESCE(hcp.reverseHolofoil_Market, 0) as reverseholofoilmarket, 
      COALESCE(hcp.firstEditionHolofoil_Market, 0) as firstEditionHolofoilMarket, 
      COALESCE(hcp.firstEditionNormal_Market, 0) as firstEditionNormalMarket
    FROM metadata.optcg_metadata ocm
    JOIN metadata.optcg_sets os ON ocm.set_id = os.set_id
    LEFT JOIN historical_pokemon_card_prices.historical_card_prices hcp
    ON ocm.unique_id = hcp.unique_id
    INNER JOIN (
        SELECT unique_id, MAX(updatedAt) as latestUpdate
        FROM historical_pokemon_card_prices.historical_card_prices
        GROUP BY unique_id
    ) latest_prices ON hcp.unique_id = latest_prices.unique_id AND hcp.updatedAt = latest_prices.latestUpdate
    WHERE ${optcgLikeClauses}
  `;

  pool.query(query, [...likeValues, ...optcgLikeValues], (err, results) => {
    if (err) {
      console.error("Error executing query:", err);
      return res.status(500).json({ error: "An error occurred while fetching queue details" });
    }

    const detailsMap = {};
    results.forEach((result) => {
      const count = uniqueIdCounts[result.unique_id.split("_")[0]] || 1;
      detailsMap[result.unique_id] = Array(count).fill({
        setName: result.set_name,
        number: result.number,
        set_printedTotal: result.set_printedTotal,
        name: result.name,
        normalMarket: result.normal_market > 0 ? result.normal_market : null,
        holofoilMarket: result.holofoil_market > 0 ? result.holofoil_market : null,
        reverseHolofoilMarket: result.reverseholofoilmarket > 0 ? result.reverseholofoilmarket : null,
        firstEditionHolofoilMarket: result.firstEditionHolofoilMarket > 0 ? result.firstEditionHolofoilMarket : null,
        firstEditionNormalMarket: result.firstEditionNormalMarket > 0 ? result.firstEditionNormalMarket : null,
      });
    });

    res.json(detailsMap);
  });
});

router.get("/card-click-screen-metadata", (req, res) => {
  const { uniqueId } = req.query;

  if (!uniqueId) {
    return res.status(400).json({ error: "uniqueId query parameter is required." });
  }

  const query = `
  SELECT 
    m.unique_id, 
    m.name, 
    s.set_name, 
    m.number, 
    s.set_printedTotal,
    m.rarity, 
    s.set_releaseDate, 
    m.artist
  FROM 
    metadata.pkmn_card_metadata m
  JOIN 
    metadata.sets s ON m.set_id = s.set_id
  LEFT JOIN 
    historical_pokemon_card_prices.historical_card_prices hcp 
    ON m.unique_id = hcp.unique_id
  LEFT JOIN (
      SELECT 
        unique_id, 
        MAX(updatedAt) as latestUpdate
      FROM 
        historical_pokemon_card_prices.historical_card_prices
      GROUP BY 
        unique_id
  ) latest_prices 
    ON hcp.unique_id = latest_prices.unique_id AND hcp.updatedAt = latest_prices.latestUpdate
  WHERE 
    m.unique_id = ?;
  `;

  pool.query(query, [uniqueId], (err, results) => {
    if (err) {
      console.error("Error executing query", err);
      return res.status(500).json({ error: "Internal server error" });
    }

    if (results.length === 0) {
      return res.status(404).json({ error: "No record found for given uniqueId" });
    }

    const data = results[0];
    res.json(data);
  });
});

router.get("/optcg-card-click-screen-metadata", (req, res) => {
  const { uniqueId } = req.query;

  if (!uniqueId) {
    return res.status(400).json({ error: "uniqueId query parameter is required." });
  }

  const query = `
  SELECT 
    m.unique_id, 
    m.name, 
    s.set_name, 
    m.number, 
    s.set_total,
    m.card_type,
    s.set_releaseDate,
    m.color,
    m.rarity, 
    m.power

  FROM 
    metadata.optcg_metadata m
  JOIN 
    metadata.optcg_sets s ON m.set_id = s.set_id
  LEFT JOIN 
    historical_pokemon_card_prices.historical_card_prices hcp 
    ON m.unique_id = hcp.unique_id
  LEFT JOIN (
      SELECT 
        unique_id, 
        MAX(updatedAt) as latestUpdate
      FROM 
        historical_pokemon_card_prices.historical_card_prices
      GROUP BY 
        unique_id
  ) latest_prices 
    ON hcp.unique_id = latest_prices.unique_id AND hcp.updatedAt = latest_prices.latestUpdate
  WHERE 
    m.unique_id = ?;
  `;

  pool.query(query, [uniqueId], (err, results) => {
    if (err) {
      console.error("Error executing query", err);
      return res.status(500).json({ error: "Internal server error" });
    }

    if (results.length === 0) {
      return res.status(404).json({ error: "No record found for given uniqueId" });
    }

    const data = results[0];
    res.json(data);
  });
});

router.get("/get-unique-sets-by-user", (req, res) => {
  const userId = req.query.userId;

  if (!userId) {
    return res.status(400).json({ error: "userId query parameter is required." });
  }

  const query = `
    SELECT DISTINCT set_name, set_releaseDate, set_printedTotal FROM (
      SELECT 
        s.set_name, 
        s.set_releaseDate, 
        s.set_printedTotal
      FROM 
        user_portfolios.UserPortfolio u
      JOIN 
        metadata.pkmn_card_metadata m ON u.unique_id = m.unique_id
      JOIN 
        metadata.sets s ON m.set_id = s.set_id
      WHERE 
        u.user_id = ?
      UNION
      SELECT 
        s.set_name, 
        s.set_releaseDate, 
        s.set_printedTotal
      FROM 
        user_portfolios.UserPortfolio u
      JOIN 
        metadata.optcg_metadata m ON u.unique_id = m.unique_id
      JOIN 
        metadata.optcg_sets s ON m.set_id = s.set_id
      WHERE 
        u.user_id = ?
    ) AS combined_sets
    ORDER BY set_name ASC;
  `;

  pool.query(query, [userId, userId], (err, results) => {
    if (err) {
      console.error("Error executing query:", err);
      return res.status(500).json({ error: "An error occurred while fetching unique sets" });
    }
    res.json(results);
  });
});

module.exports = router;