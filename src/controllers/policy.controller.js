export function createPolicyController(service) {
  return {
    search: async (req, res) => res.json(await service.search(req.query)),
    aggregate: async (req, res) => res.json(await service.aggregate(req.query)),
  };
}
