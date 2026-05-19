const fetch = require('node-fetch');
const fs = require('fs');

const TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = process.env.GUILD_ID;

const ROLE_MAP = {
  '1414318647836676146': { name: 'Founder',             emoji: '👑', order: 1 },
  '1393326324927697017': { name: 'Manager',             emoji: '🎩', order: 2 },
  '1393326479592521728': { name: 'Boss',                emoji: '🔱', order: 3 },
  '1393326540028252210': { name: 'Head of Recruitment', emoji: '🎯', order: 4 },
  '1393326980006678669': { name: 'Bloodline Staff',     emoji: '🩸', order: 5 },
  '1393326608621895851': { name: 'Senior Capo',         emoji: '⚔️', order: 6 },
  '1393326656021729360': { name: 'Caporegime',          emoji: '🗡️', order: 7 },
  '1393350418683396198': { name: 'Recruiter',           emoji: '📋', order: 8 },
  '1393326769725247710': { name: 'Lieutenant',          emoji: '🎖️', order: 9 },
  '1393326818576040058': { name: 'Soldier',             emoji: '💂', order: 10 },
  '1393326848498209009': { name: 'Associate',           emoji: '🤝', order: 11 },
  '1393326878315516045': { name: 'Trial',               emoji: '⏳', order: 12 },
};

const PB_MEMBER_ROLE_ID = '1393326899559661588';
const STAFF_ROLE_IDS = [
  '1414318647836676146',
  '1393326324927697017',
  '1393326479592521728',
  '1393326540028252210',
  '1393326980006678669',
];
const TRIAL_ROLE_ID     = '1393326878315516045';

// Default Discord avatar index — must use BigInt for snowflake precision
function defaultAvatarIndex(userId) {
  try {
    return Number(BigInt(userId) % 5n);
  } catch {
    return 0;
  }
}

function avatarUrl(member) {
  if (member.user.avatar) {
    return `https://cdn.discordapp.com/avatars/${member.user.id}/${member.user.avatar}.webp?size=64`;
  }
  // Members with a per-guild avatar (member.avatar) take priority over user avatar
  if (member.avatar) {
    return `https://cdn.discordapp.com/guilds/${GUILD_ID}/users/${member.user.id}/avatars/${member.avatar}.webp?size=64`;
  }
  return `https://cdn.discordapp.com/embed/avatars/${defaultAvatarIndex(member.user.id)}.png`;
}

async function fetchAllMembers() {
  let members = [];
  let after = '0';

  while (true) {
    const res = await fetch(
      `https://discord.com/api/v10/guilds/${GUILD_ID}/members?limit=1000&after=${after}`,
      { headers: { Authorization: `Bot ${TOKEN}` } }
    );

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Failed to fetch members: ${res.status} ${err}`);
    }

    const batch = await res.json();
    if (!batch.length) break;
    members = members.concat(batch);
    // Only continue paginating if we got a full page
    if (batch.length < 1000) break;
    after = batch[batch.length - 1].user.id;
  }

  return members;
}

async function fetchGuild() {
  const res = await fetch(
    `https://discord.com/api/v10/guilds/${GUILD_ID}?with_counts=true`,
    { headers: { Authorization: `Bot ${TOKEN}` } }
  );
  if (!res.ok) throw new Error(`Failed to fetch guild: ${res.status}`);
  return res.json();
}

