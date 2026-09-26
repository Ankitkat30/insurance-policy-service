export function createMessageController(service) {
  return {
    schedule: async (req, res) => res.status(201).json(await service.schedule(req.body)),
    status: async (req, res) => res.json(await service.status(req.params.id)),
    list: async (req, res) => res.json(await service.list(req.query)),
  };
}
