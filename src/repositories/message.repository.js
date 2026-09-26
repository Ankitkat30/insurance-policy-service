import { ObjectId } from 'mongodb';
export function createMessageRepository(db) {
  return {
    async create(job) {
      const { insertedId } = await db.collection('scheduledJobs').insertOne(job);
      return { _id: insertedId, ...job };
    },
    findSchedule: (id) => db.collection('scheduledJobs').findOne({ _id: new ObjectId(id) }),
    async list({ page, limit, jobId }) {
      const filter = jobId ? { jobId: new ObjectId(jobId) } : {};
      const [data, total] = await Promise.all([
        db
          .collection('messages')
          .find(filter)
          .sort({ _id: -1 })
          .skip((page - 1) * limit)
          .limit(limit)
          .toArray(),
        db.collection('messages').countDocuments(filter),
      ]);
      return { page, limit, total, data };
    },
  };
}
