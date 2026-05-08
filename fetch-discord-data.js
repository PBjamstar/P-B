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
const TRIAL_ROLE_ID = '1393326878315516045';

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
  return res.json();
}

async function main() {
  console.log('Fetching Discord data...');

  const [allMembers, guild] = await Promise.all([fetchAllMembers(), fetchGuild()]);

  // Filter to P-B members only (have PB_MEMBER_ROLE_ID)
  const pbMembers = allMembers.filter(m =>
    !m.user.bot && m.roles.includes(PB_MEMBER_ROLE_ID)
  );

  // Group by highest rank
  const ranked = {};
  for (const roleId of Object.keys(ROLE_MAP)) {
    ranked[roleId] = [];
  }

  for (const member of pbMembers) {
    // Find highest rank role
    let highestRole = null;
    let highestOrder = 999;

    for (const roleId of member.roles) {
      if (ROLE_MAP[roleId] && ROLE_MAP[roleId].order < highestOrder) {
        highestOrder = ROLE_MAP[roleId].order;
        highestRole = roleId;
      }
    }

    if (highestRole) {
      ranked[highestRole].push({
        id: member.user.id,
        username: member.user.username,
        displayName: member.nick || member.user.global_name || member.user.username,
        avatar: member.user.avatar
          ? `https://cdn.discordapp.com/avatars/${member.user.id}/${member.user.avatar}.webp?size=64`
          : `https://cdn.discordapp.com/embed/avatars/${parseInt(member.user.id) % 5}.png`,
        isTrial: member.roles.includes(TRIAL_ROLE_ID),
      });
    }
  }

  // Sort members alphabetically within each rank
  for (const roleId of Object.keys(ranked)) {
    ranked[roleId].sort((a, b) => a.displayName.localeCompare(b.displayName));
  }

  // Count active trials
  const trialCount = ranked[TRIAL_ROLE_ID]?.length || 0;

  // Build final roster structure
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

  // Also save stats
  const stats = {
    updatedAt: new Date().toISOString(),
    totalMembers: pbMembers.length,
    trialCount,
    onlineCount: guild.approximate_presence_count || 0,
    totalServerCount: guild.approximate_member_count || 0,
  };
  fs.writeFileSync('data/stats.json', JSON.stringify(stats, null, 2));
  console.log('✅ Stats saved');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
