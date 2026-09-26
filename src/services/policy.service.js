import { paginationSchema, searchSchema } from '../validators/request.schemas.js';
export function createPolicyService(repository) {
  return {
    search: (query) => repository.search(searchSchema.parse(query)),
    aggregate: (query) => repository.aggregate(paginationSchema.parse(query)),
  };
}
