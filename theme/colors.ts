export const colors = {
  brand: {
    primary: '#047857',
    primaryMid: '#059669',
    primaryLight: '#10b981',
    primaryDark: '#065f46',
    oldPrimary: '#006a60',
    oldPrimaryStrong: '#00504a',
    oldPrimaryDark: '#004840',
    oldPrimaryMuted: '#7aada7',
  },

  background: {
    app: '#f4fbf8',
    muted: '#f0f4f2',
    soft: '#eef5f1',
    softGreen: '#eef7f4',
    fieldSoft: '#f0f5f3',
    elevatedGreen: '#e6f3ef',
    panelGreen: '#e8f2ee',
    mutedGreen: '#d3e8e2',
    successSoft: '#cce8e1',
    successPale: '#dcfce7',
    dangerSoft: '#fdf2f2',
    dangerPale: '#f2dada',
    warningSoft: '#ffdad6',
    white: '#fff',
    transparent: 'transparent',
  },

  text: {
    primary: '#171d1b',
    secondary: '#3f4946',
    muted: '#9fb3ad',
    subtle: '#9ab0a9',
    placeholder: '#7a847f',
    inverse: '#fff',
    brand: '#047857',
    oldBrand: '#006a60',
    brandDark: '#004840',
    danger: '#ba1a1a',
    dangerDark: '#7a0010',
    checkDark: '#00201c',
    warning: '#a07a00',
  },

  border: {
    default: '#d3e0db',
    muted: '#c2cfca',
    input: '#bec9c4',
    soft: '#e6f0eb',
    softGreen: '#d3ece5',
    section: '#e2ebe7',
    formSection: '#dde8e3',
    divider: '#eef2f0',
    success: '#b6d8d0',
    successMuted: '#cfe5df',
    image: '#c2d2cc',
    disabled: '#9fb3ad',
    ratingEmpty: '#c6d0cc',
  },

  action: {
    primary: '#047857',
    primaryGradient: ['#047857', '#059669', '#10b981'],
    delete: '#a1161f',
    danger: '#ba1a1a',
    disabled: '#9fb3ad',
    folderAccent: '#9ef2e1',
  },

  shadow: {
    black: '#000',
    brand: '#004840',
    hero: '#003b35',
  },

  overlay: {
    scrim: 'rgba(0,0,0,0.42)',
    imageScrim: 'rgba(0,0,0,0.55)',
    heroBubbleStrong: 'rgba(255,255,255,0.09)',
    heroBubbleSoft: 'rgba(255,255,255,0.07)',
    heroButton: 'rgba(255,255,255,0.14)',
    heroButtonBorder: 'rgba(255,255,255,0.22)',
    heroLogo: 'rgba(255,255,255,0.16)',
    toast: 'rgba(23,29,27,0.82)',
    toastText: 'rgba(238,241,238,0.95)',
    toastIcon: 'rgba(131,213,198,0.9)',
    toastClose: 'rgba(255,255,255,0.45)',
  },

  toast: {
    accent: '#83d5c6',
  },
} as const;

export type AppColors = typeof colors;
