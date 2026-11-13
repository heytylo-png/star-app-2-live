# Star Rai as a live 3D character: what it takes (light research v1)

Issue #177. Researcher: Claude. Date: 2026-11-12. **Research only.** Nothing was downloaded, installed, bought or signed up for. Nothing is approved; the user decides each step and approves each asset separately. This is the **light version**: ordinary web searches, because the full research run could not start (account usage limit). Claims are marked **VERIFIED** (read at the cited source this session) or **ASSUMPTION** (my inference, or not confirmed at a source).

## Goal (user's words)

"A 3D model capable similar to the video." The reference clip (AI-generated, 15 s) shows constantly changing expressions, lip movement while she talks, moving hair and skirt, natural body acting (leaning, hand on wall, reaching to the viewer, walking), clean anime shading and line work, and a camera that reframes.

## Executive summary

- **Recommended format: VRM 1.0, rendered in the app with `@pixiv/three-vrm` (three.js).** VRM bundles almost everything the video needs: a humanoid rig, a face-expression standard including lip-sync shapes, toon shading (MToon), hair/cloth spring physics, and a shared animation format (VRMA).
- **Recommended model route:**
  - **Primary: VRoid Studio** (free) to get a first Star Rai VRM quickly, with clear commercial terms for your own creations.
  - **Fallback or upgrade: commission an artist** for a custom VRM, typically $800–$2,500 mid-tier.
  - **Not recommended:** converting the Tripo model. It has no anime face, no hair and no expression shapes.
- **Lip sync:** the browser's built-in voice (Web Speech API) gives no audio or mouth timing, so real lip sync means a **cloud voice that returns mouth-shape (viseme) timing**, such as Azure Speech. The fallback is a simple talk loop like today's.
- **Honest gap:** a live 3D model will look clean and responsive, but it won't match AI-video smoothness, cloth detail or camera artistry. The video's look is closer to 2D anime, so **Live2D** is a real alternative to weigh (better face, but no turning or walking).
- **First step to approve:** load an open-licensed sample VRM in a branch of the app and measure it on your Samsung. No Star Rai assets are needed for that.

## 1. Format: VRM 1.0

