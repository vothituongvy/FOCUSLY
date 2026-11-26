import { Schema, model } from 'mongoose';

/** Ghi lại mutation đã xử lý để client gửi lại (retry) không bị áp dụng 2 lần. */
const syncMutationSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    mutationId: { type: String, required: true },
    result: { type: Schema.Types.Mixed },
    createdAt: { type: Date, default: Date.now, expires: 60 * 60 * 24 * 14 },
  },
  { versionKey: false },
);
syncMutationSchema.index({ user: 1, mutationId: 1 }, { unique: true });

export const SyncMutationModel = model('SyncMutation', syncMutationSchema);
