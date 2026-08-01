# TarkovDex /ko/maps — complete missing map imagery

Target deployment:
https://tarkovdex.dev/ko/maps

This is a follow-up to the previous TarkovDex visual integration work.

## Primary goal

Complete the visual coverage of the Maps page.

IMPORTANT:
- Do NOT replace images that are already correctly applied.
- First inspect the current repository and determine which map/location cards currently have an image and which do not.
- Only fill missing/empty image slots.
- Preserve all map data, PvP/PvE boss data, raid timers, player counts, descriptions, links, localization, and responsive behavior.
- This task is visual-only except for the smallest data mapping needed to associate a map slug/name with an image.

The latest location set can include:
- Customs
- Factory
- Ground Zero
- Icebreaker
- Interchange
- Lighthouse
- Night Factory
- Reserve
- Shoreline
- Streets of Tarkov
- Terminal
- The Lab
- The Labyrinth
- Woods

Some data sources/projects may also expose "Ground Zero 21+" separately.
If it exists in THIS repository, reuse Ground Zero's image.

Do not invent or remove map entries merely to match this list.
The repository's live data remains the source of truth.

---

## Supplied files

Copy the contents of:

images/maps/

into the project's existing public/static image convention.

Suggested target if no convention already exists:

/public/images/maps/atmosphere/

Files:

customs.webp
factory.webp
ground-zero.webp
icebreaker.webp
interchange.webp
lighthouse.webp
reserve.webp
shoreline.webp
streets.webp
terminal.webp
the-lab.webp
the-labyrinth.webp
woods.webp

Also supplied:

map-image-manifest.json

The manifest contains human-name aliases. Do not blindly use display-name string matching if the project already has stable map IDs/slugs. Prefer stable IDs/slugs and use the manifest only as a guide.

---

## IMPORTANT ASSET RULE

These are generic atmosphere assets.
They are NOT official Escape from Tarkov screenshots, logos, or Battlestate Games artwork.

Do not label their alt text as an actual Tarkov screenshot.

They are intended as dark visual headers/thumbnails behind real map information.

Some of the newly supplied assets are atmosphere placeholders rather than literal recreations of the game location.
That is intentional: do not add copyrighted official map screenshots just to make them more literal.

---

# 1. Inspect current implementation before editing

Find:
- the `/ko/maps` route and its locale-independent page/component
- map card/list component
- map metadata / API normalization layer
- the current image field, if any
- existing image lookup object or helper
- styling used on map images
- responsive behavior
- whether Next.js Image or another optimized image component is used

Then determine exactly which existing map images are already populated.

Do not overwrite an existing non-empty image unless it is clearly broken.

Pseudo logic:

currentImage = existingMapImage
fallbackImage = localAtmosphereImageForMap

imageToRender = currentImage ?? fallbackImage

This means this package acts as a FALLBACK set.

---

# 2. Image mapping

Use repository slugs/IDs where possible.

Recommended mapping:

customs
-> customs.webp

factory
-> factory.webp

factory-night / night-factory / Factory night variant
-> factory.webp
Use the same file but add a stronger dark/cool overlay at render time.
Do NOT duplicate the asset unnecessarily.

ground-zero
-> ground-zero.webp

ground-zero-21 / ground-zero-21-plus, only if present
-> ground-zero.webp

icebreaker
-> icebreaker.webp

interchange
-> interchange.webp

lighthouse
-> lighthouse.webp

reserve
-> reserve.webp

shoreline
-> shoreline.webp

streets-of-tarkov / streets
-> streets.webp

terminal
-> terminal.webp

laboratory / the-lab / lab
-> the-lab.webp

the-labyrinth / labyrinth
-> the-labyrinth.webp

woods
-> woods.webp

Do not rely solely on Korean translated labels because locale strings may change.

---

# 3. Rendering rules

Keep every map image visually consistent.

Preferred map card/banner behavior:

Desktop:
- width: 100%
- aspect ratio: 16 / 9, or keep the existing card aspect ratio
- object-fit: cover
- image height should remain secondary to data
- use a dark bottom gradient if the map title overlays the image

Mobile:
- do not let thumbnails become excessively tall
- no horizontal overflow
- keep the map title and primary stats visible without scrolling through a giant image

If the current design uses a short banner instead of 16:9:
keep that exact design and crop with `object-fit: cover`.

Do NOT redesign the card layout just because these images exist.

---

# 4. Text readability

If text is rendered on top of an image:

add a strong gradient, for example conceptually:

transparent / dark at top
-> near-black 70–90% near the text area

Do not lower text opacity to compensate.

Map data must remain easier to read than the image.

Do not place:
- boss percentages
- raid durations
- player count tables
- long descriptions

directly over detailed imagery unless the existing UI already does so and contrast is excellent.

Prefer those on the solid card body below the image.

---

# 5. Special cases

## Night Factory

Reuse `factory.webp`.

Make it visually distinguishable only through CSS:
- stronger dark overlay
- slightly cooler presentation if the existing styling system supports filters cleanly

Do not create another asset request.

## Ground Zero 21+

If present as a separate card:
reuse `ground-zero.webp`.

Do not duplicate the file.

## Existing images

If, for example, Customs/Factory/Woods/Streets already have image values:
leave those values intact.

The new lookup should provide a fallback ONLY for empty maps.

Example concept:

const atmosphereByMapId = { ... };

const resolvedImage =
  map.image ||
  map.banner ||
  atmosphereByMapId[map.id] ||
  atmosphereByMapId[normalizedSlug] ||
  null;

Adapt this to the actual codebase rather than introducing redundant fields.

---

# 6. Suggested reusable component

Only create this if it reduces duplication in the current architecture.

Possible responsibility:

<MapAtmosphereImage
  src={resolvedImage}
  alt=""
  variant={isNightFactory ? "night" : "default"}
/>

If imagery is purely decorative, use `alt=""`.

If the existing card treats it as meaningful content, use generic descriptive alt text such as:
- "Dark industrial environment"
- "Foggy forest environment"
- "Underground corridor environment"
- "Urban environment"

Never:
"Escape from Tarkov [map] screenshot"

because these assets are not game screenshots.

---

# 7. Performance

If this is Next.js:
- use `next/image` if the current project does
- set useful `sizes`
- lazy-load map cards below the fold
- do NOT mark every map thumbnail as priority
- no layout shift
- local WebP files should be used rather than base64 embedding

Do not add remote image domains for this asset pack.

---

# 8. Styling consistency with the current site

Match the already deployed TarkovDex look.

Keep:
- dark surfaces
- existing green accent
- existing borders/radius
- current typography
- current spacing system

Do not turn Maps into a cinematic gallery.

Images are there to improve recognition and atmosphere while the map stats remain the main purpose.

---

# 9. No accidental copyrighted-art additions

Do NOT search Google/Pinterest/WallpaperCave/Tarkov Wiki for official-looking screenshots to fill any remaining gap.

Do NOT replace these local assets with official BSG promo art without explicit permission.

Do not add official EFT logos or character renders to these cards.

Preserve the site's current unofficial fan-project disclaimer.

---

# 10. Implementation method

Before editing, report briefly:

1. exact route/component files for Maps
2. where map image data currently comes from
3. which map cards already have images
4. which map cards are missing images
5. which supplied fallback will be assigned to each missing item

Then implement.

After implementation:
- lint
- typecheck if available
- production build
- inspect desktop and mobile
- make sure no existing map became image-less
- make sure no map has a broken path
- make sure images do not change card heights unpredictably

Finally report:
- files changed
- map -> image mapping actually used
- which existing images were preserved
- which missing cards were completed
- build/test result
