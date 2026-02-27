const { Profiles, Skills, UserSkills, database, activeFights, clearFightTimeout, scheduleTurnTimeout, commands, global, arena, calculatePlayerStats, utils, playerStats, startCombat, combatEngine, resolveImage, resolveProfileImage, calculateEffectiveSkillPower, grantSkillXp, skillProgression, Op, sequelize, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, MessageFlags } = require('discord.js');

const ALLOWED_COMBAT_TYPES = ['Physical', 'Magic', 'Debuff'];

function buildStats(combat, maxStats) {
    const hp = Math.max(0, combat.hp ?? 0);
    const shield = Math.max(0, combat.shield ?? 0);
    const mp = Math.max(0, combat.mp ?? 0);
    const stamina = Math.max(0, combat.stamina ?? 0);
    const vitalStamina = Math.max(0, combat.vitalStamina ?? 0);

    return [
        `🟥 HP: ${hp}/${maxStats.hp}${shield > 0 ? ` | 🛡 ${shield}` : ''}`,
        `🟦 MP: ${mp}/${maxStats.mp}`,
        `🟨 Stamina: ${stamina}/${maxStats.stamina}`,
        `🟩 Vital: ${vitalStamina}/${maxStats.vitalStamina}`,
        '',
        `⚔️ Offense: ${maxStats.offense}`,
        `🛡️ Defense: ${maxStats.defense}`,
        `✨ Magic: ${maxStats.magic}`,
        `🔰 Resistance: ${maxStats.resistance}`,
        `💨 Speed: ${maxStats.speed}`
    ].join('\n');
}

function buildArenaEmbed({
    inviterUser,
    opponentUser,
    inviterCombat,
    opponentCombat,
    inviterMax,
    opponentMax,
    attackerName,
    skillName,
    totalDamage,
    footerText
}) {
    return new EmbedBuilder()
        .setColor('#290003')
        .setTitle(`Arena: ${inviterUser.username} vs ${opponentUser.username}`)
        .addFields(
            { name: inviterUser.username, value: buildStats(inviterCombat, inviterMax), inline: true },
            { name: opponentUser.username, value: buildStats(opponentCombat, opponentMax), inline: true },
            {
                name: 'Attack Result',
                value: `${attackerName} used **${skillName}** and dealt **${totalDamage}** damage.`,
                inline: false
            }
        )
        .setFooter({ text: footerText });
}

