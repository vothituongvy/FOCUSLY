/** Nhãn dùng chung cho Góp ý & báo lỗi (trang người dùng và trang quản trị) */
export type FbType = 'bug' | 'idea' | 'other';
export type FbStatus = 'new' | 'in_progress' | 'fixed' | 'wontfix';
export const FB_STATUS: Record<FbStatus, { label: string; cls: string }> = {
  new: { label: 'Đã nhận', cls: '' },
  in_progress: { label: 'Đang xử lý', cls: 'in_progress' },
  fixed: { label: '✓ Đã sửa', cls: 'done' },
  wontfix: { label: 'Đã phản hồi', cls: 'medium' },
};
export const FB_TYPE: Record<FbType, string> = { bug: '🐞 Báo lỗi', idea: '💡 Góp ý', other: '💬 Khác' };
