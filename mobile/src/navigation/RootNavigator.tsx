import React from 'react';
import { View } from 'react-native';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useAuth } from '../store/auth';
import { useSession } from '../store/session';
import { colors } from '../theme';
import { Loading } from '../components/ui';
import { Icon, type IconName } from '../components/Icon';
import { ForgotPasswordScreen, LoginScreen, RegisterScreen } from '../screens/AuthScreens';
import { DashboardScreen } from '../screens/DashboardScreen';
import { PlanScreen, SubjectEditScreen, TaskEditScreen } from '../screens/PlanScreens';
import { FocusScreen } from '../screens/FocusScreen';
import { JournalScreen } from '../screens/JournalScreen';
import { LearnScreen, QuizTakeScreen, ReviewScreen } from '../screens/LearnScreens';
import { AIChatScreen, AnalyticsScreen, MaterialsScreen, NotificationsScreen } from '../screens/MoreScreens';
import { ProfileScreen } from '../screens/ProfileScreen';
import type { AppStackParams, AuthStackParams, TabParams } from './types';

const AuthStack = createNativeStackNavigator<AuthStackParams>();
const AppStack = createNativeStackNavigator<AppStackParams>();
const Tab = createBottomTabNavigator<TabParams>();

/** Icon tab: tab đang chọn được "tô dạ quang" phía sau */
const icon =
  (name: IconName) =>
  ({ focused }: { focused: boolean }) => (
    <View style={{ width: 48, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: focused ? colors.marker : 'transparent' }}>
      <Icon name={name} size={21} color={focused ? colors.text : colors.muted} strokeWidth={focused ? 2 : 1.75} />
    </View>
  );

function Tabs() {
  const running = useSession((s) => s.session);
  // Đang học với Focus Shield: ẩn thanh tab để giảm xao nhãng
  const hideTabs = Boolean(running?.shieldEnabled);
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.text,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600', marginTop: 2 },
        tabBarStyle: hideTabs
          ? { display: 'none' }
          : { height: 64, paddingTop: 6, paddingBottom: 8, backgroundColor: colors.surface, borderTopColor: colors.border, elevation: 0 },
      }}
    >
      <Tab.Screen name="Dashboard" component={DashboardScreen} options={{ title: 'Hôm nay', tabBarIcon: icon('home') }} />
      <Tab.Screen name="Plan" component={PlanScreen} options={{ title: 'Kế hoạch', tabBarIcon: icon('plan') }} />
      <Tab.Screen name="Focus" component={FocusScreen} options={{ title: 'Tập trung', tabBarIcon: icon('focus') }} />
      <Tab.Screen name="Learn" component={LearnScreen} options={{ title: 'Ôn tập', tabBarIcon: icon('cards') }} />
      <Tab.Screen name="Profile" component={ProfileScreen} options={{ title: 'Cá nhân', tabBarIcon: icon('settings') }} />
    </Tab.Navigator>
  );
}

export function RootNavigator() {
  const status = useAuth((s) => s.status);
  if (status === 'loading') return <Loading />;
  return (
    <NavigationContainer theme={{ ...DefaultTheme, colors: { ...DefaultTheme.colors, background: colors.bg, primary: colors.primary } }}>
      {status === 'authed' ? (
        <AppStack.Navigator
          screenOptions={{
            headerStyle: { backgroundColor: colors.bg },
            headerShadowVisible: false,
            headerTintColor: colors.text,
            headerTitleStyle: { fontWeight: '700', fontSize: 17 },
            contentStyle: { backgroundColor: colors.bg },
          }}
        >
          <AppStack.Screen name="Tabs" component={Tabs} options={{ headerShown: false }} />
          <AppStack.Screen name="TaskEdit" component={TaskEditScreen} options={{ title: 'Nhiệm vụ' }} />
          <AppStack.Screen name="SubjectEdit" component={SubjectEditScreen} options={{ title: 'Môn học' }} />
          <AppStack.Screen name="Journal" component={JournalScreen} options={{ title: 'Nhật ký phân tâm' }} />
          <AppStack.Screen name="Review" component={ReviewScreen} options={{ title: 'Ôn flashcard' }} />
          <AppStack.Screen name="QuizTake" component={QuizTakeScreen} options={{ title: 'Làm bài' }} />
          <AppStack.Screen name="Materials" component={MaterialsScreen} options={{ title: 'Tài liệu' }} />
          <AppStack.Screen name="AIChat" component={AIChatScreen as never} options={{ title: 'Trợ lý AI' }} />
          <AppStack.Screen name="Notifications" component={NotificationsScreen} options={{ title: 'Thông báo' }} />
          <AppStack.Screen name="Analytics" component={AnalyticsScreen} options={{ title: 'Phân tích học tập' }} />
        </AppStack.Navigator>
      ) : (
        <AuthStack.Navigator screenOptions={{ headerShown: false }}>
          <AuthStack.Screen name="Login" component={LoginScreen} />
          <AuthStack.Screen name="Register" component={RegisterScreen} />
          <AuthStack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
        </AuthStack.Navigator>
      )}
    </NavigationContainer>
  );
}
