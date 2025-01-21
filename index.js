require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { errorHandler } = require('./middleware/errorHandler');
const { getConnection } = require('./utils/database');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/card-metadata', require('./routes/cardMetadata'));
app.use('/price-retrieval', require('./routes/priceRetrieval'));
app.use('/search-routes', require('./routes/searchLogic'));
app.use('/user-sets', require('./routes/userSets'));

// Error handling
app.use(errorHandler);

// Database connection test
getConnection()
  .then((connection) => {
    connection.release();
    console.log('Database connected successfully');
    
    // Start server
    app.listen(port, '0.0.0.0', () => {
      console.log(`Server running on port ${port}`);
    });
  })
  .catch((err) => {
    console.error('Database connection failed:', err);
    process.exit(1);
  });