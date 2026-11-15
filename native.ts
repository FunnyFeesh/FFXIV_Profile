/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { CspPolicies, ImageSrc } from "@main/csp";
import { DATA_DIR } from "@main/utils/constants";
import { IpcMainInvokeEvent, safeStorage } from "electron";
import { mkdir, readFile, writeFile } from "fs/promises";
import { dirname, join } from "path";

import { clearFflogsToken, isLodestoneId, requestFflogs, requestLodestone, requestTomestone, searchLodestone } from "./api";
import type { FflogsMetric, FflogsScope } from "./parsers/fflogs";
import type { CharacterInfo, FetchResult, FflogsData, LodestoneSearchResult, SecretKind, TomestoneData } from "./types";

// Let Discord's renderer load character art, banners and job icons (takes effect after a Discord restart)
CspPolicies["img2.finalfantasyxiv.com"] = ImageSrc; // Lodestone portraits/avatars
CspPolicies["assets.tomestone.gg"] = ImageSrc; // Tomestone custom art, duty banners, site icons
CspPolicies["v2.xivapi.com"] = ImageSrc; // Job icons

// --- Secrets ---

// Kept out of Vencord settings because Cloud sync uploads settings.json
const SECRETS_FILE = join(DATA_DIR, "ffxivProfile", "secrets.json");
const SECRET_KINDS: readonly SecretKind[] = ["fflogsClientId", "fflogsClientSecret", "tomestoneToken"];

// Encrypted values, base64
let secrets: Partial<Record<SecretKind, string>> | null = null;

async function loadSecrets() {
    if (secrets) return secrets;
    try {
        secrets = JSON.parse(await readFile(SECRETS_FILE, "utf8"));
    } catch {
        secrets = {};
    }
    return secrets!;
}

async function saveSecrets() {
    await mkdir(dirname(SECRETS_FILE), { recursive: true });
    await writeFile(SECRETS_FILE, JSON.stringify(secrets), { mode: 0o600 });
}

// Not exported: secrets never cross IPC back to the renderer
async function readSecret(kind: SecretKind): Promise<string | null> {
    const encrypted = (await loadSecrets())[kind];
    if (!encrypted) return null;
    try {
        return safeStorage.decryptString(Buffer.from(encrypted, "base64"));
    } catch {
        return null;
    }
}

function assertKind(kind: unknown): asserts kind is SecretKind {
    if (!SECRET_KINDS.includes(kind as SecretKind)) throw new Error("Unknown secret kind");
}

function onSecretChanged(kind: SecretKind) {
    if (kind !== "tomestoneToken") clearFflogsToken();
}

export async function setSecret(_: IpcMainInvokeEvent, kind: SecretKind, value: string): Promise<{ ok: true; } | { ok: false; error: string; }> {
    assertKind(kind);
    value = String(value).trim();
    if (!value) return { ok: false, error: "Value is empty." };
    if (!safeStorage.isEncryptionAvailable())
        return { ok: false, error: "Your OS keychain isn't available, so the secret wasn't saved." };

    const s = await loadSecrets();
    s[kind] = safeStorage.encryptString(value).toString("base64");
    await saveSecrets();
    onSecretChanged(kind);
    return { ok: true };
}

export async function clearSecret(_: IpcMainInvokeEvent, kind: SecretKind) {
    assertKind(kind);
    const s = await loadSecrets();
    delete s[kind];
    await saveSecrets();
    onSecretChanged(kind);
}

export async function getSecretStatus(_: IpcMainInvokeEvent): Promise<Record<SecretKind, boolean>> {
    const s = await loadSecrets();
    return {
        fflogsClientId: !!s.fflogsClientId,
        fflogsClientSecret: !!s.fflogsClientSecret,
        tomestoneToken: !!s.tomestoneToken,
    };
}

// --- Fetchers ---

export async function fetchFflogs(_: IpcMainInvokeEvent, lodestoneId: string, metric: FflogsMetric, scope: FflogsScope): Promise<FetchResult<FflogsData>> {
    if (!isLodestoneId(lodestoneId)) return { status: "error", message: "Invalid Lodestone ID" };
    const [clientId, clientSecret] = await Promise.all([readSecret("fflogsClientId"), readSecret("fflogsClientSecret")]);
    if (!clientId || !clientSecret) return { status: "no_token" };
    return requestFflogs({ clientId, clientSecret }, lodestoneId, metric, scope);
}

export async function fetchTomestone(_: IpcMainInvokeEvent, lodestoneId: string): Promise<FetchResult<TomestoneData>> {
    const token = await readSecret("tomestoneToken");
    if (!token) return { status: "no_token" };
    return requestTomestone(token, lodestoneId);
}

export function fetchLodestone(_: IpcMainInvokeEvent, lodestoneId: string): Promise<FetchResult<CharacterInfo>> {
    return requestLodestone(lodestoneId);
}

export function searchLodestoneCharacter(_: IpcMainInvokeEvent, name: string, world: string): Promise<FetchResult<LodestoneSearchResult>> {
    return searchLodestone(name, world);
}