async function handleSkillSelection(interaction, client) {
    const { values } = interaction;
    const fight = activeFights.get(interaction.user.id);

    if (!fight || fight.state !== 'inCombat') {
        return interaction.reply({
            content: 'This fight is no longer active.',
            flags: MessageFlags.Ephemeral
        });
    }

    if (fight.turn !== interaction.user.id) {
        return interaction.reply({
            content: "It's not your turn.",
            flags: MessageFlags.Ephemeral
        });
    }

    const attackerId = fight.turn;
    const defenderId = attackerId === fight.playerA ? fight.playerB : fight.playerA;

    const skillId = parseInt(values[0], 10);
    if (isNaN(skillId)) {
        return interaction.reply({ content: 'Invalid skill.', flags: MessageFlags.Ephemeral });
    }

    const [attackerProfile, defenderProfile, skill] = await Promise.all([
        Profiles.findOne({ where: { userId: attackerId } }),
        Profiles.findOne({ where: { userId: defenderId } }),
        Skills.findByPk(skillId)
    ]);

    if (!attackerProfile || !defenderProfile || !skill) {
        return interaction.reply({ content: 'Invalid combat state.', flags: MessageFlags.Ephemeral });
    }

    if (!ALLOWED_COMBAT_TYPES.includes(skill.effect_type_main)) {
        return interaction.reply({
            content: 'This skill cannot be used in arena combat.',
            flags: MessageFlags.Ephemeral
        });
    }

    const attackerUserSkill = await UserSkills.findOne({
        where: {
            profileId: attackerProfile.id,
            skillId: skill.id,
            equippedSlot: { [Op.not]: null }
        }
    });

    if (!attackerUserSkill) {
        return interaction.reply({
            content: 'This skill is not equipped. Use /loadout equip first.',
            flags: MessageFlags.Ephemeral
        });
    }

    const combatSkill = {
        ...skill.toJSON(),
        power: calculateEffectiveSkillPower(skill.power, attackerUserSkill.level)
    };

    const attackerStats = await calculatePlayerStats(attackerProfile);
    const defenderStats = await calculatePlayerStats(defenderProfile);

    const combatResult = startCombat({
        attackerStats,
        defenderStats,
        attackerCombat: attackerProfile.combatState,
        defenderCombat: defenderProfile.combatState,
        skill: combatSkill
    });

    if (combatResult.skillUsed) {
        const pvpSkillXp = Math.max(2, Math.min(20, Math.round(2 + Math.sqrt(combatResult.totalDamage || 0) * 0.35)));
        await grantSkillXp(attackerProfile.id, skill.id, pvpSkillXp);
    }

    await attackerProfile.update({ combatState: combatResult.updatedAttacker });
    await defenderProfile.update({ combatState: combatResult.updatedDefender });

    const inviterUser = await client.users.fetch(fight.playerA);
    const opponentUser = await client.users.fetch(fight.playerB);

    const inviterCombat = fight.playerA === attackerId
        ? combatResult.updatedAttacker
        : combatResult.updatedDefender;
    const opponentCombat = fight.playerB === attackerId
        ? combatResult.updatedAttacker
        : combatResult.updatedDefender;

    const inviterMax = fight.playerA === attackerId ? attackerStats : defenderStats;
    const opponentMax = fight.playerB === attackerId ? attackerStats : defenderStats;

    const inviterImage = resolveImage(
        fight.playerA === attackerId ? attackerProfile : defenderProfile
    );
    const opponentImage = resolveImage(
        fight.playerB === attackerId ? attackerProfile : defenderProfile
    );

    if (combatResult.updatedDefender.hp <= 0) {
        clearFightTimeout(fight);
        activeFights.delete(fight.playerA);
        activeFights.delete(fight.playerB);
        await attackerProfile.update({ combatState: null });
        await defenderProfile.update({ combatState: null });

        const winner = await client.users.fetch(attackerId);
        const finalEmbed = buildArenaEmbed({
            inviterUser,
            opponentUser,
            inviterCombat,
            opponentCombat,
            inviterMax,
            opponentMax,
            attackerName: interaction.user.username,
            skillName: skill.name,
            totalDamage: combatResult.totalDamage,
            footerText: `Winner: ${winner.username}`
        });

        if (inviterImage) finalEmbed.setImage(`attachment://${inviterImage.name}`);
        if (opponentImage) finalEmbed.setThumbnail(`attachment://${opponentImage.name}`);

        return interaction.update({
            embeds: [finalEmbed],
            components: [],
            files: [
                ...(inviterImage ? [inviterImage] : []),
                ...(opponentImage ? [opponentImage] : [])
            ]
        });
    }

    fight.turn = defenderId;
    scheduleTurnTimeout(fight, client);

    const nextUser = await client.users.fetch(defenderId);
    const updatedEmbed = buildArenaEmbed({
        inviterUser,
        opponentUser,
        inviterCombat,
        opponentCombat,
        inviterMax,
        opponentMax,
        attackerName: interaction.user.username,
        skillName: skill.name,
        totalDamage: combatResult.totalDamage,
        footerText: `It's ${nextUser.username}'s turn.`
    });

    if (inviterImage) updatedEmbed.setImage(`attachment://${inviterImage.name}`);
    if (opponentImage) updatedEmbed.setThumbnail(`attachment://${opponentImage.name}`);

    const nextProfile = await Profiles.findOne({ where: { userId: defenderId } });
    const nextSkills = await UserSkills.findAll({
        where: {
            profileId: nextProfile.id,
            equippedSlot: { [Op.not]: null }
        },
        include: [{
            model: Skills,
            as: 'Skill',
            where: {
                effect_type_main: {
                    [Op.in]: ALLOWED_COMBAT_TYPES
                }
            }
        }]
    });

    if (!nextSkills.length) {
        clearFightTimeout(fight);
        activeFights.delete(fight.playerA);
        activeFights.delete(fight.playerB);
        await attackerProfile.update({ combatState: null });
        await defenderProfile.update({ combatState: null });

        return interaction.update({
            content: `${nextUser.username} has no equipped combat skills. Fight ended.`,
            embeds: [],
            components: [],
            attachments: [],
            files: []
        });
    }

    const select = new StringSelectMenuBuilder()
        .setCustomId('pvp_attack')
        .setPlaceholder('Select a skill')
        .addOptions(
            nextSkills.slice(0, 25).map(us => ({
                label: us.Skill.name,
                value: us.Skill.id.toString(),
                description: buildSkillOptionDescription(defenderStats, attackerStats, us.Skill, us.level)
            }))
        );

    const row = new ActionRowBuilder().addComponents(select);

    return interaction.update({
        embeds: [updatedEmbed],
        components: [row],
        files: [
            ...(inviterImage ? [inviterImage] : []),
            ...(opponentImage ? [opponentImage] : [])
        ]
    });
}

