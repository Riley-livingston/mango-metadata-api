const express = require("express");
const router = express.Router();

// Import the database pool from index.js
const pool = require("./index").pool;

router.post("/combined-portfolio-update", (req, res) => {
  console.log(
    "Received combined-portfolio-update request with body:",
    req.body
  );

  const {
    user_id,
    unique_id,
    price_type,
    count,
    image_id,
    part_ids,
  } = req.body;

  if (
    !user_id ||
    !unique_id ||
    !price_type ||
    !image_id ||
    !part_ids ||
    !Array.isArray(part_ids)
  ) {
    console.log("Invalid request parameters", req.body);
    return res.status(400).json({ error: "Invalid request parameters" });
  }

  const itemCount = count || 1;

  pool.getConnection((err, db) => {
    if (err) {
      console.error("Error getting connection from pool", err);
      return res.status(500).json({ error: "Internal server error" });
    }

    db.beginTransaction((err) => {
      if (err) {
        console.error("Error starting transaction", err);
        db.release();
        return res.status(500).json({ error: "Internal server error" });
      }
      console.log("Transaction started for user:", user_id);

      const rollback = (error) => {
        console.error("Transaction error, rolling back. Error:", error);
        db.rollback(() => {
          db.release();
          return res.status(500).json({ error: "Internal server error" });
        });
      };

      const userPortfolioQuery = `
        INSERT INTO user_portfolios.UserPortfolio (user_id, unique_id, price_type, count)
        VALUES (?, ?, ?, ?) 
        ON DUPLICATE KEY UPDATE count = count + VALUES(count);
      `;
      console.log("Executing UserPortfolio update query");
      db.query(
        userPortfolioQuery,
        [user_id, unique_id, price_type, itemCount],
        (err, results) => {
          if (err) {
            console.error("Error executing UserPortfolio update query", err);
            return rollback(err);
          }
          console.log(
            "UserPortfolio update query executed successfully",
            results
          );

          const updateWholeImageQuery = `
            UPDATE user_images.user_whole_images 
            SET added = 1 
            WHERE user_id = ? AND image_id = ?;
          `;
          console.log("Executing user_whole_images update query");
          db.query(
            updateWholeImageQuery,
            [user_id, image_id],
            (err, results) => {
              if (err) {
                console.error(
                  "Error executing user_whole_images update query",
                  err
                );
                return rollback(err);
              }
              console.log(
                "user_whole_images update query executed successfully",
                results
              );

              if (part_ids.length === 0) {
                db.commit((err) => {
                  if (err) {
                    console.error("Error committing transaction", err);
                    return rollback(err);
                  }
                  console.log("Transaction committed successfully");
                  db.release();
                  return res.json({
                    message:
                      "Successfully updated portfolio and 'added' status",
                  });
                });
              } else {
                let completedQueries = 0;
                part_ids.forEach((partId) => {
                  const updateSegmentedImagesQuery = `
                    UPDATE user_images.segmented_images
                    SET added = 1
                    WHERE user_id = ? AND image_id = ? AND part_id = ?;
                  `;
                  console.log(
                    "Executing segmented_images update query for part_id:",
                    partId
                  );
                  db.query(
                    updateSegmentedImagesQuery,
                    [user_id, image_id, partId],
                    (err, results) => {
                      if (err) {
                        console.error(
                          "Error executing segmented_images update query for part_id:",
                          partId,
                          err
                        );
                        return rollback(err);
                      }
                      console.log(
                        "segmented_images update query executed successfully for part_id:",
                        partId,
                        results
                      );

                      completedQueries++;
                      if (completedQueries === part_ids.length) {
                        db.commit((err) => {
                          if (err) {
                            console.error(
                              "Error committing transaction",
                              err
                            );
                            return rollback(err);
                          }
                          console.log(
                            "Transaction committed successfully after updating all part_ids"
                          );
                          db.release();
                          res.json({
                            message:
                              "Successfully updated portfolio and 'added' status",
                          });
                        });
                      }
                    }
                  );
                });
              }
            }
          );
        }
      );
    });
  });
});

