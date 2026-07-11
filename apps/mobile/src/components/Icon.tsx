import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

import { useTheme } from '../theme/ThemeContext';

type Props = Readonly<{
  name: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
  size?: number;
  color?: string;
  variant?: 'fg' | 'sub' | 'accent';
}>;

export function Icon({ name, size = 24, color, variant = 'fg' }: Props) {
  const c = useTheme();
  let resolved = c.fg;
  if (variant === 'accent') {
    resolved = c.accent;
  } else if (variant === 'sub') {
    resolved = c.sub;
  }
  resolved = color ?? resolved;
  return <MaterialCommunityIcons name={name} size={size} color={resolved} />;
}
