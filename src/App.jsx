import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Trophy,
  Calendar,
  Flame,
  Users,
  BookOpen,
  GitMerge,
  Lock,
  Unlock,
  RefreshCw,
  Award,
  ShieldAlert,
  Clock,
  Flag,
  X,
  Eye,
  EyeOff,
  Plus,
  Trash2,
  UserPlus,
  FileSpreadsheet,
  Search,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  CalendarPlus,
  Shuffle,
  Edit3,
  Radio,
  MessageCircle,
  FileWarning,
  XCircle,
  Database,
  Copy,
  Check,
  Save,
  LogOut,
} from 'lucide-react';
import * as kitRenderer from './engine/kitRenderer.js';
import * as footballRules from './engine/footballRules.js';
import * as firestoreClient from './services/firestoreClient.js';
import {
  decryptAndMountAdminVault,
  saveSessionPassphrase,
  getSessionPassphrase,
  clearSessionPassphrase,
} from './services/vaultCrypto.js';

const LucideIcons = {
  Trophy,
  Calendar,
  Flame,
  Users,
  BookOpen,
  GitMerge,
  Lock,
  Unlock,
  RefreshCw,
  Award,
  ShieldAlert,
  Clock,
  Flag,
  X,
  Eye,
  EyeOff,
  Plus,
  Trash2,
  UserPlus,
  FileSpreadsheet,
  Search,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  CalendarPlus,
  Shuffle,
  Edit3,
  Radio,
  MessageCircle,
  FileWarning,
  XCircle,
  Database,
  Copy,
  Check,
  Save,
  LogOut,
};

const LOCAL_CACHE_KEY = 'ksu_housing_6v6_cache_v2';

const DEFAULT_CONFIG = {
  tournamentTitle: 'بطولة كرة القدم السداسية بالإسكان الطلابي',
  groupCount: 4,
  qualifiersPerGroup: 2,
  pointsWin: 3,
  pointsDraw: 1,
  pointsLoss: 0,
};

