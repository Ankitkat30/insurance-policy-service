// Native MongoDB collection contracts. Unique indexes enforce business identities.
export const collectionModels = {
  agents: [{ key: { key: 1 }, unique: true }],
  users: [
    { key: { identity: 1 }, unique: true },
    { key: { firstnameKey: 1, _id: 1 } },
    { key: { email: 1, _id: 1 } },
  ],
  accounts: [{ key: { userId: 1, key: 1 }, unique: true }],
  lobs: [{ key: { key: 1 }, unique: true }],
  carriers: [{ key: { key: 1 }, unique: true }],
  policies: [
    { key: { carrierId: 1, policyNumber: 1 }, unique: true },
    { key: { userId: 1, _id: 1 } },
  ],
  scheduledJobs: [{ key: { status: 1, scheduledAt: 1 } }],
  messages: [{ key: { jobId: 1 }, unique: true }],
};
