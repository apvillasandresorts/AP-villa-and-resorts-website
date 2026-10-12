# Mahakal game: cut-scene videos with Google Flow (prompt pack)

The game at www.apvillasandresorts.in/mahakal-game.html is already wired for 11 short cut-scenes. Each one plays at the right moment, only once per device, with a **Skip** button. Until a clip exists, the game simply carries on without it.

| File name (key) | When it plays |
|---|---|
| `intro` | After "Enter the Temple", before wave 1 |
| `boss-mahisha` | Before the Mahishasura fight (first try only) |
| `boss-rakta` | Before the Raktabija fight |
| `boss-andhaka` | Before the final Andhakasura fight |
| `bless-ganesh`, `bless-hanuman`, `bless-durga`, `bless-vishnu`, `bless-lakshmi`, `bless-mahakal` | Just before each Ashirvaad card. Each one also shows the hero growing to his next stage |
| `finale` | After the celebration, before the coupon screen |

## Before you start

- **Cost:** Google Flow (Veo) and Nano Banana Pro use your Google AI plan's credits. A free account gets very few credits, so check your plan first. Nothing here needs a paid API from the website's side.
- **Reference frames:** real screenshots from the game are in `docs/game-video-refs/`. Uploading these as references is the single biggest thing for matching colours and style.
  - 01–03: dawn, dusk and night bridge
  - 04–05: Mahishasura and his charge
  - 06: Raktabija under the blood moon
  - 07: Rudra form
  - 08: Andhakasura with the lion
  - 09–10: the gods' Ashirvaad and the celebration
  - 11: the hero's six growth stages
- **House rules (they keep the site honest and respectful):**
  - Never show the real Mahakaleshwar temple, Ujjain city or our villas. The prompts use a fictional golden temple floating in the clouds, as the game does.
  - Show the deities with reverence, in traditional iconography: calm, glowing, blessing. No comedy, no horror, no distortion. If a clip of a deity comes out wrong (extra limbs, odd faces), discard it. Don't publish it.
  - Don't ask for written words in the video. AI text comes out garbled; the game adds its own titles.
  - No gore. Asuras are defeated in light and dust, never blood and wounds.

## Step by step

1. **Make the character sheets first (Nano Banana Pro, images).** Do prompts A1–A6 below. Upload the matching screenshot from `docs/game-video-refs/` with each one. Keep the best image of each and save it; these are your "ingredients".
2. **Open Google Flow → New project.** Set the model to Veo (Quality), and the aspect ratio to **9:16 (portrait)**, since most players are on phones. If you have credits left later, also make 16:9 versions for desktop.
3. **For each video (B1–B11):**
   - Use **Ingredients to Video**: add the character sheet(s) named in the prompt plus the listed game screenshot.
   - Paste the **Style block** first, then the clip prompt.
   - Generate 2–4 takes and pick the cleanest. Flow clips are 8 seconds; to reach about 10 seconds, use **Extend** with the "extend" line under each prompt.
4. **Download** each chosen clip as MP4, at 1080p if offered, and name it exactly as in the table: for example `boss-mahisha-portrait.mp4`, plus `boss-mahisha-landscape.mp4` if you made a desktop version.
5. **Put the files in** a folder named `videos/game/` inside the website folder, or just tell me where they are.
6. **Tell me "add the game videos".** I will:
   - compress each clip to about 2–4 MB so the game stays fast;
   - make a poster frame for each;
   - register them in the game, which picks portrait on phones and landscape on desktops;
   - test every cut-scene and the Skip button;
   - publish and verify it live.

## Style block (paste this at the start of every prompt)

> Stylised 2D game cinematic in the exact art style of the attached screenshots from the mobile game "Path to Darshan": clean flat-shaded vector shapes with soft painterly gradients, gentle rim light and glowing particle effects, rounded friendly character designs, no photorealism, no 3D plastic look, no film grain. Colour palette: indigo #2B2C7A, violet #7D5BB8, rose #F096B9, warm peach-gold #FFD7A3, temple gold #F4D58D, saffron #C0531A, deep night #04061A. Soft dreamy clouds, warm divine light, smooth slow camera moves, 24 fps, crisp clean edges. Indian devotional atmosphere: sound of conch (shankh), temple bells and dhol. No text, no letters, no logos, no watermarks.

