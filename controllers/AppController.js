import redisClient from '../utils/redis';
import dbClient from '../utils/db';

class AppController {
  static async getStatus(req, res) {
    res.status(200).json({
      redis: await redisClient.isAlive(),
      db: await dbClient.isAlive(),
    });
  }

  static async getStats(req, res) {
    const usersNum = await dbClient.nbUsers();
    const filesNum = await dbClient.nbFiles();
    res.status(200).json({ users: usersNum, files: filesNum });
  }
}

export default AppController;