router.post("/queue-click-table-update", (req, res) => {
  const { user_id, image_id, part_ids, unique_ids, price_types } = req.body;

  if (
    !user_id ||
    !image_id ||
    !Array.isArray(part_ids) ||
    !Array.isArray(unique_ids) ||
    !Array.isArray(price_types) ||
    part_ids.length !== unique_ids.length ||
    part_ids.length !== price_types.length
  ) {
    return res.status(400).json({ error: "Invalid request parameters" });
  }

  pool.getConnection((err, db) => {
    if (err) {
      console.error("Error getting connection from pool", err);
      return res.status(500).json({ error: "Internal server error" });
    }

    db.beginTransaction((err) => {
      if (err) {
        console.error("Error starting transaction", err);
        db.release();
        return res.status(500).json({ error: "Internal server error" });
      }

      const updateWholeImageQuery = `
        INSERT INTO user_images.user_whole_images (image_id, user_id, created_at)
        VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE created_at = VALUES(created_at);
      `;
      db.query(
        updateWholeImageQuery,
        [image_id, user_id, new Date().toISOString()],
        (err, results) => {
          if (err) {
            db.rollback(() => {
              console.error("Error updating user_whole_images", err);
              db.release();
              return res.status(500).json({ error: "Internal server error" });
            });
            return;
          }

          const updateSegmentedImagesPromises = part_ids.map((part_id, index) => {
            const unique_id = unique_ids[index];
            const price_type = price_types[index];
            const updateSegmentedImageQuery = `
              INSERT INTO user_images.segmented_images (part_id, image_id, user_id, unique_id, created_at, price_type)
              VALUES (?, ?, ?, ?, ?, ?)
              ON DUPLICATE KEY UPDATE created_at = VALUES(created_at), price_type = VALUES(price_type);
            `;
            return new Promise((resolve, reject) => {
              db.query(
                updateSegmentedImageQuery,
                [
                  part_id,
                  image_id,
                  user_id,
                  unique_id,
                  new Date().toISOString(),
                  price_type,
                ],
                (err, results) => {
                  if (err) {
                    reject(err);
                  } else {
                    resolve(results);
                  }
                }
              );
            });
          });

          Promise.all(updateSegmentedImagesPromises)
            .then(() => {
              db.commit((err) => {
                if (err) {
                  db.rollback(() => {
                    console.error("Error committing transaction", err);
                    db.release();
                    return res
                      .status(500)
                      .json({ error: "Internal server error" });
                  });
                  return;
                }
                db.release();
                res.json({ message: "Successfully updated image data" });
              });
            })
            .catch((err) => {
              db.rollback(() => {
                console.error("Error updating segmented_images", err);
                db.release();
                return res.status(500).json({ error: "Internal server error" });
              });
            });
        }
      );
    });
  });
});

router.get("/get-user-portfolio", (req, res) => {
  const user_id = req.query.user_id;
  const sortBy = req.query.sortBy;
  const sortOrder = req.query.sortOrder === "desc" ? "DESC" : "ASC";
  const timestamp = req.query.timestamp;
  const search = req.query.search;

  if (!user_id) {
    return res
      .status(400)
      .json({ error: "user_id query parameter is required." });
  }

  let query = `
  WITH PriceAverages AS (
    SELECT 
        unique_id,
        AVG(average_price) AS average_price
    FROM (
        SELECT 
            unique_id,
            (COALESCE(normal_low, 0) + COALESCE(normal_high, 0) + COALESCE(normal_market, 0) + 
            COALESCE(holofoil_low, 0) + COALESCE(holofoil_high, 0) + COALESCE(holofoil_market, 0) + 
            COALESCE(reverseHolofoil_low, 0) + COALESCE(reverseHolofoil_high, 0) + COALESCE(reverseHolofoil_market, 0) + 
            COALESCE(firstEditionHolofoil_low, 0) + COALESCE(firstEditionHolofoil_high, 0) + COALESCE(firstEditionHolofoil_market, 0) +
            COALESCE(firstEditionNormal_low, 0) + COALESCE(firstEditionNormal_high, 0) + COALESCE(firstEditionNormal_market, 0)) /
            NULLIF((CASE WHEN normal_low IS NOT NULL THEN 1 ELSE 0 END +
                CASE WHEN normal_high IS NOT NULL THEN 1 ELSE 0 END +
                CASE WHEN normal_market IS NOT NULL THEN 1 ELSE 0 END +
                CASE WHEN holofoil_low IS NOT NULL THEN 1 ELSE 0 END +
                CASE WHEN holofoil_high IS NOT NULL THEN 1 ELSE 0 END +
                CASE WHEN holofoil_market IS NOT NULL THEN 1 ELSE 0 END +
                CASE WHEN reverseHolofoil_low IS NOT NULL THEN 1 ELSE 0 END +
                CASE WHEN reverseHolofoil_high IS NOT NULL THEN 1 ELSE 0 END +
                CASE WHEN reverseHolofoil_market IS NOT NULL THEN 1 ELSE 0 END +
                CASE WHEN firstEditionHolofoil_low IS NOT NULL THEN 1 ELSE 0 END +
                CASE WHEN firstEditionHolofoil_high IS NOT NULL THEN 1 ELSE 0 END +
                CASE WHEN firstEditionHolofoil_market IS NOT NULL THEN 1 ELSE 0 END +
                CASE WHEN firstEditionNormal_low IS NOT NULL THEN 1 ELSE 0 END +
                CASE WHEN firstEditionNormal_high IS NOT NULL THEN 1 ELSE 0 END +
                CASE WHEN firstEditionNormal_market IS NOT NULL THEN 1 ELSE 0 END), 0) AS average_price
        FROM historical_pokemon_card_prices.historical_card_prices
        WHERE updatedAt >= NOW() - INTERVAL 3 DAY
    ) AS subquery
    GROUP BY unique_id
)
SELECT 
    up.unique_id,
    up.count,
    up.timestamp,
    m.name,
    m.set_name,
    m.number,
    m.rarity,
    COALESCE(m.types, '') AS types,
    m.set_releaseDate,
    COALESCE(m.artist, '') AS artist,
    ROUND(AVG(pa.average_price), 2) AS median
FROM user_portfolios.UserPortfolio AS up
LEFT JOIN (
    SELECT 
        m.unique_id, 
        m.name, 
        s.set_name, 
        m.number, 
        m.rarity, 
        m.types, 
        s.set_releaseDate, 
        m.artist, 
        'pkmn' AS source
    FROM metadata.pkmn_card_metadata AS m
    JOIN metadata.sets AS s ON m.set_id = s.set_id
    UNION ALL
    SELECT 
        m.unique_id, 
        m.name, 
        s.set_name, 
        m.number, 
        m.rarity, 
        NULL AS types, 
        s.set_releaseDate, 
        NULL AS artist, 
        'optcg' AS source
    FROM metadata.optcg_metadata AS m
    JOIN metadata.optcg_sets AS s ON m.set_id = s.set_id
) AS m ON up.unique_id = m.unique_id
LEFT JOIN historical_pokemon_card_prices.historical_card_prices AS hcp ON up.unique_id = hcp.unique_id
LEFT JOIN PriceAverages AS pa ON up.unique_id = pa.unique_id
WHERE up.user_id = ?
GROUP BY up.unique_id, up.count, up.timestamp, m.name, m.set_name, m.number, m.rarity, m.types, m.set_releaseDate, m.artist
  `;
  
  const queryParams = [user_id];

  if (timestamp) {
    query += " AND up.timestamp > ?";
    queryParams.push(timestamp);
  }

  if (search) {
    query += " AND (m.name LIKE ? OR m.set_name LIKE ?)";
    const searchPattern = `%${search}%`;
    queryParams.push(searchPattern, searchPattern);
  }

  const validSortOptions = [
    "name",
    "set_name",
    "set_releaseDate",
    "median",
    "timestamp",
  ];
  if (sortBy && validSortOptions.includes(sortBy)) {
    query += ` ORDER BY ${sortBy} ${sortOrder}`;
  } else {
    query += ` ORDER BY up.timestamp DESC`;
  }

  pool.query(query, queryParams, (err, results) => {
    if (err) {
      console.error("Error executing query", err);
      return res.status(500).json({ error: "Internal server error" });
    }

    const portfolioItems = results.map((result) => ({
      unique_id: result.unique_id,
      count: result.count,
      timestamp: result.timestamp,
      name: result.name,
      set_name: result.set_name,
      number: result.number,
      rarity: result.rarity,
      types: result.types,
      set_releaseDate: result.set_releaseDate,
      artist: result.artist,
      median: result.median,
    }));

    res.json({ user_id, portfolioItems });
  });
});



