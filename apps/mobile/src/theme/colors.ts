export type ColorScheme = {
  bg: string;
  card: string;
  fg: string;
  sub: string;
  fill: string;
  sep: string;
  accent: string;
  asoft: string;
  bar: string;
  pill: string;
  chipbd: string;
  danger: string;
};

export const lightColors: ColorScheme = {
  bg: '#fbfbf9',
  card: '#f1efec',
  fg: '#1b1b1b',
  sub: '#6b6b6b',
  fill: '#eceae7',
  sep: 'rgba(0,0,0,.07)',
  accent: '#00aa77',
  asoft: 'rgba(0,170,119,.14)',
  bar: '#f4f2ef',
  pill: 'rgba(0,170,119,.20)',
  chipbd: 'rgba(0,0,0,.20)',
  danger: '#e5484d',
};

export const darkColors: ColorScheme = {
  bg: '#121212',
  card: '#232323',
  fg: '#eaeaea',
  sub: '#a1a1a1',
  fill: '#2b2b2b',
  sep: 'rgba(255,255,255,.08)',
  accent: '#00aa77',
  asoft: 'rgba(0,170,119,.22)',
  bar: '#1e1e1e',
  pill: 'rgba(0,170,119,.28)',
  chipbd: 'rgba(255,255,255,.20)',
  danger: '#e5484d',
};
