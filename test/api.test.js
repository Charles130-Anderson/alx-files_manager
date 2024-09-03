// test/api.test.js

import request from 'supertest';
import { expect } from 'chai';
import app from '../server'; // Assuming your Express app is exported from server.js
import dbClient from '../utils/db';
import redisClient from '../utils/redis';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';
import sinon from 'sinon';

let mongoServer;
let client;
let db;

before(async () => {
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  client = new MongoClient(uri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });
  await client.connect();
  db = client.db();
  dbClient.client = client;
  dbClient.db = db;

  // Stub redisClient methods for testing
  sinon.stub(redisClient, 'get').resolves(null);
  sinon.stub(redisClient, 'set').resolves();
  sinon.stub(redisClient, 'del').resolves();
});

after(async () => {
  await client.close();
  await mongoServer.stop();

  // Restore redisClient methods
  sinon.restore();
});

describe('API Endpoints', () => {
  describe('GET /status', () => {
    it('should return status OK', async () => {
      const res = await request(app).get('/status');
      expect(res.status).to.equal(200);
      expect(res.body).to.deep.equal({ redis: true, db: true });
    });
  });

  describe('GET /stats', () => {
    it('should return stats', async () => {
      const res = await request(app).get('/stats');
      expect(res.status).to.equal(200);
      expect(res.body).to.have.property('users');
      expect(res.body).to.have.property('files');
    });
  });

  describe('POST /users', () => {
    it('should create a new user', async () => {
      const res = await request(app)
        .post('/users')
        .send({ email: 'test@example.com', password: '123456' });
      expect(res.status).to.equal(201);
      expect(res.body).to.have.property('id');
      expect(res.body).to.have.property('email', 'test@example.com');
    });

    it('should return error for missing email or password', async () => {
      const res = await request(app)
        .post('/users')
        .send({ email: 'test@example.com' });
      expect(res.status).to.equal(400);
      expect(res.body).to.have.property('error');
    });
  });

  describe('GET /connect', () => {
    it('should login a user', async () => {
      await db
        .collection('users')
        .insertOne({ email: 'test@example.com', password: '123456' });
      const res = await request(app)
        .get('/connect')
        .auth('test@example.com', '123456');
      expect(res.status).to.equal(200);
      expect(res.body).to.have.property('token');
    });

    it('should return error for invalid credentials', async () => {
      const res = await request(app)
        .get('/connect')
        .auth('wrong@example.com', '123456');
      expect(res.status).to.equal(401);
      expect(res.body).to.have.property('error');
    });
  });

  describe('GET /disconnect', () => {
    it('should logout a user', async () => {
      const token = 'some-token';
      redisClient.set(`auth_${token}`, 'user-id');
      const res = await request(app).get('/disconnect').set('X-Token', token);
      expect(res.status).to.equal(204);
    });

    it('should return error for missing token', async () => {
      const res = await request(app).get('/disconnect');
      expect(res.status).to.equal(401);
      expect(res.body).to.have.property('error');
    });
  });

  describe('GET /users/me', () => {
    it('should return the current user', async () => {
      const token = 'some-token';
      const userId = new ObjectId().toString();
      await db.collection('users').insertOne({
        _id: userId,
        email: 'test@example.com',
        password: '123456',
      });
      redisClient.get.withArgs(`auth_${token}`).resolves(userId);

      const res = await request(app).get('/users/me').set('X-Token', token);
      expect(res.status).to.equal(200);
      expect(res.body).to.have.property('id', userId);
      expect(res.body).to.have.property('email', 'test@example.com');
    });

    it('should return error for missing token', async () => {
      const res = await request(app).get('/users/me');
      expect(res.status).to.equal(401);
      expect(res.body).to.have.property('error');
    });
  });

  describe('POST /files', () => {
    it('should create a new file', async () => {
      const token = 'some-token';
      const userId = new ObjectId().toString();
      redisClient.get.withArgs(`auth_${token}`).resolves(userId);

      const res = await request(app)
        .post('/files')
        .set('X-Token', token)
        .send({ name: 'file.txt', type: 'file', data: 'SGVsbG8gd29ybGQ=' });
      expect(res.status).to.equal(201);
      expect(res.body).to.have.property('id');
      expect(res.body).to.have.property('name', 'file.txt');
    });

    it('should return error for missing name or type', async () => {
      const token = 'some-token';
      const userId = new ObjectId().toString();
      redisClient.get.withArgs(`auth_${token}`).resolves(userId);

      const res = await request(app)
        .post('/files')
        .set('X-Token', token)
        .send({ type: 'file' });
      expect(res.status).to.equal(400);
      expect(res.body).to.have.property('error');
    });
  });

  describe('GET /files/:id', () => {
    it('should return a file', async () => {
      const token = 'some-token';
      const userId = new ObjectId().toString();
      const fileId = new ObjectId().toString();
      await db.collection('files').insertOne({
        _id: fileId,
        userId,
        name: 'file.txt',
        type: 'file',
        localPath: '/tmp/files_manager/file.txt',
      });
      redisClient.get.withArgs(`auth_${token}`).resolves(userId);

      const res = await request(app)
        .get(`/files/${fileId}`)
        .set('X-Token', token);
      expect(res.status).to.equal(200);
      expect(res.body).to.have.property('id', fileId);
      expect(res.body).to.have.property('name', 'file.txt');
    });

    it('should return error for missing or invalid file id', async () => {
      const token = 'some-token';
      redisClient.get.withArgs(`auth_${token}`).resolves('user-id');

      const res = await request(app)
        .get('/files/invalid-id')
        .set('X-Token', token);
      expect(res.status).to.equal(404);
      expect(res.body).to.have.property('error');
    });
  });

  describe('GET /files', () => {
    it('should return files with pagination', async () => {
      const token = 'some-token';
      const userId = new ObjectId().toString();
      redisClient.get.withArgs(`auth_${token}`).resolves(userId);

      await db.collection('files').insertMany([
        {
          userId,
          name: 'file1.txt',
          type: 'file',
          localPath: '/tmp/files_manager/file1.txt',
        },
        {
          userId,
          name: 'file2.txt',
          type: 'file',
          localPath: '/tmp/files_manager/file2.txt',
        },
      ]);

      const res = await request(app)
        .get('/files')
        .set('X-Token', token)
        .query({ page: 1 });
      expect(res.status).to.equal(200);
      expect(res.body.length).to.be.at.least(1);
    });

    it('should return error for missing token', async () => {
      const res = await request(app).get('/files');
      expect(res.status).to.equal(401);
      expect(res.body).to.have.property('error');
    });
  });

  describe('PUT /files/:id/publish', () => {
    it('should publish a file', async () => {
      const token = 'some-token';
      const userId = new ObjectId().toString();
      const fileId = new ObjectId().toString();
      await db.collection('files').insertOne({
        _id: fileId,
        userId,
        name: 'file.txt',
        type: 'file',
        localPath: '/tmp/files_manager/file.txt',
      });
      redisClient.get.withArgs(`auth_${token}`).resolves(userId);

      const res = await request(app)
        .put(`/files/${fileId}/publish`)
        .set('X-Token', token);
      expect(res.status).to.equal(200);
      expect(res.body).to.have.property('isPublic', true);
    });

    it('should return error for invalid file id', async () => {
      const token = 'some-token';
      redisClient.get.withArgs(`auth_${token}`).resolves('user-id');

      const res = await request(app)
        .put('/files/invalid-id/publish')
        .set('X-Token', token);
      expect(res.status).to.equal(404);
      expect(res.body).to.have.property('error');
    });
  });

  describe('PUT /files/:id/unpublish', () => {
    it('should unpublish a file', async () => {
      const token = 'some-token';
      const userId = new ObjectId().toString();
      const fileId = new ObjectId().toString();
      await db.collection('files').insertOne({
        _id: fileId,
        userId,
        name: 'file.txt',
        type: 'file',
        localPath: '/tmp/files_manager/file.txt',
        isPublic: true,
      });
      redisClient.get.withArgs(`auth_${token}`).resolves(userId);

      const res = await request(app)
        .put(`/files/${fileId}/unpublish`)
        .set('X-Token', token);
      expect(res.status).to.equal(200);
      expect(res.body).to.have.property('isPublic', false);
    });

    it('should return error for invalid file id', async () => {
      const token = 'some-token';
      redisClient.get.withArgs(`auth_${token}`).resolves('user-id');

      const res = await request(app)
        .put('/files/invalid-id/unpublish')
        .set('X-Token', token);
      expect(res.status).to.equal(404);
      expect(res.body).to.have.property('error');
    });
  });

  describe('GET /files/:id/data', () => {
    it('should return file data', async () => {
      const token = 'some-token';
      const userId = new ObjectId().toString();
      const fileId = new ObjectId().toString();
      const filePath = '/tmp/files_manager/file.txt';
      await db.collection('files').insertOne({
        _id: fileId,
        userId,
        name: 'file.txt',
        type: 'file',
        localPath: filePath,
      });
      redisClient.get.withArgs(`auth_${token}`).resolves(userId);

      // Create a dummy file for the test
      const fs = require('fs');
      fs.writeFileSync(filePath, 'Hello, world!');

      const res = await request(app)
        .get(`/files/${fileId}/data`)
        .set('X-Token', token);
      expect(res.status).to.equal(200);
      expect(res.text).to.equal('Hello, world!');

      // Clean up the dummy file
      fs.unlinkSync(filePath);
    });

    it('should return error for invalid file id', async () => {
      const token = 'some-token';
      redisClient.get.withArgs(`auth_${token}`).resolves('user-id');

      const res = await request(app)
        .get('/files/invalid-id/data')
        .set('X-Token', token);
      expect(res.status).to.equal(404);
      expect(res.body).to.have.property('error');
    });
  });
});
