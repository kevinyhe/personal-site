# Graph Report - arbor-web  (2026-09-22)

## Corpus Check
- 196 files · ~4,173,298 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1646 nodes · 2605 edges · 151 communities (110 shown, 41 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 30 edges (avg confidence: 0.77)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `8383ecab`
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
- buildScene
- budgetedMesh
- ProblemStatementTransition.tsx
- scopeLocalMesh
- tv.mjs
- AGENTS.md
- tvopen.mjs
- tvseq.mjs
- viewportMetrics.ts
- DitherVideo.tsx
- scripts
- fbm2
- package.json
- budgetedMesh
- Branch
- registerColor
- partFor
- robo.mjs
- buildPartMesh
- propModels.ts
- load4.mjs
- load1.mjs
- slotsOf
- final.mjs
- scrub.mjs
- sweep.sh
- sweep2.mjs
- sweep3.mjs
- barShader.ts
- ValleyMarkup.tsx
- mountains.ts
- queue.mjs
- makeRng
- Branch
- centre.mjs
- asciiTree.ts
- scopeLocalMesh
- blossomCloud.ts
- hop.mjs
- usweep.mjs
- petalBank.ts
- Branch
- groupCapRegions
- smooth.mjs
- cam2.mjs
- cam2model.mts
- camsmooth.mts
- idxrender.mjs
- keytest.mjs
- goalfit.mts
- radius.mjs
- camtrace.mts
- drift.mts
- idx.mjs
- hinge.mjs
- run-shot.sh
- sweepglide.sh
- check-serif-glyphs.mjs
- package.json
- Branch
- SakuraStage.tsx
- sakuraBlossomMarks.ts
- sakuraStage.ts
- .append
- siteContent.ts
- Brief: the ball's journey and the scoring animation, as real physics
- layout.tsx
- SubpageShell.tsx
- sakuraTree.ts
- eslint
- HomeSections.tsx
- postcss
- @types/node
- idxrender.mjs
- LocalTime.tsx

## God Nodes (most connected - your core abstractions)
1. `WeepingCherryGenerator` - 47 edges
2. `start()` - 22 edges
3. `lerp()` - 19 edges
4. `clamp01()` - 18 edges
5. `WeepingCherryTreeCanvas()` - 18 edges
6. `PetalDrift()` - 16 edges
7. `compilerOptions` - 16 edges
8. `ballStatesAt()` - 15 edges
9. `buildSimulation()` - 15 edges
10. `validate()` - 14 edges

## Surprising Connections (you probably didn't know these)
- `draw()` --indirect_call--> `U`  [INFERRED]
  .scratch-s54100/idxview.mjs → components/valley/barShader.ts
- `start()` --indirect_call--> `band()`  [INFERRED]
  components/valley/valleyBehaviour.ts → .scratch-s54100/cam2model.mts
- `makeBlossomMarks()` --indirect_call--> `px()`  [INFERRED]
  components/sakuraBlossomMarks.ts → .scratch-s54100/idxrender.mjs
- `makeBlossomMarks()` --indirect_call--> `py()`  [INFERRED]
  components/sakuraBlossomMarks.ts → .scratch-s54100/idxrender.mjs
- `PetalReveal()` --indirect_call--> `draw()`  [INFERRED]
  components/PetalReveal.tsx → .scratch-s54100/idxview.mjs

## Import Cycles
- 1-file cycle: `components/SakuraStage.tsx -> components/SakuraStage.tsx`
- 1-file cycle: `components/PetalDrift.tsx -> components/PetalDrift.tsx`

## Communities (151 total, 41 thin omitted)

### Community 0 - "compilerOptions"
Cohesion: 0.09
Nodes (23): autoprefixer, @dimforge/rapier3d-compat, eslint, eslint-config-next, @eslint/eslintrc, devDependencies, autoprefixer, @dimforge/rapier3d-compat (+15 more)

### Community 1 - "package.json"
Cohesion: 0.13
Nodes (15): gsap, next, dependencies, gsap, next, react, react-dom, @react-three/fiber (+7 more)

### Community 2 - "What You Must Do When Invoked"
Cohesion: 0.07
Nodes (28): ./*, dom, dom.iterable, esnext, next-env.d.ts, .next/types/**/*.ts, node_modules, **/*.ts (+20 more)

### Community 3 - "What You Must Do When Invoked"
Cohesion: 0.07
Nodes (26): For /graphify add and --watch, For /graphify query, For the commit hook and native CLAUDE.md integration, For --update and --cluster-only, /graphify, Honesty Rules, Interpreter guard for subcommands, Part A - Structural extraction for code files (+18 more)

### Community 4 - "What You Must Do When Invoked"
Cohesion: 0.19
Nodes (17): applyBlossomWind(), clamp01(), createBarkTextures(), createFallingPetalGeometry(), createPetalDetailTexture(), createSakuraBlossomGeometry(), createSakuraBudGeometry(), getBranchWindVectors() (+9 more)

### Community 5 - "WeepingCherryTreeCanvas"
Cohesion: 0.05
Nodes (34): ab, byColor, CAP_CHASSIS, CAP_WHEEL, chassisInstances, chassisMeshCache, chassisPrims, chassisTris (+26 more)

### Community 6 - "devDependencies"
Cohesion: 0.08
Nodes (24): For /graphify add and --watch, For /graphify query, For the commit hook and native CLAUDE.md integration, For --update and --cluster-only, /graphify, Honesty Rules, Interpreter guard for subcommands, Part A - Structural extraction for code files (+16 more)

### Community 7 - "/graphify"
Cohesion: 0.22
Nodes (8): graphify reference: extra exports and benchmark, Step 6b - Wiki (only if --wiki flag), Step 7 - Neo4j export (only if --neo4j or --neo4j-push flag), Step 7a - FalkorDB export (only if --falkordb or --falkordb-push flag), Step 7b - SVG export (only if --svg flag), Step 7c - GraphML export (only if --graphml flag), Step 7d - MCP server (only if --mcp flag), Step 8 - Token reduction benchmark (only if total_words > 5000)

### Community 8 - "graphify reference: extra exports and benchmark"
Cohesion: 0.22
Nodes (8): graphify reference: extra exports and benchmark, Step 6b - Wiki (only if --wiki flag), Step 7 - Neo4j export (only if --neo4j or --neo4j-push flag), Step 7a - FalkorDB export (only if --falkordb or --falkordb-push flag), Step 7b - SVG export (only if --svg flag), Step 7c - GraphML export (only if --graphml flag), Step 7d - MCP server (only if --mcp flag), Step 8 - Token reduction benchmark (only if total_words > 5000)

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

### Community 28 - ".update"
Cohesion: 0.29
Nodes (4): arborGustEnvelope(), FallingPetalSystem, randomPointInUnitSphere(), wrapAngle()

### Community 35 - "compress.py"
Cohesion: 0.07
Nodes (49): benchmark_pair(), count_tokens(), main(), print_table(), Path, main(), print_usage(), backup_dir_for() (+41 more)

### Community 36 - "validate.py"
Cohesion: 0.13
Nodes (17): APPROACH, buildDriftPath(), clamp(), DriverPhase, frictionCoef(), GOAL_MOUTH_RL, PICKUP_WINDOW, RobotDriftFrame (+9 more)

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
Cohesion: 0.06
Nodes (68): Bloom, BLOSSOM_CENTER, Branch, BranchRule(), BranchRuleProps, buildBranch(), easeOut(), easeOutBack() (+60 more)

### Community 47 - "clamp01"
Cohesion: 0.40
Nodes (4): Boundaries, Compile-Only Verification, Rule, Workflow

### Community 49 - "polyfills.js"
Cohesion: 0.04
Nodes (38): ab, byColor, chassisInstances, chassisMeshCache, chassisPrims, chassisTris, colorIndex, colorReg (+30 more)

### Community 50 - "smoothstep"
Cohesion: 0.06
Nodes (37): BareThreeCanvasProps, BLOSSOM_CALYX_COLOR, BLOSSOM_CENTER_COLOR, BlossomPlacement, BranchFrame, BranchWindVectors, CanopyLobe, CanopyShadeUniforms (+29 more)

### Community 51 - "TreeTuner.tsx"
Cohesion: 0.06
Nodes (46): BloomCursor(), BurstOptions, clamp01(), COLOURS, EmitFn, gustEnvelope(), Petal, petalOutline() (+38 more)

### Community 53 - "Preserve Typography"
Cohesion: 0.40
Nodes (4): Hard Rule, Preserve Typography, Verification, Workflow

### Community 54 - "idxview.mjs"
Cohesion: 0.09
Nodes (32): CAM_FAR_LOOK, CAM_FAR_POS, CAM_NEAR_LOOK, CAM_NEAR_POS, createHutScene(), fbm2(), hash2(), lerp() (+24 more)

### Community 55 - "loadThinkerGeometry"
Cohesion: 0.04
Nodes (38): blob, chassisDraws, chassisIdx, chassisMesh, chassisPos, drawCount, F2G, f3d (+30 more)

### Community 56 - "CanopyLobe"
Cohesion: 0.08
Nodes (34): createRobotCameraState(), DRIFT_FINISH, RobotCameraState, assembleRig(), BallPhysicsModule, BallState, buildPlaceholderBall(), buildPlaceholderBallPhysics() (+26 more)

### Community 57 - "fbm2"
Cohesion: 0.07
Nodes (58): arcLengths(), ballAt(), ballCount(), BallPlan, ballPlans(), ballSpin(), BallState, ballStatesAt() (+50 more)

### Community 58 - "carveCell"
Cohesion: 0.33
Nodes (7): collectScope(), drawScope(), isWheelWorld(), mul4(), partFor(), reAdd(), scopeInfo()

### Community 59 - "buildSolidThinkerChunks"
Cohesion: 0.29
Nodes (5): PartMeta, RobotMeta, RobotModel, RobotSpinner, WheelMeta

### Community 60 - "fractureIntoPieces"
Cohesion: 0.40
Nodes (4): fractions, [outPrefix = "shot", fractionsArg = "0", waitArg = "1500"], settleMs, t0

### Community 61 - "capture.mjs"
Cohesion: 0.40
Nodes (4): fractions, [outPrefix = "shot", fractionsArg = "0", waitArg = "1500"], settleMs, t0

### Community 62 - "buildScene"
Cohesion: 0.67
Nodes (4): buildScene(), findAll(), namePat(), parseOverrides()

### Community 63 - "budgetedMesh"
Cohesion: 0.67
Nodes (3): budgetedMesh(), compact(), simplify()

### Community 64 - "ProblemStatementTransition.tsx"
Cohesion: 0.16
Nodes (9): HERO_POSE, HeroIntro(), HeroIntroProps, LOADING_POSE, NarrationScene, narrationX(), StageErrorBoundary, sceneFx (+1 more)

### Community 65 - "scopeLocalMesh"
Cohesion: 0.19
Nodes (21): bakePrimitives(), ball, budgetedMesh(), budgetLoop(), buildBall(), buildGoal(), collectInstances(), compact() (+13 more)

### Community 72 - "viewportMetrics.ts"
Cohesion: 0.21
Nodes (12): BranchWindUniforms, boughSpawn, BoughSpawnField, sampleBoughSpawn(), BLOSSOM_BUDGET, BOUGH_AIM, disposeTree(), makeSakuraBough() (+4 more)

### Community 73 - "DitherVideo.tsx"
Cohesion: 0.14
Nodes (17): HutScene, Box, boxOf(), getLenis(), Mode, mountValley(), registerOnce(), Scene (+9 more)

### Community 74 - "scripts"
Cohesion: 0.25
Nodes (8): scripts, bake:balls, bake:bg, build, dev, lint, start, typecheck

### Community 75 - "fbm2"
Cohesion: 0.20
Nodes (6): box, center, PUB, size, tris3d, v

### Community 76 - "package.json"
Cohesion: 0.50
Nodes (3): name, private, version

### Community 77 - "budgetedMesh"
Cohesion: 0.50
Nodes (4): budgetedMesh(), budgetLoop(), compact(), simplify()

### Community 78 - "Branch"
Cohesion: 0.06
Nodes (54): worldToModel(), args, finalPose, FPS, frames, HERE, inTrough, maxSteps (+46 more)

### Community 79 - "registerColor"
Cohesion: 0.67
Nodes (3): colorKeyOf(), registerColor(), slotsOf()

### Community 80 - "partFor"
Cohesion: 0.67
Nodes (3): dropDegenerate(), partFor(), weld()

### Community 82 - "buildPartMesh"
Cohesion: 0.36
Nodes (8): budgetedMesh(), budgetLoop(), buildPartMesh(), compact(), dropDegenerate(), partFor(), simplify(), weld()

### Community 83 - "propModels.ts"
Cohesion: 0.36
Nodes (7): BallMeta, GoalMeta, GoalModel, loadBallModel(), loadGlb(), loadGoalModel(), makeGoalTranslucent()

### Community 84 - "load4.mjs"
Cohesion: 0.33
Nodes (5): back, end, fwd, n, ts

### Community 85 - "load1.mjs"
Cohesion: 0.50
Nodes (3): box, byCat, parents

### Community 86 - "slotsOf"
Cohesion: 0.50
Nodes (4): colorKeyOf(), registerColor(), signature(), slotsOf()

### Community 98 - "barShader.ts"
Cohesion: 0.13
Nodes (17): BarCanvas, BarCanvasOptions, BarLayer, BarLayerConfig, createBarCanvas(), cssColorToRgb(), DEFAULT_CONFIG, hexToRgb() (+9 more)

### Community 100 - "mountains.ts"
Cohesion: 0.31
Nodes (14): buildMassif(), buildRanges(), clamp(), createMountains(), lerp(), MountainOptions, paint(), Ridge (+6 more)

### Community 101 - "queue.mjs"
Cohesion: 0.29
Nodes (6): end, f1, f2, fin, finish, n

### Community 102 - "makeRng"
Cohesion: 0.22
Nodes (13): createHutSilhouette(), g(), HutOptions, paint(), makeRng(), bezier2(), bezier3(), createSprig() (+5 more)

### Community 103 - "Branch"
Cohesion: 0.40
Nodes (3): bend, f, rs

### Community 105 - "asciiTree.ts"
Cohesion: 0.31
Nodes (8): BuiltTree, createAsciiTree(), disposeObject(), frameTree(), KEY_POSITION, relevelMaterials(), standardMaterialsOf(), yieldFrame()

### Community 106 - "scopeLocalMesh"
Cohesion: 0.67
Nodes (3): dropDegenerate(), scopeLocalMesh(), weld()

### Community 107 - "blossomCloud.ts"
Cohesion: 0.39
Nodes (7): Bloom, clamp(), CloudOptions, createBlossomCloud(), Lobe, makeFlowerPath(), smoothstep()

### Community 110 - "petalBank.ts"
Cohesion: 0.48
Nodes (6): clamp(), createPetalBank(), makePetalPath(), Petal, PetalBankOptions, smoothstep()

### Community 111 - "Branch"
Cohesion: 0.33
Nodes (3): Branch, getBranchFrame(), UP

### Community 112 - "groupCapRegions"
Cohesion: 0.29
Nodes (6): bx, f, GOAL_MOUTH, inward, rear, tip

### Community 123 - "cam2model.mts"
Cohesion: 0.15
Nodes (9): makeContactTree(), args, band(), body, f, hi, lo, rows (+1 more)

### Community 124 - "camsmooth.mts"
Cohesion: 0.23
Nodes (11): AIMY, anchor(), at(), AZ, BEHIND, DIST, f, keyed() (+3 more)

### Community 125 - "idxrender.mjs"
Cohesion: 0.14
Nodes (20): resolveSceneQuality(), anchorProgress(), AnchorRecord, claimDraw(), createPlacement(), disposeObject(), drawArbiter, KEY_LIGHT_POSITION (+12 more)

### Community 126 - "keytest.mjs"
Cohesion: 0.20
Nodes (7): K, p2, prev, r, r2, rates, rr

### Community 127 - "goalfit.mts"
Cohesion: 0.22
Nodes (4): f, iDeep, minZ, MOUTH

### Community 128 - "radius.mjs"
Cohesion: 0.22
Nodes (5): A, B, f, R, seg

### Community 129 - "camtrace.mts"
Cohesion: 0.33
Nodes (3): f, KEYS_AZ, prev

### Community 131 - "idx.mjs"
Cohesion: 0.67
Nodes (3): load(), names, report()

### Community 136 - "package.json"
Cohesion: 0.33
Nodes (9): Field, FIELDS, TreeTuner(), freezeBlock(), isTreeTuningEnabled(), setTreeTuning(), TREE_BASE_SCALE, TREE_TUNING_DEFAULT (+1 more)

### Community 138 - "Branch"
Cohesion: 0.14
Nodes (13): getTwigWindAmplitude(), getTwigWindFlutter(), BLOSSOM_FORWARD, BlossomSlot, buildBlossomMesh(), makeRng(), makeSakuraMargins(), makeTwigFamily() (+5 more)

### Community 139 - "SakuraStage.tsx"
Cohesion: 0.16
Nodes (8): Quality, ScreenToWorld, StageAnchor, StageElement, StageLights, StagePlacement, StageQuality, StageViewport

### Community 140 - "sakuraBlossomMarks.ts"
Cohesion: 0.18
Nodes (16): BLOSSOM_TINT_BRIGHT, BLOSSOM_TINT_PALE, BLOSSOM_TINT_ROSE, BLOSSOM_TINT_SOFT, buildBudArrays(), makeBlossomMarks(), makeNarrationBlossomMarks(), makeRng() (+8 more)

### Community 142 - "sakuraStage.ts"
Cohesion: 0.21
Nodes (9): CRT_ASSETS, Band, prefersReducedMotion(), SectionHeader(), LenisLike, scrollToSection(), SectionLink(), sectionLinks (+1 more)

### Community 145 - "siteContent.ts"
Cohesion: 0.19
Nodes (6): metadata, metadata, currently, selected, stack, workEntries

### Community 150 - "Brief: the ball's journey and the scoring animation, as real physics"
Cohesion: 0.29
Nodes (6): Acceptance checks (Node audit, no browser), Brief: the ball's journey and the scoring animation, as real physics, Materials, roughly, The five stages to reproduce, The hard constraint: it must be scrubbable, What the sim has to get right that the current version fakes

### Community 151 - "layout.tsx"
Cohesion: 0.20
Nodes (8): displaySerif, inter, metadata, viewport, SiteBackground(), SmoothScroll(), lenis, lenis

### Community 152 - "SubpageShell.tsx"
Cohesion: 0.31
Nodes (6): Template(), SubpageShell(), SubpageShellProps, parkVeil(), TransitionLink(), TransitionLinkProps

### Community 153 - "sakuraTree.ts"
Cohesion: 0.27
Nodes (10): holderStyle, NarrationScene(), StageResizeContext, BLOSSOM_BUDGET, clamp01(), disposeSubtree(), makeNarrationTree(), makeSakuraTree() (+2 more)

### Community 154 - "eslint"
Cohesion: 0.38
Nodes (5): completeFile(), isFile(), OMITTED_EXTENSIONS, resolve(), ROOT

### Community 159 - "HomeSections.tsx"
Cohesion: 0.20
Nodes (6): Line, Narration(), Run, Stanza(), Voice, WorkEntry

### Community 160 - "postcss"
Cohesion: 0.29
Nodes (6): { chromium }, H, LAYERS, QUALITY, require, W

### Community 163 - "@types/node"
Cohesion: 0.23
Nodes (7): metadata, FractureText(), hashed(), ContactStage, HomeSections(), elsewhere, useRevealOnScroll()

### Community 165 - "idxrender.mjs"
Cohesion: 0.14
Nodes (14): CanvasSource, Bird, BirdsOptions, createBirds(), WING, angle, buf, depth (+6 more)

### Community 166 - "LocalTime.tsx"
Cohesion: 0.39
Nodes (7): CLOCK_FORMAT, LocalTime(), nowInToronto(), PLACEHOLDER, prefersReducedMotion(), Time, ZONE_FORMAT

## Knowledge Gaps
- **707 isolated node(s):** `[outPrefix = "shot", fractionsArg = "0", waitArg = "1500"]`, `fractions`, `settleMs`, `t0`, `vhs` (+702 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **41 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `start()` connect `DitherVideo.tsx` to `CanopyOcclusion`, `barShader.ts`, `@types/node`, `mountains.ts`, `idxrender.mjs`, `makeRng`, `asciiTree.ts`, `blossomCloud.ts`, `petalBank.ts`, `TreeTuner.tsx`, `idxview.mjs`, `cam2model.mts`?**
  _High betweenness centrality (0.040) - this node is a cross-community bridge._
- **Why does `ballStatesAt()` connect `fbm2` to `createSakuraBlossomGeometry`?**
  _High betweenness centrality (0.035) - this node is a cross-community bridge._
- **Why does `CanopyOcclusion` connect `createSakuraBlossomGeometry` to `smoothstep`?**
  _High betweenness centrality (0.031) - this node is a cross-community bridge._
- **Are the 4 inferred relationships involving `start()` (e.g. with `.createSpraySprigs()` and `BranchProgress()`) actually correct?**
  _`start()` has 4 INFERRED edges - model-reasoned connections that need verification._
- **What connects `[outPrefix = "shot", fractionsArg = "0", waitArg = "1500"]`, `fractions`, `settleMs` to the rest of the system?**
  _707 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `compilerOptions` be split into smaller, more focused modules?**
  _Cohesion score 0.08695652173913043 - nodes in this community are weakly interconnected._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.13333333333333333 - nodes in this community are weakly interconnected._