router.post("/update-portfolio-count", (req, res) => {
  const { user_id, unique_id, operation, price_type } = req.body;

  pool.getConnection((err, db) => {
    if (err) {
      console.error("Error getting connection from pool", err);
      return res.status(500).json({ error: "Internal server error" });
    }

    db.beginTransaction((err) => {
      if (err) {
        console.error("Error starting transaction", err);
        db.release();
        return res.status(500).json({ error: "Internal server error" });
      }

      let updateQuery = `
        INSERT INTO user_portfolios.UserPortfolio (user_id, unique_id, count, price_type)
        VALUES (?, ?, 1, ?)
        ON DUPLICATE KEY UPDATE count = CASE
          WHEN ? = 'increment' THEN count + 1
          WHEN ? = 'decrement' THEN IF(count > 1, count - 1, 0)
          ELSE count
        END;
      `;

      db.query(
        updateQuery,
        [user_id, unique_id, price_type, operation, operation],
        (err, results) => {
          if (err) {
            console.error("Error executing update query", err);
            return db.rollback(() => {
              db.release();
              res.status(500).json({ error: "Internal server error" });
            });
          }

          let deleteQuery = `
            DELETE FROM user_portfolios.UserPortfolio 
            WHERE user_id = ? AND unique_id = ? AND price_type = ? AND count = 0;
          `;

          db.query(
            deleteQuery,
            [user_id, unique_id, price_type],
            (err, deleteResults) => {
              if (err) {
                console.error("Error executing delete query", err);
                return db.rollback(() => {
                  db.release();
                  res.status(500).json({ error: "Internal server error" });
                });
              }

              let fetchCountQuery = `
                SELECT count FROM user_portfolios.UserPortfolio 
                WHERE user_id = ? AND unique_id = ? AND price_type = ?;
              `;

              db.query(
                fetchCountQuery,
                [user_id, unique_id, price_type],
                (err, countResults) => {
                  if (err) {
                    console.error("Error fetching updated count", err);
                    return db.rollback(() => {
                      db.release();
                      res.status(500).json({ error: "Internal server error" });
                    });
                  }

                  let updatedCount = countResults[0]?.count || 0;

                  db.commit((err) => {
                    if (err) {
                      console.error("Error committing transaction", err);
                      return db.rollback(() => {
                        db.release();
                        res
                          .status(500)
                          .json({ error: "Error during transaction commit" });
                      });
                    }

                    db.release();
                    res.json({
                      message: `Successfully ${operation}ed portfolio count`,
                      count: updatedCount,
                    });
                  });
                }
              );
            }
          );
        }
      );
    });
  });
});

