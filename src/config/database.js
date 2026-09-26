import { collectionModels } from '../models/collections.js';
import { MongoClient } from 'mongodb';
export async function connect(config) {
  const client = new MongoClient(config.MONGODB_URI, {
    serverSelectionTimeoutMS: 5000,
    maxPoolSize: 20,
  });
  await client.connect();
  return { client, db: client.db(config.DB_NAME) };
}
export async function indexes(db) {
  await Promise.all(
    Object.entries(collectionModels).map(([name, indexes]) =>
      db.collection(name).createIndexes(indexes),
    ),
  );
}
