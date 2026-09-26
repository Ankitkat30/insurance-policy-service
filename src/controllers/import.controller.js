export function createImportController(service) {
  return { upload: async (req, res) => res.json(await service.upload(req.file)) };
}
