# Mahakal game: asset catalogue

Generated from `docs/game-assets/asset-manifest.json` (the machine-readable source of truth). Verify any time with `node scripts/verify-game-assets.mjs`.

**Key facts:** all 46 new files are in `new game videos/`; every one is an MP4 video (1280×720, 24 fps, ~8 s, with audio). **No still images (PNG/JPG/WebP) were found.** No file is game-ready yet; the game must not load the source folder directly.

## A. Environments

| ID | Take | Subject | Size | Recommended | Notes |
|---|---|---|---|---|---|
| `env.act-variations.a` | A | Bridge at dawn, at night, and the glowing temple (divine destination) | 3.5 MB | ✓ |  |
| `env.act-variations.b` | B | Bridge at dawn, at night, and the glowing temple (alternate) | 5.2 MB |  |  |
| `env.bridge-temple-concept.a` | A | Cloud bridge with stone pillars leading to the temple (sunset) | 2.8 MB |  |  |
| `env.bridge-temple-concept.b` | B | Cloud bridge with gold inlay leading to the temple | 3.4 MB | ✓ |  |
| `env.temple-production.a` | A | Temple exterior over clouds; carved pillar close-ups | 2.8 MB | ✓ |  |
| `env.temple-production.b` | B | Temple close view, pillared courtyard, cliffs | 3.1 MB |  |  |

Coverage: exterior → `env.temple-production.*`, `env.bridge-temple-concept.*`; courtyard/arena → `env.temple-production.b`, `hero.stage4-tapasvi.b` (background), `boss.mahishasura.b` (arena); sanctum/destination → `env.act-variations.*` (glowing temple); variations → `env.act-variations.*` (dawn/night).

## B. Protagonist (six stages + references)

| ID | Take | Subject | Size | Recommended | Notes |
|---|---|---|---|---|---|
| `hero.action-ref.a` | A | Hero action reference: bow shot, golden chakra throw, aura burst | 2.4 MB | ✓ |  |
| `hero.action-ref.b` | B | Hero action reference (golden armour): bow, chakra, trishul aura | 3.6 MB |  |  |
| `hero.stage1-bal-brahmachari` | A | Stage 1 · Bal Brahmachari (child with bow): turnaround, run, draw | 1.7 MB | ✓ |  |
| `hero.stage2-kishor-sadhak.a` | A | Stage 2 · Kishor Sadhak: turnaround, bow draw (labelled) | 2.7 MB | ✓ | on-screen labels |
| `hero.stage2-kishor-sadhak.b` | B | Stage 2 · Kishor Sadhak: annotated turnaround | 2.5 MB |  | on-screen annotation text |
| `hero.stage3-yuva-sadhu.a` | A | Stage 3 · Yuva Sadhu: turnaround, running, action sheet | 2.7 MB | ✓ | labelled "Stage 2" in the video; the game calls Yuva Sadhu stage 3 |
| `hero.stage3-yuva-sadhu.b` | B | Stage 3 · Yuva Sadhu: idle / run / attack / dodge sheet | 2.6 MB |  | labelled "Stage 2 — Yuva Sadhu" |
| `hero.stage4-tapasvi.a` | A | Stage 4 · Tapasvi: turnaround, bow attack, weapon special (labelled) | 3.9 MB | ✓ | on-screen labels |
| `hero.stage4-tapasvi.b` | B | Stage 4 · Tapasvi: cinematic in a temple courtyard | 3.8 MB |  |  |
| `hero.stage5-maha-yogi.a` | A | Stage 5 · Maha Yogi with trishul: turnaround, swing | 3.8 MB | ✓ |  |
| `hero.stage5-maha-yogi.b` | B | Stage 5 · Maha Yogi: portrait, run, trishul glow | 4.0 MB |  |  |
| `hero.stage6-siddha-sadhu.a` | A | Stage 6 · Siddha Sadhu: turnaround, victory/namaste, divine lion | 4.0 MB | ✓ | labelled "Stage 5 Siddha Sadhu" |
| `hero.stage6-siddha-sadhu.b` | B | Stage 6 · Siddha Sadhu: turnaround, staff power, face close-up | 4.2 MB |  |  |

## C. Bosses

