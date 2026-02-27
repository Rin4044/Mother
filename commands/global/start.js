const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { Profiles, Skills, UserSkills } = require('../../database');
const { progressTutorial } = require('../../utils/tutorialService');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('start')
        .setDescription('Start your adventure and create a player profile.'),

    async execute(interaction) {
        const userId = interaction.user.id;
        const name = "no name";
        const roleId = '1279130327100428369'; // ID du rôle à attribuer

        try {
            console.log(`Checking profile for user ${name} (${userId})`);
            const profiles = await Profiles.findOne({ where: { userId: userId } });

            if (profiles) {
                console.log('Profile already exists.');
                return interaction.reply({ content: "You have already started your adventure!", ephemeral: false });
            }

            console.log('Creating new profile.');
            const newProfile = await Profiles.create({
                userId: userId,
                name: name,
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
                    // Vérifiez si UserSkill avec le même userId et skillId existe déjà
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

                    // Créez une nouvelle entrée dans la table UserSkills
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
                    throw error; // Rejeter pour que la transaction soit annulée
                }
            }

            // Ajoutez le rôle à l'utilisateur
            const member = await interaction.guild.members.fetch(userId);
            if (member) {
                await member.roles.add(roleId);
                console.log(`Role ${roleId} added to user ${userId}.`);
            } else {
                console.error(`Member with ID ${userId} not found.`);
            }

            const tuto = await progressTutorial(newProfile.id, 'used_start');
            const tutoText = tuto?.nextStep
                ? `\nYou finished tutorial step 1. Use **/tuto** for the next quest: **${tuto.nextStep.title}**.`
                : '';

            return interaction.reply({
                content: `Adventure started for **${name}**! You are now a **"small lesser taratect"**.${tutoText}`,
                ephemeral: false
            });
        } catch (error) {
            console.error('Error executing start command:', error);
            return interaction.reply({ content: 'There was an error while executing this command!', flags: MessageFlags.Ephemeral });
        }
    }
};
