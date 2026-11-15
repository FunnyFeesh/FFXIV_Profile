/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { PluginNative } from "@utils/types";

import type { FetchResult } from "../types";

export const Native = VencordNative.pluginHelpers.FfxivProfile as PluginNative<typeof import("../native")>;

// IPC can reject (e.g. native side not loaded); turn that into a result the UI can show
export async function safeFetch<T>(call: () => Promise<FetchResult<T>>): Promise<FetchResult<T>> {
    try {
        return await call();
    } catch (e) {
        return { status: "error", message: e instanceof Error ? e.message : String(e) };
    }
}