module.exports = { handleSkillSelection };

function estimateSkillDamage(attackerStats, defenderStats, skill, skillLevel = 1) {
    const effectivePower = (Number(skill?.power) || 0) + ((Math.max(1, Number(skillLevel) || 1) - 1) * 0.1);
    let attackStat = 0;
    let defenseStat = 0;

    if (skill?.effect_type_main === 'Physical') {
        attackStat = Math.max(0, Number(attackerStats?.offense) || 0);
        defenseStat = Math.max(0, Number(defenderStats?.defense) || 0);
    } else if (skill?.effect_type_main === 'Magic') {
        attackStat = Math.max(0, Number(attackerStats?.magic) || 0);
        defenseStat = Math.max(0, Number(defenderStats?.resistance) || 0);
    } else {
        return 0;
    }

    const multiplier = 1 + (effectivePower * 0.1);
    const rawDamage = attackStat * multiplier;
    const reducedDamage = rawDamage * (100 / (100 + defenseStat));
    return Math.max(0, Math.floor(reducedDamage));
}

function getGuaranteedEvilEyeBonus(attackerStats, defenderStats, skill) {
    const name = String(skill?.name || '').toLowerCase().trim();
    if (!name.includes('evil eye')) return { bonus: 0, note: '' };

    const atkMagic = Math.max(0, Number(attackerStats?.magic) || 0);
    const targetHp = Math.max(0, Number(defenderStats?.hp) || 0);

    if (name.includes('evil eye of extinction') || name.includes('extinction evil eye')) {
        const burst = Math.max(10, Math.floor(atkMagic * 0.06));
        const rotTick = Math.max(5, Math.floor(atkMagic * 0.06));
        return { bonus: burst + rotTick, note: `+FX ${burst + rotTick} (100% proc)` };
    }
    if (name.includes('annihilating')) {
        const burst = Math.max(12, Math.floor(atkMagic * 0.05));
        return { bonus: burst, note: `+FX ${burst} (100% proc)` };
    }
    if (name.includes('phantom pain')) {
        const burst = Math.max(8, Math.floor(atkMagic * 0.04));
        return { bonus: burst, note: `+FX ${burst} (100% proc)` };
    }
    if (name.includes('evil eye of grudge')) {
        const drainHp = Math.max(0, Math.floor(targetHp * 0.06));
        return { bonus: drainHp, note: `+Drain ${drainHp} (100% proc)` };
    }

    return { bonus: 0, note: '100% utility proc' };
}

function buildSkillOptionDescription(attackerStats, defenderStats, skill, skillLevel = 1) {
    const base = estimateSkillDamage(attackerStats, defenderStats, skill, skillLevel);
    const extra = getGuaranteedEvilEyeBonus(attackerStats, defenderStats, skill);
    const total = base + extra.bonus;
    const parts = [`~DMG ${total}`];
    if (extra.note) parts.push(extra.note);
    const mpCost = Math.max(0, Number(skill?.mp_cost) || 0);
    const spCost = Math.max(0, Number(skill?.sp_cost) || 0);
    if (mpCost > 0) parts.push(`MP ${mpCost}`);
    if (spCost > 0) parts.push(`SP ${spCost}`);
    const text = parts.join(' | ');
    return text.length <= 100 ? text : text.slice(0, 97) + '...';
}
