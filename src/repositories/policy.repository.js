const joins = [
  ['agents', 'agentId', 'agent'],
  ['accounts', 'accountId', 'account'],
  ['lobs', 'categoryId', 'category'],
  ['carriers', 'carrierId', 'carrier'],
].flatMap(([from, localField, as]) => [
  { $lookup: { from, localField, foreignField: '_id', as } },
  { $unwind: { path: `$${as}`, preserveNullAndEmptyArrays: true } },
]);
export function createPolicyRepository(db) {
  return {
    async search({ username, page, limit }) {
      const data = await db
        .collection('users')
        .aggregate([
          { $match: { $or: [{ firstnameKey: username }, { email: username }] } },
          {
            $lookup: { from: 'policies', localField: '_id', foreignField: 'userId', as: 'policy' },
          },
          { $unwind: '$policy' },
          {
            $replaceRoot: {
              newRoot: {
                $mergeObjects: [
                  '$policy',
                  { user: { _id: '$_id', firstname: '$firstname', email: '$email' } },
                ],
              },
            },
          },
          { $sort: { _id: 1 } },
          {
            $facet: {
              metadata: [{ $count: 'total' }],
              data: [{ $skip: (page - 1) * limit }, { $limit: limit }, ...joins],
            },
          },
        ])
        .toArray();
      return { page, limit, total: data[0].metadata[0]?.total ?? 0, data: data[0].data };
    },
    async aggregate({ page, limit }) {
      const [result] = await db
        .collection('users')
        .aggregate([
          { $sort: { _id: 1 } },
          {
            $facet: {
              metadata: [{ $count: 'total' }],
              data: [
                { $skip: (page - 1) * limit },
                { $limit: limit },
                {
                  $lookup: {
                    from: 'policies',
                    let: { user: '$_id' },
                    pipeline: [
                      { $match: { $expr: { $eq: ['$userId', '$$user'] } } },
                      {
                        $group: {
                          _id: null,
                          policyCount: { $sum: 1 },
                          earliestStart: { $min: '$startDate' },
                          latestEnd: { $max: '$endDate' },
                          categories: { $addToSet: '$categoryId' },
                          carriers: { $addToSet: '$carrierId' },
                        },
                      },
                    ],
                    as: 'summary',
                  },
                },
                {
                  $project: {
                    firstname: 1,
                    email: 1,
                    policyCount: { $ifNull: [{ $arrayElemAt: ['$summary.policyCount', 0] }, 0] },
                    earliestStart: { $arrayElemAt: ['$summary.earliestStart', 0] },
                    latestEnd: { $arrayElemAt: ['$summary.latestEnd', 0] },
                    categoryIds: { $arrayElemAt: ['$summary.categories', 0] },
                    carrierIds: { $arrayElemAt: ['$summary.carriers', 0] },
                  },
                },
              ],
            },
          },
        ])
        .toArray();
      return { page, limit, total: result.metadata[0]?.total ?? 0, data: result.data };
    },
  };
}
