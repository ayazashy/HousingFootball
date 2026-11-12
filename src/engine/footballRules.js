/**
 * KSU Student Housing 6-a-Side Football League — Official Rules & Analytics Engine
 * Implements regulations from اللجنة المنظمة.docx:
 * - 40-min matches (2x20 + 5m break)
 * - Group tiebreakers: 1) Points (3/1/0) 2) Goal Diff 3) Head-to-Head 4) Fair Play 5) Goals For
 * - Knockout ties: Direct penalty shootout (3 kicks + sudden death, no extra time)
 * - Discipline:
 *   * 2 yellows in same match = Red card & 1-match suspension
 *   * 3 accumulated yellows across matches = 1-match suspension
 *   * Direct red card = automatic suspension pending Discipline Committee decision
 */

export const GROUP_LETTERS_AR = ['أ', 'ب', 'ج', 'د', 'هـ', 'و', 'ز', 'ح'];

export function computeTournamentAnalytics(teams = [], matches = [], manualSuspensions = {}) {
  const playerMap = {};
  const teamMap = {};

  for (const team of teams) {
    teamMap[team.id] = {
      teamId: team.id,
      team,
      name: team.name,
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      gf: 0,
      ga: 0,
      gd: 0,
      points: 0,
      cleanSheets: 0,
      yellowCards: 0,
      redCards: 0,
      fairPlayPoints: 0,
      recentForm: [],
    };

    for (const p of team.players || []) {
      playerMap[p.id] = {
        id: p.id,
        player: p,
        name: p.name,
        number: p.number || '',
        position: p.position || 'MID',
        studentId: p.studentId || '',
        teamId: team.id,
        teamName: team.name,
        team,
        goals: 0,
        penaltyGoals: 0,
        ownGoals: 0,
        assists: 0,
        yellowCards: 0,
        redCards: 0,
        secondYellowReds: 0,
        mvps: 0,
        activeYellowsTowardBan: 0,
        isSuspended: false,
        suspensionReason: null,
        yellowWarning: false,
      };
    }
  }

  const orderedMatches = [...matches].sort((a, b) => (a.order || 0) - (b.order || 0));

  for (const m of orderedMatches) {
    if (m.status !== 'completed' && m.status !== 'live') continue;

    const homeStats = teamMap[m.homeTeamId];
    const awayStats = teamMap[m.awayTeamId];
    const hs = Number(m.homeScore ?? 0);
    const as = Number(m.awayScore ?? 0);

    if (m.status === 'completed') {
      if (homeStats) {
        homeStats.played += 1;
        homeStats.gf += hs;
        homeStats.ga += as;
        homeStats.gd = homeStats.gf - homeStats.ga;
        if (as === 0) homeStats.cleanSheets += 1;
        if (hs > as) {
          homeStats.won += 1;
          homeStats.points += 3;
          homeStats.recentForm.push('W');
        } else if (hs === as) {
          homeStats.drawn += 1;
          homeStats.points += 1;
          homeStats.recentForm.push('D');
        } else {
          homeStats.lost += 1;
          homeStats.recentForm.push('L');
        }
      }

      if (awayStats) {
        awayStats.played += 1;
        awayStats.gf += as;
        awayStats.ga += hs;
        awayStats.gd = awayStats.gf - awayStats.ga;
        if (hs === 0) awayStats.cleanSheets += 1;
        if (as > hs) {
          awayStats.won += 1;
          awayStats.points += 3;
          awayStats.recentForm.push('W');
        } else if (as === hs) {
          awayStats.drawn += 1;
          awayStats.points += 1;
          awayStats.recentForm.push('D');
        } else {
          awayStats.lost += 1;
          awayStats.recentForm.push('L');
        }
      }

      // If a player was suspended entering this completed match and their team played, clear 1-match ban
      for (const pStat of Object.values(playerMap)) {
        if (
          (pStat.teamId === m.homeTeamId || pStat.teamId === m.awayTeamId) &&
          pStat.isSuspended &&
          pStat.suspensionAutoClear
        ) {
          pStat.isSuspended = false;
          pStat.suspensionReason = null;
          pStat.suspensionAutoClear = false;
        }
      }
    }

    // Process match events
    const matchYellowTracker = {};
    for (const ev of m.events || []) {
      const pStat = playerMap[ev.playerId];
      const tStat = teamMap[ev.teamId];

      if (ev.type === 'goal') {
        if (pStat) pStat.goals += 1;
        if (ev.assistPlayerId && playerMap[ev.assistPlayerId]) {
          playerMap[ev.assistPlayerId].assists += 1;
        }
      } else if (ev.type === 'penalty_goal') {
        if (pStat) {
          pStat.goals += 1;
          pStat.penaltyGoals += 1;
        }
      } else if (ev.type === 'own_goal') {
        if (pStat) pStat.ownGoals += 1;
      } else if (ev.type === 'yellow_card') {
        if (tStat) {
          tStat.yellowCards += 1;
          tStat.fairPlayPoints -= 1;
        }
        if (pStat) {
          pStat.yellowCards += 1;
          matchYellowTracker[pStat.id] = (matchYellowTracker[pStat.id] || 0) + 1;
          if (matchYellowTracker[pStat.id] === 2) {
            // 2 yellows in 1 match = Red card & suspension
            pStat.redCards += 1;
            pStat.secondYellowReds += 1;
            pStat.isSuspended = true;
            pStat.suspensionReason = 'طرد بعد بطاقتين صفراوين في نفس المباراة';
            pStat.suspensionAutoClear = true;
            if (tStat) {
              tStat.redCards += 1;
              tStat.fairPlayPoints -= 2;
            }
          } else {
            pStat.activeYellowsTowardBan += 1;
            if (pStat.activeYellowsTowardBan >= 3) {
              pStat.activeYellowsTowardBan = 0;
              pStat.isSuspended = true;
              pStat.suspensionReason = 'تراكم 3 بطاقات صفراء';
              pStat.suspensionAutoClear = true;
            }
          }
        }
      } else if (ev.type === 'second_yellow') {
        if (tStat) {
          tStat.yellowCards += 1;
          tStat.redCards += 1;
          tStat.fairPlayPoints -= 3;
        }
        if (pStat) {
          pStat.yellowCards += 1;
          pStat.redCards += 1;
          pStat.secondYellowReds += 1;
          pStat.isSuspended = true;
          pStat.suspensionReason = 'طرد بعد الإنذار الثاني';
          pStat.suspensionAutoClear = true;
        }
      } else if (ev.type === 'red_card') {
        if (tStat) {
          tStat.redCards += 1;
          tStat.fairPlayPoints -= 3;
        }
        if (pStat) {
          pStat.redCards += 1;
          pStat.isSuspended = true;
          pStat.suspensionReason = 'بطاقة حمراء مباشرة (قرار لجنة الانضباط)';
          pStat.suspensionAutoClear = false;
        }
      }
    }

    if (m.mvpPlayerId && playerMap[m.mvpPlayerId]) {
      playerMap[m.mvpPlayerId].mvps += 1;
    }
  }

  // Apply manual overrides from Discipline Committee & compute warnings
  for (const pStat of Object.values(playerMap)) {
    const manual = manualSuspensions?.[pStat.id];
    if (manual?.status === 'suspended') {
      pStat.isSuspended = true;
      pStat.suspensionReason = manual.reason || 'إيقاف بقرار لجنة الانضباط';
    } else if (manual?.status === 'cleared') {
      pStat.isSuspended = false;
      pStat.suspensionReason = null;
    }
    pStat.yellowWarning = !pStat.isSuspended && pStat.activeYellowsTowardBan === 2;
  }

  for (const tStat of Object.values(teamMap)) {
    tStat.recentForm = tStat.recentForm.slice(-5);
  }

  return {
    playerStats: playerMap,
    teamStats: teamMap,
  };
}

