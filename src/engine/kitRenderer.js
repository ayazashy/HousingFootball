/**
 * Original Football Club Kit & Shield Crest Generator
 * Designed specifically for KSU Student Housing 6-a-Side Football League
 */

export const CLUB_KIT_THEMES = [
  { id: 'emerald_gold', label: 'أخضر ملكي وذهبي', primary: '#059669', secondary: '#F59E0B', pattern: 'stripes' },
  { id: 'navy_sky', label: 'كحلي وسماوي', primary: '#1E3A8A', secondary: '#38BDF8', pattern: 'sash' },
  { id: 'crimson_white', label: 'أحمر قرمزي وأبيض', primary: '#B91C1C', secondary: '#F8FAFC', pattern: 'halves' },
  { id: 'royal_gold', label: 'أزرق ملكي وذهبي', primary: '#1D4ED8', secondary: '#FBBF24', pattern: 'stripes' },
  { id: 'obsidian_emerald', label: 'أسود وزمردي', primary: '#18181B', secondary: '#10B981', pattern: 'sash' },
  { id: 'burgundy_gold', label: 'عنابي وذهبي', primary: '#7F1D1D', secondary: '#FDE047', pattern: 'solid' },
  { id: 'purple_silver', label: 'بنفسجي وفضي', primary: '#5B21B6', secondary: '#E2E8F0', pattern: 'halves' },
  { id: 'amber_black', label: 'ذهبي وأسود', primary: '#D97706', secondary: '#111827', pattern: 'stripes' },
  { id: 'teal_lime', label: 'تركواز وأخضر فاتح', primary: '#0F766E', secondary: '#A3E635', pattern: 'solid' },
  { id: 'slate_orange', label: 'رمادي داكن وبرتقالي', primary: '#334155', secondary: '#FB923C', pattern: 'sash' },
];

export const POSITIONS_AR = [
  { id: 'GK', label: 'حارس مرمى', short: 'حارس' },
  { id: 'DEF', label: 'مدافع', short: 'دفاع' },
  { id: 'MID', label: 'خط وسط', short: 'وسط' },
  { id: 'FWD', label: 'مهاجم', short: 'هجوم' },
];

function getInitials(name = '') {
  const cleaned = String(name).trim();
  if (!cleaned) return 'ن';
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0] || ''}${parts[1][0] || ''}`;
  }
  return cleaned.slice(0, 2);
}

export function getClubColors(team) {
  if (team?.primaryColor && team?.secondaryColor) {
    return {
      primary: team.primaryColor,
      secondary: team.secondaryColor,
      pattern: team.kitPattern || 'stripes',
    };
  }
  const found = CLUB_KIT_THEMES.find((k) => k.id === team?.kitId);
  if (found) return found;
  const hash = String(team?.name || team?.id || 'club')
    .split('')
    .reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return CLUB_KIT_THEMES[hash % CLUB_KIT_THEMES.length];
}

export function renderClubCrestDataUrl(team) {
  const { primary, secondary, pattern } = getClubColors(team);
  const initials = getInitials(team?.name || 'فريق');

  let patternSvg = '';
  if (pattern === 'stripes') {
    patternSvg = `
      <rect x="34" y="18" width="10" height="72" fill="${secondary}" fill-opacity="0.32"/>
      <rect x="55" y="14" width="10" height="80" fill="${secondary}" fill-opacity="0.32"/>
      <rect x="76" y="18" width="10" height="72" fill="${secondary}" fill-opacity="0.32"/>
    `;
  } else if (pattern === 'sash') {
    patternSvg = `<polygon points="24,24 38,18 96,80 82,88" fill="${secondary}" fill-opacity="0.36"/>`;
  } else if (pattern === 'halves') {
    patternSvg = `<path d="M60 10L100 24V56C100 81 82 98 60 106V10Z" fill="${secondary}" fill-opacity="0.28"/>`;
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
    <defs>
      <clipPath id="shieldClip">
        <path d="M60 10L100 24V56C100 81 82 98 60 106C38 98 20 81 20 56V24L60 10Z"/>
      </clipPath>
    </defs>
    <g clip-path="url(#shieldClip)">
      <rect width="120" height="120" fill="${primary}"/>
      ${patternSvg}
      <circle cx="60" cy="56" r="22" fill="#061412" fill-opacity="0.55" stroke="${secondary}" stroke-width="2"/>
    </g>
    <path d="M60 10L100 24V56C100 81 82 98 60 106C38 98 20 81 20 56V24L60 10Z" fill="none" stroke="${secondary}" stroke-width="4"/>
    <text x="60" y="63" text-anchor="middle" fill="#FFFFFF" font-family="sans-serif" font-weight="800" font-size="18">${initials}</text>
  </svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

