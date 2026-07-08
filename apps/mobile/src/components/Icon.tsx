import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

import { useTheme } from '../theme/ThemeContext';

type Props = {
  name: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  size?: number;
  color?: string;
  variant?: 'fg' | 'sub' | 'accent';
};

export function Icon({ name, size = 24, color, variant = 'fg' }: Props) {
  const c = useTheme();
  const resolved = color ?? (variant === 'accent' ? c.accent : variant === 'sub' ? c.sub : c.fg);
  return <MaterialCommunityIcons name={name} size={size} color={resolved} />;
}
