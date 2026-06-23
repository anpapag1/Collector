export const colors = {
  brand: {
    primary: '#2589C8',
    primaryMid: '#2F9FDB',
    primaryLight: '#62B3E5',
    primaryDark: '#17689B',
    primarySoft: '#EAF6FD',
    oldPrimary: '#2589C8',
    oldPrimaryStrong: '#17689B',
    oldPrimaryDark: '#17689B',
    oldPrimaryMuted: '#62B3E5',
  },

  background: {
    app: '#F7FBFE',
    muted: '#F3F8FC',
    soft: '#F1F8FD',
    softGreen: '#F1F8FD',
    fieldSoft: '#F3F8FC',
    elevatedGreen: '#EAF6FD',
    panelGreen: '#EAF6FD',
    mutedGreen: '#D8ECFA',
    successSoft: '#EAF6FD',
    successPale: '#EAF6FD',
    dangerSoft: '#fdf2f2',
    dangerPale: '#f2dada',
    warningSoft: '#ffdad6',
    white: '#fff',
    transparent: 'transparent',
  },

  text: {
    primary: '#171d1b',
    secondary: '#3f4946',
    muted: '#8EA8B8',
    subtle: '#8EA8B8',
    placeholder: '#7a847f',
    inverse: '#fff',
    brand: '#2589C8',
    oldBrand: '#2589C8',
    brandDark: '#17689B',
    danger: '#ba1a1a',
    dangerDark: '#7a0010',
    checkDark: '#00201c',
    warning: '#a07a00',
  },

  border: {
    default: '#D2E4EF',
    muted: '#B8C9D4',
    input: '#B8C9D4',
    soft: '#E3F0F8',
    softGreen: '#CFEAFA',
    section: '#E1EEF7',
    formSection: '#D8ECFA',
    divider: '#eef2f0',
    success: '#B7DBF3',
    successMuted: '#D8ECFA',
    image: '#B8C9D4',
    disabled: '#8EA8B8',
    ratingEmpty: '#C4D1D8',
  },

  action: {
    primary: '#2589C8',
    primaryGradient: ['#17689B', '#2589C8', '#62B3E5'],
    delete: '#a1161f',
    danger: '#ba1a1a',
    disabled: '#8EA8B8',
    folderAccent: '#BDE6FA',
  },

  shadow: {
    black: '#000',
    brand: '#17689B',
    hero: '#0B4F78',
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
