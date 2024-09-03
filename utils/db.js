// utils/db.js

import { MongoClient } from 'mongodb';
// import dotenv from 'dotenv';

// load environment variables from .env file
// dotenv.config();

/**
 * DBClient class to interact with MongoDB server.
 */
class DBClient {
  constructor() {
    const host = process.env.DB_HOST || 'localhost';
    const port = process.env.DB_PORT || 27017;
    const database = process.env.DB_DATABASE || 'files_manager';
    const url = `mongodb://${host}:${port}/${database}`;

    // MongoDB client
    this.client = new MongoClient(url, {
      useUnifiedTopology: true,
      useNewUrlParser: true,
    });

    // connect to the MongoDB server
    this.client.connect((err) => {
      if (err) {
        console.error(`MongoDB client not connected to the server: ${err}`);
      }
    });
    // reference to the database on successful connection
    this.db = this.client.db(`${database}`);
  }

  /**
   * Checks if the MongoDB client is alive.
   * @returns {boolean} True if the connection is successful, otherwise false.
   */
  isAlive() {
    return this.client.isConnected();
  }

  /**
   * Returns the number of documents in the users collection.
   * @returns {Promise<number>} The number of documents in the users collection.
   */
  async nbUsers() {
    const users = this.db.collection('users');
    const usersNum = await users.countDocuments();
    return usersNum;
  }

  /**
   * Returns the number of documents in the files collection.
   * @returns {Promise<number>} The number of documents in the files collection.
   */
  async nbFiles() {
    const files = this.db.collection('files');
    const filesNum = await files.countDocuments();
    return filesNum;
  }
}

// Create and export an instance of DBClient
const dbClient = new DBClient();
export default dbClient;
