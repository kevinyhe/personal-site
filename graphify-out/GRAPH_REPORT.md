# Graph Report - arbor-web  (2026-09-26)

## Corpus Check
- 166 files · ~262,569 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1310 nodes · 2516 edges · 85 communities (63 shown, 22 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 28 edges (avg confidence: 0.78)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `0225677b`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- compilerOptions
- package.json
- What You Must Do When Invoked
- What You Must Do When Invoked
- What You Must Do When Invoked
- WeepingCherryTreeCanvas
- devDependencies
- /graphify
- graphify reference: extra exports and benchmark
- clamp01
- graphify reference: query, path, explain
- graphify reference: query, path, explain
- eslint.config.mjs
- graphify reference: add a URL and watch a folder
- graphify reference: commit hook and native CLAUDE.md integration
- graphify reference: incremental update and cluster-only
- graphify reference: add a URL and watch a folder
- graphify reference: commit hook and native CLAUDE.md integration
- graphify reference: incremental update and cluster-only
- layout.tsx
- graphify reference: GitHub clone and cross-repo merge
- graphify reference: transcribe video and audio
- graphify reference: GitHub clone and cross-repo merge
- smoothstep
- AGENTS.md
- CLAUDE.md
- CLAUDE.md
- extraction-spec.md
- .update
- next.config.ts
- postcss.config.mjs
- tailwind.config.ts
- next-env.d.ts
- CanopyOcclusion
- createSakuraBlossomGeometry
- compress.py
- validate.py
- README.md
- SKILL.md
- Caveman Help
- Caveman Compress
- SKILL.md
- caveman-commit
- caveman-review
- caveman-stats
- __init__.py
- template.tsx
- clamp01
- not-found.tsx
- polyfills.js
- smoothstep
- TreeTuner.tsx
- lerp
- Preserve Typography
- idxview.mjs
- loadThinkerGeometry
- CanopyLobe
- fbm2
- carveCell
- buildSolidThinkerChunks
- fractureIntoPieces
- capture.mjs
- v08.tsx
- v09.tsx
- ProblemStatementTransition.tsx
- v13.tsx
- eslint
- AGENTS.md
- scripts
- barShader.ts
- ValleyMarkup.tsx
- makeRng
- Branch
- idxrender.mjs
- check-serif-glyphs.mjs
- package.json
- Branch
- sakuraStage.ts
- .append
- siteContent.ts
- layout.tsx
- HomeSections.tsx
- postcss
- @types/node
- LocalTime.tsx

## God Nodes (most connected - your core abstractions)
1. `WeepingCherryGenerator` - 46 edges
2. `start()` - 24 edges
3. `elsewhere` - 20 edges
4. `lerp()` - 19 edges
5. `clamp01()` - 18 edges
6. `CanvasSource` - 18 edges
7. `WeepingCherryTreeCanvas()` - 17 edges
8. `PetalDrift()` - 17 edges
9. `makeRng()` - 17 edges
10. `VariantShell()` - 17 edges

## Surprising Connections (you probably didn't know these)
- `Home()` --calls--> `preloadCrtAssets()`  [EXTRACTED]
  app/crt/page.tsx → components/crtAssets.ts
- `Home()` --calls--> `preloadCrtAssets()`  [EXTRACTED]
  app/page.tsx → components/crtAssets.ts
- `generateMetadata()` --references--> `VARIANTS`  [EXTRACTED]
  app/v/[n]/page.tsx → components/variants/list.ts
- `yieldFrame()` --indirect_call--> `resolve()`  [INFERRED]
  components/valley/hutScene.ts → scripts/ts-hooks.mjs
- `withTimeout()` --indirect_call--> `resolve()`  [INFERRED]
  components/valley/valleyBehaviour.ts → scripts/ts-hooks.mjs

## Import Cycles
- 1-file cycle: `components/SakuraStage.tsx -> components/SakuraStage.tsx`
- 1-file cycle: `components/PetalDrift.tsx -> components/PetalDrift.tsx`

## Communities (85 total, 22 thin omitted)

### Community 0 - "compilerOptions"
Cohesion: 0.09
Nodes (23): autoprefixer, @dimforge/rapier3d-compat, eslint-config-next, @eslint/eslintrc, devDependencies, autoprefixer, @dimforge/rapier3d-compat, eslint-config-next (+15 more)

### Community 1 - "package.json"
Cohesion: 0.13
Nodes (15): gsap, next, dependencies, gsap, next, react, react-dom, simple-icons (+7 more)

### Community 2 - "What You Must Do When Invoked"
Cohesion: 0.07
Nodes (29): ./*, dom, dom.iterable, esnext, next-env.d.ts, .next-s47/types/**/*.ts, .next/types/**/*.ts, node_modules (+21 more)

### Community 3 - "What You Must Do When Invoked"
Cohesion: 0.07
Nodes (26): For /graphify add and --watch, For /graphify query, For the commit hook and native CLAUDE.md integration, For --update and --cluster-only, /graphify, Honesty Rules, Interpreter guard for subcommands, Part A - Structural extraction for code files (+18 more)

### Community 4 - "What You Must Do When Invoked"
Cohesion: 0.25
Nodes (8): applyBlossomWind(), createPetalDetailTexture(), createSakuraBlossomGeometry(), createSakuraBudGeometry(), lerp(), makeRng(), sakuraPetalOutline(), sampleBlossomTint()

### Community 5 - "WeepingCherryTreeCanvas"
Cohesion: 0.06
Nodes (22): before, buf, discs, driveBox, driveCentre, dropped, droppedSet, floorDiscs (+14 more)

### Community 6 - "devDependencies"
Cohesion: 0.08
Nodes (24): For /graphify add and --watch, For /graphify query, For the commit hook and native CLAUDE.md integration, For --update and --cluster-only, /graphify, Honesty Rules, Interpreter guard for subcommands, Part A - Structural extraction for code files (+16 more)

### Community 7 - "/graphify"
Cohesion: 0.22
Nodes (8): graphify reference: extra exports and benchmark, Step 6b - Wiki (only if --wiki flag), Step 7 - Neo4j export (only if --neo4j or --neo4j-push flag), Step 7a - FalkorDB export (only if --falkordb or --falkordb-push flag), Step 7b - SVG export (only if --svg flag), Step 7c - GraphML export (only if --graphml flag), Step 7d - MCP server (only if --mcp flag), Step 8 - Token reduction benchmark (only if total_words > 5000)

### Community 8 - "graphify reference: extra exports and benchmark"
Cohesion: 0.22
Nodes (8): graphify reference: extra exports and benchmark, Step 6b - Wiki (only if --wiki flag), Step 7 - Neo4j export (only if --neo4j or --neo4j-push flag), Step 7a - FalkorDB export (only if --falkordb or --falkordb-push flag), Step 7b - SVG export (only if --svg flag), Step 7c - GraphML export (only if --graphml flag), Step 7d - MCP server (only if --mcp flag), Step 8 - Token reduction benchmark (only if total_words > 5000)

### Community 9 - "clamp01"
Cohesion: 0.15
Nodes (11): education, Experience, projects, skillGroups, currently, elsewhere, pad(), STATEMENTS (+3 more)

### Community 10 - "graphify reference: query, path, explain"
Cohesion: 0.33
Nodes (5): For /graphify explain, For /graphify path, graphify reference: query, path, explain, Step 0 — Constrained query expansion (REQUIRED before traversal), Step 1 — Traversal

### Community 11 - "graphify reference: query, path, explain"
Cohesion: 0.33
Nodes (5): For /graphify explain, For /graphify path, graphify reference: query, path, explain, Step 0 — Constrained query expansion (REQUIRED before traversal), Step 1 — Traversal

### Community 12 - "eslint.config.mjs"
Cohesion: 0.40
Nodes (4): compat, __dirname, eslintConfig, __filename

### Community 13 - "graphify reference: add a URL and watch a folder"
Cohesion: 0.50
Nodes (3): For /graphify add, For --watch, graphify reference: add a URL and watch a folder

### Community 14 - "graphify reference: commit hook and native CLAUDE.md integration"
Cohesion: 0.50
Nodes (3): For git commit hook, For native CLAUDE.md integration, graphify reference: commit hook and native CLAUDE.md integration

### Community 15 - "graphify reference: incremental update and cluster-only"
Cohesion: 0.50
Nodes (3): For --cluster-only, For --update (incremental re-extraction), graphify reference: incremental update and cluster-only

### Community 16 - "graphify reference: add a URL and watch a folder"
Cohesion: 0.50
Nodes (3): For /graphify add, For --watch, graphify reference: add a URL and watch a folder

### Community 17 - "graphify reference: commit hook and native CLAUDE.md integration"
Cohesion: 0.50
Nodes (3): For git commit hook, For native CLAUDE.md integration, graphify reference: commit hook and native CLAUDE.md integration

### Community 18 - "graphify reference: incremental update and cluster-only"
Cohesion: 0.50
Nodes (3): For --cluster-only, For --update (incremental re-extraction), graphify reference: incremental update and cluster-only

### Community 19 - "layout.tsx"
Cohesion: 0.17
Nodes (17): place(), Block(), copy(), drawTile(), fitLines(), Fonts, LenisLike, reducedMotion() (+9 more)

### Community 28 - ".update"
Cohesion: 0.29
Nodes (4): arborGustEnvelope(), FallingPetalSystem, randomPointInUnitSphere(), wrapAngle()

### Community 35 - "compress.py"
Cohesion: 0.07
Nodes (49): benchmark_pair(), count_tokens(), main(), print_table(), Path, main(), print_usage(), backup_dir_for() (+41 more)

### Community 36 - "validate.py"
Cohesion: 0.14
Nodes (14): WorkEntry, AboutSection(), ContactSection(), Attrs, Divider(), PillButton(), SectionTitle(), TitleStars() (+6 more)

### Community 37 - "README.md"
Cohesion: 0.09
Nodes (20): Before / After, Benchmarks, How It Work, <img src="../../docs/assets/dancing-rock.svg" width="20" height="20" alt="rock"/> Caveman (285 tokens), Install, 📄 Original (706 tokens), Part of Caveman, Security (+12 more)

### Community 38 - "SKILL.md"
Cohesion: 0.14
Nodes (12): cavecrew, Example chaining, How to invoke, Model overrides, See also, What it does, Auto-clarity (inherited), Chaining patterns (+4 more)

### Community 39 - "Caveman Help"
Cohesion: 0.14
Nodes (12): caveman-help, Example output, How to invoke, See also, What it does, Caveman Help, Configure Default Mode, Deactivate (+4 more)

### Community 40 - "Caveman Compress"
Cohesion: 0.17
Nodes (11): Boundaries, Caveman Compress, Compress, Compression Rules, Pattern, Preserve EXACTLY (never modify), Preserve Structure, Process (+3 more)

### Community 41 - "SKILL.md"
Cohesion: 0.17
Nodes (10): caveman, Example output, How to invoke, See also, What it does, Auto-Clarity, Boundaries, Intensity (+2 more)

### Community 42 - "caveman-commit"
Cohesion: 0.18
Nodes (9): caveman-commit, Example output, How to invoke, See also, What it does, Auto-Clarity, Boundaries, Examples (+1 more)

### Community 43 - "caveman-review"
Cohesion: 0.18
Nodes (9): caveman-review, Example output, How to invoke, See also, What it does, Auto-Clarity, Boundaries, Examples (+1 more)

### Community 44 - "caveman-stats"
Cohesion: 0.29
Nodes (5): caveman-stats, Example output, How to invoke, See also, What it does

### Community 46 - "template.tsx"
Cohesion: 0.05
Nodes (70): sampleBoughSpawn(), Bloom, BLOSSOM_CENTER, Branch, BranchRule(), BranchRuleProps, buildBranch(), easeOut() (+62 more)

### Community 47 - "clamp01"
Cohesion: 0.40
Nodes (4): Boundaries, Compile-Only Verification, Rule, Workflow

### Community 49 - "polyfills.js"
Cohesion: 0.13
Nodes (13): ALL_SKILLS, AREAS, Case(), KIND, LenisLike, PILLARS, PLACES, scrollToHeading() (+5 more)

### Community 50 - "smoothstep"
Cohesion: 0.06
Nodes (37): BareThreeCanvasProps, BLOSSOM_CALYX_COLOR, BLOSSOM_CENTER_COLOR, BlossomPlacement, BranchFrame, BranchWindVectors, CanopyLobe, CanopyShadeUniforms (+29 more)

### Community 51 - "TreeTuner.tsx"
Cohesion: 0.13
Nodes (27): Bloom, BranchProgress(), BranchProgressProps, clamp01(), DEFAULT_LANDMARKS, DEFAULT_LIGHT_PANELS, Landmark, LenisLike (+19 more)

### Community 53 - "Preserve Typography"
Cohesion: 0.40
Nodes (4): Hard Rule, Preserve Typography, Verification, Workflow

### Community 54 - "idxview.mjs"
Cohesion: 0.06
Nodes (47): HeroValley(), sceneFx, buildTrackHeight(), CAM_FAR_LOOK, CAM_FAR_POS, CAM_PAST_LOOK, CAM_PAST_POS, createHutScene() (+39 more)

### Community 55 - "loadThinkerGeometry"
Cohesion: 0.19
Nodes (11): awards, SkillGroup, Terminal(), NAV, pad(), SectionId, SKILL_ORDER, TAGLINE (+3 more)

### Community 56 - "CanopyLobe"
Cohesion: 0.21
Nodes (10): Skill, all, iconColour(), skillIcon, SkillMark(), allSkills, skillFor(), V06() (+2 more)

### Community 57 - "fbm2"
Cohesion: 0.22
Nodes (3): BelowIntro(), crestAt(), NeedleSeam()

### Community 58 - "carveCell"
Cohesion: 0.24
Nodes (6): Home(), Home(), CRT_ASSETS, preloadCrtAssets(), sectionLinks, socialLinks

### Community 59 - "buildSolidThinkerChunks"
Cohesion: 0.14
Nodes (10): Marquee(), LocalTime(), DOTS, EXPLORATIONS, FEATURED, KIND, PITCH, tick() (+2 more)

### Community 60 - "fractureIntoPieces"
Cohesion: 0.27
Nodes (4): DESIGNS, generateMetadata(), metadata, VARIANTS

### Community 61 - "capture.mjs"
Cohesion: 0.24
Nodes (7): ALL_SKILLS, findSkill(), StackMarks(), STAGES, Tear(), tearPoints(), TILES

### Community 62 - "v08.tsx"
Cohesion: 0.32
Nodes (6): CREDENTIALS, drawSlide(), TONES, Uniforms, V08(), wrap()

### Community 63 - "v09.tsx"
Cohesion: 0.29
Nodes (4): curvePath(), KIND, TONES, V09()

### Community 65 - "v13.tsx"
Cohesion: 0.33
Nodes (5): Project, ACCENTS, DISCIPLINE, skillByName(), V13()

### Community 74 - "scripts"
Cohesion: 0.18
Nodes (10): name, private, scripts, bake:bg, build, dev, lint, start (+2 more)

### Community 98 - "barShader.ts"
Cohesion: 0.06
Nodes (79): easeOutCubic(), HeroRobot, HeroRobotOptions, mountHeroRobot(), Wheel, AboutScene(), SprigScene(), StatementSection() (+71 more)

### Community 99 - "ValleyMarkup.tsx"
Cohesion: 0.08
Nodes (10): mountValley(), registerOnce(), ValleyHome(), Attrs, HOME_NAV, NAV, NavItem, ValleyIntroHome() (+2 more)

### Community 102 - "makeRng"
Cohesion: 0.09
Nodes (47): Bloom, clamp(), CloudOptions, createBlossomCloud(), grey(), LAYOUTS, Loose, makeFlowerPath() (+39 more)

### Community 111 - "Branch"
Cohesion: 0.33
Nodes (3): Branch, getBranchFrame(), UP

### Community 125 - "idxrender.mjs"
Cohesion: 0.05
Nodes (66): BLOSSOM_TINT_BRIGHT, BLOSSOM_TINT_PALE, BLOSSOM_TINT_ROSE, BLOSSOM_TINT_SOFT, BranchWindUniforms, Quality, resolveSceneQuality(), boughSpawn (+58 more)

### Community 136 - "package.json"
Cohesion: 0.33
Nodes (9): Field, FIELDS, TreeTuner(), freezeBlock(), isTreeTuningEnabled(), setTreeTuning(), TREE_BASE_SCALE, TREE_TUNING_DEFAULT (+1 more)

### Community 138 - "Branch"
Cohesion: 0.30
Nodes (11): clamp01(), createBarkTextures(), createFallingPetalGeometry(), getBranchWindVectors(), getLimbWindAmplitude(), getPetalVertexColor(), getTwigWindAmplitude(), getTwigWindFlutter() (+3 more)

### Community 142 - "sakuraStage.ts"
Cohesion: 0.21
Nodes (11): ContactStage, HomeSections(), Band, headerBand(), prefersReducedMotion(), SectionHeader(), LenisLike, scrollToSection() (+3 more)

### Community 145 - "siteContent.ts"
Cohesion: 0.13
Nodes (11): metadata, Template(), metadata, selected, stack, workEntries, SubpageShell(), SubpageShellProps (+3 more)

### Community 151 - "layout.tsx"
Cohesion: 0.16
Nodes (10): displaySerif, inter, metadata, mono, viewport, AuroraBackground, SiteBackground(), SmoothScroll() (+2 more)

### Community 159 - "HomeSections.tsx"
Cohesion: 0.15
Nodes (16): HERO_POSE, HeroIntro(), HeroIntroProps, LOADING_POSE, NarrationScene, narrationX(), clamp01(), IntroductionRun() (+8 more)

### Community 160 - "postcss"
Cohesion: 0.29
Nodes (6): { chromium }, H, LAYERS, QUALITY, require, W

### Community 163 - "@types/node"
Cohesion: 0.47
Nodes (3): metadata, FractureText(), hashed()

### Community 166 - "LocalTime.tsx"
Cohesion: 0.39
Nodes (7): CLOCK_FORMAT, LocalTime(), nowInToronto(), PLACEHOLDER, prefersReducedMotion(), Time, ZONE_FORMAT

## Knowledge Gaps
- **455 isolated node(s):** `metadata`, `metadata`, `mono`, `inter`, `displaySerif` (+450 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **22 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `tick()` connect `buildSolidThinkerChunks` to `barShader.ts`, `LocalTime.tsx`, `template.tsx`, `layout.tsx`, `loadThinkerGeometry`, `layout.tsx`, `idxrender.mjs`?**
  _High betweenness centrality (0.089) - this node is a cross-community bridge._
- **Why does `start()` connect `barShader.ts` to `CanopyOcclusion`, `ValleyMarkup.tsx`, `makeRng`, `TreeTuner.tsx`, `idxview.mjs`, `loadThinkerGeometry`, `HomeSections.tsx`?**
  _High betweenness centrality (0.056) - this node is a cross-community bridge._
- **Why does `SmoothScroll()` connect `layout.tsx` to `buildSolidThinkerChunks`?**
  _High betweenness centrality (0.055) - this node is a cross-community bridge._
- **Are the 5 inferred relationships involving `start()` (e.g. with `.createSpraySprigs()` and `BranchProgress()`) actually correct?**
  _`start()` has 5 INFERRED edges - model-reasoned connections that need verification._
- **What connects `metadata`, `metadata`, `mono` to the rest of the system?**
  _455 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `compilerOptions` be split into smaller, more focused modules?**
  _Cohesion score 0.08695652173913043 - nodes in this community are weakly interconnected._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.13333333333333333 - nodes in this community are weakly interconnected._