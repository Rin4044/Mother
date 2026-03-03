function isAbyssSkill(skill) {
    const specific = String(skill?.effect_type_specific || '').toLowerCase().trim();
    const name = String(skill?.name || '').toLowerCase().trim();
    return specific === 'abyss' || name.includes('abyss');
}

function isAbyssAttack(skill) {
    const main = String(skill?.effect_type_main || '').trim();
    if (main !== 'Physical' && main !== 'Magic') return false;
    return isAbyssSkill(skill);
}

module.exports = {
    isAbyssSkill,
    isAbyssAttack
};