export function computeGroupTable(group, matches = [], teamsMap = {}, config = {}) {
  const winPts = Number(config.pointsWin ?? 3);
  const drawPts = Number(config.pointsDraw ?? 1);
  const lossPts = Number(config.pointsLoss ?? 0);

  const rowsMap = {};
  for (const teamId of group?.teamIds || []) {
    const team = teamsMap[teamId];
    if (!team) continue;
    rowsMap[teamId] = {
      teamId,
      team,
      name: team.name,
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      gf: 0,
      ga: 0,
      gd: 0,
      points: 0,
      yellowCards: 0,
      redCards: 0,
      fairPlayScore: 0,
      h2h: {},
    };
  }

  const grpMatches = matches.filter(
    (m) => m.stage === 'group' && m.groupId === group?.id && m.status === 'completed'
  );

  for (const m of grpMatches) {
    const home = rowsMap[m.homeTeamId];
    const away = rowsMap[m.awayTeamId];
    if (!home || !away) continue;

    const hs = Number(m.homeScore ?? 0);
    const as = Number(m.awayScore ?? 0);

    home.played += 1;
    away.played += 1;
    home.gf += hs;
    home.ga += as;
    away.gf += as;
    away.ga += hs;
    home.gd = home.gf - home.ga;
    away.gd = away.gf - away.ga;

    if (!home.h2h[away.teamId]) home.h2h[away.teamId] = { pts: 0, gd: 0, gf: 0 };
    if (!away.h2h[home.teamId]) away.h2h[home.teamId] = { pts: 0, gd: 0, gf: 0 };

    home.h2h[away.teamId].gd += hs - as;
    home.h2h[away.teamId].gf += hs;
    away.h2h[home.teamId].gd += as - hs;
    away.h2h[home.teamId].gf += as;

    if (hs > as) {
      home.won += 1;
      home.points += winPts;
      away.lost += 1;
      away.points += lossPts;
      home.h2h[away.teamId].pts += winPts;
    } else if (hs < as) {
      away.won += 1;
      away.points += winPts;
      home.lost += 1;
      home.points += lossPts;
      away.h2h[home.teamId].pts += winPts;
    } else {
      home.drawn += 1;
      away.drawn += 1;
      home.points += drawPts;
      away.points += drawPts;
      home.h2h[away.teamId].pts += drawPts;
      away.h2h[home.teamId].pts += drawPts;
    }

    for (const ev of m.events || []) {
      const target = rowsMap[ev.teamId];
      if (!target) continue;
      if (ev.type === 'yellow_card') {
        target.yellowCards += 1;
        target.fairPlayScore -= 1;
      } else if (ev.type === 'second_yellow' || ev.type === 'red_card') {
        target.redCards += 1;
        target.fairPlayScore -= 3;
      }
    }
  }

  return Object.values(rowsMap).sort((a, b) => {
    // 1. Points
    if (b.points !== a.points) return b.points - a.points;
    // 2. Goal Difference
    if (b.gd !== a.gd) return b.gd - a.gd;
    // 3. Head-to-Head
    const aVsB = a.h2h[b.teamId];
    const bVsA = b.h2h[a.teamId];
    if (aVsB && bVsA) {
      if (bVsA.pts !== aVsB.pts) return bVsA.pts - aVsB.pts;
      if (bVsA.gd !== aVsB.gd) return bVsA.gd - aVsB.gd;
    }
    // 4. Fair Play (closer to 0 is better)
    if (b.fairPlayScore !== a.fairPlayScore) return b.fairPlayScore - a.fairPlayScore;
    // 5. Goals For
    if (b.gf !== a.gf) return b.gf - a.gf;
    return a.name.localeCompare(b.name, 'ar');
  });
}