async function main() {
  console.log('Fetching Discord data...');

  const [allMembers, guild] = await Promise.all([fetchAllMembers(), fetchGuild()]);

  console.log(`Total members fetched from API: ${allMembers.length}`);

  const ALL_RANK_ROLE_IDS = new Set(Object.keys(ROLE_MAP));

  // Count everyone with ANY rank role OR the P-B member role
  // (catches people whose rank role assignment is pending but already have PB_MEMBER)
  const pbMembers = allMembers.filter(m =>
    !m.user.bot &&
    (m.roles.some(r => ALL_RANK_ROLE_IDS.has(r)) || m.roles.includes(PB_MEMBER_ROLE_ID))
  );

  console.log(`P-B members found: ${pbMembers.length}`);

  // Group by highest rank
  const ranked = {};
  for (const roleId of Object.keys(ROLE_MAP)) {
    ranked[roleId] = [];
  }

  // Fallback bucket for members with PB_MEMBER role but no rank role yet
  const unranked = [];

  for (const member of pbMembers) {
    let highestRole = null;
    let highestOrder = 999;

    for (const roleId of member.roles) {
      if (ROLE_MAP[roleId] && ROLE_MAP[roleId].order < highestOrder) {
        highestOrder = ROLE_MAP[roleId].order;
        highestRole = roleId;
      }
    }

    const entry = {
      id: member.user.id,
      username: member.user.username,
      displayName: member.nick || member.user.global_name || member.user.username,
      avatar: avatarUrl(member),
      isTrial: member.roles.includes(TRIAL_ROLE_ID),
    };

    if (highestRole) {
      ranked[highestRole].push(entry);
    } else {
      // Has PB_MEMBER role but no rank — log for visibility
      console.warn(`⚠️  Member ${entry.displayName} (${entry.id}) has PB_MEMBER role but no rank role`);
      unranked.push(entry);
    }
  }

  // Sort alphabetically within each rank
  for (const roleId of Object.keys(ranked)) {
    ranked[roleId].sort((a, b) => a.displayName.localeCompare(b.displayName));
  }

  const trialCount = ranked[TRIAL_ROLE_ID]?.length || 0;
  const activeRanksCount = Object.values(ranked).filter(arr => arr.length > 0).length;

  console.log(`Active trials: ${trialCount}`);
  console.log(`Active ranks: ${activeRanksCount}`);
  if (unranked.length > 0) {
    console.warn(`⚠️  ${unranked.length} members have PB_MEMBER role but no rank — they will not appear on the roster`);
  }

  const roster = {
    updatedAt: new Date().toISOString(),
    totalMembers: pbMembers.length,
    trialCount,
    guildName: guild.name,
    guildIcon: guild.icon
      ? `https://cdn.discordapp.com/icons/${GUILD_ID}/${guild.icon}.webp?size=128`
      : null,
    approximateMemberCount: guild.approximate_member_count || 0,
    approximatePresenceCount: guild.approximate_presence_count || 0,
    ranks: Object.entries(ROLE_MAP)
      .sort((a, b) => a[1].order - b[1].order)
      .map(([roleId, info]) => ({
        id: roleId,
        name: info.name,
        emoji: info.emoji,
        members: ranked[roleId] || [],
        count: (ranked[roleId] || []).length,
      }))
      .filter(r => r.count > 0),
  };

  fs.mkdirSync('data', { recursive: true });
  fs.writeFileSync('data/roster.json', JSON.stringify(roster, null, 2));
  console.log(`✅ Saved ${pbMembers.length} P-B members across ${roster.ranks.length} ranks`);

  const stats = {
    updatedAt: new Date().toISOString(),
    totalMembers: pbMembers.length,
    trialCount,
    activeRanks: activeRanksCount,
    onlineCount: guild.approximate_presence_count || 0,
    totalServerCount: guild.approximate_member_count || 0,
  };
  fs.writeFileSync('data/stats.json', JSON.stringify(stats, null, 2));
  console.log('✅ Stats saved');

  // ── Staff JSON ────────────────────────────────────────────────────────────
  const staffRoleSet = new Set(STAFF_ROLE_IDS);
  const staffMembers = allMembers
    .filter(m => !m.user.bot && m.roles.some(r => staffRoleSet.has(r)))
    .map(member => {
      let highestRole = null;
      let highestOrder = 999;
      for (const roleId of member.roles) {
        if (ROLE_MAP[roleId] && ROLE_MAP[roleId].order < highestOrder) {
          highestOrder = ROLE_MAP[roleId].order;
          highestRole = roleId;
        }
      }
      return {
        name: member.nick || member.user.global_name || member.user.username,
        rank: highestRole ? ROLE_MAP[highestRole].name : 'Staff',
        emoji: highestRole ? ROLE_MAP[highestRole].emoji : '🩸',
        avatar: avatarUrl(member),
        order: highestRole ? ROLE_MAP[highestRole].order : 99,
      };
    })
    .sort((a, b) => a.order - b.order);

  fs.writeFileSync('data/staff.json', JSON.stringify(staffMembers, null, 2));
  console.log(`✅ Staff saved: ${staffMembers.length} members`);

  // ── Blacklist export ───────────────────────────────────────────────────────
  // Reads the blacklist channel and exports Discord user IDs + IGNs to blacklist.json
  // The website checks this before accepting an application
  const BLACKLIST_CHANNEL_ID = '1393335632947970098';
  try {
    const blacklisted = [];
    let lastId = null;
    while (true) {
      const url = `https://discord.com/api/v10/channels/${BLACKLIST_CHANNEL_ID}/messages?limit=100${lastId ? `&before=${lastId}` : ''}`;
      const res = await fetch(url, { headers: { Authorization: `Bot ${TOKEN}` } });
      if (!res.ok) throw new Error(`Failed to fetch blacklist messages: ${res.status}`);
      const msgs = await res.json();
      if (!msgs.length) break;
      for (const msg of msgs) {
        if (!msg.embeds.length) continue;
        const embed = msg.embeds[0];
        const idField = embed.fields?.find(f => f.name.includes('Discord User'));
        const ignField = embed.fields?.find(f => f.name.includes('In-Game Name'));
        if (idField) {
          const idMatch = idField.value.match(/\d{17,20}/);
          if (idMatch) {
            blacklisted.push({
              userId: idMatch[0],
              ign: ignField?.value?.toLowerCase() || ''
            });
          }
        }
      }
      lastId = msgs[msgs.length - 1].id;
      if (msgs.length < 100) break;
    }
    fs.writeFileSync('data/blacklist.json', JSON.stringify(blacklisted, null, 2));
    console.log(`✅ Blacklist saved: ${blacklisted.length} entries`);
  } catch (err) {
    console.warn('⚠️ Blacklist export failed:', err.message);
    fs.writeFileSync('data/blacklist.json', JSON.stringify([], null, 2));
  }
}

