import type { Role } from '../spec/index.ts';

/** Visual style for one role. Colors are hex; widths in px. */
export interface RoleStyle {
  color: string;
  strokeWidth: number;
  /** Fill opacity for regions. */
  fillOpacity?: number;
  /** Color for labels attached to elements of this role (defaults to `color`). */
  labelColor?: string;
}

export type InternalRole = 'grid' | 'axis';
export type AnyRole = Role | InternalRole;

export interface ByeTheme {
  name: string;
  /** Figure background. Transparent by default so the figure sits on the page. */
  background: string;
  transparentBackground: boolean;
  roles: Record<AnyRole, RoleStyle>;
  fonts: {
    /** Math labels and element labels (STIX Two Text). */
    math: string;
    mathItalic: string;
    /** Notes / explanatory text (Zen Kaku Gothic New). */
    note: string;
  };
  fontSize: { label: number; note: number; tick: number; min: number };
  pointRadius: number;
}

/** BYE design tokens, light theme (brief §6). */
export const ByeLightTheme: ByeTheme = {
  name: 'bye-light',
  background: '#f6f3ec',
  transparentBackground: true,
  roles: {
    grid: { color: '#ece6da', strokeWidth: 1 },
    axis: { color: '#8a8378', strokeWidth: 1 },
    f: { color: '#2f4b7c', strokeWidth: 2.5 },
    area: { color: '#2f4b7c', strokeWidth: 0, fillOpacity: 0.16, labelColor: '#2f4b7c' },
    bound: { color: '#b5462a', strokeWidth: 2.5 },
    F: { color: '#2f6b4a', strokeWidth: 2.5 },
    note: { color: '#5a554d', strokeWidth: 1 },
    text: { color: '#1e1c19', strokeWidth: 1 },
  },
  fonts: {
    math: 'STIXTwoText_400Regular',
    mathItalic: 'STIXTwoText_400Regular_Italic',
    note: 'ZenKakuGothicNew_400Regular',
  },
  fontSize: { label: 15, note: 12, tick: 11, min: 11 },
  pointRadius: 3.5,
};
