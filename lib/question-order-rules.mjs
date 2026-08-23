export function orderedImportTimestamp(batchStartedAt, index) {
  const startedAt = Number.isFinite(batchStartedAt) ? Math.trunc(batchStartedAt) : Date.now();
  const offset = Number.isFinite(index) ? Math.max(0, Math.trunc(index)) : 0;
  return Math.max(1, startedAt - offset);
}

export function retainedQuestionCreatedAt(value, now = Date.now()) {
  const timestamp = Number(value);
  return Number.isFinite(timestamp) && timestamp > 0 && timestamp <= now ? Math.trunc(timestamp) : now;
}
