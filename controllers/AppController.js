// controllers/AppController.js

import redisClient from '../utils/redis';
import dbClient from '../utils/db';

/**
 * AppController class to handle the status and stats endpoints.
 */
class AppController {
  /**
   * GET /status endpoint handler.
   * @param {Object} req - Express request object.
   * @param {Object} res - Express response object.
   */
  static async getStatus(req, res) {
    res.status(200).json({
      redis: await redisClient.isAlive(),
      db: await dbClient.isAlive(),
    });
  }

  /**
   * GET /stats endpoint handler.
   * @param {Object} req - Express request object.
   * @param {Object} res - Express response object.
   */
  static async getStats(req, res) {
    const usersNum = await dbClient.nbUsers();
    const filesNum = await dbClient.nbFiles();
    res.status(200).json({ users: usersNum, files: filesNum });
  }
}

export default AppController;
