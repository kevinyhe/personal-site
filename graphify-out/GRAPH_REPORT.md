# Graph Report - arbor-web  (2026-09-11)

## Corpus Check
- 206 files · ~4,191,986 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1819 nodes · 2796 edges · 165 communities (122 shown, 43 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 39 edges (avg confidence: 0.77)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `a4e01a65`
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
- SpatialHash
- Preserve Typography
- thinkerFragments.ts
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
- carveCell
- buildSolidThinkerChunks
- scripts
- fbm2
- createSakuraBlossomGeometry
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
- audit.mts
- impact.mts
- TreeTuner.tsx
- queue.mjs
- flight.mts
- Branch
- centre.mjs
- alias.mjs
- scopeLocalMesh
- hop.mjs
- usweep.mjs
- sweep.mts
- groupCapRegions
- Branch
- smooth.mjs
- cost.mts
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
- eslint
- Branch
- SakuraStage.tsx
- sakuraBlossomMarks.ts
- thinkerChunks.ts
- sakuraStage.ts
- .append
- HomeSections.tsx
- siteContent.ts
- bake-chunks.mjs
- SubpageShell.tsx
- page.tsx
- page.tsx
- Brief: the ball's journey and the scoring animation, as real physics
- layout.tsx
- thinkerFragments.worker.ts
- sakuraTree.ts
- eslint
- fractureIntoPieces
- branchRadius
- check
- gradientAt
- .key
- postcss
- Narration.tsx
- package.json
- @types/node
- @dimforge/rapier3d-compat

## God Nodes (most connected - your core abstractions)
1. `WeepingCherryGenerator` - 42 edges
2. `lerp()` - 19 edges
3. `WeepingCherryTreeCanvas()` - 19 edges
4. `clamp01()` - 17 edges
5. `PetalDrift()` - 17 edges
6. `compilerOptions` - 16 edges
7. `ChunkedFigure()` - 15 edges
8. `ballStatesAt()` - 15 edges
9. `buildSimulation()` - 15 edges
10. `validate()` - 14 edges

## Surprising Connections (you probably didn't know these)
- `makeBlossomMarks()` --indirect_call--> `px()`  [INFERRED]
  components/sakuraBlossomMarks.ts → .scratch-s54100/idxrender.mjs
- `makeBlossomMarks()` --indirect_call--> `py()`  [INFERRED]
  components/sakuraBlossomMarks.ts → .scratch-s54100/idxrender.mjs
- `ballStatesAt()` --indirect_call--> `carried()`  [INFERRED]
  components/ballPhysics.ts → scripts/bake-balls.mjs
- `PetalReveal()` --indirect_call--> `draw()`  [INFERRED]
  components/PetalReveal.tsx → .scratch-s54100/idxview.mjs
- `WeepingCherryTreeCanvas()` --indirect_call--> `w()`  [INFERRED]
  components/BareThreeCanvas.tsx → .scratch-s54100/probe.mjs

## Import Cycles
- 1-file cycle: `components/SakuraStage.tsx -> components/SakuraStage.tsx`
- 1-file cycle: `components/PetalDrift.tsx -> components/PetalDrift.tsx`

## Communities (165 total, 43 thin omitted)

### Community 0 - "compilerOptions"
Cohesion: 0.09
Nodes (23): autoprefixer, eslint, eslint-config-next, @eslint/eslintrc, devDependencies, autoprefixer, eslint, eslint-config-next (+15 more)

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
Cohesion: 0.24
Nodes (4): Branch, getBranchFrame(), lerp(), sampleBlossomTint()

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

### Community 9 - "clamp01"
Cohesion: 0.25
Nodes (15): makeChunkGeometries(), breakupAt(), CameraRig(), ChunkedFigure(), figureAt(), keyed(), smoothPhase(), StageFloor() (+7 more)

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
Cohesion: 0.39
Nodes (3): FallingPetalSystem, randomPointInUnitSphere(), wrapAngle()

### Community 33 - "CanopyOcclusion"
Cohesion: 0.33
Nodes (3): CanopyOcclusion, groupCapRegions(), pointInLoop()

### Community 34 - "createSakuraBlossomGeometry"
Cohesion: 0.07
Nodes (31): createRobotCameraState(), DRIFT_FINISH, RobotCameraState, CAMERA_AIM_BEHIND_KEYS, CAMERA_AIM_HEIGHT, CAMERA_AZIMUTH, CAMERA_DISTANCE_KEYS, CAMERA_HEIGHT_KEYS (+23 more)

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
Cohesion: 0.14
Nodes (17): ThinkerChunkData, clamp01(), createPetalGeometry(), createPetalMaterial(), makeRng(), paintPetals(), PETAL, PETAL_BASE (+9 more)

### Community 47 - "clamp01"
Cohesion: 0.40
Nodes (4): Boundaries, Compile-Only Verification, Rule, Workflow

### Community 48 - "not-found.tsx"
Cohesion: 0.39
Nodes (7): CLOCK_FORMAT, LocalTime(), nowInToronto(), PLACEHOLDER, prefersReducedMotion(), Time, ZONE_FORMAT

### Community 49 - "polyfills.js"
Cohesion: 0.04
Nodes (38): ab, byColor, chassisInstances, chassisMeshCache, chassisPrims, chassisTris, colorIndex, colorReg (+30 more)

### Community 50 - "smoothstep"
Cohesion: 0.06
Nodes (40): arborGustEnvelope(), BareThreeCanvasProps, BLOSSOM_CALYX_COLOR, BLOSSOM_CENTER_COLOR, BlossomPlacement, BranchFrame, BranchWindVectors, CanopyLobe (+32 more)

### Community 51 - "TreeTuner.tsx"
Cohesion: 0.06
Nodes (52): BloomCursor(), BurstOptions, clamp01(), COLOURS, EmitFn, gustEnvelope(), Petal, petalOutline() (+44 more)

### Community 53 - "Preserve Typography"
Cohesion: 0.40
Nodes (4): Hard Rule, Preserve Typography, Verification, Workflow

### Community 54 - "thinkerFragments.ts"
Cohesion: 0.07
Nodes (35): ACCESSOR_ITEM_SIZE, AccessorValues, BreakPhase, BuildSolidChunkOptions, CapBuildStats, CapLoop, CapNode, CellBuild (+27 more)

### Community 55 - "loadThinkerGeometry"
Cohesion: 0.04
Nodes (38): blob, chassisDraws, chassisIdx, chassisMesh, chassisPos, drawCount, F2G, f3d (+30 more)

### Community 56 - "CanopyLobe"
Cohesion: 0.09
Nodes (31): assembleRig(), BallPhysicsModule, BallState, buildPlaceholderBall(), buildPlaceholderBallPhysics(), buildPlaceholderDriftPath(), buildPlaceholderGoal(), buildPlaceholderRobot() (+23 more)

### Community 57 - "fbm2"
Cohesion: 0.07
Nodes (57): arcLengths(), ballAt(), ballCount(), BallPlan, ballPlans(), ballSpin(), BallState, ballStatesAt() (+49 more)

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
Cohesion: 0.17
Nodes (13): boxPlanOf(), clampStart(), HERO_POSE, HeroIntro(), HeroIntroProps, LOADING_POSE, loadThinkerStage(), narrationDrift() (+5 more)

### Community 65 - "scopeLocalMesh"
Cohesion: 0.19
Nodes (21): bakePrimitives(), ball, budgetedMesh(), budgetLoop(), buildBall(), buildGoal(), collectInstances(), compact() (+13 more)

### Community 72 - "carveCell"
Cohesion: 0.26
Nodes (12): boundingPlanes(), carveCell(), cleanLoop(), clipToHalfSpace(), cutPolygons(), getPlaneBasis(), idOf(), makeCapPolygons() (+4 more)

### Community 73 - "buildSolidThinkerChunks"
Cohesion: 0.24
Nodes (12): buildOnMainThread(), buildSolidThinkerChunks(), hash01(), makeFlatArrays(), makeInsideTest(), planReleaseOrder(), planSeeds(), randomUnitVector() (+4 more)

### Community 74 - "scripts"
Cohesion: 0.20
Nodes (10): scripts, bake:balls, bake:bg, bake:cherry, bake:chunks, build, dev, lint (+2 more)

### Community 75 - "fbm2"
Cohesion: 0.20
Nodes (6): box, center, PUB, size, tris3d, v

### Community 76 - "createSakuraBlossomGeometry"
Cohesion: 0.16
Nodes (4): applyBlossomWind(), applyPetalTranslucency(), OccupiedPoint, WeepingCherryGenerator

### Community 77 - "budgetedMesh"
Cohesion: 0.50
Nodes (4): budgetedMesh(), budgetLoop(), compact(), simplify()

### Community 78 - "Branch"
Cohesion: 0.06
Nodes (55): worldToModel(), args, carried(), finalPose, FPS, frames, HERE, inTrough (+47 more)

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

### Community 98 - "audit.mts"
Cohesion: 0.13
Nodes (11): build, index, moments, origin, per, PUBLIC, rawPos, rows (+3 more)

### Community 99 - "impact.mts"
Cohesion: 0.17
Nodes (9): basePts, centroid, idx, mix, pos, PUBLIC, size, stage (+1 more)

### Community 100 - "TreeTuner.tsx"
Cohesion: 0.15
Nodes (18): BranchWindUniforms, boughSpawn, BoughSpawnField, BLOSSOM_ATTRIBUTES, BLOSSOM_BUDGET, BOUGH_AIM, BRANCH_ATTRIBUTES, BranchRange (+10 more)

### Community 101 - "queue.mjs"
Cohesion: 0.29
Nodes (6): end, f1, f2, fin, finish, n

### Community 102 - "flight.mts"
Cohesion: 0.33
Nodes (4): OLD_CAM, OLD_DRIFT, oldDir, oldSum

### Community 103 - "Branch"
Cohesion: 0.40
Nodes (3): bend, f, rs

### Community 106 - "scopeLocalMesh"
Cohesion: 0.67
Nodes (3): dropDegenerate(), scopeLocalMesh(), weld()

### Community 112 - "groupCapRegions"
Cohesion: 0.29
Nodes (6): bx, f, GOAL_MOUTH, inward, rear, tip

### Community 113 - "Branch"
Cohesion: 0.40
Nodes (4): b, h, PUBLIC, t

### Community 119 - "cost.mts"
Cohesion: 0.05
Nodes (71): sampleBoughSpawn(), Bloom, BLOSSOM_CENTER, Branch, BranchRule(), BranchRuleProps, buildBranch(), easeOut() (+63 more)

### Community 123 - "cam2model.mts"
Cohesion: 0.15
Nodes (9): makeContactTree(), args, band(), body, f, hi, lo, rows (+1 more)

### Community 124 - "camsmooth.mts"
Cohesion: 0.23
Nodes (11): AIMY, anchor(), at(), AZ, BEHIND, DIST, f, keyed() (+3 more)

### Community 125 - "idxrender.mjs"
Cohesion: 0.15
Nodes (19): resolveSceneQuality(), AnchorRecord, claimDraw(), createPlacement(), disposeObject(), drawArbiter, KEY_LIGHT_POSITION, LenisLike (+11 more)

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
Cohesion: 0.13
Nodes (18): clamp01(), getBranchWindVectors(), getLimbWindAmplitude(), getTwigWindAmplitude(), getTwigWindFlutter(), getWindFlutterRamp(), getWindRamp(), BLOSSOM_FORWARD (+10 more)

### Community 139 - "SakuraStage.tsx"
Cohesion: 0.18
Nodes (8): Quality, ScreenToWorld, StageElement, StageElementFactory, StageLights, StagePlacement, StageQuality, StageViewport

### Community 140 - "sakuraBlossomMarks.ts"
Cohesion: 0.16
Nodes (17): BLOSSOM_TINT_BRIGHT, BLOSSOM_TINT_PALE, BLOSSOM_TINT_ROSE, BLOSSOM_TINT_SOFT, buildBudArrays(), makeBlossomMarks(), makeRng(), makeSakuraBlossomMarks() (+9 more)

### Community 141 - "thinkerChunks.ts"
Cohesion: 0.10
Nodes (25): CHERRY_CHUNK_OPTIONS, loadCherryChunks(), BakedChunkRecord, BakedChunksHeader, buildInWorker(), CAMERA_OFFSET, CAMERA_OFFSET_CLOSE, ChunkBuildError (+17 more)

### Community 142 - "sakuraStage.ts"
Cohesion: 0.27
Nodes (7): Template(), SubpageShell(), SubpageShellProps, parkVeil(), TransitionLink(), TransitionLinkProps, useRevealOnScroll()

### Community 143 - ".append"
Cohesion: 0.33
Nodes (3): applyBranchWind(), BranchGeometryBuilder, createSakuraBudGeometry()

### Community 144 - "HomeSections.tsx"
Cohesion: 0.15
Nodes (8): SectionStage, WorkPlate, Line, Narration(), Run, Stanza(), Voice, PlateContent

### Community 145 - "siteContent.ts"
Cohesion: 0.19
Nodes (10): CRT_ASSETS, HomeSections(), Band, prefersReducedMotion(), SectionHeader(), LenisLike, scrollToSection(), SectionLink() (+2 more)

### Community 147 - "SubpageShell.tsx"
Cohesion: 0.20
Nodes (9): angle, buf, depth, H, img, names, px(), py() (+1 more)

### Community 148 - "page.tsx"
Cohesion: 0.38
Nodes (4): metadata, FractureText(), hashed(), elsewhere

### Community 149 - "page.tsx"
Cohesion: 0.03
Nodes (59): args, bbox, bboxMax, bboxMin, bin, binPath, byDepth, CELL (+51 more)

### Community 150 - "Brief: the ball's journey and the scoring animation, as real physics"
Cohesion: 0.29
Nodes (6): Acceptance checks (Node audit, no browser), Brief: the ball's journey and the scoring animation, as real physics, Materials, roughly, The five stages to reproduce, The hard constraint: it must be scrubbable, What the sim has to get right that the current version fakes

### Community 151 - "layout.tsx"
Cohesion: 0.20
Nodes (8): displaySerif, inter, metadata, viewport, SiteBackground(), SmoothScroll(), lenis, lenis

### Community 152 - "thinkerFragments.worker.ts"
Cohesion: 0.16
Nodes (8): metadata, metadata, currently, HERO_NARRATION, selected, stack, workEntries, WorkEntry

### Community 153 - "sakuraTree.ts"
Cohesion: 0.26
Nodes (11): holderStyle, NarrationScene(), makeNarrationBlossomMarks(), StageResizeContext, BLOSSOM_BUDGET, clamp01(), disposeSubtree(), makeNarrationTree() (+3 more)

### Community 154 - "eslint"
Cohesion: 0.38
Nodes (5): completeFile(), isFile(), OMITTED_EXTENSIONS, resolve(), ROOT

### Community 155 - "fractureIntoPieces"
Cohesion: 0.24
Nodes (9): BranchSamples, filterBlossoms(), componentKey(), countOpenGeometryEdges(), fractureIntoPieces(), makePiece(), makeSourcePiece(), polygonArea() (+1 more)

### Community 156 - "branchRadius"
Cohesion: 1.00
Nodes (3): branchRadius(), clamp01(), smoothstep()

### Community 159 - ".key"
Cohesion: 0.20
Nodes (9): dampSpring(), disposeMaterialTextures(), easeOutCubic(), homographyAdj(), homographyBasis(), homographyMul(), WeepingCherryTreeCanvas(), f (+1 more)

### Community 160 - "postcss"
Cohesion: 0.29
Nodes (6): { chromium }, H, LAYERS, QUALITY, require, W

### Community 161 - "Narration.tsx"
Cohesion: 0.83
Nodes (3): makeInteriorMaterial(), makeSurfaceMaterial(), useMarbleMaterials()

### Community 162 - "package.json"
Cohesion: 0.50
Nodes (3): name, private, version

## Knowledge Gaps
- **835 isolated node(s):** `[outPrefix = "shot", fractionsArg = "0", waitArg = "1500"]`, `fractions`, `settleMs`, `t0`, `vhs` (+830 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **43 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `ballStatesAt()` connect `fbm2` to `CanopyOcclusion`, `Branch`?**
  _High betweenness centrality (0.024) - this node is a cross-community bridge._
- **Why does `carried()` connect `Branch` to `fbm2`?**
  _High betweenness centrality (0.017) - this node is a cross-community bridge._
- **Why does `CanopyOcclusion` connect `CanopyOcclusion` to `smoothstep`?**
  _High betweenness centrality (0.016) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `WeepingCherryTreeCanvas()` (e.g. with `.key()` and `w()`) actually correct?**
  _`WeepingCherryTreeCanvas()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `[outPrefix = "shot", fractionsArg = "0", waitArg = "1500"]`, `fractions`, `settleMs` to the rest of the system?**
  _835 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `compilerOptions` be split into smaller, more focused modules?**
  _Cohesion score 0.08695652173913043 - nodes in this community are weakly interconnected._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.13333333333333333 - nodes in this community are weakly interconnected._