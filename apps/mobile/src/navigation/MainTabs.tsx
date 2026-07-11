import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

import { Icon } from '../components/Icon';
import { HistoryScreen } from '../screens/HistoryScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { useTheme } from '../theme/ThemeContext';

export type MainTabsParamList = {
  Workout: undefined;
  History: undefined;
  Profile: undefined;
};

const Tab = createBottomTabNavigator<MainTabsParamList>();

const ICONS: Record<keyof MainTabsParamList, React.ComponentProps<typeof Icon>['name']> = {
  Workout: 'dumbbell',
  History: 'history',
  Profile: 'account',
};

type MainTabIconProps = Readonly<{
  routeName: keyof MainTabsParamList;
  color: string;
  size: number;
}>;

function MainTabIcon({ routeName, color, size }: MainTabIconProps) {
  return <Icon name={ICONS[routeName]} color={color} size={size} />;
}

export function MainTabs() {
  const c = useTheme();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: c.accent,
        tabBarInactiveTintColor: c.sub,
        tabBarStyle: { backgroundColor: c.bar, borderTopColor: c.sep },
        tabBarIcon: ({ color, size }) => (
          <MainTabIcon routeName={route.name as keyof MainTabsParamList} color={color} size={size} />
        ),
      })}
    >
      <Tab.Screen name="Workout" component={HomeScreen} />
      <Tab.Screen name="History" component={HistoryScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}
