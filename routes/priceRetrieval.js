const express = require("express");
const router = express.Router();
const { pool } = require("../utils/database");


router.get("/retrieve-prices/:unique_id", (req, res) => {
  const uniqueId = req.params.unique_id;
  const sql = `
        SELECT
            unique_id,
            updatedAt, 
            normal_market,
            holofoil_market,
            reverseHolofoil_market,
            firstEditionHolofoil_market,
            firstEditionNormal_market
        FROM 
            historical_pokemon_card_prices.historical_card_prices 
        WHERE 
            unique_id = ? 
            AND (
                normal_market IS NOT NULL OR 
                holofoil_market IS NOT NULL OR 
                reverseHolofoil_market IS NOT NULL OR 
                firstEditionHolofoil_market IS NOT NULL OR 
                firstEditionNormal_market IS NOT NULL
            )
        ORDER BY 
            updatedAt DESC
        LIMIT 1
    `;

  pool.query(sql, [uniqueId], (error, results) => {
    if (error) {
      console.error("Error fetching prices:", error);
      res.status(500).json({ error: "Internal server error" });
      return;
    }

    if (results.length > 0) {
      const row = results[0];
      const filteredData = {};
      for (const key in row) {
        if (row[key] !== null) {
          filteredData[key] = row[key];
        }
      }
      res.json(filteredData);
    } else {
      res.status(404).json({ message: "No data found for the given unique_id." });
    }
  });
});

router.get("/retrieve-prices-card-chart/:unique_id", (req, res) => {
  const uniqueId = req.params.unique_id;
  console.log("Received unique_id:", uniqueId);

  const sql = `
        SELECT
            unique_id,
            updatedAt, 
            normal_market,
            holofoil_market,
            reverseHolofoil_market,
            firstEditionHolofoil_market,
            firstEditionNormal_market
        FROM 
            historical_pokemon_card_prices.historical_card_prices 
        WHERE 
            unique_id = ? 
            AND (
                normal_market IS NOT NULL OR 
                holofoil_market IS NOT NULL OR 
                reverseHolofoil_market IS NOT NULL OR 
                firstEditionHolofoil_market IS NOT NULL OR 
                firstEditionNormal_market IS NOT NULL
            )
            AND updatedAt >= CURDATE() - INTERVAL 3 MONTH
        ORDER BY 
            updatedAt ASC
    `;

  pool.query(sql, [uniqueId], (error, results) => {
    if (error) {
      console.error("Error fetching prices:", error);
      res.status(500).json({ error: "Internal server error" });
      return;
    }

    const responseArray = results.map((row) => {
      const filteredData = {};
      for (const key in row) {
        if (row[key] !== null) {
          filteredData[key] = row[key];
        }
      }
      return filteredData;
    });

    console.log("Response data:", responseArray);

    res.json(responseArray);
  });
});

router.get("/retrieve-prices-card-list/:unique_ids", (req, res) => {
  const uniqueIds = req.params.unique_ids.split(",").map((id) => id.trim());

  const placeholders = uniqueIds.map(() => "?").join(", ");
  const sql = `
    SELECT
      unique_id,
      updatedAt, 
      normal_market,
      holofoil_market,
      reverseHolofoil_market,
      firstEditionHolofoil_market,
      firstEditionNormal_market
    FROM 
      historical_pokemon_card_prices.historical_card_prices 
    WHERE 
      unique_id IN (${placeholders})
      AND (
        normal_market IS NOT NULL OR 
        holofoil_market IS NOT NULL OR 
        reverseHolofoil_market IS NOT NULL OR 
        firstEditionHolofoil_market IS NOT NULL OR 
        firstEditionNormal_market IS NOT NULL
      )
    ORDER BY 
      updatedAt DESC;
  `;

  pool.query(sql, uniqueIds, (error, results) => {
    if (error) {
      console.error("Error fetching prices:", error);
      res.status(500).json({ error: "Internal server error" });
      return;
    }

    const responseMap = {};
    results.forEach((row) => {
      if (!responseMap[row.unique_id]) {
        responseMap[row.unique_id] = {};
        for (const key in row) {
          if (row[key] !== null) {
            responseMap[row.unique_id][key] = row[key];
          }
        }
      }
    });

    res.json(responseMap);
  });
});

