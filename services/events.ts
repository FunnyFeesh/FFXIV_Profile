/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// One change signal for links, identities and passports; UI re-reads its sync getters when it fires
const listeners = new Set<() => void>();

export function subscribe(fn: () => void) {
    listeners.add(fn);
    return () => void listeners.delete(fn);
}

export function emitChange() {
    for (const fn of listeners) fn();
}
