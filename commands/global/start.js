const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { Profiles, Skills, UserSkills } = require('../../database');
const { progressTutorial } = require('../../utils/tutorialService');
const { calculateXpForLevel } = require('../../utils/xpUtils');
const { RACES } = require('../../utils/races');
const { RACE_CONFIG } = require('../../utils/evolutionConfig');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('start')
        .setDescription('Start your adventure and create a player profile.')
        .addStringOption(option =>
            option
                .setName('race')
                .setDescription('Choose your starting race')
                .setRequired(true)
                .addChoices(
                    { name: 'Taratect', value: 'small lesser taratect' },
                    { name: 'Elf', value: 'young elf' },
                    { name: 'Human', value: 'human' },
                    { name: 'Demon', value: 'lesser demon' }
                )
        ),

    async execute(interaction) {
        const userId = interaction.user.id;
        const name = 'no name';
        const selectedRace = interaction.options.getString('race');
        const raceData = RACES[selectedRace];
        const raceKey = selectedRace.replace(/\s+/g, '_');
        const roleId = RACE_CONFIG[raceKey]?.role || null;

        if (!raceData) {
            return interaction.reply({
                content: 'Selected race is not configured.',
                flags: MessageFlags.Ephemeral
            });
        }

        try {
            console.log(`Checking profile for user ${name} (${userId})`);
            const profiles = await Profiles.findOne({ where: { userId } });

            if (profiles) {
                console.log('Profile already exists.');
                return interaction.reply({ content: 'You have already started your adventure!' });
            }

            console.log('Creating new profile.');
            const newProfile = await Profiles.create({
                userId,
                name,
                race: selectedRace,
                level: 1,
                xp: 0,
                xpToNextLevel: calculateXpForLevel(2, selectedRace),
                baseHp: raceData.base.hp,
                baseMp: raceData.base.mp,
                baseStamina: raceData.base.stamina,
                baseVitalStamina: raceData.base.vitalStamina,
                baseOffense: raceData.base.offense,
                baseDefense: raceData.base.defense,
                baseMagic: raceData.base.magic,
                baseResistance: raceData.base.resistance,
                baseSpeed: raceData.base.speed,
                remainingHp: raceData.base.hp,
                remainingMp: raceData.base.mp,
                remainingStamina: raceData.base.stamina,
                remainingVitalStamina: raceData.base.vitalStamina
            });

            console.log('Profile created. Adding skills...');

            const skillIds = [1, 2, 3, 26];
            const skills = await Skills.findAll({ where: { id: skillIds } });

            if (skills.length !== skillIds.length) {
                console.error('Some skills not found in the database.');
                return interaction.reply({ content: 'Error: Some skills are not found in the database!', flags: MessageFlags.Ephemeral });
            }

            const skillsToAssign = [
                { skillId: 1, level: 1 },
                { skillId: 2, level: 3 },
                { skillId: 3, level: 9 },
                { skillId: 26, level: 1 }
            ];

            for (const skillData of skillsToAssign) {
                const skillDetails = skills.find(skill => skill.id === skillData.skillId);
                console.log('Inserting UserSkill with data:', {
                    profileId: newProfile.id,
                    skillId: skillData.skillId,
                    level: skillData.level,
                    xp: 0,
                });

                try {
                    const existingUserSkills = await UserSkills.findOne({
                        where: {
                            profileId: newProfile.id,
                            skillId: skillData.skillId
                        }
                    });

                    if (existingUserSkills) {
                        console.log('UserSkill already exists, skipping insertion.');
                        continue;
                    }

                    if (!skillDetails) {
                        console.error(`Skill with ID ${skillData.skillId} not found.`);
                        continue;
                    }

                    await UserSkills.create({
                        profileId: newProfile.id,
                        skillId: skillData.skillId,
                        name: skillDetails.name,
                        level: skillData.level,
                        xp: 0,
                        type: skillDetails.type,
                        effect_type_main: skillDetails.effect_type_main,
                        effect_type_specific: skillDetails.effect_type_specific,
                        description: skillDetails.description,
                        sp_cost: skillDetails.sp_cost,
                        mp_cost: skillDetails.mp_cost,
                        cooldown: skillDetails.cooldown,
                        power: skillDetails.power,
                    });

                    console.log('UserSkill created successfully.');
                } catch (error) {
                    console.error('Failed to insert UserSkill:', error);
                    throw error;
                }
            }

            const member = await interaction.guild.members.fetch(userId);
            if (member && roleId) {
                await member.roles.add(roleId);
                console.log(`Role ${roleId} added to user ${userId}.`);
            } else {
                console.error(`Member with ID ${userId} not found or role missing.`);
            }

            const tuto = await progressTutorial(newProfile.id, 'used_start');
            const tutoText = tuto?.nextStep
                ? `\nYou finished tutorial step 1. Use **/tuto** for the next quest: **${tuto.nextStep.title}**.`
                : '';

            return interaction.reply({
                content: `Adventure started for **${name}**! You are now a **"${selectedRace}"**.${tutoText}`,
            });
        } catch (error) {
            console.error('Error executing start command:', error);
            return interaction.reply({ content: 'There was an error while executing this command!', flags: MessageFlags.Ephemeral });
        }
    }
};