router.get("/get-unique-ids-by-set-and-user", (req, res) => {
  const { userId, setName } = req.query;

  if (!userId || !setName) {
    return res.status(400).send("userId and setName are required.");
  }

  const query = `
    SELECT DISTINCT unique_id, in_portfolio FROM (
      SELECT 
        m.unique_id, 
        CASE WHEN u.user_id IS NOT NULL THEN 1 ELSE 0 END AS in_portfolio
      FROM 
        metadata.pkmn_card_metadata m
      JOIN 
        metadata.sets s ON m.set_id = s.set_id
      LEFT JOIN 
        user_portfolios.UserPortfolio u ON u.unique_id = m.unique_id AND u.user_id = ?
      WHERE 
        s.set_name = ?
      UNION
      SELECT 
        m.unique_id, 
        CASE WHEN u.user_id IS NOT NULL THEN 1 ELSE 0 END AS in_portfolio
      FROM 
        metadata.optcg_metadata m
      JOIN 
        metadata.optcg_sets s ON m.set_id = s.set_id
      LEFT JOIN 
        user_portfolios.UserPortfolio u ON u.unique_id = m.unique_id AND u.user_id = ?
      WHERE 
        s.set_name = ?
    ) AS combined_results
  `;

  pool.query(query, [userId, setName, userId, setName], (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).send("An error occurred");
    }
    return res.json(results);
  });
});


router.get("/get-unique-ids-for-multiple-sets", (req, res) => {
  const { userId, setNames } = req.query;

  if (!userId || !setNames) {
    return res.status(400).send("userId and setNames are required.");
  }

  const setNameArray = setNames
    .split(",")
    .map((name) => decodeURIComponent(name));

  const query = `
    SELECT DISTINCT set_name, unique_id FROM (
      SELECT 
        s.set_name, 
        u.unique_id
      FROM 
        user_portfolios.UserPortfolio u
      JOIN 
        metadata.pkmn_card_metadata m ON u.unique_id = m.unique_id
      JOIN 
        metadata.sets s ON m.set_id = s.set_id
      WHERE 
        u.user_id = ? AND s.set_name IN (?)
      UNION
      SELECT 
        s.set_name, 
        u.unique_id
      FROM 
        user_portfolios.UserPortfolio u
      JOIN 
        metadata.optcg_metadata m ON u.unique_id = m.unique_id
      JOIN 
        metadata.optcg_sets s ON m.set_id = s.set_id
      WHERE 
        u.user_id = ? AND s.set_name IN (?)
    ) AS combined_results
  `;

  pool.query(query, [userId, setNameArray, userId, setNameArray], (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).send("An error occurred");
    }

    const groupedResults = results.reduce((acc, item) => {
      acc[item.set_name] = acc[item.set_name] || [];
      acc[item.set_name].push(item.unique_id);
      return acc;
    }, {});
    return res.json(groupedResults);
  });
});


router.get("/get-set-count-by-user", (req, res) => {
  const { user_id } = req.query;

  if (!user_id) {
    return res
      .status(400)
      .json({ error: "user_id query parameter is required." });
  }

  const query = `
    SELECT s.set_id, s.set_name, s.set_total, s.set_releaseDate, m.lang_eng, IFNULL(COUNT(u.unique_id), 0) as progress
    FROM metadata.pkmn_card_metadata m
    JOIN metadata.sets s ON m.set_id = s.set_id
    LEFT JOIN user_portfolios.UserPortfolio u ON m.unique_id = u.unique_id AND u.user_id = ?
    WHERE m.lang_eng = 1
    GROUP BY s.set_id, s.set_name, s.set_total, s.set_releaseDate, m.lang_eng;
  `;

  pool.query(query, [user_id], (err, results) => {
    if (err) {
      console.error("Error executing query", err);
      return res.status(500).json({ error: "Internal server error" });
    }
    res.json({ user_id, countsBySetId: results });
  });
});

router.get("/get-set-count-by-user-optcg", (req, res) => {
  const { user_id } = req.query;

  if (!user_id) {
    return res
      .status(400)
      .json({ error: "user_id query parameter is required." });
  }

  const query = `
    SELECT s.set_id, s.set_name, s.set_total, s.set_releaseDate, m.lang_eng, IFNULL(COUNT(u.unique_id), 0) as progress
    FROM metadata.optcg_metadata m
    JOIN metadata.optcg_sets s ON m.set_id = s.set_id
    LEFT JOIN user_portfolios.UserPortfolio u ON m.unique_id = u.unique_id AND u.user_id = ?
    WHERE m.lang_eng = 1
    GROUP BY s.set_id, s.set_name, s.set_total, s.set_releaseDate, m.lang_eng;
  `;

  pool.query(query, [user_id], (err, results) => {
    if (err) {
      console.error("Error executing query", err);
      return res.status(500).json({ error: "Internal server error" });
    }
    res.json({ user_id, countsBySetId: results });
  });
});

