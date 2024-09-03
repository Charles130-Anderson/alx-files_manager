import sha1 from 'sha1';
import dbClient from '../utils/db';

class UsersController {
  static async postNew(req, res) {
    const { email, password } = req.body;

    // Validate email and password
    if (!email) {
      return res.status(400).json({ error: 'Missing email' });
    }
    if (!password) {
      return res.status(400).json({ error: 'Missing password' });
    }

    // Check if the email already exists in the database
    const userCollection = dbClient.db.collection('users');
    const existingUser = await userCollection.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'Already exist' });
    }

    // Hash the password using SHA1
    const hashedPassword = sha1(password);

    // Insert the new user into the database
    const result = await userCollection.insertOne({
      email,
      password: hashedPassword,
    });

    // Return the new user's id and email
    return res.status(201).json({
      id: result.insertedId,
      email,
    });
  }
}

export default UsersController;
