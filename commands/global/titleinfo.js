const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { Titles, Skills, TitleSkills } = require('../../database.js');
const { GLOBAL_REQUIREMENTS, RULER_REQUIREMENTS } = require('../../utils/rulerTitleService');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('titleinfo')
        .setDescription('Displays detailed information about a specific title.')
        .addIntegerOption((option) =>
            option.setName('id')
                .setDescription('The ID of the title you want to view.')
                .setRequired(true)
        ),

    async execute(interaction) {
        const titleId = interaction.options.getInteger('id');
        const title = await Titles.findByPk(titleId);

        if (!title) {
            return interaction.reply({ content: `Title with ID ${titleId} not found.`, flags: MessageFlags.Ephemeral });
        }

        const [acqSkill1, acqSkill2, titleSkills] = await Promise.all([
            title.acquisition_skill_1
                ? Skills.findByPk(title.acquisition_skill_1)
                : Promise.resolve(null),
            title.acquisition_skill_2
                ? Skills.findByPk(title.acquisition_skill_2)
                : Promise.resolve(null),
            TitleSkills.findAll({ where: { titleId: title.id } })
        ]);

        const grantedSkillIds = titleSkills.map((ts) => ts.skillId).filter(Boolean);
        const grantedSkills = grantedSkillIds.length
            ? await Skills.findAll({ where: { id: grantedSkillIds } })
            : [];
        const grantedSkillNameById = new Map(grantedSkills.map((s) => [s.id, s.name]));

        const statLines = [];
        if (title.hp) statLines.push(`HP: +${title.hp}`);
        if (title.mp) statLines.push(`MP: +${title.mp}`);
        if (title.stamina) statLines.push(`Stamina: +${title.stamina}`);
        if (title.vital_stamina) statLines.push(`Vital Stamina: +${title.vital_stamina}`);
        if (title.offense) statLines.push(`Offense: +${title.offense}`);
        if (title.defense) statLines.push(`Defense: +${title.defense}`);
        if (title.magic) statLines.push(`Magic: +${title.magic}`);
        if (title.resistance) statLines.push(`Resistance: +${title.resistance}`);
        if (title.speed) statLines.push(`Speed: +${title.speed}`);

        const rulerReq = RULER_REQUIREMENTS[title.name];
        const obtainLines = [];
        if (rulerReq) {
            obtainLines.push(`Global: Level ${GLOBAL_REQUIREMENTS.minLevel}+ and Taboo Lv${GLOBAL_REQUIREMENTS.tabooLevel}+`);
            for (const reqSkill of rulerReq.skills || []) {
                obtainLines.push(`- ${reqSkill.name} (Lvl ${reqSkill.level})`);
            }
            obtainLines.push(`Objective: ${formatObjective(rulerReq.objective)}`);
        } else {
            if (title.acquisition_skill_1) {
                obtainLines.push(
                    `- ${acqSkill1?.name || `Unknown Skill (${title.acquisition_skill_1})`} ` +
                    `(Lvl ${title.acquisition_skill_1_lvl || 1})`
                );
            }
            if (title.acquisition_skill_2) {
                obtainLines.push(
                    `- ${acqSkill2?.name || `Unknown Skill (${title.acquisition_skill_2})`} ` +
                    `(Lvl ${title.acquisition_skill_2_lvl || 1})`
                );
            }
        }

        const grantedLines = titleSkills.length
            ? titleSkills.map((ts) => `- ${grantedSkillNameById.get(ts.skillId) || `Unknown Skill (${ts.skillId})`}`)
            : ['- None configured'];

        const embed = new EmbedBuilder()
            .setTitle(`Title Info: ${title.name}`)
            .setColor('#1f1f23')
            .addFields(
                {
                    name: 'Stat Bonuses',
                    value: statLines.length ? statLines.join('\n') : 'No stat bonus',
                    inline: false
                },
                {
                    name: 'How to Obtain',
                    value: obtainLines.length
                        ? obtainLines.join('\n')
                        : 'No automatic condition configured yet (admin/manual for now).',
                    inline: false
                },
                {
                    name: 'Granted Skills',
                    value: grantedLines.join('\n'),
                    inline: false
                }
            );

        if (title.description) embed.addFields({ name: 'Description:', value: title.description, inline: false });

        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }
};

function formatObjective(objective = {}) {
    switch (objective.type) {
    case 'tier_stage':
        return `Reach Tier ${objective.tier} - Stage ${objective.stage}`;
    case 'win_streak':
        return `Win streak: ${objective.count}`;
    case 'status_inflicted_total':
        return `Inflict status effects: ${objective.count}`;
    case 'damage_taken_survived_total':
        return `Take and survive total damage: ${objective.count}`;
    case 'poison_damage_total':
        return `Deal poison damage total: ${objective.count}`;
    case 'wins_above_70hp':
        return `Wins while ending above 70% HP: ${objective.count}`;
    case 'elite_wins':
        return `Elite wins: ${objective.count}`;
    case 'total_battles':
        return `Total battles: ${objective.count}`;
    case 'reach_level':
        return `Reach level ${objective.level}`;
    case 'status_damage_ticks_taken':
        return `Status damage instances taken: ${objective.count}`;
    default:
        return 'Unknown objective';
    }
}
