import { key } from '../validators/import.schema.js';
export async function saveImportRow(db, session, data) {
  async function upsert(collection, filter, values) {
    return db
      .collection(collection)
      .findOneAndUpdate(
        filter,
        { $set: values },
        { upsert: true, returnDocument: 'after', session },
      );
  }
  const agent = await upsert('agents', { key: key(data.agent) }, { name: data.agent });
  const user = await upsert('users', { identity: data.user.identity }, data.user);
  const account = await upsert(
    'accounts',
    { userId: user._id, key: key(data.account) },
    { name: data.account },
  );
  const lob = await upsert('lobs', { key: key(data.category) }, { categoryName: data.category });
  const carrier = await upsert(
    'carriers',
    { key: key(data.carrier) },
    { companyName: data.carrier },
  );
  await upsert(
    'policies',
    { carrierId: carrier._id, policyNumber: data.policy.policyNumber },
    {
      ...data.policy,
      userId: user._id,
      agentId: agent._id,
      accountId: account._id,
      categoryId: lob._id,
    },
  );
}
