export interface ThemeColors {
  background: string;
  surface: string;
  surfaceElevated: string;
  primary: string;
  primaryDark: string;
  primaryLight: string;
  accent: string;
  success: string;
  warning: string;
  error: string;
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  border: string;
  moodGreat: string;
  moodGood: string;
  moodOkay: string;
  moodLow: string;
  moodTough: string;
}

export const darkColors: ThemeColors = {
  background: '#141517',
  surface: '#1E2023',
  surfaceElevated: '#282B30',
  primary: '#6DB88F',
  primaryDark: '#5A9E79',
  primaryLight: '#8FCFAB',
  accent: '#E88D67',
  success: '#6DB88F',
  warning: '#E8C468',
  error: '#D4726A',
  textPrimary: '#F2F0ED',
  textSecondary: '#9B9A97',
  textTertiary: '#6B6A67',
  border: '#2F3136',
  moodGreat: '#6DB88F',
  moodGood: '#8FCFAB',
  moodOkay: '#E8C468',
  moodLow: '#E88D67',
  moodTough: '#D4726A',
};

export const lightColors: ThemeColors = {
  background: '#FAF8F5',
  surface: '#FFFFFF',
  surfaceElevated: '#F5F2EE',
  primary: '#5A9E79',
  primaryDark: '#4A8A68',
  primaryLight: '#7AB896',
  accent: '#E07A52',
  success: '#5A9E79',
  warning: '#D4A84B',
  error: '#C4615A',
  textPrimary: '#1A1917',
  textSecondary: '#6B6A67',
  textTertiary: '#9B9A97',
  border: '#E8E5E0',
  moodGreat: '#5A9E79',
  moodGood: '#7AB896',
  moodOkay: '#D4A84B',
  moodLow: '#E07A52',
  moodTough: '#C4615A',
};