Act palettes, to add when a prompt says so:
- **Dawn:** sky indigo #2B2C7A → violet #7D5BB8 → rose #F096B9 → peach-gold #FFD7A3. Pink-white clouds.
- **Golden dusk:** sky plum #33195A → magenta #A8457A → orange #F2864E → amber #FFCF7A. Peach clouds.
- **Night of Mahakal:** sky #04061A → navy #111A46 → violet #2A2862, with stars and a crescent moon. Lavender-blue clouds.
- **Blood moon:** the same night palette with a crimson tint (#AA0014) and a large red moon.
- **Great darkness:** deep purple #46005A with a swirling violet vortex and purple lightning.

## A. Character sheets (Nano Banana Pro, images)

**A1 · The hero, six stages.** Reference: `11-hero-growth-stages.jpg`, `01-dawn-bridge-wave1.jpg`.
> Character turnaround sheet in the attached game style: an Indian yogi warrior shown in six growth stages left to right. (1) Bal Brahmachari, a small bald monk boy with a shikha tuft, cream dhoti and sash, wide happy eyes. (2) Kishor Sadhak, a teen seeker with short black hair, rudraksha beads. (3) Yuva Sadhu, a young man with a black topknot and short black beard, saffron dhoti. (4) Tapasvi, long matted jata, long black beard, sacred ash tripundra on the forehead. (5) Maha Yogi, grey topknot, long grey beard, calm closed eyes. (6) Siddha Sadhu, white flowing beard and hair, a small crescent moon in his hair, glowing aura. Each shown front and back view, same proportions as the reference, plain dark-indigo background, soft rim light.

**A2 · The divine lion of Mahakal.** Reference: `08-boss-andhakasura-lion.jpg`.
> Character sheet in the attached game style: a majestic golden divine lion with a flowing amber mane, a gold and red saddle cloth, golden anklets, kind fierce eyes and a soft fire glow in its mouth. Side, front and three-quarter-back views, running and roaring poses, plain dark-indigo background.

**A3 · Mahishasura.** Reference: `04-boss-mahishasura.jpg`.
> Boss character sheet in the attached game style: Mahishasura, a huge buffalo-headed asura with enormous cream sweeping horns, red glowing eyes, a gold nose ring, a shaggy dark-brown body, a red dhoti with a gold belt, four arms holding a spiked club and swords. Menacing but not gory. Front, side and charging pose, dusty brown background.

**A4 · Raktabija.** Reference: `06-boss-raktabija-bloodmoon.jpg`.
> Boss character sheet in the attached game style: Raktabija, a crimson-skinned four-armed asura with wild black hair, yellow glowing eyes, tusks, a garland of small skulls, a skull cup and a sword, dark red droplets floating around him like embers (stylised, not gory). Front and three-quarter view, blood-moon background.

**A5 · Andhakasura.** Reference: `08-boss-andhakasura-lion.jpg`.
> Boss character sheet in the attached game style: Andhakasura, king of darkness, a towering four-armed asura with dark indigo skin, cream curved horns, a spiked gold crown, red glowing eyes and a dark third eye, a gold necklace and a maroon dhoti, surrounded by a dark violet aura. Front and side view, stormy purple background with lightning.

**A6 · The sky world.** Reference: `01-dawn-bridge-wave1.jpg`, `03-night-wave8.jpg`.
> Environment concept in the attached game style: a long violet-stone bridge with golden trims and small golden diya lamps on pillars, floating above a sea of pink-white clouds and leading to a fictional glowing sandstone Nagara-style temple with a tall curved shikhara and a saffron flag, distant snowy Kailash peaks. Show three versions: dawn, golden dusk, and starry night with a crescent moon.

## B. Video prompts (Google Flow / Veo, 8 s + Extend to about 10 s)

**B1 · `intro`: the game opens.** Ingredients: A1 (stage 1), A6. Palette: dawn.
> Opening shot: two tall carved golden temple doors swing open toward the camera, warm light pouring out. The camera glides through onto the violet stone bridge above a sea of pink clouds at dawn; golden diyas flicker along the edges. The little monk boy (stage 1) stands with his small bow, looks back over his shoulder at us with a brave smile, then turns toward the distant glowing temple. Far away, dark horned silhouettes of danav rise from the clouds and red eyes blink. A conch sounds, bells ring, dhol begins.
> *Extend:* the camera rises behind the boy as he takes his first running steps up the bridge, petals drifting.

**B2 · `boss-mahisha`: Mahishasura arrives.** Ingredients: A3, A1 (stage 3), A6. Palette: dawn turning dusty brown.
> A dust storm rolls across the cloud bridge, the dawn sky turning sandy brown. The ground shakes; the dust parts and Mahishasura stomps forward, scraping his hoof, lowering his huge horns, red eyes blazing, snorting steam. The young sadhu (stage 3) with his golden mace plants his feet and stands firm. Low drums, a deep bull roar, rumbling.
> *Extend:* Mahishasura charges straight at the camera and the shot cuts to black just before impact.

**B3 · `boss-rakta`: Raktabija arrives.** Ingredients: A4, A1 (stage 4), A6. Palette: blood moon.
> Night falls with a huge red blood moon. Dark crimson droplets fall slowly like rain and, where they touch the bridge, small red demon shapes rise up. From the moonlight Raktabija appears, grinning, four arms spread, skull garland swaying. The tapasvi hero (stage 4) raises his spinning blue Sudarshan Chakra, its light pushing back the red. Eerie choir hum, thunder, rapid damru.
> *Extend:* the chakra flares bright blue and the camera spins once around the hero.

**B4 · `boss-andhaka`: the final battle.** Ingredients: A5, A2, A1 (stage 6), A6. Palette: great darkness.
> A violet vortex swirls above the temple; purple lightning cracks; bats with glowing red eyes and a witch on a broom streak across the sky. Andhakasura rises enormous out of the darkness, crown glinting, third eye opening. Then a golden roar: the white-bearded Siddha Sadhu (stage 6) bursts out of the clouds riding the divine golden lion, which lands on the bridge and breathes a stream of sacred fire upward. Conch, thunder, epic drums.
> *Extend:* the lion rears up and roars toward Andhakasura, fire lighting the clouds gold.

**B5 · `bless-ganesh`: Shri Ganesh blesses (stage 1 → 2).** Ingredients: A1 (stages 1 and 2). Palette: dawn.
> In a halo of golden light above the clouds, Lord Ganesha appears seated on a lotus, shown reverently in traditional form with gentle eyes, a modak in one hand and the other raised in blessing. A soft golden ray touches the little monk boy, who folds his hands. Light swirls around him and he grows into the teen seeker (stage 2), and a glowing golden axe (parashu) forms in his hand. Bells, soft flute, a warm "Om".

**B6 · `bless-hanuman`: Hanuman ji blesses (stage 2 → 3).** Ingredients: A1 (stages 2 and 3). Palette: dawn to morning.
> Hanuman ji descends from the clouds in a saffron glow, mighty and kind, holding his golden gada and raising a hand in blessing. The teen seeker bows; wind and light swirl; he grows taller and stronger into the young sadhu with a topknot and first beard (stage 3), and a golden mace appears in his hands. Dhol and bells.

**B7 · `bless-durga`: Maa Durga blesses (stage 3 → 4).** Ingredients: A1 (stages 3 and 4). Palette: golden dusk.
> Maa Durga appears on her lion in a ring of golden light, many arms holding her divine weapons, serene and powerful, her hand raised in blessing. A beam of light falls on the young sadhu; his hair grows into matted jata, sacred ash appears on his forehead, rudraksha around his neck (stage 4), and a shining sword (khadga) appears in his hand. Conch, shehnai, festival drums.

**B8 · `bless-vishnu`: Shri Vishnu and Maa Lakshmi bless (stage 4 → 5).** Ingredients: A1 (stages 4 and 5). Palette: dusk turning violet.
> On a lotus above an ocean of clouds, Lord Vishnu with Maa Lakshmi beside him, calm blue radiance, the Sudarshan Chakra spinning on his finger. The chakra floats down and settles above the tapasvi's raised finger; his beard lengthens and greys and he becomes the Maha Yogi (stage 5), eyes calm and wise. Soft conch and veena.

**B9 · `bless-lakshmi`: Maa Lakshmi blesses (golden chakra).** Ingredients: A1 (stage 5). Palette: night with gold.
> Maa Lakshmi appears on a pink lotus, gold coins and lotus petals gently falling from her hand, a warm golden glow. The Maha Yogi's blue chakra turns into a gleaming golden chakra; golden light ripples across the night bridge and the diyas brighten. Soft bells, sitar.

**B10 · `bless-mahakal`: Mahakal sends the lion (stage 5 → 6).** Ingredients: A1 (stages 5 and 6), A2. Palette: night with blue-white divine light.
> Over the night sky the form of Lord Shiva as Mahakal appears in meditation in blue-white light, crescent moon in his hair, trishul beside him, the Ganga flowing from his locks, raising his hand in blessing. Lightning-white light surrounds the Maha Yogi, who becomes the white-bearded Siddha Sadhu with a crescent moon in his hair (stage 6). A golden divine lion leaps down from the clouds and kneels; the hero climbs on. Conch, damru, "Har Har Mahadev" chant (no on-screen text).

**B11 · `finale`: the gods' Ashirvaad and the celebration.** Ingredients: A1 (stage 6), A2. Reference: `09-finale-gods-ashirvaad.jpg`, `10-finale-celebration.jpg`. Palette: dawn returning after darkness.
> The darkness lifts and dawn floods back over the cloud bridge. One by one, glowing golden medallions of the gods appear in an arc across the sky (Ganesha, Hanuman, Durga, Vishnu, Lakshmi, Mahakal), each sending a soft golden beam that meets above the Siddha Sadhu on his lion. He raises his hands in gratitude; a great "Om" of light shines above the temple. Flower petals rain down, golden fireworks burst, the lion roars with joy. Conch, bells, dhol, joyful chant.
> *Extend:* the camera pulls back and rises high above the clouds as the temple glows gold at sunrise.

## Tips for the closest match
- If colours drift too orange or too realistic, add: *"match the colour grading and flat vector look of the attached screenshot exactly"*.
- To keep the hero consistent between clips, always add the same A1 image as an ingredient.
- Keep shots simple: one main action per clip works much better than many.
- Clips with any deformed deity or text-like scribbles: don't use them.
