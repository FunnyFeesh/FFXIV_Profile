# FfxivProfile

A [Vencord](https://github.com/Vendicated/Vencord) userplugin that links Discord users to their Final Fantasy XIV characters and shows their raid progress on Discord profiles:

- **Profile popout:** character name and world over their Tomestone banner, a tile per floor of the current Savage tier with your Best % in FFLogs colours (or your current prog point), and a strip of all seven Ultimates.
- **FFXIV Passport window** (the **Open FFXIV Passport** button at the bottom of the popout card):
  - the character's Tomestone banner across the top (if they've set one), with a **View banner** button for the full image;
  - a side rail with the character portrait, job and iLvl (click the job for all job levels), and links to Tomestone, FF Logs and the Lodestone;
  - a Savage table with Best %, kills, fastest kill and job per boss, with older tiers in a dropdown;
  - Ultimate clears and progress, and the active Tomestone progression target.
- **Profile badges:** main job icon, an FF Logs link, and a gold chip for each cleared Ultimate.

Data comes from [FF Logs](https://www.fflogs.com/) (parses, kills), [Tomestone.gg](https://tomestone.gg/) (prog points, custom art, character details) and [The Lodestone](https://na.finalfantasyxiv.com/lodestone/) (fallback for character details and art). Job icons come from [XIVAPI](https://v2.xivapi.com/).

**Desktop only.** It works in Discord desktop and Vesktop, not the browser extension or web Discord, because it needs Vencord's native (main process) side to make requests and store credentials.

## Install

Userplugins need Vencord built from source.

1. Follow Vencord's guide to [build from source](https://docs.vencord.dev/installing/) and [install custom plugins](https://docs.vencord.dev/installing/custom-plugins/).
2. Clone this repo into Vencord's `src/userplugins` folder **as `ffxivProfile.desktop`**. The `.desktop` suffix keeps it out of the web build.

   ```sh
   cd src/userplugins
   git clone https://github.com/FunnyFeesh/FFXIV_Profile ffxivProfile.desktop
   ```

3. From the Vencord folder, run `pnpm build`, then `pnpm inject` if Discord isn't already patched with your build.
4. **Fully restart Discord** (quit from the tray, not just Ctrl+R). Then turn on **FfxivProfile** in Settings → Vencord → Plugins.

## Set up your API credentials

Each user brings their own credentials. Without them the plugin still works, but shows a "No Token" pill and falls back to the Lodestone for character details.

| Credential | Where to get it | Used for |
|---|---|---|
| FF Logs Client ID + Secret | [fflogs.com/api/clients](https://www.fflogs.com/api/clients/) → **Create Client**. Any name; any redirect URL such as `http://localhost`; leave **Public Client unchecked**. | Best %, kill counts, fastest kills |
| Tomestone API token | Tomestone.gg → Account Settings → API Access Token | Prog points, custom art, character details |

Paste them into the plugin's settings (the cog next to FfxivProfile) and press **Save** for each.

**How credentials are stored:**
- They're encrypted with your OS keychain (Electron `safeStorage`) and stored in Vencord's data folder.
- They're never part of Vencord settings, so Vencord Cloud sync never uploads them.
- Once saved, they can't be read back into Discord; you can only replace or clear them.

## Link a character

The plugin looks for a character in this order:

1. **Your own link:** right-click a user → **Link / Edit FFXIV Character**. Enter a Lodestone or Tomestone URL, a Lodestone ID, or `First Last @ World`. Links are stored only on your device.
2. **Your Discord note on that user.**
3. **Their Discord bio.**

In a note or bio, any of these work:

- `https://na.finalfantasyxiv.com/lodestone/character/12345678/` (any region)
- `https://tomestone.gg/character/12345678/...`
- `https://www.fflogs.com/character/na/gilgamesh/First%20Last`
- `ffxiv:12345678` or `lodestone:12345678`
- `ffxiv: First Last @ World`

FF Logs links of the form `fflogs.com/character/id/<n>` aren't supported, because that number is FF Logs' own ID, not a Lodestone ID.

### Auto-detection

If none of those finds a character, the plugin guesses one from data Discord has already loaded, and checks the guess on the Lodestone:

4. **Their FFXIV Rich Presence**, from the Dalamud *Discord Rich Presence* plugin (character name, plus the world or «FC» tag).
5. **Their nickname** in any server you share, or their display name, when it looks like `First Last`, `First Last (World)`, `First Last @ World`, `[TAG] First Last` or `Nick | First Last`. Roles named after a world or data center (e.g. `Aether`) narrow the search.

A guess is used only when the Lodestone has exactly one character with that exact name (on that world, if one was given). It shows as a **Suggested match** on the popout and in the Passport window, with no badges, until you choose:

- **Confirm** saves it like a link you made yourself.
- **Not them** hides that character for that user for good. Removing a link does the same.
- **Allow again** in the Link dialog undoes those rejections for that user.

If the suggested character's Lodestone profile text contains that person's Discord user ID, the plugin links it automatically, since they published the link themselves.

Your own link always wins over everything else. Turn each auto-detection source off in the plugin settings. Lookups only run for profiles you open, never for member lists.

## Using it

- **Refresh:** profiles are cached for 1–6 hours (setting, default 3).
  - The ↻ button re-fetches only when the cache is older than that.
  - **Shift-click** forces a re-fetch.
  - Both wait 60 seconds after the last fetch.
  - Saving or clearing a credential makes all cached profiles out of date.
- **FF Logs points:** your FF Logs client has an hourly point budget (typically 1,000).
  - Opening a profile costs about 26 points (current tier in Savage and Normal, plus Ultimates).
  - An older tier in the dropdown is fetched only when you pick it (about 10 points).
- **Badges:** Discord asks for badges only once per profile view, so a character's badges appear from the second time you open their profile.
- **Best % and kills are all-time:** every tier and Ultimate counts parses from all patch partitions, not just the current patch.
- **Clears:** an encounter counts as cleared if either FF Logs has a kill or Tomestone records a clear (achievements count even without an uploaded log).

## Privacy

- Requests go from your own computer to FF Logs, Tomestone, the Lodestone and XIVAPI.
- Linked characters and fetched profiles are cached locally in Vencord's IndexedDB storage.
- A `tomestone-hidden` marker in a character's Lodestone bio, or progression set to private on Tomestone, is respected and shown as "Private".

## Development

Run from the Vencord folder:

```sh
pnpm build --dev
node --import tsx --test src/userplugins/ffxivProfile.desktop/tests/*.test.ts
```

- **Tests:** `node:test` checks the parsers and pure logic (`parsers/`, `services/passportModel.ts`, `services/display.ts`, `services/identityText.ts`, `services/detectText.ts`, `services/worlds.ts`).
- **Fixture:** the Tomestone tests read a real profile response from `../tomestone-profile.json`, relative to the Vencord folder. Override the path with `FFXIV_FIXTURE`. Don't commit that file: it contains a real character's data.
- **Live API check:** `dev/check-live.ps1` (PowerShell) calls FF Logs and Tomestone through the plugin's own request code. It asks for credentials with hidden prompts and prints only statuses and field names.
- **Reloading Discord:**
  - Changes to `native.ts`, or the image allowlist at its top, need a full Discord restart.
  - Everything else needs only Ctrl+R.
- **New Savage tier:** the current tier is pinned in `constants.ts` (`CURRENT_SAVAGE_TIER`, `SAVAGE_TIERS`). Add the tier's FF Logs zone and encounter IDs and Tomestone canonical names there.

## License

GPL-3.0-or-later, like Vencord.
