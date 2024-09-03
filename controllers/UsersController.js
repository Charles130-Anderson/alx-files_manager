// controllers/UsersController.js
import sha1 from 'sha1';
import Queue from 'bull';
import dbClient from '../utils/db';
import redisClient from '../utils/redis';

const { ObjectId } = require('mongodb');
// Create a Bull queue for user welcome emails
const userQueue = new Queue('userQueue');

class UsersController {
  // Method to handle the creation of a new user
  static async postNew(req, res) {
    const { email, password } = req.body;

    // Check if email is missing
    if (!email) {
      return res.status(400).json({ error: 'Missing email' });
    }
    // Check if password is missing
    if (!password) {
      return res.status(400).json({ error: 'Missing password' });
    }

    // Check if user with the same email already exists
    const existingUser = await dbClient.db
      .collection('users')
      .findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'Already exist' });
    }

    // Hash the password using sha1 algorithm
    const hashedPassword = sha1(password);

    // Insert the new user into the database
    const result = await dbClient.db
      .collection('users')
      .insertOne({ email, password: hashedPassword });

    const newUserId = result.insertedId;

    // Add a job to the queue with the new user ID
    await userQueue.add({ userId: newUserId });

    // Return the created user's id and email
    return res.status(201).json({ id: result.insertedId, email });
  }

  // Static method to handle fetching the authenticated user's details
  static async getMe(req, res) {
    // Extract the token from the 'x-token' header
    const token = req.headers['x-token'];

    // Check if the token is missing
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' }); // Respond with a 401 status and an error message
    }

    // Create a key for the token stored in Redis
    const tokenKey = `auth_${token}`;
    // Retrieve the user ID associated with the token from Redis
    const userId = await redisClient.get(tokenKey);

    // Check if no user ID was found for the provided token
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' }); // respond 401 status and an error message
    }
    // search for the user in the database using the retrieved user ID
    const user = await dbClient.db
      .collection('users')
      .findOne({ _id: ObjectId(userId) });

    if (!user) {
      // check if no user found with the provided user ID
      return res.status(401).json({ error: 'Unauthorized' }); // respond 401 status anderror message
    }

    // respond 200 status and the user's id and email
    return res.status(200).json({ id: user._id, email: user.email });
  }
}

export default UsersController;