- **VERIFIED** ([vrm.dev](https://vrm.dev/en/vrm1/)):
  - VRM 1.0 was released in September 2022; 0.x is "legacy and deprecated".
  - 1.0 is split into separate specs:
    - core (humanoid, meta, expressions; lookAt and firstPerson pages)
    - **MToon** (toon material)
    - **SpringBone** ("swaying parts like hair or clothing")
    - node constraint
    - **VRM Animation**
  - It carries its own avatar licence, the VRM Public License 1.0.
- **VERIFIED, expression presets** ([VRMC_vrm-1.0 expressions spec](https://github.com/vrm-c/vrm-specification/blob/master/specification/VRMC_vrm-1.0/expressions.md)):

  | Group | Presets |
  |---|---|
  | Emotion | `happy`, `angry`, `sad`, `relaxed`, `surprised` |
  | Lip sync | `aa`, `ih`, `ou`, `ee`, `oh` |
  | Blink | `blink`, `blinkLeft`, `blinkRight` |
  | Gaze | `lookUp`, `lookDown`, `lookLeft`, `lookRight` |
  | Other | `neutral` |

  Custom expressions are allowed. `overrideMouth`, `overrideBlink` and `overrideLookAt` (none/block/blend) let an emotion suppress lip sync or blinking, for example closed-eye smug.
- **Alternatives:**
  - **Plain glTF + own toon shader:** same runtime, but you rebuild expressions and physics yourself. No gain.
  - **Live2D Cubism:** 2.5D layered artwork. Closest to the video's flat anime look and to your current PNG puppet, but it can't turn around, walk or reframe in 3D. (ASSUMPTION: general knowledge, no source fetched.)
  - **Spine:** 2D skeletal animation; same limits. (ASSUMPTION)

## 2. Where a Star Rai VRM can come from

| Route | Facts | Fit |
|---|---|---|
| **VRoid Studio** | **VERIFIED** ([guidelines](https://vroid.com/en/studio/guidelines)): you own textures and hair meshes you make from scratch. pixiv keeps base models, clothing meshes and presets ("not CC0"). You may sell or commercially use meshes, textures and presets, sell exported model data, use images and videos in apps and games, edit exports in other software, and make and sell figures. Some presets carry special licence terms. You can't build an app that generates or outputs models from VRoid parts. No credit is required. **VERIFIED** ([MoguLive](https://www.moguravr.com/vroid-studio-v2-14-0-ipad-ads-vroid-plus-en/)): v2.14.0, 29 Jun 2026, Windows/macOS/iPad, free, ads only on iPad (VRoid Plus removes them), exports VRM. VRM 1.0 export re-enabled in v1.20.2 ([notice](https://vroid.com/en/studio/notice/62qSFvhlfsQMgFY7xzqeIH)). | **Primary.** Hair system, outfit and face sliders cover tan skin, messy black hair with an ahoge, star earrings and the sailor uniform. ASSUMPTION: the ahoge and messy strands need hand-drawn hair groups; earrings may need a custom accessory. |
| **Blender → VRM** | **VERIFIED** ([VRM Add-on for Blender](https://github.com/saturday06/VRM-Addon-for-Blender)): VRM import/export for Blender 2.93 to 5.2, configures MToon, MIT/GPL-3.0. Listed as VRMA-capable on [vrm.dev](https://vrm.dev/en/vrma/). | Upgrade path: polish a VRoid export or a commission (BlendBro work). Needs Blender, still blocked here; the user's other session has it. |
| **AI 3D (Tripo, etc.) → VRM** | Our own measurements (#177): the Tripo model has no face rig, no hair, realistic shading and fused or odd topology risks. | **Not recommended** for this look. You'd have to sculpt and shape every expression by hand, which costs more than starting in VRoid. |
| **Commission** | **VERIFIED, secondary source** ([VIVERSE, 2026](https://news.viverse.com/post/vtuber-model-pricing-2026)): custom 3D VRM about $300–$800 budget, $800–$2,500 mid, $3,000–$10,000+ premium, 4–8 weeks typical, pro rigs 8–12 weeks. Commercial licence usually +20–30%; 30–50% deposit; get scope and licence in writing. | **Upgrade or fallback** when you want a pro face and hair. Brief must name: VRM 1.0, all 18 presets plus custom (smug, pout, wink, shy), springs for hair/ahoge/skirt/bow, mobile budget (§5), commercial rights, source files. |

## 3. Face and lip sync

- **Today:** browser text-to-speech (Web Speech API) plays audio inside the browser engine and gives the page **no audio stream and no phoneme timing**. You can't do true lip sync from it, only a "talking" mouth loop. (ASSUMPTION: some engines fire word-boundary events, but support on Android Chrome is unreliable; not tested.)
- **Cloud voice with visemes:**
  - **VERIFIED** ([Azure docs](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/how-to-speech-synthesis-viseme)): the JavaScript SDK fires `visemeReceived` with an **audio offset** for each of **22 visemes** (IDs 0–21). It can also output 55-value blend-shape frames at 60 fps.
  - **Mapping:** the 22 IDs map down to VRM's five mouth shapes (aa, ih, ou, ee, oh).
  - **Key safety:** keep the API key off the phone. The repo already has a `worker/` folder that could proxy it (ASSUMPTION: not inspected).
- **Amplitude fallback:** with any voice that gives audio (cloud TTS), analysing loudness with Web Audio drives mouth opening (`aa`) cheaply. Less accurate than visemes, but robust.
- **Emotion mapping** (proposal): the brain's `emotion` field maps to presets plus custom expressions:

  | `emotion` | Expression |
  |---|---|
  | bratty | custom pout/smirk |
  | smug | custom smug, half-lidded via `blink` 0.4 |
  | tired | `relaxed` + `blink` 0.5 |
  | shy | custom shy (blush) |
  | soft | `relaxed` |
  | hype | `happy` |
  | glance | `lookLeft` / `lookRight` |

  Blend weights over about 150 ms; random blinks every 2–6 s.

## 4. Body animation

- **VRMA:**
  - **VERIFIED** ([vrm.dev](https://vrm.dev/en/vrma/)): officially released, stored as glTF animation with the `VRMC_vrm_animation` extension, `.vrma` extension. It covers humanoid bones, expressions and lookAt, and "the same animation file can be used with any VRM file".
  - Supporting tools include UniVRM, VRM Add-on for Blender, bvh2vrma and VRoid Hub. `@pixiv/three-vrm` is listed.
  - The page warns that tools built on the draft spec may differ.
- **Mixamo:**
  - **VERIFIED, older community FAQ** ([Adobe community, 2022](https://community.adobe.com/t5/mixamo-discussions/mixamo-faq-licensing-royalties-ownership-eula-and-tos/td-p/13234775)): royalty-free for commercial and non-commercial projects. The only real restriction is not distributing the raw character and animation files, plus no ML training.
  - **Risk:** that page is from 2022 and calls it a "preview"; check Adobe's current terms. Shipping clips inside the app is generally treated as use, not raw redistribution (ASSUMPTION).
  - Mixamo clips need retargeting to VRM humanoid. We've already shown retargeting works and how it can go wrong (#177 v10 retarget review).
- **Own clips:** BlendBro can author anime gestures in Blender and export them as VRMA. Motion capture from video is another option (ASSUMPTION: quality varies).
- **Layering in three.js:**
  - an idle loop (breathing, weight shift);
  - a gesture layer per `pose` (wave, peace, scold…) crossfaded about 0.3 s;
  - expressions and lip sync on the face, separately;
  - look-at toward the camera.
- **Pose list → clips:** most map to a short clip plus an expression (wave → wave clip + `happy`; think → hand-to-chin + `lookUp`; pout → idle + custom pout). `turn`, `profile` and the `three_quarter_*` poses become **camera or body yaw** rather than clips.
- **Joint limits:** the v10 joint-range study (#177, `d5f543e`) is about the printed figure. A VRM has no such joint limits.

## 5. Running it on your phone

- **Library:**
  - **VERIFIED** ([three-vrm](https://github.com/pixiv/three-vrm/), [npm](https://www.npmjs.com/package/@pixiv/three-vrm)): MIT; supports VRM 1.0 "and the previous version".
  - From v3 it is WebGPU-compatible via `MToonNodeMaterial` (three.js r167+), with a warning that the NodeMaterial system is "still under development".
  - The normal WebGL path is the safe choice on Android (ASSUMPTION).
- **React:** plain three.js inside one React component is simplest. react-three-fiber is fine if more 3D UI is planned (ASSUMPTION).
- **Budget** (ASSUMPTION; no official three-vrm mobile budget found):
  - **Reference points:**
    - VRChat's Android/Quest guidance (a headset drawing many avatars) is under 10,000 triangles, 1 material and textures 1024² at most ([VRChat](https://creators.vrchat.com/platforms/android/quest-content-optimization)).
    - Our Seed-san study measured 45,058 triangles and 21 primitives (`claude/seed-san-texturebro-study-review.md`).
  - **Suggested starting budget** for **one** character filling a phone screen:
    - **30k–60k triangles**
    - **8–12 materials**
    - **2048² atlases in KTX2**
    - **under about 80 spring joints**
    - **a .vrm under about 20–30 MB**
  - **Measure before committing.**
- **Hosting:** **VERIFIED** ([GitHub Pages limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)): sites up to 1 GB, 100 GB/month soft bandwidth, 10-minute deploy timeout. Git itself blocks files over 100 MB (ASSUMPTION: GitHub's standard limit). Cache the .vrm in the PWA service worker so it downloads once.

## 6. What will and won't match the video

- **Achievable live:**
  - toon shading and outlines (MToon)
  - rim light
  - expression changes and blinking
  - lip sync (with a cloud voice)
  - hair, ahoge and skirt sway
  - gestures and leans
  - look-at toward the viewer
  - camera cuts and zoom between close-up and mid shot
- **Hard or unlikely:**
  - AI-video-level hair strand detail and fluid cloth
  - hand contact with a wall that actually holds (needs IK and scene geometry)
  - painterly lighting
  - walking through a room (possible, but a scene and locomotion are extra work)
  - perfectly natural acting from a small clip library

## 7. Roadmap (proposal; each step needs your approval)

| Phase | What | Rough effort | Decision for you |
|---|---|---|---|
| **0. Pipeline proof** | Research branch of the app: three-vrm loads an **open-licensed sample VRM** (e.g. a pixiv/VRM Consortium sample), with idle, blink and look-at. Measure FPS, memory and load time on your Samsung. No deploy. | 1–2 sessions | Approve one sample asset to use |
| **1. First Star Rai** | Build Star Rai in VRoid Studio (you, or a helper on your machine), export VRM 1.0. Review licence fields and our budget. | 1–3 days of hands-on creation | VRoid vs commission |
| **2. Face** | Map `emotion` to expressions; add custom smug/pout/shy; random blink; talk loop with today's TTS. | 1–2 sessions | — |
| **3. Voice and lip sync** | Cloud TTS with visemes (e.g. Azure) via the worker proxy, visemes mapped to aa/ih/ou/ee/oh. | 2–3 sessions | Pick a voice service; cost and API key |
| **4. Body** | 8–12 gesture clips (VRMA, from Blender or Mixamo after a licence check) mapped to `pose`, with crossfades and camera framing. | Several sessions | Clip source and licence |
| **5. Polish** | Spring tuning (hair, ahoge, skirt, bow), outline and rim look, performance pass, PWA caching. Ship only on a named deploy. | Ongoing | Named ship |

## Open questions for you

1. Does Star Rai need to **turn and move in 3D**? If not, Live2D might match the look better.
2. VRoid yourself, or **commission** (budget range)?
3. Are you OK with a **paid cloud voice** for real lip sync?
4. Which **phone** sets the budget? (Assumed: your Samsung in Chrome.)

## Limits of this light version

- Fewer sources than a full research run.
- Commission prices come from one secondary source.
- The Mixamo terms page is from 2022.
- No mobile performance was measured.
- Live2D and Spine comparisons are from general knowledge.
- The full research brief can still be run later.
