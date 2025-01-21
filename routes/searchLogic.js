const express = require("express");
const router = express.Router();
const mysql = require('mysql'); // Import the mysql module
const { pool } = require("../utils/database"); // Updated import

router.get("/search", async (req, res) => {
  const searchTerm = req.query.term;

  if (!searchTerm) {
    return res.status(400).json({ error: "No search term provided" });
  }

  const escapedSearchTerm = mysql.escape(searchTerm);

  const query = `
    SELECT 
      m.unique_id, 
      m.name, 
      m.number, 
      s.set_total, 
      s.set_name, 
      s.set_releaseDate, 
      m.lang_eng,
      MATCH(m.name) AGAINST (${escapedSearchTerm} IN NATURAL LANGUAGE MODE) AS relevance_m,
      MATCH(s.set_name) AGAINST (${escapedSearchTerm} IN NATURAL LANGUAGE MODE) AS relevance_s
    FROM 
      metadata.pkmn_card_metadata m
    JOIN 
      metadata.sets s ON m.set_id = s.set_id
    WHERE 
      MATCH(m.name) AGAINST (${escapedSearchTerm} IN NATURAL LANGUAGE MODE)
      OR MATCH(s.set_name) AGAINST (${escapedSearchTerm} IN NATURAL LANGUAGE MODE)
    UNION ALL
    SELECT 
      m.unique_id, 
      m.name, 
      m.number, 
      s.set_total, 
      s.set_name, 
      s.set_releaseDate, 
      NULL AS lang_eng,
      MATCH(m.name) AGAINST (${escapedSearchTerm} IN NATURAL LANGUAGE MODE) AS relevance_m,
      MATCH(s.set_name) AGAINST (${escapedSearchTerm} IN NATURAL LANGUAGE MODE) AS relevance_s
    FROM 
      metadata.optcg_metadata m
    JOIN 
      metadata.optcg_sets s ON m.set_id = s.set_id
    WHERE 
      MATCH(m.name) AGAINST (${escapedSearchTerm} IN NATURAL LANGUAGE MODE)
      OR MATCH(s.set_name) AGAINST (${escapedSearchTerm} IN NATURAL LANGUAGE MODE)
    ORDER BY 
      relevance_m + relevance_s DESC;
  `;

  pool.query(query, (error, results, fields) => {
    if (error) {
      console.error(error);
      return res.status(500).json({ error: "Server error" });
    } else {
      res.json(results);
    }
  });
});

router.get("/count", async (req, res) => {
  const searchTerm = req.query.term;

  if (!searchTerm) {
    return res.status(400).json({ error: "No search term provided" });
  }

  const escapedSearchTerm = mysql.escape(searchTerm);

  const countQuery = `
    SELECT SUM(count) AS count FROM (
      SELECT COUNT(*) AS count
      FROM 
        metadata.pkmn_card_metadata m
      JOIN 
        metadata.sets s ON m.set_id = s.set_id
      WHERE 
        MATCH(m.name) AGAINST (${escapedSearchTerm} IN NATURAL LANGUAGE MODE)
        OR MATCH(s.set_name) AGAINST (${escapedSearchTerm} IN NATURAL LANGUAGE MODE)
      UNION ALL
      SELECT COUNT(*) AS count
      FROM 
        metadata.optcg_metadata m
      JOIN 
        metadata.optcg_sets s ON m.set_id = s.set_id
      WHERE 
        MATCH(m.name) AGAINST (${escapedSearchTerm} IN NATURAL LANGUAGE MODE)
        OR MATCH(s.set_name) AGAINST (${escapedSearchTerm} IN NATURAL LANGUAGE MODE)
    ) AS combined_count;
  `;

  pool.query(countQuery, (error, results, fields) => {
    if (error) {
      console.error(error);
      return res.status(500).json({ error: "Server error" });
    } else {
      const count = results[0].count;
      res.json({ count });
    }
  });
});

module.exports = router;
