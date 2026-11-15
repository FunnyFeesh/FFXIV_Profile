/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { OptionType } from "@utils/types";

import { CredentialsSettings } from "./components/CredentialsSettings";

export const settings = definePluginSettings({
    // Secrets live in native.ts (OS-encrypted), never in this synced settings object
    credentials: {
        type: OptionType.COMPONENT,
        component: CredentialsSettings,
    },
    cacheTtlHours: {
        type: OptionType.SLIDER,
        description: "How long fetched profiles stay cached before Refresh fetches again (hours)",
        markers: [1, 2, 3, 4, 5, 6],
        default: 3,
        stickToMarkers: true,
    },
    parseMetric: {
        type: OptionType.SELECT,
        description: "FFLogs metric for Best %",
        options: [
            { label: "rDPS", value: "rdps", default: true },
            { label: "aDPS", value: "adps" },
            { label: "cDPS", value: "cdps" },
        ],
    },
});