export function buildMissingGroupMatches(groups = [], existingMatches = [], teamsMap = {}) {
  const nextMatches = [...existingMatches];
  let createdCount = 0;
  let orderCursor = nextMatches.reduce((max, m) => Math.max(max, m.order || 0), 0) + 1;

  for (const grp of groups) {
    const teamIds = grp.teamIds || [];
    for (let i = 0; i < teamIds.length; i++) {
      for (let j = i + 1; j < teamIds.length; j++) {
        const t1 = teamIds[i];
        const t2 = teamIds[j];
        const alreadyExists = nextMatches.some(
          (m) =>
            m.stage === 'group' &&
            m.groupId === grp.id &&
            ((m.homeTeamId === t1 && m.awayTeamId === t2) ||
              (m.homeTeamId === t2 && m.awayTeamId === t1))
        );
        if (!alreadyExists) {
          createdCount += 1;
          nextMatches.push({
            id: `m_grp_${grp.id}_${Date.now()}_${createdCount}`,
            stage: 'group',
            groupId: grp.id,
            roundName: grp.name,
            order: orderCursor++,
            homeTeamId: t1,
            awayTeamId: t2,
            homeName: teamsMap[t1]?.name || '',
            awayName: teamsMap[t2]?.name || '',
            homeScore: null,
            awayScore: null,
            homePenalties: null,
            awayPenalties: null,
            status: 'scheduled',
            date: '',
            time: '',
            pitch: 'ملعب الإسكان الرئيسي',
            referee: '',
            events: [],
            mvpPlayerId: null,
            isWalkover: false,
            walkoverWinner: null,
            notes: '',
          });
        }
      }
    }
  }

  return { matches: nextMatches, createdCount };
}

