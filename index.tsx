/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import { addProfileBadge, removeProfileBadge } from "@api/Badges";
import { NavContextMenuPatchCallback } from "@api/ContextMenu";
import ErrorBoundary from "@components/ErrorBoundary";
import { PencilIcon } from "@components/Icons";
import definePlugin from "@utils/types";
import type { User } from "@vencord/discord-types";
import { Menu } from "@webpack/common";

import { FfxivProfileBadge } from "./components/FfxivProfileBadge";
import { openLinkCharacterModal } from "./components/LinkCharacterModal";
import { PopoutProgSummary } from "./components/PopoutProgSummary";
import { loadCache } from "./services/CacheService";
import { loadLinks } from "./services/IdentityService";
import { settings } from "./settings";

const userContextPatch: NavContextMenuPatchCallback = (children, { user }: { user?: User; }) => {
    if (!user) return;
    children.push(
        <Menu.MenuItem
            id="vc-ffxiv-link-character"
            label="Link / Edit FFXIV Character"
            icon={PencilIcon}
            leadingAccessory={{ type: "icon", icon: PencilIcon }}
            action={() => openLinkCharacterModal(user)}
        />
    );
};

// Name must match VencordNative.pluginHelpers.FfxivProfile
export default definePlugin({
    name: "FfxivProfile",
    description: "Shows linked FFXIV characters' raid progress, parses and art on Discord profiles",
    authors: [{ name: "FunnyFeesh", id: 0n }],
    settings,

    contextMenus: {
        "user-context": userContextPatch,
    },

    patches: [
        // User popout, after the widgets block. Same find and match as ReviewDB, which inserts at the same spot
        {
            find: '"UserProfilePopout");',
            replacement: {
                match: /user:(\i),widgets:.{0,100}?\}\),/,
                replace: "$&$self.renderPopout({user:$1}),",
            },
        },
    ],

    async start() {
        await Promise.all([loadLinks(), loadCache()]);
        addProfileBadge(FfxivProfileBadge);
    },

    stop() {
        removeProfileBadge(FfxivProfileBadge);
    },

    renderPopout: ErrorBoundary.wrap(({ user }: { user: User; }) => <PopoutProgSummary user={user} />, { noop: true }),
});
