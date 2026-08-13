import { MongoClient, type Db } from 'mongodb';

declare global {
  // eslint-disable-next-line no-var
  var clutchMongoPromise: Promise<MongoClient> | undefined;
}

function databaseName(uri: string) {
  const pathname = new URL(uri).pathname.replace(/^\//, '');
  return pathname || 'clutch_atlas';
}

export async function getDatabase(): Promise<Db> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not configured');

  if (!global.clutchMongoPromise) {
    global.clutchMongoPromise = new MongoClient(uri, {
      maxPoolSize: 10,
      minPoolSize: 0,
      maxIdleTimeMS: 30_000,
      serverSelectionTimeoutMS: 8_000,
      retryReads: true,
      retryWrites: true
    }).connect();
  }
  const client = await global.clutchMongoPromise;
  return client.db(databaseName(uri));
}
