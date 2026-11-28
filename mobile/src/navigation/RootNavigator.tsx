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
import { AnalyticsScreen, MaterialsScreen, NotificationsScreen } from '../screens/MoreScreens';
import { AIChatScreen, AICoachScreen } from '../screens/AIScreens';
import { GuideScreen, HistoryScreen, NotificationSettingsScreen, PreferencesScreen, SecurityScreen, ShieldSettingsScreen } from '../screens/ExtraScreens';
import { GoalsScreen, LearnProgressScreen, MistakesScreen } from '../screens/ReviewScreens';
import { DeckEditScreen, MaterialAddScreen, MaterialDetailScreen, QuizEditScreen } from '../screens/StudyScreens';
import { ProfileScreen } from '../screens/ProfileScreen';
import { OnboardingScreen, SplashScreen } from '../screens/OnboardingScreen';
import type { AppStackParams, AuthStackParams, TabParams } from './types';
import { prefGet, prefSet, tr } from '../i18n';
import { SessionBar } from '../components/SessionBar';
import { AppState } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { consumeNotifyLink, consumeWidgetAction } from '../native';
import { onPushOpen } from '../push';
import { openLink } from './links';
import { ChatsScreen, ChatThreadScreen } from '../screens/ChatScreens';
import { FriendsScreen, RoomScreen, RoomsScreen, WeeklyReportScreen } from '../screens/SocialScreens';
import { ExamDetailScreen, ExamEditScreen, ExamsScreen } from '../screens/ExamScreens';
import { ClassDetailScreen, ClassesScreen, LibraryScreen } from '../screens/CommunityScreens';

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

/** Đọc hành động khi người dùng bấm widget màn hình chính (mở app / bắt đầu 25 phút / ôn thẻ) */
function WidgetBridge() {
  const nav = useNavigation<any>(); // eslint-disable-line @typescript-eslint/no-explicit-any
  useEffect(() => {
    const check = async () => {
      const a = await consumeWidgetAction();
      if (a === 'startFocus') nav.navigate('Focus', { quickStart: Date.now() });
      else if (a === 'review') nav.navigate('Review');
      // chạm vào thông báo do app tự hiện (lúc app đang mở) -> mở đúng màn hình
      const link = await consumeNotifyLink();
      if (link) openLink(nav, link);
    };
    void check();
    const sub = AppState.addEventListener('change', (st) => st === 'active' && void check());
    // chạm vào thông báo đẩy -> mở đúng màn hình (tin nhắn, lớp học, phòng học…)
    const off = onPushOpen((link) => openLink(nav, link));
    return () => {
      sub.remove();
      off();
    };
  }, [nav]);
  return null;
}

function DashboardWithBridge() {
  return (
    <>
      <WidgetBridge />
      <DashboardScreen />
    </>
  );
}

function Tabs() {
  const running = useSession((s) => s.session);
  // Đang học với Focus Shield: ẩn thanh tab để giảm xao nhãng
  const hideTabs = Boolean(running?.shieldEnabled);
  const insets = useSafeAreaInsets();
  // Sau khi đổi ngôn ngữ app tự tải lại -> mở lại đúng tab Cá nhân
  const [initialTab] = useState<keyof TabParams>(() => {
    const t = prefGet('reopenTab');
    if (t) prefSet('reopenTab', '');
    return t === 'Profile' ? 'Profile' : 'Dashboard';
  });
  return (
    <Tab.Navigator
      initialRouteName={initialTab}
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
        // Nhãn tab không phóng theo cỡ chữ hệ thống để không bị cắt thành "Kế hoạ..."
        tabBarAllowFontScaling: false,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700', marginTop: 4 },
        tabBarStyle: hideTabs
          ? { display: 'none' }
          : { height: 68 + insets.bottom, paddingTop: 8, paddingBottom: Math.max(8, insets.bottom), backgroundColor: colors.board, borderTopWidth: 1, borderTopColor: colors.border, elevation: 0 },
      }}
    >
      <Tab.Screen name="Dashboard" component={DashboardWithBridge} options={{ title: tr('Hôm nay'), tabBarIcon: icon('home') }} />
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
          <AppStack.Screen name="AICoach" component={AICoachScreen} options={{ title: tr('Đề xuất & kế hoạch') }} />
          <AppStack.Screen name="History" component={HistoryScreen} options={{ title: tr('Lịch sử phiên học') }} />
          <AppStack.Screen name="Guide" component={GuideScreen} options={{ title: tr('Hướng dẫn sử dụng') }} />
          <AppStack.Screen name="MaterialDetail" component={MaterialDetailScreen} options={{ title: tr('Tài liệu') }} />
          <AppStack.Screen name="MaterialAdd" component={MaterialAddScreen} options={{ title: tr('Thêm tài liệu') }} />
          <AppStack.Screen name="DeckEdit" component={DeckEditScreen} options={{ title: tr('Bộ flashcard') }} />
          <AppStack.Screen name="QuizEdit" component={QuizEditScreen} options={{ title: tr('Bộ câu hỏi') }} />
          <AppStack.Screen name="Preferences" component={PreferencesScreen} options={{ title: tr('Sở thích học tập') }} />
          <AppStack.Screen name="ShieldSettings" component={ShieldSettingsScreen} options={{ title: 'Focus Shield' }} />
          <AppStack.Screen name="NotificationSettings" component={NotificationSettingsScreen} options={{ title: tr('Cài đặt thông báo') }} />
          <AppStack.Screen name="Security" component={SecurityScreen} options={{ title: tr('Bảo mật') }} />
          <AppStack.Screen name="Mistakes" component={MistakesScreen} options={{ title: tr('Ôn câu sai') }} />
          <AppStack.Screen name="LearnProgress" component={LearnProgressScreen} options={{ title: tr('Tiến độ ghi nhớ') }} />
          <AppStack.Screen name="Goals" component={GoalsScreen} options={{ title: tr('Mục tiêu học tập') }} />
          <AppStack.Screen name="Chats" component={ChatsScreen} options={{ title: tr('Tin nhắn') }} />
          <AppStack.Screen name="ChatThread" component={ChatThreadScreen} options={{ title: tr('Trò chuyện') }} />
          <AppStack.Screen name="Friends" component={FriendsScreen} options={{ title: tr('Bạn bè & xếp hạng') }} />
          <AppStack.Screen name="Rooms" component={RoomsScreen} options={{ title: tr('Phòng học chung') }} />
          <AppStack.Screen name="Room" component={RoomScreen} options={{ title: tr('Phòng học') }} />
          <AppStack.Screen name="WeeklyReport" component={WeeklyReportScreen} options={{ title: tr('Báo cáo tuần') }} />
          <AppStack.Screen name="Exams" component={ExamsScreen} options={{ title: tr('Ôn thi') }} />
          <AppStack.Screen name="ExamDetail" component={ExamDetailScreen} options={{ title: tr('Kế hoạch ôn thi') }} />
          <AppStack.Screen name="ExamEdit" component={ExamEditScreen} options={{ title: tr('Kỳ thi') }} />
          <AppStack.Screen name="Library" component={LibraryScreen} options={{ title: tr('Thư viện cộng đồng') }} />
          <AppStack.Screen name="Classes" component={ClassesScreen} options={{ title: tr('Lớp học') }} />
          <AppStack.Screen name="ClassDetail" component={ClassDetailScreen} options={{ title: tr('Lớp học') }} />
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
