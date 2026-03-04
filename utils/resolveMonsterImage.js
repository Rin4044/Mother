const { AttachmentBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

const IMAGE_DIR = path.resolve('utils', 'images');
const EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp'];
const FORCED_ALIASES = {
    orthocadinath: ['1_orthocadinath.png', '1_orthocadinaht.png'],
    orthocadinaht: ['1_orthocadinaht.png', '1_orthocadinath.png'],
    '1_orthocadinath': ['1_orthocadinath.png', '1_orthocadinaht.png'],
    '1_orthocadinaht': ['1_orthocadinaht.png', '1_orthocadinath.png']
};

function normalizeBaseName(raw) {
    return String(raw || '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '_');
}

function typoVariants(base) {
    const out = new Set([base]);
    if (base.includes('orthocadinath')) out.add(base.replaceAll('orthocadinath', 'orthocadinaht'));
    if (base.includes('orthocadinaht')) out.add(base.replaceAll('orthocadinaht', 'orthocadinath'));
    return [...out];
}

function buildCandidates(inputName) {
    const raw = String(inputName || '').trim();
    if (!raw) return [];

    const candidates = new Set();
    candidates.add(raw);

    const rawNorm = normalizeBaseName(raw);
    const extMatch = rawNorm.match(/^(.*?)(\.[a-z0-9]+)$/i);
    const baseNoExt = extMatch ? extMatch[1] : rawNorm;
    const hasExt = Boolean(extMatch);
    const baseNoPrefix = baseNoExt.replace(/^\d+_/, '');

    for (const variant of typoVariants(rawNorm)) {
        candidates.add(variant);
        candidates.add(`1_${variant}`);
    }

    for (const variant of typoVariants(baseNoExt)) {
        candidates.add(variant);
        candidates.add(`1_${variant}`);
        for (const ext of EXTENSIONS) {
            candidates.add(`${variant}${ext}`);
            candidates.add(`1_${variant}${ext}`);
        }
    }

    if (baseNoPrefix && baseNoPrefix !== baseNoExt) {
        for (const variant of typoVariants(baseNoPrefix)) {
            candidates.add(variant);
            candidates.add(`1_${variant}`);
            for (const ext of EXTENSIONS) {
                candidates.add(`${variant}${ext}`);
                candidates.add(`1_${variant}${ext}`);
            }
        }
    }

    if (!hasExt) {
        for (const ext of EXTENSIONS) {
            candidates.add(`${raw}${ext}`);
        }
    } else {
        for (const ext of EXTENSIONS) {
            candidates.add(`${baseNoExt}${ext}`);
            candidates.add(`1_${baseNoExt}${ext}`);
        }
    }

    for (const key of [rawNorm, baseNoExt, baseNoPrefix]) {
        const aliases = FORCED_ALIASES[key] || [];
        for (const alias of aliases) candidates.add(alias);
    }
    return [...candidates];
}

function resolveMonsterImageFileName(imageOrMonster) {
    const inputName = typeof imageOrMonster === 'string'
        ? imageOrMonster
        : (imageOrMonster?.image || imageOrMonster?.name || '');
    if (!inputName) return null;
    if (!fs.existsSync(IMAGE_DIR)) return null;

    const files = fs.readdirSync(IMAGE_DIR);
    const fileMap = new Map(files.map((f) => [String(f).toLowerCase(), f]));

    for (const candidate of buildCandidates(inputName)) {
        const byExactPath = path.join(IMAGE_DIR, candidate);
        if (fs.existsSync(byExactPath)) return candidate;

        const mapped = fileMap.get(String(candidate).toLowerCase());
        if (mapped) return mapped;
    }

    return null;
}

function resolveMonsterImage(imageOrMonster) {
    const fileName = resolveMonsterImageFileName(imageOrMonster);
    if (!fileName) return null;
    const filePath = path.join(IMAGE_DIR, fileName);
    if (!fs.existsSync(filePath)) return null;
    return new AttachmentBuilder(filePath, { name: fileName });
}

module.exports = {
    resolveMonsterImage,
    resolveMonsterImageFileName
};