export function buildRandomGroupDraw(teams = [], groupCount = 4) {
  const count = Math.max(1, Math.min(groupCount, 8));
  const shuffled = [...teams].sort(() => Math.random() - 0.5);
  const groups = Array.from({ length: count }, (_, idx) => ({
    id: `grp_${Date.now()}_${idx + 1}`,
    name: `المجموعة ${GROUP_LETTERS_AR[idx] || idx + 1}`,
    teamIds: [],
  }));

  shuffled.forEach((team, idx) => {
    groups[idx % count].teamIds.push(team.id);
  });

  return groups;
}

export function buildKnockoutStageMatches(groups = [], allMatches = [], teamsMap = {}, config = {}) {
  const qualifiersPerGroup = Number(config.qualifiersPerGroup) || 2;
  const groupTables = groups.map((g) => ({
    group: g,
    standings: computeGroupTable(g, allMatches, teamsMap, config),
  }));

  const qualified = [];
  for (let rank = 0; rank < qualifiersPerGroup; rank++) {
    for (let gIdx = 0; gIdx < groupTables.length; gIdx++) {
      const row = groupTables[gIdx].standings[rank];
      if (row) {
        qualified.push({
          teamId: row.teamId,
          name: row.name,
          seedLabel: `${rank === 0 ? 'أول' : 'ثاني'} ${groupTables[gIdx].group.name}`,
          rank,
          gIdx,
        });
      }
    }
  }

  if (qualified.length < 2) return [];

  let orderBase = allMatches.reduce((max, m) => Math.max(max, m.order || 0), 0) + 1;
  const koMatches = [];
  const ts = Date.now();

  const makeMatch = (id, stage, roundName, home, away, nextMatchId = null, nextSlot = null, loserMatchId = null, loserSlot = null) => ({
    id,
    stage,
    roundName,
    groupId: null,
    order: orderBase++,
    homeTeamId: home?.teamId || null,
    awayTeamId: away?.teamId || null,
    homeName: home?.name || home?.placeholder || 'يُحدد لاحقاً',
    awayName: away?.name || away?.placeholder || 'يُحدد لاحقاً',
    homeScore: null,
    awayScore: null,
    homePenalties: null,
    awayPenalties: null,
    status: 'scheduled',
    date: '',
    time: '',
    pitch: 'ملعب الإسكان الرئيسي',
    referee: '',
    events: [],
    mvpPlayerId: null,
    isWalkover: false,
    walkoverWinner: null,
    notes: '',
    nextMatchId,
    nextSlot,
    loserMatchId,
    loserSlot,
  });

  const finalId = `ko_final_${ts}`;
  const thirdId = `ko_third_${ts}`;
  const sf1Id = `ko_sf1_${ts}`;
  const sf2Id = `ko_sf2_${ts}`;

  if (qualified.length >= 8) {
    const qfIds = [`ko_qf1_${ts}`, `ko_qf2_${ts}`, `ko_qf3_${ts}`, `ko_qf4_${ts}`];
    // Cross-group pairing: 1st Group A vs 2nd Group B, etc.
    const firsts = qualified.filter((q) => q.rank === 0);
    const seconds = qualified.filter((q) => q.rank === 1);
    const pairs = [
      [firsts[0] || qualified[0], seconds[1] || qualified[7]],
      [firsts[2] || qualified[2], seconds[3] || qualified[5]],
      [firsts[1] || qualified[1], seconds[0] || qualified[6]],
      [firsts[3] || qualified[3], seconds[2] || qualified[4]],
    ];

    koMatches.push(
      makeMatch(qfIds[0], 'qf', 'ربع النهائي 1', pairs[0][0], pairs[0][1], sf1Id, 'home'),
      makeMatch(qfIds[1], 'qf', 'ربع النهائي 2', pairs[1][0], pairs[1][1], sf1Id, 'away'),
      makeMatch(qfIds[2], 'qf', 'ربع النهائي 3', pairs[2][0], pairs[2][1], sf2Id, 'home'),
      makeMatch(qfIds[3], 'qf', 'ربع النهائي 4', pairs[3][0], pairs[3][1], sf2Id, 'away'),
      makeMatch(sf1Id, 'sf', 'نصف النهائي 1', { placeholder: 'الفائز من ربع النهائي 1' }, { placeholder: 'الفائز من ربع النهائي 2' }, finalId, 'home', thirdId, 'home'),
      makeMatch(sf2Id, 'sf', 'نصف النهائي 2', { placeholder: 'الفائز من ربع النهائي 3' }, { placeholder: 'الفائز من ربع النهائي 4' }, finalId, 'away', thirdId, 'away'),
      makeMatch(thirdId, 'third_place', 'مباراة المركز الثالث', { placeholder: 'الخاسر من نصف النهائي 1' }, { placeholder: 'الخاسر من نصف النهائي 2' }),
      makeMatch(finalId, 'final', 'المباراة النهائية 🏆', { placeholder: 'الفائز من نصف النهائي 1' }, { placeholder: 'الفائز من نصف النهائي 2' })
    );
  } else if (qualified.length >= 4) {
    koMatches.push(
      makeMatch(sf1Id, 'sf', 'نصف النهائي 1', qualified[0], qualified[3] || qualified[1], finalId, 'home', thirdId, 'home'),
      makeMatch(sf2Id, 'sf', 'نصف النهائي 2', qualified[1], qualified[2] || qualified[0], finalId, 'away', thirdId, 'away'),
      makeMatch(thirdId, 'third_place', 'مباراة المركز الثالث', { placeholder: 'الخاسر من نصف النهائي 1' }, { placeholder: 'الخاسر من نصف النهائي 2' }),
      makeMatch(finalId, 'final', 'المباراة النهائية 🏆', { placeholder: 'الفائز من نصف النهائي 1' }, { placeholder: 'الفائز من نصف النهائي 2' })
    );
  } else {
    koMatches.push(
      makeMatch(finalId, 'final', 'المباراة النهائية 🏆', qualified[0], qualified[1])
    );
  }

  return koMatches;
}