| ID | Take | Subject | Size | Recommended | Notes |
|---|---|---|---|---|---|
| `boss.andhakasura.a` | A | Andhakasura: dark armour, emergence from smoke, red rage | 4.0 MB | ✓ |  |
| `boss.andhakasura.b` | B | Andhakasura: titled sheet, violet emergence, defeat | 5.7 MB |  | on-screen titles |
| `boss.mahishasura.a` | A | Mahishasura with axe: idle, raise, red-eyed rage | 3.4 MB | ✓ |  |
| `boss.mahishasura.b` | B | Mahishasura: title card, charge across an arena, defeat | 4.1 MB |  | on-screen title |
| `boss.raktabija.a` | A | Raktabija with spear: sheet, blood magic, kneeling defeat | 4.5 MB | ✓ | label misspelt "RAKTAB IJA" |
| `boss.raktabija.b` | B | Raktabija: turnaround, blood swirl, blood clones | 4.5 MB |  | label misspelt "RAKTAB IJA" |

## D. New gameplay enemies (fictional creations)

| ID | Take | Subject | Size | Recommended | Notes |
|---|---|---|---|---|---|
| `enemy.agni-vetala.a` | A | Agni Vetala: hover, fire casting circle, death (labelled) | 4.1 MB | ✓ | on-screen labels |
| `enemy.agni-vetala.b` | B | Agni Vetala: hover, fire pillars, violet-flame death | 3.4 MB |  |  |
| `enemy.chhaya-rakshasa.a` | A | Chhaya Rakshasa: shadow figures, portal, smoke dissolve | 3.2 MB | ✓ |  |
| `enemy.chhaya-rakshasa.b` | B | Chhaya Rakshasa: titled turnaround, shadow clones | 3.1 MB |  | on-screen title |
| `enemy.kaal-pishacha.a` | A | Kaal Pishacha: labelled turnaround, shadow-arc attack, dissolve | 2.8 MB | ✓ | on-screen labels |
| `enemy.kaal-pishacha.b` | B | Kaal Pishacha: turnaround, violet casting, dissolve | 2.6 MB |  | label misspelt "KAAL PISPHACHA" |
| `enemy.maya-mohini.a` | A | Maya Mohini Asura: turnaround, illusion circle, defeat | 4.4 MB | ✓ | on-screen labels |
| `enemy.maya-mohini.b` | B | Maya Mohini Asura: titled portrait, illusion rings, defeat | 4.0 MB |  | on-screen title |
| `enemy.naga-rakshaka.a` | A | Naga Rakshaka (male): turnaround, energy shield | 3.7 MB | ✓ |  |
| `enemy.naga-rakshaka.b` | B | Naga Rakshaka (female variant): turnaround, shield, kill pose | 3.3 MB |  | different design from take A |
| `enemy.vajra-danava.a` | A | Vajra Danava: turnaround, charge preparation, death | 4.2 MB | ✓ | on-screen labels |
| `enemy.vajra-danava.b` | B | Vajra Danava: titled card, charge, death | 4.6 MB |  | on-screen title |

## E. Weapons

| ID | Take | Subject | Size | Recommended | Notes |
|---|---|---|---|---|---|
| `weapon.trishul.a` | A | Trishul: turnaround, head close-up, sparkle | 2.3 MB |  |  |
| `weapon.trishul.b` | B | Kalantaka Trishula (labelled), lightning variant | 3.5 MB | ✓ | on-screen title + "MAHAKAI" logo text |

## F. Pickups

| ID | Take | Subject | Size | Recommended | Notes |
|---|---|---|---|---|---|
| `pickup.set.a` | A | Pickups: Tej Orb, Divine Weapon Token, Celestial Bonus (labelled) | 1.9 MB | ✓ | on-screen labels |
| `pickup.set.b` | B | Pickups: Tej Orb, Shield of Protection, line-up of 5 (Tej Orb, Divine Restoration lotus, Divine Weapon Token, Shield, Celestial Bonus) | 1.7 MB |  | on-screen labels |

## Art direction / key art

| ID | Take | Subject | Size | Recommended | Notes |
|---|---|---|---|---|---|
| `art-direction.a` | A | Hero with gada on the temple bridge; lightning swing; temple battle | 6.3 MB | ✓ | hero design differs from the six stage sheets |
| `art-direction.b` | B | Temple pillars, hero face close-up, key-art title card | 5.6 MB |  | contains title text "PROJECT: MAHAKAL PATH TO DARSHAN" |

## Unsuitable

| ID | Take | Subject | Size | Recommended | Notes |
|---|---|---|---|---|---|
| `hero.animation-ref.offmodel.a` | A | Off-model armoured female warrior (not the protagonist) | 2.1 MB |  | does not match any game character |
| `hero.animation-ref.offmodel.b` | B | Off-model armoured male warrior (not the protagonist) | 1.8 MB |  | does not match any game character |

## Excluded

