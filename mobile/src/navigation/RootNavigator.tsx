import React, { useEffect, useRef, useState } from 'react';
import { Animated, View } from 'react-native';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { BottomTabBar, createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useAuth } from '../store/auth';
import { useSession } from '../store/session';
import { colors, fonts } from '../theme';
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
import { OnboardingScreen, SplashScreen } from '../screens/OnboardingScreen';
import type { AppStackParams, AuthStackParams, TabParams } from './types';
import { prefGet, prefSet, tr } from '../i18n';
import { SessionBar } from '../components/SessionBar';

const AuthStack = createNativeStackNavigator<AuthStackParams>();
const AppStack = createNativeStackNavigator<AppStackParams>();
const Tab = createBottomTabNavigator<TabParams>();

/** Icon tab: tab đang chọn được "tô dạ quang" phía sau, nảy nhẹ khi chọn */
function TabIcon({ name, focused }: { name: IconName; focused: boolean }) {
  const v = useRef(new Animated.Value(focused ? 1 : 0)).current;
  useEffect(() => {
    Animated.spring(v, { toValue: focused ? 1 : 0, useNativeDriver: true, speed: 18, bounciness: 10 }).start();
  }, [focused, v]);
  return (
    <View style={{ width: 58, height: 32, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View
        style={{
          position: 'absolute',
          width: 58,
          height: 32,
          borderRadius: 16,
          backgroundColor: colors.marker,
          opacity: v,
          transform: [{ scaleX: v.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) }],
        }}
      />
      <Icon name={name} size={24} color={focused ? colors.boardText : colors.boardMuted} strokeWidth={focused ? 2.1 : 1.75} />
    </View>
  );
}
const icon =
  (name: IconName) =>
  ({ focused }: { focused: boolean }) => <TabIcon name={name} focused={focused} />;

function Tabs() {
  const running = useSession((s) => s.session);
  // Đang học với Focus Shield: ẩn thanh tab để giảm xao nhãng
  const hideTabs = Boolean(running?.shieldEnabled);
  const insets = useSafeAreaInsets();
  return (
    <Tab.Navigator
      tabBar={(props) => (
        <>
          {!hideTabs && props.state.routes[props.state.index]?.name !== 'Focus' && <SessionBar onOpen={() => props.navigation.navigate('Focus')} />}
          <BottomTabBar {...props} />
        </>
      )}
      screenOptions={{
        headerShown: false,
        animation: 'shift',
        tabBarActiveTintColor: colors.boardText,
        tabBarInactiveTintColor: colors.boardMuted,
        tabBarLabelStyle: { fontSize: 11.5, fontWeight: '700', marginTop: 4 },
        tabBarStyle: hideTabs
          ? { display: 'none' }
          : { height: 68 + insets.bottom, paddingTop: 8, paddingBottom: Math.max(8, insets.bottom), backgroundColor: colors.board, borderTopWidth: 1, borderTopColor: colors.border, elevation: 0 },
      }}
    >
      <Tab.Screen name="Dashboard" component={DashboardScreen} options={{ title: tr('Hôm nay'), tabBarIcon: icon('home') }} />
      <Tab.Screen name="Plan" component={PlanScreen} options={{ title: tr('Kế hoạch'), tabBarIcon: icon('plan') }} />
      <Tab.Screen name="Focus" component={FocusScreen} options={{ title: tr('Tập trung'), tabBarIcon: icon('focus') }} />
      <Tab.Screen name="Learn" component={LearnScreen} options={{ title: tr('Ôn tập'), tabBarIcon: icon('cards') }} />
      <Tab.Screen name="Profile" component={ProfileScreen} options={{ title: tr('Cá nhân'), tabBarIcon: icon('settings') }} />
    </Tab.Navigator>
  );
}

export function RootNavigator() {
  const status = useAuth((s) => s.status);
  const [onboarded, setOnboarded] = useState(() => prefGet('onboarded') === '1');
  if (status === 'loading') return <SplashScreen />;
  if (status !== 'authed' && !onboarded)
    return (
      <OnboardingScreen
        onDone={() => {
          prefSet('onboarded', '1');
          setOnboarded(true);
        }}
      />
    );
  return (
    <NavigationContainer theme={{ ...DefaultTheme, colors: { ...DefaultTheme.colors, background: colors.bg, primary: colors.primary } }}>
      {status === 'authed' ? (
        <AppStack.Navigator
          screenOptions={{
            headerStyle: { backgroundColor: colors.board },
            headerShadowVisible: false,
            headerTintColor: colors.boardText,
            headerTitleStyle: { fontWeight: '700', fontSize: 18, fontFamily: fonts.display },
            contentStyle: { backgroundColor: colors.bg },
            animation: 'slide_from_right',
          }}
        >
          <AppStack.Screen name="Tabs" component={Tabs} options={{ headerShown: false }} />
          <AppStack.Screen name="TaskEdit" component={TaskEditScreen} options={{ title: tr('Nhiệm vụ') }} />
          <AppStack.Screen name="SubjectEdit" component={SubjectEditScreen} options={{ title: tr('Môn học') }} />
          <AppStack.Screen name="Journal" component={JournalScreen} options={{ title: tr('Nhật ký phân tâm') }} />
          <AppStack.Screen name="Review" component={ReviewScreen} options={{ title: tr('Ôn flashcard') }} />
          <AppStack.Screen name="QuizTake" component={QuizTakeScreen} options={{ title: tr('Làm bài') }} />
          <AppStack.Screen name="Materials" component={MaterialsScreen} options={{ title: tr('Tài liệu') }} />
          <AppStack.Screen name="AIChat" component={AIChatScreen as never} options={{ title: tr('Trợ lý AI') }} />
          <AppStack.Screen name="Notifications" component={NotificationsScreen} options={{ title: tr('Thông báo') }} />
          <AppStack.Screen name="Analytics" component={AnalyticsScreen} options={{ title: tr('Phân tích học tập') }} />
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
