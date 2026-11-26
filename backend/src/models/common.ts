import { Schema, SchemaOptions } from 'mongoose';

/** Chuẩn hoá JSON trả về: `_id` -> `id`, bỏ `__v`. */
export const jsonOptions = {
  timestamps: true,
  toJSON: {
    virtuals: true,
    versionKey: false,
    transform: (_doc: unknown, ret: Record<string, unknown>) => {
      delete ret._id;
      return ret;
    },
  },
} satisfies SchemaOptions;
// Lưu ý: dùng `satisfies` (không gán kiểu SchemaOptions) để Mongoose vẫn suy ra đúng kiểu các trường

/**
 * Các trường dùng chung cho dữ liệu đồng bộ Web/Mobile:
 * - user: chủ sở hữu
 * - clientId: id do client sinh khi tạo offline (chống tạo trùng khi gửi lại)
 * - deletedAt: xoá mềm để thiết bị khác biết bản ghi đã bị xoá
 */
export const syncFields = {
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  clientId: { type: String },
  deletedAt: { type: Date, default: null },
} as const;

/** Index dùng chung cho dữ liệu đồng bộ (các trường khai báo bằng `...syncFields` trong schema) */
export function syncable(schema: Schema): void {
  schema.index({ user: 1, updatedAt: 1 });
  schema.index(
    { user: 1, clientId: 1 },
    { unique: true, partialFilterExpression: { clientId: { $type: 'string' } } },
  );
}
