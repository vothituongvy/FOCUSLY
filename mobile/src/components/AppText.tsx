import { forwardRef, type ComponentRef } from 'react';
import { Text as RNText, TextInput as RNTextInput, type TextInputProps, type TextProps } from 'react-native';
import { colors } from '../theme';

/**
 * Text / TextInput dùng chung cho cả app.
 * Giới hạn mức phóng chữ theo cài đặt "Cỡ chữ" của điện thoại: vẫn to hơn khi người dùng chọn chữ lớn,
 * nhưng không to tới mức tràn khỏi ô, thẻ, nút.
 */
export const FONT_SCALE_MAX = 1.15;

export const Text = forwardRef<ComponentRef<typeof RNText>, TextProps>(function Text(props, ref) {
  // màu chữ mặc định theo giao diện sáng/tối (Android không tự đổi theo app)
  return <RNText maxFontSizeMultiplier={FONT_SCALE_MAX} {...props} style={[{ color: colors.text }, props.style]} ref={ref} />;
});

export const TextInput = forwardRef<ComponentRef<typeof RNTextInput>, TextInputProps>(function TextInput(props, ref) {
  return <RNTextInput maxFontSizeMultiplier={FONT_SCALE_MAX} placeholderTextColor={colors.muted} {...props} style={[{ color: colors.text }, props.style]} ref={ref} />;
});
