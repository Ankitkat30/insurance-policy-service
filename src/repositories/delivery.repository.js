export async function deliverNextJob(db, session, now) {
  const job = await db
    .collection('scheduledJobs')
    .findOneAndUpdate(
      { status: 'pending', scheduledAt: { $lte: now } },
      { $set: { status: 'delivered', deliveredAt: now } },
      { sort: { scheduledAt: 1 }, session, returnDocument: 'after' },
    );
  if (!job) return false;
  await db.collection('messages').updateOne(
    { jobId: job._id },
    {
      $setOnInsert: { message: job.message, scheduledAt: job.scheduledAt, createdAt: now },
    },
    { upsert: true, session },
  );
  return true;
}
