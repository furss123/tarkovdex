# TarkovDex visual integration task

Target site: https://tarkovdex.vercel.app/

## First: inspect the existing repository
Before changing anything, inspect the current framework, routing, layout components, styles, image handling, localization structure, and responsive breakpoints.

Do NOT replace the current app architecture just to implement this design.
Do NOT change API/data-fetching behavior unless required to fix a visual regression caused by your own changes.

The current deployed site has these important structures:
- Header/navigation: TarkovDex, Latest News, Flea Market, Hideout, Quests, Gunsmith, Ammo Info, Armor Info, Maps, Support.
- Home page:
  - "Tarkov data, all in one place"
  - PvP/PvE description
  - Current Raid Time
  - Trader Restocks
  - Boss Spawn Rates by Map
- Maps page: map guide with player counts, raid duration, boss spawn rates and descriptions.
- Support page: donation/support CTA, with non-profit fan-project wording and unofficial-project disclaimer.

Preserve all of that functionality and information.

---

# Files supplied with this prompt

Production atmosphere assets:
- factory.webp
- customs.webp
- woods.webp
- streets.webp

Design reference only:
- visual-reference-board.png
- ui-direction-reference.png

IMPORTANT:
The two `*-reference*.png` files are REFERENCE IMAGES ONLY.
Do not display them directly on the public website.
Use them only to understand the intended visual language.

The four .webp files are generic AI-generated environmental atmosphere images.
They are not official Escape from Tarkov screenshots and do not contain official Tarkov characters or logos.

Move/copy the production assets into an appropriate project path such as:

/public/images/atmosphere/factory.webp
/public/images/atmosphere/customs.webp
/public/images/atmosphere/woods.webp
/public/images/atmosphere/streets.webp

Adapt the path if this repository has an established asset convention.

---

# Goal

Keep TarkovDex a practical data dashboard, but give it a stronger dark tactical / abandoned industrial atmosphere.

This is NOT a request to redesign the site into a game landing page.
Data readability and fast access remain more important than decorative imagery.

Desired feeling:
- dark
- industrial
- utilitarian
- slightly desaturated
- olive / muted green accents
- worn / tactical atmosphere
- high information density
- no excessive visual effects

The site should still feel like TarkovDex, not like an imitation of the official Escape from Tarkov website.

---

# 1. HOME PAGE

## Hero / intro area

Use `factory.webp` as a subtle atmospheric background for the opening section containing:

"Tarkov data, all in one place"

and its subtitle.

Do not simply place a giant image above the content.

Recommended implementation:
- hero min-height around 300–420px on desktop, smaller on mobile
- image fills hero using `cover`
- strong left-to-right and bottom gradient overlay
- dark overlay strong enough that text passes WCAG contrast
- image should become atmosphere, not content
- keep the existing H1 and current wording
- do not put official Tarkov logos on the image

Example visual hierarchy:

[dark factory background]
Tarkov data,
all in one place

Flea prices, quests, ammo, and map data for both PvP and PvE.

Then transition cleanly into Current Raid Time / Trader Restocks.

Do NOT put a bright image behind dense live data cards.

## Current Raid Time / Trader Restocks

Keep these primarily solid or translucent dark panels.

If the hero visually overlaps this area:
- use strong opaque card backgrounds
- maintain current data hierarchy
- avoid glassmorphism that reduces readability

## Boss Spawn Rates by Map

This is the strongest place to reuse atmosphere imagery.

For the map cards where an asset exists:
- Factory -> factory.webp
- Customs -> customs.webp
- Woods -> woods.webp
- Streets of Tarkov -> streets.webp

Use the image as:
- a shallow card header, OR
- a low-opacity background layer behind the map title

Do not cover boss names/spawn percentages with image detail.

If the current Boss Spawn section is list-based rather than card-based, preserve the list semantics and add only a compact visual header/thumbnail where it does not increase scan time.

Do not assign these images to unrelated maps.

---

# 2. MAPS PAGE

The Maps page contains a lot of text and structured information.
Do not make every map section visually heavy.

For these four sections only:
- Factory / Night Factory -> factory.webp
- Customs -> customs.webp
- Woods -> woods.webp
- Streets of Tarkov -> streets.webp

Add a restrained 16:9 or ~3:1 visual banner at the top of the corresponding map card/section.