router.get("/get-set-count-by-user-jpn", (req, res) => {
  const { user_id } = req.query;

  if (!user_id) {
    return res
      .status(400)
      .json({ error: "user_id query parameter is required." });
  }

  const query = `
    SELECT s.set_id, s.set_name, s.set_total, s.set_releaseDate, m.lang_eng, IFNULL(COUNT(u.unique_id), 0) as progress
    FROM metadata.pkmn_card_metadata m
    JOIN metadata.sets s ON m.set_id = s.set_id
    LEFT JOIN user_portfolios.UserPortfolio u ON m.unique_id = u.unique_id AND u.user_id = ?
    WHERE m.lang_eng = 0
    GROUP BY s.set_id, s.set_name, s.set_total, s.set_releaseDate, m.lang_eng;
  `;

  pool.query(query, [user_id], (err, results) => {
    if (err) {
      console.error("Error executing query", err);
      return res.status(500).json({ error: "Internal server error" });
    }
    res.json({ user_id, countsBySetId: results });
  });
});

router.get("/get-name-id-and-set-by-user", (req, res) => {
  const user_id = req.query.user_id;

  if (!user_id) {
    return res.status(400).json({ error: "user_id query parameter is required." });
  }

  const query = `
  SELECT 
    COALESCE(m.name, om.name) AS name, 
    COALESCE(s.set_name, os.set_name) AS set_name,
    COALESCE(m.number, om.number) AS number,
    u.unique_id, 
    u.count,
    MAX(h.updatedAt) AS latestUpdate, 
    COALESCE(MAX(h.normal_market), MAX(h.holofoil_market), MAX(h.reverseHolofoil_market), 
             MAX(h.firstEditionHolofoil_market), MAX(h.firstEditionNormal_market)) AS market_price
  FROM user_portfolios.UserPortfolio u
  LEFT JOIN metadata.pkmn_card_metadata m ON u.unique_id = m.unique_id
  LEFT JOIN metadata.sets s ON m.set_id = s.set_id
  LEFT JOIN metadata.optcg_metadata om ON u.unique_id = om.unique_id
  LEFT JOIN metadata.optcg_sets os ON om.set_id = os.set_id
  LEFT JOIN historical_pokemon_card_prices.historical_card_prices h ON u.unique_id = h.unique_id
  WHERE u.user_id = ? 
    AND COALESCE(h.normal_market, h.holofoil_market, h.reverseHolofoil_market, 
                 h.firstEditionHolofoil_market, h.firstEditionNormal_market) IS NOT NULL
  GROUP BY u.unique_id, name, set_name, u.count
  ORDER BY market_price DESC, latestUpdate DESC 
  LIMIT 10;
  `;

  pool.query(query, [user_id], (err, results) => {
    if (err) {
      console.error("Error executing query", err);
      return res.status(500).json({ error: "Internal server error" });
    }

    res.json({ user_id, results });
  });
});
router.get("/get-daily-portfolio-movers", (req, res) => {
  const { user_id } = req.query;

  if (!user_id) {
    return res.status(400).json({ error: "user_id query parameter is required." });
  }

  const query = `
  SELECT 
    COALESCE(m.name, om.name) AS name, 
    COALESCE(s.set_name, os.set_name) AS set_name,
    COALESCE(m.number, om.number) AS number,
    u.unique_id, 
    latestDate AS latestUpdate,
    COALESCE(latest.normal_market, latest.holofoil_market, latest.reverseHolofoil_market, 
             latest.firstEditionHolofoil_market, latest.firstEditionNormal_market) AS current_price,
    COALESCE(previous.normal_market, previous.holofoil_market, previous.reverseHolofoil_market, 
             previous.firstEditionHolofoil_market, previous.firstEditionNormal_market) AS price_24hrs_ago,
    ROUND(
      (
        COALESCE(latest.normal_market, latest.holofoil_market, latest.reverseHolofoil_market, 
                 latest.firstEditionHolofoil_market, latest.firstEditionNormal_market) -
        COALESCE(previous.normal_market, previous.holofoil_market, previous.reverseHolofoil_market, 
                 previous.firstEditionHolofoil_market, previous.firstEditionNormal_market)
      ), 2
    ) AS dollar_change,
    ROUND(
      (
        (
          COALESCE(latest.normal_market, latest.holofoil_market, latest.reverseHolofoil_market, 
                   latest.firstEditionHolofoil_market, latest.firstEditionNormal_market) -
          COALESCE(previous.normal_market, previous.holofoil_market, previous.reverseHolofoil_market, 
                   previous.firstEditionHolofoil_market, previous.firstEditionNormal_market)
        ) /
        COALESCE(previous.normal_market, previous.holofoil_market, previous.reverseHolofoil_market, 
                 previous.firstEditionHolofoil_market, previous.firstEditionNormal_market) * 100
      ), 2
    ) AS percent_change
  FROM user_portfolios.UserPortfolio u
  LEFT JOIN metadata.pkmn_card_metadata m ON u.unique_id = m.unique_id
  LEFT JOIN metadata.sets s ON m.set_id = s.set_id
  LEFT JOIN metadata.optcg_metadata om ON u.unique_id = om.unique_id
  LEFT JOIN metadata.optcg_sets os ON om.set_id = os.set_id
  JOIN (
    SELECT unique_id, MAX(updatedAt) AS latestDate
    FROM historical_pokemon_card_prices.historical_card_prices
    GROUP BY unique_id
  ) AS dates ON u.unique_id = dates.unique_id
  LEFT JOIN historical_pokemon_card_prices.historical_card_prices latest ON u.unique_id = latest.unique_id AND dates.latestDate = latest.updatedAt
  LEFT JOIN historical_pokemon_card_prices.historical_card_prices previous ON u.unique_id = previous.unique_id AND DATE(latest.updatedAt) = DATE(previous.updatedAt) + INTERVAL 1 DAY
  WHERE u.user_id = ?
    AND COALESCE(latest.normal_market, latest.holofoil_market, latest.reverseHolofoil_market, 
                 latest.firstEditionHolofoil_market, latest.firstEditionNormal_market) IS NOT NULL
  GROUP BY u.unique_id, name, set_name
  HAVING current_price >= 1
  ORDER BY ABS(percent_change) DESC
  LIMIT 10;
  `;

  pool.query(query, [user_id], (err, results) => {
    if (err) {
      console.error("Error executing query", err);
      return res.status(500).json({ error: "Internal server error", details: err.message });
    }
    console.log("Query results:", results);
    res.json({ user_id, results: results || [] });
  });
});

