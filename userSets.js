const express = require("express");
const router = express.Router();

// Import the database pool from index.js
const pool = require("./index").pool;

// Endpoint to create a set
router.post("/create_set", (req, res) => {
    const { user_id, user_set_name, criteria_column, criteria_value, lang_eng } = req.body;

    console.log('Received request:', req.body);

    if (criteria_value.length < 3) {
        return res.status(400).json({ error: "Criteria value must be at least 3 characters long." });
    }

    if (criteria_column !== 'name' && criteria_column !== 'artist') {
        return res.status(400).json({ error: "Invalid criteria column. It must be 'name' or 'artist'." });
    }

    let lang_eng_value;
    if (lang_eng === 1) {
        lang_eng_value = 1;
    } else if (lang_eng === 0) {
        lang_eng_value = 0;
    } else if (lang_eng === null) {
        lang_eng_value = null;
    }

    const validationQuery = `
        SELECT COUNT(*) AS count 
        FROM metadata.pkmn_card_metadata 
        WHERE ${criteria_column} LIKE ? ${lang_eng_value !== null ? `AND lang_eng = ${lang_eng_value}` : ''}
    `;
    const searchValue = `%${criteria_value}%`;

    pool.query(validationQuery, [searchValue], (err, result) => {
        if (err) {
            console.error("Error executing validation query:", err);
            return res.status(500).json({ error: err.message });
        }

        if (result[0].count < 2) {
            return res.status(400).json({ error: "Criteria value does not match enough records." });
        }

        const checkExistingQuery = `
            SELECT COUNT(*) AS count 
            FROM user_portfolios.user_sets 
            WHERE user_id = ? AND criteria_column = ? AND criteria_value = ? AND ${lang_eng_value !== null ? `lang_eng = ${lang_eng_value}` : 'lang_eng IS NULL'}
        `;

        pool.query(checkExistingQuery, [user_id, criteria_column, criteria_value], (err, result) => {
            if (err) {
                console.error("Error checking existing set:", err);
                return res.status(500).json({ error: err.message });
            }

            if (result[0].count > 0) {
                return res.status(400).json({ error: "A set with the same criteria already exists for this user." });
            }

            const insertQuery = `
                INSERT INTO user_portfolios.user_sets (user_id, user_set_name, criteria_column, criteria_value, lang_eng) 
                VALUES (?, ?, ?, ?, ?)
            `;

            pool.query(insertQuery, [user_id, user_set_name, criteria_column, criteria_value, lang_eng_value], (err, result) => {
                if (err) {
                    console.error("Error inserting into user_sets:", err);
                    return res.status(500).json({ error: err.message });
                }
                console.log('Set created successfully:', result);
                res.status(201).json({ message: "Set created successfully" });
            });
        });
    });
});

router.get("/get-custom-sets", (req, res) => {
    const { userId } = req.query;

    if (!userId) {
        return res.status(400).send("userId is required.");
    }

    const query = `
        SELECT 
            us.user_set_name, 
            us.criteria_column, 
            us.criteria_value, 
            us.lang_eng,
            COUNT(CASE WHEN up.user_id IS NOT NULL THEN 1 ELSE NULL END) AS user_count,
            COUNT(m.unique_id) AS total_count
        FROM user_portfolios.user_sets us
        LEFT JOIN metadata.pkmn_card_metadata m 
            ON (
            (us.criteria_column = 'name' AND m.name LIKE CONCAT('%', us.criteria_value, '%'))
            OR (us.criteria_column = 'artist' AND m.artist LIKE CONCAT('%', us.criteria_value, '%'))
            )
            AND (us.lang_eng IS NULL OR m.lang_eng = us.lang_eng)
        LEFT JOIN user_portfolios.UserPortfolio up 
            ON m.unique_id = up.unique_id AND up.user_id = ?
        WHERE us.user_id = ?
        GROUP BY us.user_set_name, us.criteria_column, us.criteria_value, us.lang_eng
    `;

    pool.query(query, [userId, userId], (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).send("An error occurred");
        }
        return res.json(results);
    });
});

router.get("/get-custom-set-unique-ids", (req, res) => {
    const { userId, setName } = req.query;

    if (!userId || !setName) {
        return res.status(400).send("userId and setName are required.");
    }

    const query = `
        SELECT 
            m.unique_id, 
            CASE WHEN up.user_id IS NOT NULL THEN 1 ELSE 0 END AS in_portfolio
        FROM user_portfolios.user_sets us
        JOIN metadata.pkmn_card_metadata m 
            ON (
            (us.criteria_column = 'name' AND m.name LIKE CONCAT('%', us.criteria_value, '%'))
            OR (us.criteria_column = 'artist' AND m.artist LIKE CONCAT('%', us.criteria_value, '%'))
            )
            AND (us.lang_eng IS NULL OR m.lang_eng = us.lang_eng)
        LEFT JOIN user_portfolios.UserPortfolio up 
            ON m.unique_id = up.unique_id AND up.user_id = ?
        WHERE us.user_id = ? AND us.user_set_name = ?
    `;

    pool.query(query, [userId, userId, setName], (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).send("An error occurred");
        }
        return res.json(results);
    });
});

router.delete("/delete_set", async (req, res) => {
    const { user_id, criteria_value } = req.body;

    console.log('Received delete request with user_id:', user_id, 'and criteria_value:', criteria_value);

    if (!user_id || !criteria_value) {
        return res.status(400).json({ error: "user_id and criteria_value are required." });
    }

    const deleteQuery = `
        DELETE FROM user_portfolios.user_sets
        WHERE user_id = ? AND criteria_value = ?;
    `;

    try {
        const result = await new Promise((resolve, reject) => {
            pool.query(deleteQuery, [user_id, criteria_value], (err, results) => {
                if (err) return reject(err);
                resolve(results);
            });
        });

        console.log('Query result:', result);

        const affectedRows = result.affectedRows !== undefined ? result.affectedRows : (result[0] && result[0].affectedRows);

        if (affectedRows > 0) {
            res.json({ message: "Custom set deleted successfully." });
        } else {
            res.status(404).json({ error: "Custom set not found." });
        }
    } catch (error) {
        console.error("Error deleting custom set:", error);
        res.status(500).json({ error: "Internal server error", details: error.message });
    }
});

module.exports = router;
