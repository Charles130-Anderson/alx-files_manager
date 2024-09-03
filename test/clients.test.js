// test/clients.test.js

import { expect } from 'chai';
import { before, after } from 'mocha';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';
import redisClient from '../utils/redis';
import dbClient from '../utils/db';

describe('redis Client', () => {
  it('should connect to Redis server', async () => {
    expect.assertions(1);
    const isAlive = await redisClient.isAlive();
    expect(isAlive).to.be.true;
  });

  it('should set and get a key', async () => {
    expect.assertions(1);
    await redisClient.set('test_key', 'test_value', 10);
    const value = await redisClient.get('test_key');
    expect(value).to.equal('test_value');
  });

  it('should delete a key', async () => {
    expect.assertions(1);
    await redisClient.set('test_key', 'test_value', 10);
    await redisClient.del('test_key');
    const value = await redisClient.get('test_key');
    expect(value).to.be.null;
  });
});

describe('dB Client', () => {
  let mongoServer;
  let client;

  before(async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    client = new MongoClient(uri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    await client.connect();
    dbClient.client = client;
    dbClient.db = client.db();
  });

  after(async () => {
    await client.close();
    await mongoServer.stop();
  });

  it('should connect to MongoDB server', async () => {
    expect.hasAssertions();
    const isAlive = dbClient.isAlive();
    expect(isAlive).to.be.true;
  });

  it('should return the number of users', async () => {
    expect.hasAssertions();
    const usersCount = await dbClient.nbUsers();
    expect(usersCount).to.be.a('number');
  });

  it('should return the number of files', async () => {
    expect.hasAssertions();
    const filesCount = await dbClient.nbFiles();
    expect(filesCount).to.be.a('number');
  });
});
