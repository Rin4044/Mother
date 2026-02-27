const { Profiles, TutorialProgress, UserSkills, FightProgress } = require('../database');
const { Op } = require('sequelize');

const TUTORIAL_STEPS = [
    {
        id: 1,
        title: 'Welcome To The World',
        description: 'Start your adventure with `/start`.',
        reward: 10,
        actions: ['used_start']
    },
    {
        id: 2,
        title: 'Know Your Character',
        description: 'Use `/profile` and `/myskills` to inspect your character and skills.',
        reward: 10,
        actions: ['used_profile', 'used_myskills']
    },
    {
        id: 3,
        title: 'Set Your Loadout',
        description: 'Use `/loadout equip` to equip at least one combat skill.',
        reward: 10,
        actions: ['used_skill_equip']
    },
    {
        id: 4,
        title: 'First PvE Steps',
        description: 'Use `/fight view` then `/fight start` to begin the tower.',
        reward: 15,
        actions: ['used_fight_view', 'used_fight_start']
    },
    {
        id: 5,
        title: 'Wandering Monsters',
        description: 'Join one wandering monster encounter.',
        reward: 15,
        actions: ['used_wandering_fight']
    },
    {
        id: 6,
        title: 'Grow Stronger',
        description: 'Reach level 2.',
        reward: 20,
        actions: []
    },
    {
        id: 7,
        title: 'Skill Economy',
        description: 'Open `/skillshop` and review available skills.',
        reward: 10,
        actions: ['used_skillshop']
    },
    {
        id: 8,
        title: 'Kin Eater Title (Coming Soon)',
        description: 'Obtain the title **Kin Eater**. This tutorial step is not available yet.',
        reward: 0,
        actions: []
    }
];

function getStepById(stepId) {
    return TUTORIAL_STEPS.find((s) => s.id === stepId) || null;
}

function normalizeActions(actions) {
    if (!actions) return {};
    if (typeof actions === 'string') {
        try {
            const parsed = JSON.parse(actions);
            return parsed && typeof parsed === 'object' ? parsed : {};
        } catch {
            return {};
        }
    }
    if (typeof actions === 'object') return actions;
    return {};
}

async function getOrCreateTutorial(profileId) {
    let tutorial = await TutorialProgress.findOne({ where: { profileId } });
    if (!tutorial) {
        tutorial = await TutorialProgress.create({
            profileId,
            current_step: 1,
            actions: {},
            finished: false,
            total_crystals_earned: 0
        });
    }
    return tutorial;
}

function setAction(actions, actionKey) {
    const next = { ...normalizeActions(actions) };
    if (actionKey) next[actionKey] = true;
    return next;
}

async function isStepCompleted(step, profile, tutorial) {
    if (!step) return true;

    const actions = normalizeActions(tutorial.actions);

    if (step.id === 1) {
        return !!actions.used_start || !!profile;
    }

    if (step.id === 2) {
        const byActions = !!actions.used_profile && !!actions.used_myskills;
        const byProgress = (profile.level || 1) >= 2;
        return byActions || byProgress;
    }

    if (step.id === 3) {
        const byActions = !!actions.used_skill_equip;
        const equipped = await UserSkills.count({
            where: {
                profileId: profile.id,
                equippedSlot: { [Op.not]: null }
            }
        });
        const byProgress = equipped > 0;
        return byActions || byProgress;
    }

    if (step.id === 4) {
        const byActions = !!actions.used_fight_view && !!actions.used_fight_start;
        const fp = await FightProgress.findOne({ where: { profileId: profile.id } });
        const byProgress = !!fp && ((fp.wins || 0) > 0 || (fp.stage || 1) > 1);
        return byActions || byProgress;
    }

    if (step.id === 5) {
        const byActions = !!actions.used_wandering_fight;
        const byProgress = (profile.level || 1) >= 3;
        return byActions || byProgress;
    }

    if (step.id === 6) {
        return (profile.level || 1) >= 2;
    }

    if (step.id === 7) {
        const byActions = !!actions.used_skillshop;
        const skills = await UserSkills.count({ where: { profileId: profile.id } });
        const byProgress = skills > 4;
        return byActions || byProgress;
    }

    if (step.id === 8) {
        // Placeholder until title acquisition flow is fully implemented.
        return false;
    }

    return false;
}

async function progressTutorial(profileId, actionKey = null) {
    const profile = await Profiles.findByPk(profileId);
    if (!profile) return null;

    const tutorial = await getOrCreateTutorial(profileId);
    tutorial.actions = setAction(tutorial.actions, actionKey);

    const rewards = [];

    while (!tutorial.finished) {
        const step = getStepById(tutorial.current_step);
        if (!step) {
            tutorial.finished = true;
            break;
        }

        const completed = await isStepCompleted(step, profile, tutorial);
        if (!completed) break;

        const reward = step.reward || 0;
        if (reward > 0) {
            profile.crystals = (profile.crystals || 0) + reward;
            tutorial.total_crystals_earned = (tutorial.total_crystals_earned || 0) + reward;
        }

        rewards.push({
            stepId: step.id,
            title: step.title,
            crystals: reward
        });

        tutorial.current_step += 1;
        if (tutorial.current_step > TUTORIAL_STEPS.length) {
            tutorial.finished = true;
            break;
        }
    }

    await profile.save();
    await tutorial.save();

    return {
        profile,
        tutorial,
        rewards,
        nextStep: tutorial.finished ? null : getStepById(tutorial.current_step)
    };
}

function buildTutorialStepText(step, actions = {}) {
    if (!step) return 'Tutorial complete.';
    const safeActions = normalizeActions(actions);
    const lines = [];
    for (const action of step.actions || []) {
        const done = !!safeActions[action];
        lines.push(`${done ? '✅' : '➡️'} ${formatActionLabel(action)}`);
    }
    if (!lines.length) {
        lines.push('Progress condition is automatic for this step.');
    }
    return lines.join('\n');
}

function formatActionLabel(action) {
    const map = {
        used_start: 'Use /start',
        used_profile: 'Use /profile',
        used_myskills: 'Use /myskills',
        used_skill_equip: 'Equip a skill with /loadout equip',
        used_fight_view: 'Use /fight view',
        used_fight_start: 'Use /fight start',
        used_wandering_fight: 'Join a wandering monster fight',
        used_skillshop: 'Use /skillshop'
    };
    return map[action] || action;
}

module.exports = {
    TUTORIAL_STEPS,
    getStepById,
    getOrCreateTutorial,
    progressTutorial,
    buildTutorialStepText
};