| ID | Take | Subject | Size | Recommended | Notes |
|---|---|---|---|---|---|
| `excluded.chanakya-film` | - | Chanakya – Final Cut (Hindi): unrelated 120 s film | 106.9 MB |  | 106.9 MB (over GitHub 100 MB file limit); identical copy exists in ~/Downloads |

## Missing

| ID | Category | What | Note |
|---|---|---|---|
| `weapon.bow` | weapon | Wooden bow | No dedicated asset. Appears in hand in hero stage sheets 1–4 and action reference. |
| `weapon.parashu` | weapon | Parashu | No asset. (Mahishasura carries an axe, but that is boss art.) |
| `weapon.gada` | weapon | Gada | No dedicated asset. Appears in hand in art-direction take A. |
| `weapon.khadga` | weapon | Khadga | No asset. |
| `weapon.sudarshan-chakra` | weapon | Sudarshan Chakra | No dedicated asset. Appears in action reference A/B. |
| `weapon.swarna-chakra` | weapon | Swarna Chakra | No dedicated asset. A golden chakra appears in action reference A. |
| `effects.blessing` | effects | Blessing / Ashirvaad effects | No asset (existing paintings + code effects remain). |
| `effects.particles` | effects | Particles / hit / aura effects | No dedicated asset; auras visible inside hero action references only. |
| `pickup.existing-six` | pickup | Art for the six existing pickups (Prasad, Rudraksha, Trinetra, Kavach, Damru, Amrit Kalash) | The new pickup set is a different set: Tej Orb, Divine Restoration, Divine Weapon Token, Shield, Celestial Bonus. |
| `still-images` | all | Clean still images (PNG/JPG/WebP) of any new asset | None exist in the project; every new asset is an 8 s video. |

## Issues common to every new asset

Video only (no still) · baked background, no transparency · semi-realistic 3D style (game is flat 2D) · Flow watermark in the corner. Takes marked with on-screen labels have printed text, some misspelt.

## Existing live assets (used by mahakal-game.html, unchanged)

| ID | Path | Size | Dimensions |
|---|---|---|---|
| `live.blessing.ganesh` | `images/blog/mahakal-game/ganesha-lord-of-obstacles-lacma-ac1999-127-34-960.webp` | 0.2 MB | 960×1206 |
| `live.blessing.hanuman` | `images/blog/mahakal-game/hanuman-fetches-the-herb-bearing-mountain-in-a-print-from-th-960.webp` | 0.4 MB | 960×1394 |
| `live.blessing.durga` | `images/blog/mahakal-game/mahishasura-mardini-960.webp` | 0.3 MB | 960×1387 |
| `live.blessing.vishnu` | `images/blog/mahakal-game/vishnu-laxmi-and-serpent-anant-960.webp` | 0.2 MB | 960×1303 |
| `live.blessing.lakshmi` | `images/blog/mahakal-game/raja-ravi-varma-goddess-lakshmi-1896-960.webp` | 0.2 MB | 960×1359 |
| `live.blessing.mahakal` | `images/blog/mahakal-game/a-version-from-the-ravi-varma-press-shankar-c-1910-s-960.webp` | 0.2 MB | 960×1406 |
| `live.cutscene.intro` | `videos/game/intro.mp4` | 1.1 MB | 576×1024 |
| `live.cutscene.boss-mahisha` | `videos/game/boss-mahisha.mp4` | 0.9 MB | 576×1024 |
| `live.cutscene.boss-rakta` | `videos/game/boss-rakta.mp4` | 0.9 MB | 576×1024 |
| `live.cutscene.boss-andhaka` | `videos/game/boss-andhaka.mp4` | 1.0 MB | 576×1024 |
| `live.cutscene.bless-ganesh` | `videos/game/bless-ganesh.mp4` | 0.8 MB | 576×1024 |
| `live.cutscene.bless-hanuman` | `videos/game/bless-hanuman.mp4` | 0.8 MB | 576×1024 |
| `live.cutscene.bless-durga` | `videos/game/bless-durga.mp4` | 1.0 MB | 576×1024 |
| `live.cutscene.bless-vishnu` | `videos/game/bless-vishnu.mp4` | 0.9 MB | 576×1024 |
| `live.cutscene.bless-lakshmi` | `videos/game/bless-lakshmi.mp4` | 1.0 MB | 576×1024 |
| `live.cutscene.bless-mahakal` | `videos/game/bless-mahakal.mp4` | 0.9 MB | 576×1024 |
| `live.cutscene.finale` | `videos/game/finale.mp4` | 1.3 MB | 576×1024 |
| `live.brand.emblem` | `assets/brand/logo-emblem-96.webp` | 0.0 MB | 96×96 |
