const { sequelize, Profiles, Titles, UserTitles, TitleSkills, UserSkills, Skills } = require('../database');

const TITLE_RULES = {
    'Foul Feeder': (m) => m.poisonDamageTakenTotal >= 5000,
    'Kin Eater': (m) => m.taratectKills >= 20,
    'Poison Technique User': (m) => m.poisonSkillUses >= 120,
    Assassin: (m) => m.oneShotKills >= 120,
    'Thread User': (m) => m.threadSkillUses >= 120,
    Merciless: (m) => m.heresyOneShotKills >= 30,
    Commander: (m) => m.raidHostWins2Plus >= 10,
    Guardian: (m) => m.raidHostNoDeathWins >= 5,
    Fearbringer: (m) => m.totalMonsterKills >= 1000,
    Rescuer: (m) => m.healSkillUses >= 150,
    'Medicine Alchemist': (m) => m.healConsumableUses >= 80,
    Saint: (m) => m.holySkillUses >= 180,
    Savior: (m, ctx) => (ctx.hasTitle('Saint') && m.holySkillUses >= 420),
    'Monster Slayer': (m) => m.totalMonsterKills >= 50,
    'Monster Slaughterer': (m) => m.totalMonsterKills >= 200,
    'Monster Calamity': (m) => m.totalMonsterKills >= 500,
    'Human Slayer': (m) => m.humanKills >= 50,
    'Human Slaughterer': (m) => m.humanKills >= 200,
    'Human Calamity': (m) => m.humanKills >= 500,
    'Demon Slayer': (m) => m.demonKills >= 50,
    'Demon Slaughterer': (m) => m.demonKills >= 200,
    'Demon Calamity': (m) => m.demonKills >= 500,
    'Ally Killer': (m) => m.raidHostWinsAlliesDead >= 1,
    'Fairy Slayer': (m) => m.fairyKills >= 50,
    'Fairy Slaughterer': (m) => m.fairyKills >= 200,
    'Fairy Calamity': (m) => m.fairyKills >= 500,
    'Wyrm Slayer': (m) => m.wyrmKills >= 50,
    'Wyrm Slaughterer': (m) => m.wyrmKills >= 200,
    'Wyrm Calamity': (m) => m.wyrmKills >= 500,
    'Dragon Slayer': (m) => m.dragonKills >= 50,
    'Dragon Slaughterer': (m) => m.dragonKills >= 200,
    'Dragon Calamity': (m) => m.dragonKills >= 500,
    'Subjugated By The Hero': (m) => m.killedByHeroCount >= 1
};

function defaultMetrics() {
    return {
        poisonDamageTakenTotal: 0,
        taratectKills: 0,
        poisonSkillUses: 0,
        oneShotKills: 0,
        threadSkillUses: 0,
        heresyOneShotKills: 0,
        raidHostWins2Plus: 0,
        raidHostNoDeathWins: 0,
        raidHostWinsAlliesDead: 0,
        totalMonsterKills: 0,
        humanKills: 0,
        demonKills: 0,
        healSkillUses: 0,
        healConsumableUses: 0,
        holySkillUses: 0,
        fairyKills: 0,
        wyrmKills: 0,
        dragonKills: 0,
        killedByHeroCount: 0
    };
}

function normalizeMetrics(raw) {
    const base = defaultMetrics();
    const src = raw && typeof raw === 'object' ? raw : {};
    for (const key of Object.keys(base)) {
        base[key] = Math.max(0, Number(src[key]) || 0);
    }
    return base;
}

function detectMonsterFamily(monsterType, monsterName) {
    const type = String(monsterType || '').toLowerCase().trim();
    if (['human', 'demon', 'fairy', 'wyrm', 'dragon', 'monster', 'elf'].includes(type)) {
        return type;
    }

    const name = String(monsterName || '').toLowerCase().trim();
    if (!name) return 'monster';
    if (name.includes('human')) return 'human';
    if (name.includes('demon')) return 'demon';
    if (name.includes('fairy')) return 'fairy';
    if (name.includes('wyrm')) return 'wyrm';
    if (name.includes('dragon')) return 'dragon';
    return null;
}