router.get("/set-click-screen-details/:setId", (req, res) => {
  const setId = req.params.setId;
  const sortField = req.query.sortField || "number";
  const sortOrder = req.query.sortOrder || "ASC";

  let orderByClause;
  if (sortField === "number") {
    orderByClause = `CAST(pcm.number AS UNSIGNED) ${sortOrder}`;
  } else {
    orderByClause = `${sortField} ${sortOrder}`;
  }

  const query = `
    SELECT 
      pcm.unique_id, 
      pcm.name, 
      pcm.number, 
      pcm.rarity, 
      pcm.types, 
      hcp.updatedAt, 
      hcp.normal_market,
      hcp.holofoil_market,
      hcp.reverseHolofoil_market,
      hcp.firstEditionHolofoil_market,
      hcp.firstEditionNormal_market
    FROM 
      pkmn_card_metadata pcm
    LEFT JOIN 
      historical_pokemon_card_prices.historical_card_prices hcp
      ON pcm.unique_id = hcp.unique_id
    LEFT JOIN (
        SELECT unique_id, MAX(updatedAt) as latestUpdate
        FROM historical_pokemon_card_prices.historical_card_prices
        GROUP BY unique_id
    ) latest_prices 
      ON hcp.unique_id = latest_prices.unique_id AND hcp.updatedAt = latest_prices.latestUpdate
    WHERE 
      pcm.set_id = ?
    ORDER BY 
      ${orderByClause};
  `;

  pool.query(query, [setId], (err, results) => {
    if (err) {
      console.error(err);
      res.status(500).send("An error occurred");
      return;
    }

    const detailsMap = {};
    results.forEach((result) => {
      detailsMap[result.unique_id] = {
        name: result.name,
        number: result.number,
        rarity: result.rarity,
        types: result.types,
        updatedAt: result.updatedAt,
        priceData: {
          normal_market: result.normal_market != null ? result.normal_market : undefined,
          holofoil_market: result.holofoil_market != null ? result.holofoil_market : undefined,
          reverseHolofoil_market: result.reverseHolofoil_market != null ? result.reverseHolofoil_market : undefined,
          firstEditionHolofoil_market: result.firstEditionHolofoil_market != null ? result.firstEditionHolofoil_market : undefined,
          firstEditionNormal_market: result.firstEditionNormal_market != null ? result.firstEditionNormal_market : undefined,
        },
      };
    });

    res.json(detailsMap);
  });
});

router.get("/optcg-set-click-screen-details/:setId", (req, res) => {
  const setId = req.params.setId;
  const sortField = req.query.sortField || "number";
  const sortOrder = req.query.sortOrder || "ASC";

  let orderByClause;
  if (sortField === "number") {
    orderByClause = `CAST(om.number AS UNSIGNED) ${sortOrder}`;
  } else {
    orderByClause = `${sortField} ${sortOrder}`;
  }

  const query = `
    SELECT 
      om.unique_id, 
      om.name, 
      om.cost, 
      om.color, 
      om.rarity, 
      om.number,
      hcp.updatedAt, 
      hcp.normal_market,
      hcp.holofoil_market,
      hcp.reverseHolofoil_market,
      hcp.firstEditionHolofoil_market,
      hcp.firstEditionNormal_market
    FROM 
      optcg_metadata om
    LEFT JOIN 
      historical_pokemon_card_prices.historical_card_prices hcp
      ON om.unique_id = hcp.unique_id
    LEFT JOIN (
        SELECT unique_id, MAX(updatedAt) as latestUpdate
        FROM historical_pokemon_card_prices.historical_card_prices
        GROUP BY unique_id
    ) latest_prices 
      ON hcp.unique_id = latest_prices.unique_id AND hcp.updatedAt = latest_prices.latestUpdate
    WHERE 
      om.set_id = ?
    ORDER BY 
      ${orderByClause};
  `;

  pool.query(query, [setId], (err, results) => {
    if (err) {
      console.error(err);
      res.status(500).send("An error occurred");
      return;
    }

    const detailsMap = {};
    results.forEach((result) => {
      detailsMap[result.unique_id] = {
        name: result.name,
        cost: result.cost,
        color: result.color,
        rarity: result.rarity,
        number: result.number,
        updatedAt: result.updatedAt,
        priceData: {
          normal_market: result.normal_market != null ? result.normal_market : undefined,
          holofoil_market: result.holofoil_market != null ? result.holofoil_market : undefined,
          reverseHolofoil_market: result.reverseHolofoil_market != null ? result.reverseHolofoil_market : undefined,
          firstEditionHolofoil_market: result.firstEditionHolofoil_market != null ? result.firstEditionHolofoil_market : undefined,
          firstEditionNormal_market: result.firstEditionNormal_market != null ? result.firstEditionNormal_market : undefined,
        },
      };
    });

    res.json(detailsMap);
  });
});

module.exports = router;