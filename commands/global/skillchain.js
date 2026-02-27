const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { Skills } = require('../../database.js');

module.exports = {

    data: new SlashCommandBuilder()
        .setName('skillchain')
        .setDescription('Show the evolution chain of a skill (admin).')
        .setDefaultMemberPermissions(0x8)
        .addIntegerOption((o) =>
            o.setName('id')
                .setDescription('Skill ID')
                .setRequired(true)
        ),

    async execute(interaction) {
        const skillId = interaction.options.getInteger('id');

        const skill = await Skills.findByPk(skillId);
        if (!skill) {
            return interaction.reply({
                content: `Skill ID ${skillId} not found.`,
                flags: MessageFlags.Ephemeral
            });
        }

        const chain = await buildSkillChain(skill);

        const lines = chain.map((s) =>
            `${s.id} - ${s.name} (Tier ${s.tier})`
        );

        const embed = new EmbedBuilder()
            .setColor('#290003')
            .setTitle(`Skill Chain: ${skill.name}`)
            .setDescription(lines.join('\n'))
            .setFooter({ text: 'T1 -> T2 -> T3 (linked with parent field)' });

        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }
};

async function buildSkillChain(skill) {
    let root = skill;
    while (root.parent) {
        const parent = await Skills.findByPk(root.parent);
        if (!parent) break;
        root = parent;
    }

    const chain = [root];
    let cursor = root;

    while (true) {
        const child = await Skills.findOne({
            where: {
                parent: cursor.id,
                tier: (cursor.tier || 1) + 1
            },
            order: [['id', 'ASC']]
        });
        if (!child) break;
        chain.push(child);
        cursor = child;
    }

    return chain;
}
