// controllers/FilesController.js

import { v4 as uuidv4 } from 'uuid';
import { promises as fsPromises } from 'fs';
import path from 'path';
import { ObjectId } from 'mongodb';
import mime from 'mime-types';
import Queue from 'bull';
import dbClient from '../utils/db';
import redisClient from '../utils/redis';

const fileQueue = new Queue('fileQueue');

class FilesController {
  // Static method to handle file upload
  static async postUpload(req, res) {
    // Extract the token from the 'x-token' header
    const token = req.headers['x-token'];
    // Check if the token is missing
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' }); // respond with 401 and error message
    }

    // create a key for the token stored in Redis
    const tokenKey = `auth_${token}`;
    // Retrieve the user ID associated with the token from Redis
    const userId = await redisClient.get(tokenKey);

    // Check if no user ID was found for the provided token
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' }); // Respond with a 401 status and an error message
    }

    // Extract file details from the request body
    const {
      name, type, parentId = 0, isPublic = false, data,
    } = req.body;

    if (!name) {
      // check if the file name is missing
      return res.status(400).json({ error: 'Missing name' }); // respond with 400 and error message
    }

    // check if the file type is missing or invalid
    if (!type || !['folder', 'file', 'image'].includes(type)) {
      return res.status(400).json({ error: 'Missing type' }); // respond with 400 and error message
    }

    // check if the file data is missing for non-folder types
    if (!data && type !== 'folder') {
      return res.status(400).json({ error: 'Missing data' }); // respond with 400 and error message
    }

    // check if the parent file exists and is a folder
    if (parentId !== 0) {
      const parentFile = await dbClient.db
        .collection('files')
        .findOne({ _id: ObjectId(parentId) });
      // If parent file doesn't exist or is not a folder, respond with an error
      if (!parentFile) {
        return res.status(400).json({ error: 'Parent not found' });
      }
      if (parentFile.type !== 'folder') {
        return res.status(400).json({ error: 'Parent is not a folder' });
      }
    }

    // create the file document to be inserted into the database
    const fileDocument = {
      userId: ObjectId(userId),
      name,
      type,
      isPublic,
      parentId: parentId !== 0 ? ObjectId(parentId) : 0,
    };

    // If the type is 'folder', insert the document and return the response
    if (type === 'folder') {
      const result = await dbClient.db
        .collection('files')
        .insertOne(fileDocument);
      return res.status(201).json({ id: result.insertedId, ...fileDocument });
    }

    // If the type is not 'folder', handle file upload
    const folderPath = process.env.FOLDER_PATH || '/tmp/files_manager'; // Set folder path from environment variable or default
    const localPath = path.join(folderPath, uuidv4()); // generate unique local path for file

    // create the folder if it doesn't exist
    await fsPromises.mkdir(folderPath, { recursive: true });
    // convert the base64 data to a buffer
    const fileData = Buffer.from(data, 'base64');
    // write the file to the local path
    await fsPromises.writeFile(localPath, fileData);

    // add the local path to the file document
    fileDocument.localPath = localPath;
    // insert the document into the database and return the response
    const result = await dbClient.db
      .collection('files')
      .insertOne(fileDocument);

    if (type === 'image') {
      fileQueue.add({ userId, fileId: result.insertedId.toString() });
    }

    return res.status(201).json({ id: result.insertedId, ...fileDocument });
  }

  // Static method to handle fetching a specific file's details
  static async getShow(req, res) {
    // extract the token from the 'x-token' header
    const token = req.headers['x-token'];
    // Check if the token is missing
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' }); // respond with 401 and an error message
    }

    const tokenKey = `auth_${token}`; // create a key for the token stored in Redis
    const userId = await redisClient.get(tokenKey); // get user ID linked with the token from Redis

    if (!userId) {
      // check if no user ID was found for the provided token
      return res.status(401).json({ error: 'Unauthorized' }); // respond with 401 status and an error message
    }

    // Extract the file ID from the request parameters
    const fileId = req.params.id;
    // Search for the file in the database using the file ID and user ID
    const file = await dbClient.db
      .collection('files')
      .findOne({ _id: ObjectId(fileId), userId: ObjectId(userId) });

    // Check if no file was found
    if (!file) {
      return res.status(404).json({ error: 'Not found' }); // Respond with a 404 status and an error message
    }
    // Respond with a 200 status and the file details
    return res.status(200).json(file);
  }

  // Static method to handle listing files
  static async getIndex(req, res) {
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
      return res.status(401).json({ error: 'Unauthorized' }); // Respond with a 401 status and an error message
    }

    // Extract parentId and page query parameters from the request
    const parentId = req.query.parentId || 0;
    const page = parseInt(req.query.page, 10) || 0;
    const pageSize = 20; // Set the page size for pagination

    // Search for files in the database with the matching parentId and userId
    const files = await dbClient.db
      .collection('files')
      .aggregate([
        {
          $match: {
            parentId: parentId === '0' ? 0 : ObjectId(parentId),
            userId: ObjectId(userId),
          },
        },
        { $skip: page * pageSize }, // Skip the appropriate number of documents for pagination
        { $limit: pageSize }, // Limit the number of documents returned to the page size
      ])
      .toArray();

    // Respond with a 200 status and the list of files
    return res.status(200).json(files);
  }

  static async putPublish(req, res) {
    // extract the token from the 'x-token' header
    const token = req.headers['x-token'];
    // check if the token is missing
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' }); // respond with 401 and an error message
    }

    // create a key for the token stored in Redis
    const tokenKey = `auth_${token}`;
    // get the user ID linked with the token from Redis
    const userId = await redisClient.get(tokenKey);
    // check if no user ID was found for the provided token
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' }); // respond with 401 and an error message
    }

    // extract the file ID from the request parameters
    const fileId = req.params.id;
    // search for the file in the database using the file ID and user ID
    const file = await dbClient.db
      .collection('files')
      .findOne({ _id: ObjectId(fileId), userId: ObjectId(userId) });
    // check if no file was found
    if (!file) {
      return res.status(404).json({ error: 'Not found' }); // respond with 404 and an error message
    }

    // update the file's isPublic property to true
    await dbClient.db
      .collection('files')
      .updateOne(
        { _id: ObjectId(fileId), userId: ObjectId(userId) },
        { $set: { isPublic: true } },
      );

    // retrieve the updated file from the database
    const updatedFile = await dbClient.db
      .collection('files')
      .findOne({ _id: ObjectId(fileId) });
    // respond with 200 and the updated file
    return res.status(200).json(updatedFile);
  }

  static async putUnpublish(req, res) {
    // extract the token from the 'x-token' header
    const token = req.headers['x-token'];
    // check if the token is missing
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' }); // respond with 401 and an error message
    }

    // create a key for the token stored in Redis
    const tokenKey = `auth_${token}`;
    // get the user ID linked with the token from Redis
    const userId = await redisClient.get(tokenKey);
    // check if no user ID was found for the provided token
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' }); // respond with 401 and an error message
    }

    // extract the file ID from the request parameters
    const fileId = req.params.id;
    // search for the file in the database using the file ID and user ID
    const file = await dbClient.db
      .collection('files')
      .findOne({ _id: ObjectId(fileId), userId: ObjectId(userId) });
    // check if no file was found
    if (!file) {
      return res.status(404).json({ error: 'Not found' }); // respond with 404 and an error message
    }

    // update the file's isPublic property to false
    await dbClient.db
      .collection('files')
      .updateOne(
        { _id: ObjectId(fileId), userId: ObjectId(userId) },
        { $set: { isPublic: false } },
      );

    // retrieve the updated file from the database
    const updatedFile = await dbClient.db
      .collection('files')
      .findOne({ _id: ObjectId(fileId) });
    // respond with 200 and the updated file
    return res.status(200).json(updatedFile);
  }

  static async getFile(req, res) {
    const fileId = req.params.id; // extract the file ID from the request parameters
    const token = req.headers['x-token']; // extract the token from the 'x-token' header

    // search for file in the database using the file ID
    const file = await dbClient.db
      .collection('files')
      .findOne({ _id: ObjectId(fileId) });
    // check if no file was found
    if (!file) {
      return res.status(404).json({ error: 'Not found' });
    }

    // extract the 'isPublic' property from the file
    const { isPublic } = file;
    // get user ID associated with the token from Redis
    const userId = token ? await redisClient.get(`auth_${token}`) : null;

    // check if the file is not public and the user is not the owner
    if (!isPublic && (!userId || userId !== file.userId.toString())) {
      return res.status(404).json({ error: 'Not found' });
    }

    // Check if the file is a folder
    if (file.type === 'folder') {
      return res.status(400).json({ error: "A folder doesn't have content" });
    }

    // get the file path from the file document
    let filePath = file.localPath;
    const { size } = req.query; // extract the 'size' query parameter from the request
    // check if the 'size' parameter is provided and is a valid value
    if (size && ['100', '250', '500'].includes(size)) {
      // append the size to the file path to get the resized file path
      filePath = `${file.localPath}_${size}`;
    }

    try {
      // read the file data from the file path
      const fileData = await fsPromises.readFile(filePath);
      // Determine the MIME type of the file
      const mimeType = mime.lookup(file.name) || 'application/octet-stream';
      // Set the 'Content-Type' header of the response
      res.setHeader('Content-Type', mimeType);
      // Return the file data in the response body
      return res.status(200).send(fileData);
    } catch (err) {
      return res.status(404).json({ error: 'Not found' });
    }
  }
}

// Export the FilesController class
export default FilesController;