router.get("/get-weekly-portfolio-movers", (req, res) => {
  const { user_id } = req.query;

  if (!user_id) {
    return res.status(400).json({ error: "user_id query parameter is required." });
  }

  const query = `
  SELECT 
    COALESCE(m.name, om.name) AS name, 
    COALESCE(s.set_name, os.set_name) AS set_name,
    COALESCE(m.number, om.number) AS number,
    u.unique_id, 
    latestDate AS latestUpdate,
    COALESCE(latest.normal_market, latest.holofoil_market, latest.reverseHolofoil_market, 
             latest.firstEditionHolofoil_market, latest.firstEditionNormal_market) AS current_price,
    COALESCE(previous.normal_market, previous.holofoil_market, previous.reverseHolofoil_market, 
             previous.firstEditionHolofoil_market, previous.firstEditionNormal_market) AS price_7_days_ago,
    ROUND(
      (
        COALESCE(latest.normal_market, latest.holofoil_market, latest.reverseHolofoil_market, 
                 latest.firstEditionHolofoil_market, latest.firstEditionNormal_market) -
        COALESCE(previous.normal_market, previous.holofoil_market, previous.reverseHolofoil_market, 
                 previous.firstEditionHolofoil_market, previous.firstEditionNormal_market)
      ), 2
    ) AS dollar_change,
    ROUND(
      (
        (
          COALESCE(latest.normal_market, latest.holofoil_market, latest.reverseHolofoil_market, 
                   latest.firstEditionHolofoil_market, latest.firstEditionNormal_market) -
          COALESCE(previous.normal_market, previous.holofoil_market, previous.reverseHolofoil_market, 
                   previous.firstEditionHolofoil_market, previous.firstEditionNormal_market)
        ) /
        COALESCE(previous.normal_market, previous.holofoil_market, previous.reverseHolofoil_market, 
                 previous.firstEditionHolofoil_market, previous.firstEditionNormal_market) * 100
      ), 2
    ) AS percent_change
  FROM user_portfolios.UserPortfolio u
  LEFT JOIN metadata.pkmn_card_metadata m ON u.unique_id = m.unique_id
  LEFT JOIN metadata.sets s ON m.set_id = s.set_id
  LEFT JOIN metadata.optcg_metadata om ON u.unique_id = om.unique_id
  LEFT JOIN metadata.optcg_sets os ON om.set_id = os.set_id
  JOIN (
    SELECT unique_id, MAX(updatedAt) AS latestDate
    FROM historical_pokemon_card_prices.historical_card_prices
    GROUP BY unique_id
  ) AS dates ON u.unique_id = dates.unique_id
  LEFT JOIN historical_pokemon_card_prices.historical_card_prices latest ON u.unique_id = latest.unique_id AND dates.latestDate = latest.updatedAt
  LEFT JOIN historical_pokemon_card_prices.historical_card_prices previous ON u.unique_id = previous.unique_id AND DATE(latest.updatedAt) = DATE(previous.updatedAt) + INTERVAL 7 DAY
  WHERE u.user_id = ?
    AND COALESCE(latest.normal_market, latest.holofoil_market, latest.reverseHolofoil_market, 
                 latest.firstEditionHolofoil_market, latest.firstEditionNormal_market) IS NOT NULL
  GROUP BY u.unique_id, name, set_name
  HAVING current_price >= 1
  ORDER BY ABS(percent_change) DESC
  LIMIT 10;
  `;

  pool.query(query, [user_id], (err, results) => {
    if (err) {
      console.error("Error executing query", err);
      return res.status(500).json({ error: "Internal server error", details: err.message });
    }
    console.log("Query results:", results);
    res.json({ user_id, results: results || [] });
  });
});


