import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { Text } from '../components/AppText';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { api, errorMessage } from '../api/client';
import { useAuth } from '../store/auth';
import { colors } from '../theme';
import { Button, Card, Field, Muted, s, Logo } from '../components/ui';
import type { AuthStackParams } from '../navigation/types';
import { tr } from '../i18n';
import { LangSwitch } from '../components/LangSwitch';

function AuthShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 22, gap: 22 }} keyboardShouldPersistTaps="handled">
        <View style={{ gap: 18 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Logo size={30} />
            <Text style={{ flex: 1, fontSize: 22, fontWeight: '800', color: colors.text, letterSpacing: 0.6 }}>FOCUSLY</Text>
            <LangSwitch compact />
          </View>
          <Text style={{ fontSize: 30, fontWeight: '800', color: colors.text, letterSpacing: -0.8, lineHeight: 36 }}>{title}</Text>
        </View>
        <Card style={{ gap: 14, padding: 18 }}>{children}</Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export function LoginScreen({ navigation }: NativeStackScreenProps<AuthStackParams, 'Login'>) {
  const { login, googleLogin } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title={tr('Đăng nhập để tiếp tục buổi học')}>
      <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
      <Field label={tr('Mật khẩu')} value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" />
      {!!error && <Text style={s.error}>{error}</Text>}
      <Button title={tr('Đăng nhập')} loading={busy} onPress={() => run(() => login(email.trim(), password))} />
      <Button title={tr('Đăng nhập bằng Google')} variant="secondary" disabled={busy} onPress={() => run(googleLogin)} />
      <Button title={tr('Quên mật khẩu?')} variant="ghost" small onPress={() => navigation.navigate('ForgotPassword')} />
      <Button title={tr('Chưa có tài khoản? Đăng ký')} variant="ghost" small onPress={() => navigation.navigate('Register')} />
    </AuthShell>
  );
}

export function RegisterScreen({ navigation }: NativeStackScreenProps<AuthStackParams, 'Register'>) {
  const register = useAuth((st) => st.register);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) return setError(tr('Mật khẩu tối thiểu 8 ký tự, gồm chữ và số'));
    setBusy(true);
    setError('');
    try {
      await register(name.trim(), email.trim(), password);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title={tr('Tạo tài khoản FOCUSLY')}>
      <Field label={tr('Họ tên')} value={name} onChangeText={setName} />
      <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
      <Field label={tr('Mật khẩu')} value={password} onChangeText={setPassword} secureTextEntry />
      {!!error && <Text style={s.error}>{error}</Text>}
      <Button title={tr('Đăng ký')} loading={busy} onPress={submit} />
      <Button title={tr('Đã có tài khoản? Đăng nhập')} variant="ghost" small onPress={() => navigation.goBack()} />
    </AuthShell>
  );
}

export function ForgotPasswordScreen({ navigation }: NativeStackScreenProps<AuthStackParams, 'ForgotPassword'>) {
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <AuthShell title={tr('Đặt lại mật khẩu')}>
      <Muted>{tr('Nhập email đã đăng ký. Liên kết đặt lại mật khẩu sẽ được gửi tới email (mở trên trình duyệt).')}</Muted>
      <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
      {!!msg && <Text style={{ color: colors.success }}>{msg}</Text>}
      {!!error && <Text style={s.error}>{error}</Text>}
      <Button
        title={tr('Gửi liên kết')}
        loading={busy}
        onPress={async () => {
          setBusy(true);
          setError('');
          try {
            const r = await api<{ message: string }>('/auth/forgot-password', { method: 'POST', body: { email: email.trim() }, auth: false });
            setMsg(r.message);
          } catch (e) {
            setError(errorMessage(e));
          } finally {
            setBusy(false);
          }
        }}
      />
      <Button title={tr('‹ Quay lại')} variant="ghost" small onPress={() => navigation.goBack()} />
    </AuthShell>
  );
}
