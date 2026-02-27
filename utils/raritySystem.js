const rarities = [
  { name: "Common", multiplier: 1.0, xp: 1.0, chance: 50 },
  { name: "Powerful", multiplier: 1.3, xp: 1.4, chance: 25 },
  { name: "Elite", multiplier: 1.6, xp: 1.8, chance: 15 },
  { name: "Mini Boss", multiplier: 2.2, xp: 2.5, chance: 8 },
  { name: "Boss", multiplier: 3.5, xp: 4.0, chance: 2 }
];

function rollRarity() {
  const roll = Math.random() * 100;
  let cumulative = 0;

  for (const rarity of rarities) {
    cumulative += rarity.chance;
    if (roll <= cumulative) return rarity;
  }

  return rarities[0];
}

module.exports = { rollRarity };