router.get("/get-daily-movers", (req, res) => {
  const query = `
    SELECT 
      t.name, 
      t.set_name,
      t.number,
      t.unique_id, 
      t.updatedAt AS latestUpdate,
      t.current_price,
      t.price_24hrs_ago,
      t.dollar_change,
      t.percent_change
    FROM historical_pokemon_card_prices.pkmn_top_ten t
    WHERE t.updatedAt = (SELECT MAX(updatedAt) FROM historical_pokemon_card_prices.pkmn_top_ten)
    ORDER BY ABS(t.percent_change) DESC
    LIMIT 10;
  `;

  pool.query(query, (err, results) => {
    if (err) {
      console.error("Error executing query", err);
      return res.status(500).json({ error: "Internal server error", details: err.message });
    }
    console.log("Query results:", results);
    res.json({ results: results || [] });
  });
});

router.get("/get-daily-movers-optcg", (req, res) => {
  const query = `
    SELECT 
      t.name, 
      t.set_name,
      t.number,
      t.unique_id, 
      t.updatedAt AS latestUpdate,
      t.current_price,
      t.price_24hrs_ago,
      t.dollar_change,
      t.percent_change
    FROM historical_pokemon_card_prices.optcg_top_ten t
    WHERE t.updatedAt = (SELECT MAX(updatedAt) FROM historcial_pokemon_card_prices.optcg_top_ten)
    ORDER BY ABS(t.percent_change) DESC
    LIMIT 10;
  `;

  pool.query(query, (err, results) => {
    if (err) {
      console.error("Error executing query", err);
      return res.status(500).json({ error: "Internal server error", details: err.message });
    }
    console.log("Query results:", results);
    res.json({ results: results || [] });
  });
});


router.get("/get-user-portfolio-value", (req, res) => {
  const user_id = req.query.user_id;

  if (!user_id) {
    return res
      .status(400)
      .json({ error: "user_id query parameter is required." });
  }

  let query = `
  SELECT 
  up.user_id,
  hcp.updatedAt,
  SUM(
    CASE
      WHEN up.price_type = "normal" THEN COALESCE(hcp.normal_low, 0) * up.count
      WHEN up.price_type = "holofoil" THEN COALESCE(hcp.holofoil_low, 0) * up.count
      WHEN up.price_type = "reverseHolofoil" THEN COALESCE(hcp.reverseHolofoil_low, 0) * up.count
      WHEN up.price_type = "firstEditionHolofoil" THEN COALESCE(hcp.firstEditionHolofoil_low, 0) * up.count
      WHEN up.price_type = "firstEditionNormal" THEN COALESCE(hcp.firstEditionNormal_low, 0) * up.count
      ELSE 0
    END
  ) AS total_lowest_value,
  SUM(
    CASE
      WHEN up.price_type = "normal" THEN COALESCE(hcp.normal_high, 0) * up.count
      WHEN up.price_type = "holofoil" THEN COALESCE(hcp.holofoil_high, 0) * up.count
      WHEN up.price_type = "reverseHolofoil" THEN COALESCE(hcp.reverseHolofoil_high, 0) * up.count
      WHEN up.price_type = "firstEditionHolofoil" THEN COALESCE(hcp.firstEditionHolofoil_high, 0) * up.count
      WHEN up.price_type = "firstEditionNormal" THEN COALESCE(hcp.firstEditionNormal_high, 0) * up.count
      ELSE 0
    END
  ) AS total_highest_value
FROM 
  user_portfolios.UserPortfolio AS up
INNER JOIN 
  historical_pokemon_card_prices.historical_card_prices AS hcp ON up.unique_id = hcp.unique_id
WHERE 
  up.user_id = ?
GROUP BY 
  up.user_id, hcp.updatedAt;
`;

  pool.query(query, [user_id], (err, results) => {
    if (err) {
      console.error("Error executing query", err);
      return res.status(500).json({ error: "Internal server error" });
    }

    if (results.length === 0) {
      return res.status(404).json({ error: "User portfolio value not found." });
    }

    const portfolioValue = {
      user_id: results[0].user_id,
      total_lowest_value: results[0].total_lowest_value,
      total_highest_value: results[0].total_highest_value,
    };

    res.json(portfolioValue);
  });
});

router.get("/get-price-type-count", (req, res) => {
  const { user_id, unique_id, price_type } = req.query;

  const fetchCountQuery = `
    SELECT count FROM user_portfolios.UserPortfolio 
    WHERE user_id = ? AND unique_id = ? AND price_type = ?;
  `;

  pool.query(
    fetchCountQuery,
    [user_id, unique_id, price_type],
    (err, results) => {
      if (err) {
        console.error("Error fetching count", err);
        return res.status(500).json({ error: "Internal server error" });
      }

      if (results.length > 0) {
        let fetchedCount = results[0].count;
        res.json({
          message: "Successfully fetched portfolio count",
          count: fetchedCount,
        });
      } else {
        res.json({
          message: "No data found for the given criteria.",
          count: 0,
        });
      }
    }
  );
});