// ── Channel message fetcher ────────────────────────────────────────────────────
async function fetchChannelMessages(channelId, limit = 50) {
  const res = await fetch(
    `https://discord.com/api/v10/channels/${channelId}/messages?limit=${limit}`,
    { headers: { Authorization: `Bot ${TOKEN}` } }
  );
  if (!res.ok) throw new Error(`Failed to fetch messages from ${channelId}: ${res.status}`);
  return res.json();
}

// ── Pinned messages fetcher ─────────────────────────────────────────────────
async function fetchPinnedMessages(channelId) {
  const res = await fetch(
    `https://discord.com/api/v10/channels/${channelId}/pins`,
    { headers: { Authorization: `Bot ${TOKEN}` } }
  );
  if (!res.ok) throw new Error(`Failed to fetch pins from ${channelId}: ${res.status}`);
  return res.json();
}

async function exportNews() {
  const NEWS_CHANNEL_ID = '1211108754091810876';
  try {
    const messages = await fetchChannelMessages(NEWS_CHANNEL_ID, 5);
    const news = messages
      .filter(m => !m.author.bot || m.embeds.length > 0)
      .slice(0, 1)
      .map(msg => {
        // Use embed if present, otherwise use message content
        if (msg.embeds.length > 0) {
          const embed = msg.embeds[0];
          return {
            title: embed.title || 'Announcement',
            body: embed.description || embed.fields?.[0]?.value || '',
            date: msg.timestamp,
            tag: embed.footer?.text || 'Update',
            color: embed.color || null
          };
        }
        return {
          title: msg.content.split('\n')[0].replace(/[*_#>]/g, '').trim().slice(0, 80) || 'Announcement',
          body: msg.content.split('\n').slice(1).join('\n').trim().slice(0, 400) || msg.content.trim().slice(0, 400),
          date: msg.timestamp,
          tag: 'Update',
          color: null
        };
      })
      .filter(n => n.body || n.title);
    fs.writeFileSync('data/news.json', JSON.stringify(news, null, 2));
    console.log(`✅ News saved: ${news.length} items`);
  } catch (err) {
    console.warn('⚠️ News export failed:', err.message);
    fs.writeFileSync('data/news.json', JSON.stringify([], null, 2));
  }
}

async function exportDonations(allMembers) {
  const DATA_CHANNEL_ID = '1504797125815566424';
  const REAL_DATA_CHANNEL_ID = '1504797125815566424'; // same data channel

  // Build username lookup from members list
  const userMap = {};
  for (const m of allMembers) {
    userMap[m.user.id] = m.nick || m.user.global_name || m.user.username;
  }

  try {
    const pins = await fetchPinnedMessages(DATA_CHANNEL_ID);

    // ── In-game donations ──────────────────────────────────────────────────
    const donationPin = pins.find(m => m.content.startsWith('||STORE:donations||'));
    let ingameLeaderboard = [];
    let goal = 0, goalLabel = '', totalRaised = 0;

    if (donationPin) {
      const lines = donationPin.content.split('\n');
      lines.shift();
      const data = JSON.parse(lines.join('\n'));
      goal = data.goal || 0;
      goalLabel = data.goalLabel || '';

      // Build leaderboard
      const map = {};
      for (const d of (data.donations || [])) {
        const uid = d.userId;
        if (!map[uid]) map[uid] = { userId: uid, username: userMap[uid] || d.username || 'Unknown', total: 0, count: 0 };
        map[uid].total += Number(d.amount);
        map[uid].count++;
      }
      ingameLeaderboard = Object.values(map).sort((a, b) => b.total - a.total).slice(0, 10);
      totalRaised = ingameLeaderboard.reduce((s, e) => s + e.total, 0);
    }

    // ── Real money donations ───────────────────────────────────────────────
    const realPin = pins.find(m => m.content.startsWith('||STORE:real_donations||'));
    let realLeaderboard = [];
    let realTotal = 0;

    if (realPin) {
      const lines = realPin.content.split('\n');
      lines.shift();
      const data = JSON.parse(lines.join('\n'));
      const map = {};
      for (const d of (data.donations || [])) {
        const uid = d.userId;
        if (!map[uid]) map[uid] = { userId: uid, username: userMap[uid] || d.username || 'Unknown', total: 0, count: 0 };
        map[uid].total += Number(d.amount);
        map[uid].count++;
      }
      realLeaderboard = Object.values(map).sort((a, b) => b.total - a.total).slice(0, 10);
      realTotal = realLeaderboard.reduce((s, e) => s + e.total, 0);
    }

    const webData = {
      goal,
      goalLabel,
      updatedAt: new Date().toISOString(),
      totalRaised,
      realTotal,
      ingameLeaderboard,
      realLeaderboard,
      donations: ingameLeaderboard.map(e => ({ amount: e.total })) // kept for progress bar compat
    };

    fs.writeFileSync('data/donations.json', JSON.stringify(webData, null, 2));
    console.log(`✅ Donations saved — in-game top ${ingameLeaderboard.length}, real top ${realLeaderboard.length}`);
  } catch (err) {
    console.warn('⚠️ Donations export failed:', err.message);
    fs.writeFileSync('data/donations.json', JSON.stringify({ goal: 0, goalLabel: '', donations: [], ingameLeaderboard: [], realLeaderboard: [] }, null, 2));
  }
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});

// Run additional exports after main
(async () => {
  const allMembers = await fetchAllMembers();
  await exportNews();
  await exportDonations(allMembers);
})().catch(err => console.warn('Export error:', err.message));

