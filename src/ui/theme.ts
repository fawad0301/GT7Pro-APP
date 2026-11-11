import { useColorScheme } from 'react-native';

export type Theme = {
  bg: string;
  card: string;
  text: string;
  sub: string;
  border: string;
  accent: string;
  accentText: string;
  good: string;
  warn: string;
  bad: string;
  water: string;
  track: string;
};

const light: Theme = {
  bg: '#F4F6F8',
  card: '#FFFFFF',
  text: '#14181F',
  sub: '#5B6573',
  border: '#E2E6EB',
  accent: '#1F6FEB',
  accentText: '#FFFFFF',
  good: '#1A7F4B',
  warn: '#B26A00',
  bad: '#C2362B',
  water: '#1689B5',
  track: '#E7EBF0',
};

const dark: Theme = {
  bg: '#0E1116',
  card: '#181C23',
  text: '#ECEFF3',
  sub: '#9AA4B1',
  border: '#2A303A',
  accent: '#5B9BFF',
  accentText: '#0E1116',
  good: '#4CC38A',
  warn: '#E9A23B',
  bad: '#F26D63',
  water: '#4FB8E0',
  track: '#262C36',
};

export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? dark : light;
}
