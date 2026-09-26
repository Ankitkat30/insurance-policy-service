import { scheduleInput } from '../validators/message.schema.js';
import { identifierSchema, messageQuerySchema } from '../validators/request.schemas.js';
import { HttpError } from '../utils/http-error.js';
export function createMessageService(repository) {
  return {
    schedule: (body) => repository.create(scheduleInput(body)),
    async status(id) {
      const job = await repository.findSchedule(identifierSchema.parse(id));
      if (!job) throw new HttpError(404, 'Schedule not found');
      return job;
    },
    list: (query) => repository.list(messageQuerySchema.parse(query)),
  };
}