function grantTitleDelta(metrics, context = {}) {
    const next = { ...metrics };
    const skillName = String(context.skillName || '').toLowerCase();
    const effectMain = String(context.skillEffectMain || '').toLowerCase();
    const effectSpecific = String(context.skillEffectSpecific || '').toLowerCase();

    next.poisonDamageTakenTotal += Math.max(0, Number(context.poisonDamageTaken) || 0);

    const usedPoisonSkill = effectSpecific === 'poison' || skillName.includes('poison');
    if (usedPoisonSkill) next.poisonSkillUses += 1;

    const usedThreadSkill = skillName.includes('thread') || effectSpecific === 'thread';
    if (usedThreadSkill) next.threadSkillUses += 1;

    const usedHealSkill = effectMain === 'heal' || skillName.includes('heal') || skillName.includes('recovery');
    if (usedHealSkill) next.healSkillUses += 1;

    const usedHolySkill =
        skillName.includes('holy') ||
        skillName.includes('pure') ||
        effectSpecific === 'holy' ||
        effectSpecific === 'light';
    if (usedHolySkill) next.holySkillUses += 1;

    if (context.victoryAgainstMonster) {
        next.totalMonsterKills += 1;

        const monsterName = String(context.monsterName || '').toLowerCase();
        if (monsterName.includes('taratect')) next.taratectKills += 1;

        const family = detectMonsterFamily(context.monsterType, context.monsterName);
        if (family === 'human') next.humanKills += 1;
        if (family === 'demon') next.demonKills += 1;
        if (family === 'fairy') next.fairyKills += 1;
        if (family === 'wyrm') next.wyrmKills += 1;
        if (family === 'dragon') next.dragonKills += 1;

        if (context.oneShotKill) next.oneShotKills += 1;
        if (context.oneShotKill && (skillName.includes('heresy') || skillName.includes('heretic') || skillName.includes('evil eye'))) {
            next.heresyOneShotKills += 1;
        }
    }

    if (context.raidHostWinWithTeam) next.raidHostWins2Plus += 1;
    if (context.raidHostWinNoDeaths) next.raidHostNoDeathWins += 1;
    if (context.raidHostWinAlliesDead) next.raidHostWinsAlliesDead += 1;
    if (context.killedByHero) next.killedByHeroCount += 1;
    if (context.usedHealConsumable) next.healConsumableUses += 1;

    return next;
}

async function grantTitleSkills(profileId, titleId, transaction) {
    const links = await TitleSkills.findAll({ where: { titleId }, transaction });
    for (const link of links) {
        const skill = await Skills.findByPk(link.skillId, { transaction });
        if (!skill) continue;

        const existing = await UserSkills.findOne({
            where: { profileId, skillId: skill.id },
            transaction
        });

        if (existing) {
            existing.level = Math.max(1, Number(existing.level) || 1) + 1;
            await existing.save({ transaction });
            continue;
        }

        await UserSkills.create({
            profileId,
            skillId: skill.id,
            name: skill.name,
            type: skill.type,
            effect_type_main: skill.effect_type_main,
            effect_type_specific: skill.effect_type_specific,
            description: skill.description,
            sp_cost: skill.sp_cost,
            mp_cost: skill.mp_cost,
            cooldown: skill.cooldown,
            power: skill.power,
            level: 1,
            xp: 0
        }, { transaction });
    }
}

async function processTitleAchievementsByProfileId(profileId, context = {}) {
    if (!profileId) return [];

    return sequelize.transaction(async (transaction) => {
        const profile = await Profiles.findByPk(profileId, { transaction });
        if (!profile) return [];

        const progressRoot = profile.rulerProgress && typeof profile.rulerProgress === 'object'
            ? { ...profile.rulerProgress }
            : {};
        const metrics = normalizeMetrics(progressRoot.titleAchievementMetrics);
        const nextMetrics = grantTitleDelta(metrics, context);
        progressRoot.titleAchievementMetrics = nextMetrics;
        profile.rulerProgress = progressRoot;
        await profile.save({ transaction });

        const titleNames = Object.keys(TITLE_RULES);
        const titles = await Titles.findAll({
            where: { name: titleNames },
            transaction
        });
        if (!titles.length) return [];

        const owned = await UserTitles.findAll({
            where: { profileId: profile.id },
            transaction
        });
        const ownedIds = new Set(owned.map((row) => row.titleId));

        const unlocked = [];
        const titleByName = new Map(titles.map((title) => [title.name, title]));
        const ownedNames = new Set(
            titles.filter((title) => ownedIds.has(title.id)).map((title) => title.name)
        );

        let changed = true;
        while (changed) {
            changed = false;
            for (const [titleName, rule] of Object.entries(TITLE_RULES)) {
                const title = titleByName.get(titleName);
                if (!title) continue;
                if (ownedIds.has(title.id)) continue;
                const ok = rule(nextMetrics, {
                    hasTitle: (name) => ownedNames.has(String(name || ''))
                });
                if (!ok) continue;

                await UserTitles.create({
                    profileId: profile.id,
                    titleId: title.id
                }, { transaction });
                await grantTitleSkills(profile.id, title.id, transaction);
                ownedIds.add(title.id);
                ownedNames.add(title.name);
                unlocked.push(title.name);
                changed = true;
            }
        }

        return unlocked;
    });
}

async function processTitleAchievements(profile, context = {}) {
    if (!profile?.id) return [];
    return processTitleAchievementsByProfileId(profile.id, context);
}

module.exports = {
    processTitleAchievements,
    processTitleAchievementsByProfileId
};
