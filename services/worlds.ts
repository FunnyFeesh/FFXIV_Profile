/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Public worlds by data center, checked against the Lodestone World Status page on 2026-11-15 (85 worlds).
// Used to validate worlds parsed from nicknames, Rich Presence and roles. Pure, no Discord imports.
export const WORLDS_BY_DC: Readonly<Record<string, readonly string[]>> = {
    Aether: ["Adamantoise", "Cactuar", "Faerie", "Gilgamesh", "Jenova", "Midgardsormr", "Sargatanas", "Siren"],
    Crystal: ["Balmung", "Brynhildr", "Coeurl", "Diabolos", "Goblin", "Malboro", "Mateus", "Zalera"],
    Dynamis: ["Cuchulainn", "Golem", "Halicarnassus", "Kraken", "Maduin", "Marilith", "Rafflesia", "Seraph"],
    Primal: ["Behemoth", "Excalibur", "Exodus", "Famfrit", "Hyperion", "Lamia", "Leviathan", "Ultros"],
    Chaos: ["Cerberus", "Louisoix", "Moogle", "Omega", "Phantom", "Ragnarok", "Sagittarius", "Spriggan"],
    Light: ["Alpha", "Lich", "Odin", "Phoenix", "Raiden", "Shiva", "Twintania", "Zodiark"],
    Materia: ["Bismarck", "Ravana", "Sephirot", "Sophia", "Zurvan"],
    Elemental: ["Aegis", "Atomos", "Carbuncle", "Garuda", "Gungnir", "Kujata", "Tonberry", "Typhon"],
    Gaia: ["Alexander", "Bahamut", "Durandal", "Fenrir", "Ifrit", "Ridill", "Tiamat", "Ultima"],
    Mana: ["Anima", "Asura", "Chocobo", "Hades", "Ixion", "Masamune", "Pandaemonium", "Titan"],
    Meteor: ["Belias", "Mandragora", "Ramuh", "Shinryu", "Unicorn", "Valefor", "Yojimbo", "Zeromus"],
};

// lowercase world -> { world, dataCenter } with canonical casing
const WORLDS = new Map<string, { world: string; dataCenter: string; }>();
const DCS = new Map<string, string>();
for (const [dc, worlds] of Object.entries(WORLDS_BY_DC)) {
    DCS.set(dc.toLowerCase(), dc);
    for (const w of worlds) WORLDS.set(w.toLowerCase(), { world: w, dataCenter: dc });
}

// Canonical world name, or null if it isn't a public world
export function findWorld(s: string | null | undefined) {
    return s ? WORLDS.get(s.trim().toLowerCase())?.world ?? null : null;
}

export function dataCenterOf(world: string) {
    return WORLDS.get(world.trim().toLowerCase())?.dataCenter ?? null;
}

// Canonical data center name, or null
export function findDataCenter(s: string | null | undefined) {
    return s ? DCS.get(s.trim().toLowerCase()) ?? null : null;
}
