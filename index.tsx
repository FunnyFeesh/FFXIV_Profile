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
import { Logger } from "@utils/Logger";
import definePlugin from "@utils/types";
import type { User } from "@vencord/discord-types";
import { findCssClassesLazy } from "@webpack";
import { Menu, ScrollerThin } from "@webpack/common";

import { FfxivProfileBadge } from "./components/FfxivProfileBadge";
import { openLinkCharacterModal } from "./components/LinkCharacterModal";
import { ModalFfxivTab } from "./components/ModalFfxivTab";
import { PopoutProgSummary } from "./components/PopoutProgSummary";
import { loadCache } from "./services/CacheService";
import { loadLinks, resolveUser } from "./services/IdentityService";
import { settings } from "./settings";

const logger = new Logger("FfxivProfile");
const TabBarClasses = findCssClassesLazy("tabPanelScroller", "tabBarPanel");

const MODAL_SECTION = "FFXIV_PASSPORT";

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
        // Full profile modal tab, following MutualGroupDMs. Our props match takes the whole expression (not just
        // an identifier) so it wraps MutualGroupDMs' getProps(...) instead of breaking it when both are enabled.
        // Legacy User Profile Modal
        {
            find: ".BOT_DATA_ACCESS?(",
            replacement: [
                {
                    match: /(?<=initialSection:\i=\i\.\i\.USER_INFO,onClose:\i\}=)([^,;]+?)(?=[,;])/,
                    replace: "$self.getModalProps($1)",
                },
                {
                    match: /\(0,\i\.jsx\)\(\i,\{items:\i,section:(\i)/,
                    replace: `$1==='${MODAL_SECTION}'?$self.renderModalTab(arguments[0]):$&`,
                },
                {
                    match: /className:\i\.\i(?=,type:"top")/,
                    replace: '$& + " vc-ffxiv-modal-tab-bar"',
                },
            ],
        },
        // User Profile Modal v2
        {
            find: ".WIDGETS?",
            replacement: [
                {
                    match: /(?<=items:\i,initialSection:\i,onClose:\i\}=)([^,;]+?)(?=[,;])/,
                    replace: "$self.getModalProps($1)",
                },
                {
                    match: /children:(?=.{0,100}?component:.+?section:(\i))/,
                    replace: `$&$1.section==='${MODAL_SECTION}'?$self.renderModalTab(arguments[0]):`,
                },
                {
                    match: /type:"top",/,
                    replace: '$&className:"vc-ffxiv-modal-v2-tab-bar",',
                },
            ],
        },
    ],

    async start() {
        await Promise.all([loadLinks(), loadCache()]);
        addProfileBadge(FfxivProfileBadge);
    },

    stop() {
        removeProfileBadge(FfxivProfileBadge);
    },

    // Adds the "FFXIV" tab only for users with a resolved character
    getModalProps(props: { user: User; items: any[]; }) {
        try {
            if (!props?.user || !resolveUser(props.user.id)) return props;
            if (props.items.some(i => i?.section === MODAL_SECTION)) return props;
            return { ...props, items: [...props.items, { text: "FFXIV", section: MODAL_SECTION }] };
        } catch (e) {
            logger.error("Failed to add the FFXIV profile tab:", e);
            return props;
        }
    },

    renderPopout: ErrorBoundary.wrap(({ user }: { user: User; }) => <PopoutProgSummary user={user} />, { noop: true }),

    renderModalTab: ErrorBoundary.wrap(({ user }: { user: User; }) => (
        <ScrollerThin className={TabBarClasses.tabPanelScroller} fade>
            <ModalFfxivTab user={user} />
        </ScrollerThin>
    ), { noop: true }),
});