router.get("/user-portfolio-market-value-v2.0", (req, res) => {
  const user_id = req.query.user_id;

  const query = `
  WITH DatePrices AS (
    SELECT
        hcp.updatedAt,
        hcp.unique_id,
        CASE up.price_type
            WHEN 'normal' THEN hcp.normal_market
            WHEN 'holofoil' THEN hcp.holofoil_market
            WHEN 'reverseHolofoil' THEN hcp.reverseHolofoil_market
            WHEN 'firstEditionNormal' THEN hcp.firstEditionNormal_market
            WHEN 'firstEditionHolofoil' THEN hcp.firstEditionHolofoil_market
        END AS market_price,
        up.count,
        up.user_id
    FROM
        user_portfolios.UserPortfolio up
    JOIN
        historical_pokemon_card_prices.historical_card_prices hcp ON up.unique_id = hcp.unique_id
    WHERE
        up.user_id = ?
        AND up.price_type IN ('normal', 'holofoil', 'reverseHolofoil', 'firstEditionNormal', 'firstEditionHolofoil')
),
TotalPortfolioValues AS (
    SELECT
        dp.updatedAt,
        dp.user_id,
        SUM(dp.market_price * dp.count) AS total_portfolio_value
    FROM
        DatePrices dp
    GROUP BY
        dp.updatedAt, dp.user_id
)
SELECT
    tpv.updatedAt,
    tpv.user_id,
    tpv.total_portfolio_value
FROM
    TotalPortfolioValues tpv
ORDER BY
    tpv.updatedAt ASC, tpv.user_id;
  `;

  pool.query(query, [user_id], (err, results) => {
    if (err) {
      console.error("Error executing query", err);
      return res.status(500).json({ error: "Internal server error" });
    }

    if (results.length === 0) {
      return res
        .status(404)
        .json({ error: "User portfolio values not found." });
    }

    const portfolioValues = results.map((result) => {
      return {
        updatedAt: result.updatedAt,
        total_market_value: result.total_portfolio_value,
        user_id: result.user_id,
      };
    });

    res.json(portfolioValues);
  });
});

router.get("/user-portfolio-market-value-v3.0", (req, res) => {
  const user_id = req.query.user_id;

  const query = `
    SELECT
      SUM(
        CASE up.price_type
          WHEN 'normal' THEN latest_prices.normal_market * up.count
          WHEN 'holofoil' THEN latest_prices.holofoil_market * up.count
          WHEN 'reverseHolofoil' THEN latest_prices.reverseHolofoil_market * up.count
          WHEN 'firstEditionNormal' THEN latest_prices.firstEditionNormal_market * up.count
          WHEN 'firstEditionHolofoil' THEN latest_prices.firstEditionHolofoil_market * up.count
        END
      ) AS total_market_value
    FROM
      user_portfolios.UserPortfolio up
    JOIN (
      SELECT 
        hcp1.unique_id,
        hcp1.normal_market,
        hcp1.holofoil_market,
        hcp1.reverseHolofoil_market,
        hcp1.firstEditionNormal_market,
        hcp1.firstEditionHolofoil_market
      FROM 
        historical_pokemon_card_prices.historical_card_prices hcp1
      INNER JOIN (
        SELECT 
          unique_id, 
          MAX(updatedAt) as latestUpdate
        FROM 
          historical_pokemon_card_prices.historical_card_prices
        GROUP BY 
          unique_id
      ) hcp2 ON hcp1.unique_id = hcp2.unique_id AND hcp1.updatedAt = hcp2.latestUpdate
    ) latest_prices ON up.unique_id = latest_prices.unique_id
    WHERE
      up.user_id = ?
      AND up.price_type IN ('normal', 'holofoil', 'reverseHolofoil', 'firstEditionNormal', 'firstEditionHolofoil');
  `;

  pool.query(query, [user_id], (err, results) => {
    if (err) {
      console.error("Error executing query", err);
      return res.status(500).json({ error: "Internal server error" });
    }

    if (results.length === 0 || results[0].total_market_value === null) {
      return res.status(404).json({ error: "User portfolio values not found." });
    }

    res.json({ total_market_value: results[0].total_market_value });
  });
});



router.get("/get-user-portfolio-count", (req, res) => {
  const user_id = req.query.user_id;

  if (!user_id) {
    return res
      .status(400)
      .json({ error: "user_id query parameter is required." });
  }

  const query = `
    SELECT SUM(count) AS totalCards
    FROM user_portfolios.UserPortfolio
    WHERE user_id = ?
  `;

  pool.query(query, [user_id], (err, results) => {
    if (err) {
      console.error('Error fetching total cards:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }

    if (results.length > 0) {
      res.json({ totalCards: results[0].totalCards });
    } else {
      res.status(404).json({ message: 'No cards found for this user' });
    }
  });
});

router.get("/has-data", (req, res) => {
  const user_id = req.query.user_id;

  if (!user_id) {
    return res.status(400).json({ error: "user_id query parameter is required." });
  }

  const query = `
    SELECT 1
    FROM user_portfolios.UserPortfolio
    WHERE user_id = ?
    LIMIT 1;
  `;

  pool.query(query, [user_id], (err, results) => {
    if (err) {
      console.error("Error executing query", err);
      return res.status(500).json({ error: "Internal server error" });
    }

    if (results.length > 0) {
      res.json({ hasData: true });
    } else {
      res.json({ hasData: false });
    }
  });
});

module.exports = router;