export function advanceKnockoutBracket(matches = [], updatedMatch, teamsMap = {}) {
  if (!updatedMatch || updatedMatch.stage === 'group' || updatedMatch.status !== 'completed') {
    return matches;
  }

  const hs = Number(updatedMatch.homeScore ?? 0);
  const as = Number(updatedMatch.awayScore ?? 0);
  const hp = updatedMatch.homePenalties !== null && updatedMatch.homePenalties !== undefined ? Number(updatedMatch.homePenalties) : null;
  const ap = updatedMatch.awayPenalties !== null && updatedMatch.awayPenalties !== undefined ? Number(updatedMatch.awayPenalties) : null;

  let winnerId = null;
  let loserId = null;

  if (hs > as || (hs === as && hp !== null && ap !== null && hp > ap)) {
    winnerId = updatedMatch.homeTeamId;
    loserId = updatedMatch.awayTeamId;
  } else if (as > hs || (hs === as && hp !== null && ap !== null && ap > hp)) {
    winnerId = updatedMatch.awayTeamId;
    loserId = updatedMatch.homeTeamId;
  }

  if (!winnerId) return matches;

  const winnerName = teamsMap[winnerId]?.name || (winnerId === updatedMatch.homeTeamId ? updatedMatch.homeName : updatedMatch.awayName);
  const loserName = teamsMap[loserId]?.name || (loserId === updatedMatch.homeTeamId ? updatedMatch.homeName : updatedMatch.awayName);

  return matches.map((m) => {
    let next = { ...m };
    if (updatedMatch.nextMatchId && m.id === updatedMatch.nextMatchId) {
      if (updatedMatch.nextSlot === 'home') {
        next.homeTeamId = winnerId;
        next.homeName = winnerName;
      } else if (updatedMatch.nextSlot === 'away') {
        next.awayTeamId = winnerId;
        next.awayName = winnerName;
      }
    }
    if (updatedMatch.loserMatchId && m.id === updatedMatch.loserMatchId && loserId) {
      if (updatedMatch.loserSlot === 'home') {
        next.homeTeamId = loserId;
        next.homeName = loserName;
      } else if (updatedMatch.loserSlot === 'away') {
        next.awayTeamId = loserId;
        next.awayName = loserName;
      }
    }
    return next;
  });
}