Rules:
- image height about 120–180px desktop
- about 96–140px mobile
- dark overlay
- map name may overlay the image, but stats should remain below it on a solid background
- existing player count, raid duration, boss spawn data and descriptions must remain intact
- preserve existing "View on wiki" actions
- do not use one of these images as fake artwork for other maps

For maps without supplied imagery, keep the current visual style.
Consistency can be achieved with borders/backgrounds instead of forcing placeholder images everywhere.

---

# 3. SUPPORT PAGE

The Support page currently contains a donation CTA and important fan-project language.

Keep these statements prominent:
- TarkovDex is an unofficial fan project
- it is not affiliated with Battlestate Games
- donation/support wording
- server/maintenance purpose wording if present

Optional:
Use `factory.webp` as an extremely subtle background texture in the page header, around 10–20% perceived opacity after overlays.

Do NOT use a dramatic character/game image next to the donation button.
The support page should look trustworthy and restrained rather than commercial.

---

# 4. GLOBAL VISUAL RULES

Prefer:
- near-black / charcoal surfaces
- thin muted borders
- current green accent or a restrained olive tactical green
- white/off-white primary text
- gray secondary text

Avoid:
- pure neon green
- giant glowing effects
- animated smoke
- parallax
- excessive blur
- heavy grain over text
- fake military HUD clutter
- official EFT character renders/logos
- decorative images inside tables or price lists

The most information-heavy pages such as Flea Market, Hideout profit/crafts, Ammo and Armor should remain almost entirely image-free.

Images should provide identity in navigation/section entry points, not interfere with data consumption.

---

# 5. IMAGE IMPLEMENTATION

Use the framework's existing optimized image component if available (for example Next.js `next/image`).

Requirements:
- preserve aspect ratio
- use responsive `sizes`
- lazy-load images below the fold
- only the home hero image may be priority/preloaded
- avoid layout shift
- use CSS gradients/overlays rather than modifying source assets
- do not stretch images
- include meaningful generic alt text when the image is informative
- if purely decorative, use empty alt text

Suggested alt text:
factory.webp:
"Dark abandoned industrial warehouse"

customs.webp:
"Overcast industrial road and checkpoint"

woods.webp:
"Misty conifer forest"

streets.webp:
"Dark abandoned urban street"

Do not call them "Escape from Tarkov screenshots" because they are not screenshots.

---

# 6. RESPONSIVE BEHAVIOR

Desktop:
- hero can be wide and cinematic
- map thumbnails should remain secondary to data

Tablet:
- reduce hero height
- cards should wrap cleanly

Mobile:
- hero background stays dark and readable
- avoid text directly over high-detail image areas
- no horizontal scrolling introduced by image containers
- map images should become short headers rather than large banners
- preserve fast access to live data

---

# 7. ACCESSIBILITY / PERFORMANCE

Check:
- heading contrast
- link/button contrast
- keyboard focus states
- image layout shift
- Lighthouse performance impact
- dark-overlay text readability
- existing localization must not break because English/Korean/Chinese strings may have different lengths

Do not bake text into new image assets.

---

# 8. COPYRIGHT / FAN-SITE CONSTRAINT

TarkovDex accepts/supports donations, so avoid adding random official Escape from Tarkov promotional art, wallpapers, Google images, Pinterest images, WallpaperCave images, or fandom images just for decoration.

Do not download additional copyrighted Tarkov imagery while implementing this task.

Use only:
1. the four supplied atmosphere assets,
2. existing assets already deliberately used by TarkovDex for functional game data,
3. CSS/typography/icons already licensed by the project.

Do not add an official-looking Battlestate Games endorsement.

Keep the existing unofficial fan-project disclaimer.

---

# 9. CHANGE SCOPE

Before coding:
1. identify the exact page/component/style files involved
2. briefly state your implementation plan
3. then implement

Do not:
- alter business logic
- alter flea prices
- alter boss calculations
- alter trader timers
- alter APIs
- rename public routes
- remove localization
- remove footer disclaimer
- introduce a new UI framework unless the project already uses it

Prefer small reusable components such as:
- `AtmosphereHero`
- `MapAtmosphereImage`
only if that matches the existing architecture.

If the existing architecture is simpler, keep the implementation simple.

---

# 10. FINAL CHECK

After implementation:
- run lint
- run typecheck if configured
- run build
- fix only issues caused by these changes
- verify home, Maps and Support pages at desktop and mobile widths

Then report:
1. files changed
2. what changed visually
3. image asset paths
4. tests/build results
5. any area you deliberately left unchanged to protect data readability