function readCache() {
  try {
    const raw = localStorage.getItem(LOCAL_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeCache(state) {
  try {
    localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(state));
  } catch {}
}

export default function App() {
  const [teams, setTeams] = useState([]);
  const [groups, setGroups] = useState([]);
  const [matches, setMatches] = useState([]);
  const [protests, setProtests] = useState([]);
  const [manualSuspensions, setManualSuspensions] = useState({});
  const [config, setConfig] = useState(DEFAULT_CONFIG);

  const [publicView, setPublicView] = useState('matchday');
  const [selectedMatchModal, setSelectedMatchModal] = useState(null);
  const [selectedClubModal, setSelectedClubModal] = useState(null);

  const [isLoadingCloud, setIsLoadingCloud] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSavingCloud, setIsSavingCloud] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState(null);

  // Encrypted Admin Vault State
  const [showUnlockModal, setShowUnlockModal] = useState(() => {
    const q = window.location.search.toLowerCase();
    const h = window.location.hash.toLowerCase();
    return q.includes('admin') || h.includes('admin');
  });
  const [passwordInput, setPasswordInput] = useState('');
  const [showPassText, setShowPassText] = useState(false);
  const [unlockError, setUnlockError] = useState('');
  const [isDecrypting, setIsDecrypting] = useState(false);

  const [unlockedAdmin, setUnlockedAdmin] = useState(null); // { AdminComponent, secretCode }
  const [isAdminMode, setIsAdminMode] = useState(false);

  const stateRef = useRef({ teams, groups, matches, protests, manualSuspensions, config });
  stateRef.current = { teams, groups, matches, protests, manualSuspensions, config };

  const runtimeDeps = useMemo(
    () => ({
      React,
      createPortal,
      Icons: LucideIcons,
      kitRenderer,
      footballRules,
      firestoreClient,
    }),
    []
  );

  const applyTournamentSnapshot = useCallback((data) => {
    if (!data) return;
    const nextTeams = Array.isArray(data.teams) ? data.teams : [];
    const nextGroups = Array.isArray(data.groups) ? data.groups : [];
    const nextMatches = Array.isArray(data.matches) ? data.matches : [];
    const nextProtests = Array.isArray(data.protests) ? data.protests : [];
    const nextBans = data.manualSuspensions && typeof data.manualSuspensions === 'object' ? data.manualSuspensions : {};
    const nextConfig = { ...DEFAULT_CONFIG, ...(data.config || {}) };

    setTeams(nextTeams);
    setGroups(nextGroups);
    setMatches(nextMatches);
    setProtests(nextProtests);
    setManualSuspensions(nextBans);
    setConfig(nextConfig);

    writeCache({
      teams: nextTeams,
      groups: nextGroups,
      matches: nextMatches,
      protests: nextProtests,
      manualSuspensions: nextBans,
      config: nextConfig,
    });
  }, []);

  // Load initial cache + real-time Firestore listener
  useEffect(() => {
    const cached = readCache();
    if (cached) applyTournamentSnapshot(cached);

    const unsubscribe = firestoreClient.listenToTournamentState(
      (remote) => {
        if (remote) applyTournamentSnapshot(remote);
        setIsLoadingCloud(false);
      },
      () => {
        setIsLoadingCloud(false);
      }
    );

    return () => unsubscribe();
  }, [applyTournamentSnapshot]);

  // Auto-restore unlocked Admin session if passphrase is in sessionStorage
  useEffect(() => {
    const savedPass = getSessionPassphrase();
    if (!savedPass) return;
    decryptAndMountAdminVault(savedPass, runtimeDeps).then((res) => {
      if (res.success) {
        setUnlockedAdmin({
          AdminComponent: res.AdminComponent,
          secretCode: res.secretCode,
        });
      } else {
        clearSessionPassphrase();
      }
    });
  }, [runtimeDeps]);

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    try {
      const fresh = await firestoreClient.fetchTournamentState();
      if (fresh) applyTournamentSnapshot(fresh);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleUnlockSubmit = async (e) => {
    e.preventDefault();
    setIsDecrypting(true);
    setUnlockError('');
    try {
      const res = await decryptAndMountAdminVault(passwordInput, runtimeDeps);
      if (!res.success) {
        setUnlockError(res.error || 'كلمة المرور غير صحيحة.');
        return;
      }
      saveSessionPassphrase(passwordInput.trim());
      setUnlockedAdmin({
        AdminComponent: res.AdminComponent,
        secretCode: res.secretCode,
      });
      setIsAdminMode(true);
      setShowUnlockModal(false);
      setPasswordInput('');
    } finally {
      setIsDecrypting(false);
    }
  };

  const handlePersistState = useCallback(
    async (patch) => {
      const cur = stateRef.current;
      const merged = {
        teams: patch.teams ?? cur.teams,
        groups: patch.groups ?? cur.groups,
        matches: patch.matches ?? cur.matches,
        protests: patch.protests ?? cur.protests,
        manualSuspensions: patch.manualSuspensions ?? cur.manualSuspensions,
        config: patch.config ?? cur.config,
      };

      setTeams(merged.teams);
      setGroups(merged.groups);
      setMatches(merged.matches);
      setProtests(merged.protests);
      setManualSuspensions(merged.manualSuspensions);
      setConfig(merged.config);
      writeCache(merged);

      if (!unlockedAdmin?.secretCode) return;
      setIsSavingCloud(true);
      try {
        const res = await firestoreClient.pushTournamentState(merged, unlockedAdmin.secretCode);
        if (res.success) setLastSavedAt(new Date());
      } finally {
        setIsSavingCloud(false);
      }
    },
    [unlockedAdmin]
  );

  const handlePersistMatchAtomic = useCallback(
    async (nextMatches) => {
      setMatches(nextMatches);
      writeCache({ ...stateRef.current, matches: nextMatches });

      if (!unlockedAdmin?.secretCode) return;
      setIsSavingCloud(true);
      try {
        const res = await firestoreClient.pushMatchesTransaction(nextMatches, unlockedAdmin.secretCode);
        if (res.success) setLastSavedAt(new Date());
      } finally {
        setIsSavingCloud(false);
      }
    },
    [unlockedAdmin]
  );

  const teamsMap = useMemo(() => {
    const m = {};
    for (const t of teams) m[t.id] = t;
    return m;
  }, [teams]);

  const analytics = useMemo(
    () => footballRules.computeTournamentAnalytics(teams, matches, manualSuspensions),
    [teams, matches, manualSuspensions]
  );

  const playerList = useMemo(() => Object.values(analytics.playerStats || {}), [analytics]);
  const topScorers = useMemo(
    () => [...playerList].filter((p) => p.goals > 0).sort((a, b) => b.goals - a.goals || b.assists - a.assists),
    [playerList]
  );
  const topAssists = useMemo(
    () => [...playerList].filter((p) => p.assists > 0).sort((a, b) => b.assists - a.assists || b.goals - a.goals),
    [playerList]
  );
  const topMvps = useMemo(
    () => [...playerList].filter((p) => p.mvps > 0).sort((a, b) => b.mvps - a.mvps || b.goals - a.goals),
    [playerList]
  );
  const suspendedPlayers = useMemo(
    () => playerList.filter((p) => p.isSuspended || p.yellowWarning),
    [playerList]
  );

  const totalGoals = useMemo(
    () => Object.values(analytics.teamStats || {}).reduce((acc, t) => acc + t.gf, 0),
    [analytics]
  );

  // If Admin Vault is unlocked and active, render the decrypted private AdminDashboardApp!
  if (isAdminMode && unlockedAdmin?.AdminComponent) {
    const DecryptedAdminApp = unlockedAdmin.AdminComponent;
    return (
      <DecryptedAdminApp
        teams={teams}
        groups={groups}
        matches={matches}
        protests={protests}
        manualSuspensions={manualSuspensions}
        config={config}
        analytics={analytics}
        secretCode={unlockedAdmin.secretCode}
        isSaving={isSavingCloud}
        lastSavedAt={lastSavedAt}
        onPersistState={handlePersistState}
        onPersistMatchAtomic={handlePersistMatchAtomic}
        onExitAdmin={(lockVault = false) => {
          if (lockVault) {
            clearSessionPassphrase();
            setUnlockedAdmin(null);
          }
          setIsAdminMode(false);
        }}
      />
    );
  }

  const liveMatches = matches.filter((m) => m.status === 'live');
  const koMatches = matches.filter((m) => m.stage !== 'group');

  return (
    <div style={{ minHeight: '100dvh', flex: 1, display: 'flex', flexDirection: 'column' }}>
      {/* Broadcast Score Ticker Ribbon */}
      {matches.length > 0 && (
        <div className="hf-ticker-bar">
          <span className="hf-pill hf-pill-emerald" style={{ flexShrink: 0 }}>
            شريط المباريات
          </span>
          {matches.slice(0, 14).map((m) => {
            const hName = teamsMap[m.homeTeamId]?.name || m.homeName || '—';
            const aName = teamsMap[m.awayTeamId]?.name || m.awayName || '—';
            return (
              <button
                key={m.id}
                type="button"
                className="hf-ticker-chip"
                onClick={() => setSelectedMatchModal(m)}
              >
                {m.status === 'live' && <span style={{ color: '#EF4444' }}>●</span>}
                <span style={{ fontWeight: 700 }}>{hName}</span>
                <strong style={{ color: 'var(--hf-gold)' }}>
                  {m.status === 'scheduled' ? 'VS' : `${m.homeScore ?? 0}-${m.awayScore ?? 0}`}
                </strong>
                <span style={{ fontWeight: 700 }}>{aName}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Stadium Broadcast Hero Header */}
      <header
        style={{
          padding: '22px 18px 16px',
          borderBottom: '1px solid var(--hf-border)',
          background: 'linear-gradient(180deg, rgba(16,185,129,0.12) 0%, rgba(4,17,14,0.95) 100%)',
        }}
      >
        <div style={{ maxWidth: 1320, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <img src="./crest.svg" alt="شعار البطولة" style={{ width: 58, height: 58 }} />
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="hf-pill hf-pill-gold">جامعة الملك سعود • الإسكان الطلابي</span>
                  {liveMatches.length > 0 && (
                    <span className="hf-pill hf-pill-live">🔴 {liveMatches.length} مباراة مباشرة</span>
                  )}
                </div>
                <h1 style={{ fontSize: 22, fontWeight: 900, color: '#fff', marginTop: 4 }}>
                  {config.tournamentTitle}
                </h1>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                type="button"
                className="hf-btn hf-btn-ghost"
                onClick={handleManualRefresh}
                disabled={isRefreshing}
              >
                <RefreshCw size={14} />
                تحديث
              </button>

              {unlockedAdmin ? (
                <button
                  type="button"
                  className="hf-btn hf-btn-primary"
                  onClick={() => setIsAdminMode(true)}
                >
                  <Unlock size={15} />
                  لوحة عمليات البطولة
                </button>
              ) : (
                <button
                  type="button"
                  className="hf-btn hf-btn-ghost"
                  onClick={() => setShowUnlockModal(true)}
                >
                  <Lock size={14} />
                  بوابة اللجنة المنظمة
                </button>
              )}
            </div>
          </div>

          {/* KPI Strip & Navigation */}
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflowX: 'auto', paddingBottom: 2, maxWidth: '100%' }}>
              {[
                { id: 'matchday', label: 'المباريات والمجموعات', icon: Calendar },
                { id: 'knockout', label: 'الأدوار الإقصائية', icon: GitMerge },
                { id: 'leaders', label: 'الهدافون والانضباط', icon: Flame },
                { id: 'clubs', label: 'الأندية واللاعبون', icon: Users },
                { id: 'regulations', label: 'اللجان واللائحة', icon: BookOpen },
              ].map((tab) => {
                const Icon = tab.icon;
                const active = publicView === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setPublicView(tab.id)}
                    className={`hf-btn ${active ? 'hf-btn-primary' : 'hf-btn-ghost'}`}
                    style={{ whiteSpace: 'nowrap', flexShrink: 0, height: 38, borderRadius: 999 }}
                  >
                    <Icon size={15} />
                    {tab.label}
                  </button>
                );
              })}
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <span className="hf-pill hf-pill-emerald">🛡️ {teams.length} نادٍ</span>
              <span className="hf-pill hf-pill-muted">🏟️ {matches.length} مباراة</span>
              <span className="hf-pill hf-pill-gold">⚽ {totalGoals} هدف</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main style={{ flex: 1, maxWidth: 1320, width: '100%', margin: '0 auto', padding: '22px 18px 48px' }}>
        {isLoadingCloud && teams.length === 0 ? (
          <div className="hf-card" style={{ padding: 48, textAlign: 'center', color: 'var(--hf-muted)' }}>
            جاري مزامنة بيانات البطولة...
          </div>
        ) : null}

        {/* 1. MATCHDAY & STANDINGS SPLIT VIEW */}
        {publicView === 'matchday' && (
          <div className="hf-matchday-split">
            {/* Group Standings Column */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <h2 style={{ fontSize: 17, fontWeight: 800, color: 'var(--hf-emerald-bright)' }}>
                ترتيب مجموعات البطولة
              </h2>
              {groups.length === 0 ? (
                <div className="hf-card" style={{ padding: 32, textAlign: 'center', color: 'var(--hf-muted)' }}>
                  سيتم عرض جدول المجموعات فور اعتماده من اللجنة الفنية.
                </div>
              ) : (
                groups.map((g) => {
                  const rows = footballRules.computeGroupTable(g, matches, teamsMap, config);
                  const qual = Number(config.qualifiersPerGroup) || 2;
                  return (
                    <div key={g.id} className="hf-card" style={{ overflow: 'hidden' }}>
                      <div
                        style={{
                          padding: '11px 16px',
                          background: 'rgba(16,185,129,0.1)',
                          borderBottom: '1px solid var(--hf-border)',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                        }}
                      >
                        <span style={{ fontWeight: 800, fontSize: 15 }}>{g.name}</span>
                        <span style={{ fontSize: 11, color: 'var(--hf-muted)' }}>يتأهل أول {qual}</span>
                      </div>
                      <div style={{ overflowX: 'auto' }}>
                        <table className="hf-table">
                          <thead>
                            <tr>
                              <th>#</th>
                              <th>الفريق</th>
                              <th style={{ textAlign: 'center' }}>لعب</th>
                              <th style={{ textAlign: 'center' }}>ف</th>
                              <th style={{ textAlign: 'center' }}>ت</th>
                              <th style={{ textAlign: 'center' }}>خ</th>
                              <th style={{ textAlign: 'center' }}>+/-</th>
                              <th style={{ textAlign: 'center' }}>نقاط</th>
                            </tr>
                          </thead>
                          <tbody>
                            {rows.map((r, idx) => (
                              <tr
                                key={r.teamId}
                                style={{ background: idx < qual ? 'rgba(16,185,129,0.06)' : undefined }}
                              >
                                <td style={{ fontWeight: 800, color: idx < qual ? 'var(--hf-emerald-bright)' : 'var(--hf-muted)' }}>
                                  {idx + 1}
                                </td>
                                <td>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <img
                                      src={kitRenderer.renderClubCrestDataUrl(r.team || { name: r.name })}
                                      alt=""
                                      style={{ width: 24, height: 24 }}
                                    />
                                    <span style={{ fontWeight: 700, color: '#fff' }}>{r.name}</span>
                                  </div>
                                </td>
                                <td style={{ textAlign: 'center' }}>{r.played}</td>
                                <td style={{ textAlign: 'center', color: 'var(--hf-emerald-bright)' }}>{r.won}</td>
                                <td style={{ textAlign: 'center' }}>{r.drawn}</td>
                                <td style={{ textAlign: 'center', color: '#F87171' }}>{r.lost}</td>
                                <td style={{ textAlign: 'center', fontWeight: 700 }}>
                                  {r.gd > 0 ? `+${r.gd}` : r.gd}
                                </td>
                                <td style={{ textAlign: 'center', fontWeight: 900, color: idx < qual ? 'var(--hf-emerald-bright)' : '#fff' }}>
                                  {r.points}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Fixtures & Results Feed Column */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <h2 style={{ fontSize: 17, fontWeight: 800, color: 'var(--hf-gold)' }}>
                جدول ونتائج المباريات (اضغط على أي مباراة للتفاصيل)
              </h2>
              {matches.length === 0 ? (
                <div className="hf-card" style={{ padding: 32, textAlign: 'center', color: 'var(--hf-muted)' }}>
                  لم تُدرج مباريات في الجدول بعد.
                </div>
              ) : (
                matches.map((m) => {
                  const home = teamsMap[m.homeTeamId];
                  const away = teamsMap[m.awayTeamId];
                  const hName = home?.name || m.homeName || 'يُحدد لاحقاً';
                  const aName = away?.name || m.awayName || 'يُحدد لاحقاً';
                  const goals = (m.events || []).filter(
                    (e) => e.type === 'goal' || e.type === 'penalty_goal' || e.type === 'own_goal'
                  );

                  return (
                    <div
                      key={m.id}
                      className="hf-card"
                      style={{ padding: 14, cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 10 }}
                      onClick={() => setSelectedMatchModal(m)}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span className="hf-pill hf-pill-emerald">{m.roundName}</span>
                        {m.status === 'live' ? (
                          <span className="hf-pill hf-pill-live">🔴 مباشر</span>
                        ) : m.status === 'completed' ? (
                          <span className="hf-pill hf-pill-gold">انتهت</span>
                        ) : (
                          <span className="hf-pill hf-pill-muted">قادمة</span>
                        )}
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 10 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <img src={kitRenderer.renderClubCrestDataUrl(home || { name: hName })} alt="" style={{ width: 34, height: 34 }} />
                          <span style={{ fontWeight: 800, fontSize: 14 }}>{hName}</span>
                        </div>

                        <div style={{ textAlign: 'center', padding: '4px 12px', borderRadius: 10, background: 'rgba(0,0,0,0.3)' }}>
                          {m.status === 'scheduled' ? (
                            <span style={{ fontWeight: 800, color: 'var(--hf-muted)' }}>{m.time || 'VS'}</span>
                          ) : (
                            <span style={{ fontSize: 20, fontWeight: 900, color: '#fff' }}>
                              {m.homeScore ?? 0} : {m.awayScore ?? 0}
                            </span>
                          )}
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
                          <span style={{ fontWeight: 800, fontSize: 14 }}>{aName}</span>
                          <img src={kitRenderer.renderClubCrestDataUrl(away || { name: aName })} alt="" style={{ width: 34, height: 34 }} />
                        </div>
                      </div>

                      {goals.length > 0 && (
                        <div style={{ fontSize: 11.5, color: 'var(--hf-muted)', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 6 }}>
                          ⚽ {goals.map((g) => `${g.playerName}${g.minute ? ` (${g.minute}')` : ''}`).join(' • ')}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* 2. KNOCKOUT STAGE VIEW */}
        {publicView === 'knockout' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div className="hf-card" style={{ padding: 18 }}>
              <h2 style={{ fontSize: 18, fontWeight: 900, color: 'var(--hf-gold)' }}>
                شجرة الحسم والأدوار الإقصائية
              </h2>
              <p style={{ fontSize: 12.5, color: 'var(--hf-muted)' }}>
                بحسب لائحة البطولة، في حال انتهاء الوقت الأصلي بالتعادل في الأدوار الإقصائية يتم اللجوء مباشرة إلى ركلات الترجيح (3 ركلات لكل فريق).
              </p>
            </div>

            {koMatches.length === 0 ? (
              <div className="hf-card" style={{ padding: 44, textAlign: 'center', color: 'var(--hf-muted)' }}>
                <Trophy size={36} style={{ margin: '0 auto 10px', opacity: 0.4 }} />
                <div>تبدأ الأدوار الإقصائية فور انتهاء دور المجموعات.</div>
              </div>
            ) : (
              <div className="hf-grid-cards">
                {koMatches.map((m) => {
                  const home = teamsMap[m.homeTeamId];
                  const away = teamsMap[m.awayTeamId];
                  const hName = home?.name || m.homeName || 'يُحدد لاحقاً';
                  const aName = away?.name || m.awayName || 'يُحدد لاحقاً';
                  return (
                    <div
                      key={m.id}
                      className="hf-card"
                      style={{ padding: 16, cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 10 }}
                      onClick={() => setSelectedMatchModal(m)}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span className="hf-pill hf-pill-gold">{m.roundName}</span>
                        <span className="hf-pill hf-pill-muted">
                          {m.status === 'completed' ? 'انتهت' : m.status === 'live' ? 'مباشر 🔴' : 'قادمة'}
                        </span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 10 }}>
                        <div style={{ textAlign: 'center' }}>
                          <img src={kitRenderer.renderClubCrestDataUrl(home || { name: hName })} alt="" style={{ width: 38, height: 38 }} />
                          <div style={{ fontWeight: 800, fontSize: 13.5, marginTop: 4 }}>{hName}</div>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: 22, fontWeight: 900 }}>
                            {m.status === 'scheduled' ? 'VS' : `${m.homeScore ?? 0} - ${m.awayScore ?? 0}`}
                          </div>
                          {m.homePenalties !== null && m.homePenalties !== undefined && (
                            <div style={{ fontSize: 11, color: 'var(--hf-gold)', fontWeight: 700 }}>
                              ترجيح ({m.homePenalties} - {m.awayPenalties})
                            </div>
                          )}
                        </div>
                        <div style={{ textAlign: 'center' }}>
                          <img src={kitRenderer.renderClubCrestDataUrl(away || { name: aName })} alt="" style={{ width: 38, height: 38 }} />
                          <div style={{ fontWeight: 800, fontSize: 13.5, marginTop: 4 }}>{aName}</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* 3. LEADERBOARDS & DISCIPLINE RADAR */}
        {publicView === 'leaders' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {suspendedPlayers.length > 0 && (
              <div className="hf-alert-box hf-alert-danger">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, marginBottom: 6 }}>
                  <ShieldAlert size={17} />
                  رادار لجنة الانضباط (الإيقافات والإنذارات المسجلة)
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {suspendedPlayers.map((p) => (
                    <span key={p.id} className={p.isSuspended ? 'hf-pill hf-pill-live' : 'hf-pill hf-pill-gold'}>
                      {p.name} ({p.teamName}) — {p.isSuspended ? `موقوف: ${p.suspensionReason}` : 'إنذاران أصفران (مهدد بالإيقاف)'}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="hf-grid-cards" style={{ gap: 16 }}>
              {/* Top Scorers */}
              <div className="hf-card" style={{ overflow: 'hidden' }}>
                <div style={{ padding: '13px 16px', fontWeight: 900, color: 'var(--hf-emerald-bright)', borderBottom: '1px solid var(--hf-border)' }}>
                  ⚽ سباق الهدافين (الحذاء الذهبي)
                </div>
                <table className="hf-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>اللاعب</th>
                      <th>الفريق</th>
                      <th style={{ textAlign: 'center' }}>الأهداف</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topScorers.length === 0 ? (
                      <tr><td colSpan={4} style={{ textAlign: 'center', padding: 20, color: 'var(--hf-muted)' }}>لم تُسجل أهداف بعد</td></tr>
                    ) : (
                      topScorers.slice(0, 15).map((p, i) => (
                        <tr key={p.id}>
                          <td style={{ fontWeight: 900, color: i === 0 ? 'var(--hf-gold)' : 'var(--hf-muted)' }}>{i + 1}</td>
                          <td style={{ fontWeight: 800, color: '#fff' }}>{p.name}</td>
                          <td style={{ fontSize: 12, color: 'var(--hf-muted)' }}>{p.teamName}</td>
                          <td style={{ textAlign: 'center', fontWeight: 900, color: 'var(--hf-emerald-bright)' }}>{p.goals}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Top Playmakers */}
              <div className="hf-card" style={{ overflow: 'hidden' }}>
                <div style={{ padding: '13px 16px', fontWeight: 900, color: '#38BDF8', borderBottom: '1px solid var(--hf-border)' }}>
                  🎯 صناع الأهداف (Assists)
                </div>
                <table className="hf-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>اللاعب</th>
                      <th>الفريق</th>
                      <th style={{ textAlign: 'center' }}>صناعة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topAssists.length === 0 ? (
                      <tr><td colSpan={4} style={{ textAlign: 'center', padding: 20, color: 'var(--hf-muted)' }}>لم تُسجل صناعة أهداف بعد</td></tr>
                    ) : (
                      topAssists.slice(0, 15).map((p, i) => (
                        <tr key={p.id}>
                          <td style={{ fontWeight: 900, color: 'var(--hf-muted)' }}>{i + 1}</td>
                          <td style={{ fontWeight: 800, color: '#fff' }}>{p.name}</td>
                          <td style={{ fontSize: 12, color: 'var(--hf-muted)' }}>{p.teamName}</td>
                          <td style={{ textAlign: 'center', fontWeight: 900, color: '#38BDF8' }}>{p.assists}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* MVP Leaders */}
              <div className="hf-card" style={{ overflow: 'hidden' }}>
                <div style={{ padding: '13px 16px', fontWeight: 900, color: 'var(--hf-gold)', borderBottom: '1px solid var(--hf-border)' }}>
                  <Award size={15} style={{ display: 'inline', marginLeft: 5 }} />
                  نجوم المباريات (MVP)
                </div>
                <table className="hf-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>اللاعب</th>
                      <th>الفريق</th>
                      <th style={{ textAlign: 'center' }}>المرات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topMvps.length === 0 ? (
                      <tr><td colSpan={4} style={{ textAlign: 'center', padding: 20, color: 'var(--hf-muted)' }}>لم يُختر رجل مباراة بعد</td></tr>
                    ) : (
                      topMvps.slice(0, 15).map((p, i) => (
                        <tr key={p.id}>
                          <td style={{ fontWeight: 900, color: 'var(--hf-gold)' }}>{i + 1}</td>
                          <td style={{ fontWeight: 800, color: '#fff' }}>{p.name}</td>
                          <td style={{ fontSize: 12, color: 'var(--hf-muted)' }}>{p.teamName}</td>
                          <td style={{ textAlign: 'center', fontWeight: 900, color: 'var(--hf-gold)' }}>{p.mvps}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* 4. CLUBS & SQUADS */}
        {publicView === 'clubs' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 240px), 1fr))', gap: 14 }}>
            {teams.length === 0 ? (
              <div className="hf-card" style={{ padding: 36, textAlign: 'center', color: 'var(--hf-muted)' }}>
                لم تُضف الأندية بعد.
              </div>
            ) : (
              teams.map((t) => (
                <div
                  key={t.id}
                  className="hf-card"
                  style={{ padding: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 }}
                  onClick={() => setSelectedClubModal(t)}
                >
                  <img src={kitRenderer.renderClubCrestDataUrl(t)} alt="" style={{ width: 48, height: 48 }} />
                  <div>
                    <div style={{ fontWeight: 900, fontSize: 15, color: '#fff' }}>{t.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--hf-muted)', marginTop: 2 }}>
                      {(t.players || []).length} لاعب • الكابتن: {t.captainName || 'غير محدد'}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* 5. ORGANIZING COMMITTEES & OFFICIAL REGULATIONS */}
        {publicView === 'regulations' && (
          <div className="hf-grid-cards" style={{ gap: 16 }}>
            <div className="hf-card" style={{ padding: 20 }}>
              <h3 style={{ fontSize: 17, fontWeight: 900, color: 'var(--hf-gold)', marginBottom: 12 }}>
                اللجنة المنظمة والإشراف العام
              </h3>
              <ul style={{ fontSize: 13.5, lineHeight: 1.9, paddingRight: 18 }}>
                <li><strong>المشرف العام على البطولة:</strong> أ/ عبدالله الزهراني</li>
                <li><strong>المشرف الرياضي:</strong> ك/ عارف الياس</li>
                <li><strong>1. اللجنة الفنية:</strong> التأكد من أهلية اللاعبين، إعداد الجدول، واعتماد قوائم الفرق والنتائج.</li>
                <li><strong>2. لجنة الحكام:</strong> تعيين الحكام وتطبيق قوانين كرة القدم السداسية المعتمدة.</li>
                <li><strong>3. لجنة الانضباط:</strong> النظر في المخالفات، تحديد الإيقافات، ودراسة الاحتجاجات.</li>
                <li><strong>4. اللجنة الإعلامية:</strong> التغطية الإعلامية، نشر الجداول والنتائج، وإبراز نجوم البطولة.</li>
                <li><strong>5. اللجنة الطبية والتجهيزات:</strong> توفير حقيبة الإسعافات الأولية، الكرات، الشباك، والقمصان المميزة.</li>
              </ul>
            </div>

            <div className="hf-card" style={{ padding: 20 }}>
              <h3 style={{ fontSize: 17, fontWeight: 900, color: 'var(--hf-emerald-bright)', marginBottom: 12 }}>
                اللائحة الفنية والانضباطية المعتمدة
              </h3>
              <ul style={{ fontSize: 13.5, lineHeight: 1.9, paddingRight: 18 }}>
                <li><strong>زمن المباراة:</strong> 40 دقيقة مقسمة على شوطين (20 دقيقة لكل شوط) وبينهما 5 دقائق استراحة.</li>
                <li><strong>الحضور والأهلية:</strong> التواجد قبل المباراة بـ 30 دقيقة مع إبراز البطاقة الجامعية؛ التأخر أكثر من 15 دقيقة يُعد انسحاباً (خسارة 0-3).</li>
                <li><strong>اللاعبون والتبديلات:</strong> لا تبدأ المباراة بأقل من 4 لاعبين، وتُمنح 3 فرص تبديل فقط خلال اللقاء.</li>
                <li><strong>معايير الترتيب:</strong> النقاط (3 فوز / 1 تعادل) ← فارق الأهداف ← المواجهات المباشرة ← اللعب النظيف ← الأهداف المسجلة ← القرعة.</li>
                <li><strong>حسم التعادل الإقصائي:</strong> ركلات ترجيح مباشرة (3 ركلات لكل فريق ثم ركلة بركلة) دون أشواط إضافية.</li>
                <li><strong>العقوبات والاحتجاجات:</strong> بطاقتان صفراوان في مباراة = طرد وإيقاف؛ 3 صفراء متفرقة = إيقاف مباراة؛ يُرفع الاحتجاج خلال 30 دقيقة من نهاية اللقاء.</li>
              </ul>
            </div>
          </div>
        )}
      </main>

      {/* Match Details Modal for Spectators */}
      {selectedMatchModal && (
        <div className="hf-modal-overlay" onClick={() => setSelectedMatchModal(null)}>
          <div className="hf-modal-box" style={{ maxWidth: 540 }} onClick={(e) => e.stopPropagation()}>
            <div className="hf-modal-head">
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 800 }}>بطاقة تفاصيل المباراة</h3>
                <span style={{ fontSize: 12, color: 'var(--hf-muted)' }}>{selectedMatchModal.roundName}</span>
              </div>
              <button type="button" className="hf-btn hf-btn-ghost" onClick={() => setSelectedMatchModal(null)}>
                <X size={15} />
              </button>
            </div>
            <div className="hf-modal-content" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="hf-score-editor">
                <div className="hf-score-team">
                  <img
                    src={kitRenderer.renderClubCrestDataUrl(teamsMap[selectedMatchModal.homeTeamId] || { name: selectedMatchModal.homeName })}
                    alt=""
                    style={{ width: 48, height: 48 }}
                  />
                  <span style={{ fontWeight: 800 }}>{teamsMap[selectedMatchModal.homeTeamId]?.name || selectedMatchModal.homeName}</span>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 28, fontWeight: 900 }}>
                    {selectedMatchModal.status === 'scheduled'
                      ? 'VS'
                      : `${selectedMatchModal.homeScore ?? 0} : ${selectedMatchModal.awayScore ?? 0}`}
                  </div>
                  {selectedMatchModal.homePenalties !== null && selectedMatchModal.homePenalties !== undefined && (
                    <div style={{ fontSize: 12, color: 'var(--hf-gold)', fontWeight: 700 }}>
                      ركلات الترجيح ({selectedMatchModal.homePenalties} - {selectedMatchModal.awayPenalties})
                    </div>
                  )}
                </div>
                <div className="hf-score-team">
                  <img
                    src={kitRenderer.renderClubCrestDataUrl(teamsMap[selectedMatchModal.awayTeamId] || { name: selectedMatchModal.awayName })}
                    alt=""
                    style={{ width: 48, height: 48 }}
                  />
                  <span style={{ fontWeight: 800 }}>{teamsMap[selectedMatchModal.awayTeamId]?.name || selectedMatchModal.awayName}</span>
                </div>
              </div>

              {(selectedMatchModal.events || []).length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--hf-muted)', padding: 14, fontSize: 13 }}>
                  لا توجد أحداث تفصيلية مسجلة لهذه المباراة.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {(selectedMatchModal.events || []).map((ev) => (
                    <div
                      key={ev.id}
                      style={{
                        padding: '8px 12px',
                        borderRadius: 10,
                        background: 'rgba(255,255,255,0.03)',
                        border: '1px solid var(--hf-border)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: 13,
                      }}
                    >
                      <div>
                        <strong>{ev.playerName}</strong>
                        {ev.assistPlayerName && <span style={{ color: '#38BDF8', fontSize: 12 }}> (صناعة: {ev.assistPlayerName})</span>}
                        <span style={{ color: 'var(--hf-muted)', fontSize: 12 }}> — {teamsMap[ev.teamId]?.name}</span>
                      </div>
                      <span>
                        {ev.type === 'goal' || ev.type === 'penalty_goal'
                          ? '⚽ هدف'
                          : ev.type === 'own_goal'
                          ? '⚽ هدف عكسي'
                          : ev.type === 'yellow_card'
                          ? '🟨 صفراء'
                          : '🟥 حمراء'}{' '}
                        {ev.minute ? `(${ev.minute}')` : ''}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, fontSize: 12, color: 'var(--hf-muted)' }}>
                {selectedMatchModal.date && <span>📅 {selectedMatchModal.date}</span>}
                {selectedMatchModal.time && <span>⏰ {selectedMatchModal.time}</span>}
                {selectedMatchModal.pitch && <span>🏟️ {selectedMatchModal.pitch}</span>}
                {selectedMatchModal.referee && <span>🏁 الحكم: {selectedMatchModal.referee}</span>}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Club Squad Modal for Spectators */}
      {selectedClubModal && (
        <div className="hf-modal-overlay" onClick={() => setSelectedClubModal(null)}>
          <div className="hf-modal-box" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
            <div className="hf-modal-head">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <img src={kitRenderer.renderClubCrestDataUrl(selectedClubModal)} alt="" style={{ width: 38, height: 38 }} />
                <div>
                  <h3 style={{ fontSize: 17, fontWeight: 800 }}>{selectedClubModal.name}</h3>
                  <span style={{ fontSize: 12, color: 'var(--hf-muted)' }}>
                    الكابتن: {selectedClubModal.captainName || 'غير محدد'}
                  </span>
                </div>
              </div>
              <button type="button" className="hf-btn hf-btn-ghost" onClick={() => setSelectedClubModal(null)}>
                <X size={15} />
              </button>
            </div>
            <div className="hf-modal-content">
              {(selectedClubModal.players || []).length === 0 ? (
                <div style={{ textAlign: 'center', padding: 20, color: 'var(--hf-muted)' }}>
                  لم تُسجل قائمة اللاعبين بعد.
                </div>
              ) : (
                <table className="hf-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>اللاعب</th>
                      <th style={{ textAlign: 'center' }}>⚽</th>
                      <th style={{ textAlign: 'center' }}>🎯</th>
                      <th style={{ textAlign: 'center' }}>🟨/🟥</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(selectedClubModal.players || []).map((p) => {
                      const st = analytics.playerStats?.[p.id];
                      return (
                        <tr key={p.id}>
                          <td style={{ color: 'var(--hf-gold)', fontWeight: 800 }}>{p.number ? `#${p.number}` : '—'}</td>
                          <td style={{ fontWeight: 700, color: '#fff' }}>{p.name}</td>
                          <td style={{ textAlign: 'center', color: 'var(--hf-emerald-bright)', fontWeight: 800 }}>{st?.goals || 0}</td>
                          <td style={{ textAlign: 'center', color: '#38BDF8' }}>{st?.assists || 0}</td>
                          <td style={{ textAlign: 'center', fontSize: 12 }}>
                            <span style={{ color: '#FBBF24' }}>{st?.yellowCards || 0}</span>/
                            <span style={{ color: '#F87171' }}>{st?.redCards || 0}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Cryptographic Admin Unlock Modal */}
      {showUnlockModal && (
        <div className="hf-modal-overlay" onClick={() => setShowUnlockModal(false)}>
          <div className="hf-modal-box" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
            <div className="hf-modal-head">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Lock size={17} color="var(--hf-emerald-bright)" />
                <h3 style={{ fontSize: 16, fontWeight: 800 }}>فك تشفير بوابة اللجنة المنظمة</h3>
              </div>
              <button type="button" className="hf-btn hf-btn-ghost" onClick={() => setShowUnlockModal(false)}>
                <X size={15} />
              </button>
            </div>
            <form onSubmit={handleUnlockSubmit}>
              <div className="hf-modal-content" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <p style={{ fontSize: 12.5, color: 'var(--hf-muted)' }}>
                  لوحة التحكم محمية ومشفرة بالكامل بمعيار <strong>AES-256-GCM</strong>. أدخل كلمة المرور لفك التشفير في الذاكرة وتفعيل الصلاحيات.
                </p>

                {unlockError && (
                  <div className="hf-alert-box hf-alert-danger">{unlockError}</div>
                )}

                <div style={{ position: 'relative' }}>
                  <input
                    type={showPassText ? 'text' : 'password'}
                    className="hf-input"
                    dir="ltr"
                    style={{ paddingRight: 40, fontFamily: 'monospace' }}
                    placeholder="Enter master passphrase..."
                    value={passwordInput}
                    onChange={(e) => setPasswordInput(e.target.value)}
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassText((v) => !v)}
                    style={{
                      position: 'absolute',
                      right: 10,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      color: 'var(--hf-muted)',
                      cursor: 'pointer',
                    }}
                  >
                    {showPassText ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              <div className="hf-modal-foot">
                <button type="button" className="hf-btn hf-btn-ghost" onClick={() => setShowUnlockModal(false)}>
                  إلغاء
                </button>
                <button type="submit" className="hf-btn hf-btn-primary" disabled={isDecrypting}>
                  <Unlock size={15} />
                  {isDecrypting ? 'جاري فك التشفير...' : 'فتح لوحة الإدارة'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Footer */}
      <footer className="hf-footer">
        <div className="hf-footer-platform">{config.tournamentTitle}</div>
        <div className="hf-footer-credit">تطوير وتشغيل: يزن آشي | لجنة الابتكار والتطوير التقني</div>
      </footer>
    </div>
  );
}
