# Graph Report - arbor-web  (2026-09-09)

## Corpus Check
- 190 files · ~4,161,222 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1642 nodes · 2503 edges · 153 communities (113 shown, 40 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 36 edges (avg confidence: 0.78)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `eaa3ba7d`
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
- clamp01
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
- fractureIntoPieces
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
- ChunkedThinker
- SubpageShell.tsx
- page.tsx
- page.tsx
- Brief: the ball's journey and the scoring animation, as real physics
- .key
- thinkerFragments.worker.ts

## God Nodes (most connected - your core abstractions)
1. `WeepingCherryGenerator` - 41 edges
2. `lerp()` - 19 edges
3. `WeepingCherryTreeCanvas()` - 19 edges
4. `clamp01()` - 17 edges
5. `compilerOptions` - 16 edges
6. `ballStatesAt()` - 15 edges
7. `buildSimulation()` - 15 edges
8. `validate()` - 14 edges
9. `PetalDrift()` - 14 edges
10. `buildDriftPath()` - 14 edges

## Surprising Connections (you probably didn't know these)
- `makeSakuraBlossomMarks()` --indirect_call--> `px()`  [INFERRED]
  components/sakuraBlossomMarks.ts → .scratch-s54100/idxrender.mjs
- `makeSakuraBlossomMarks()` --indirect_call--> `py()`  [INFERRED]
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

## Communities (153 total, 40 thin omitted)

### Community 0 - "compilerOptions"
Cohesion: 0.05
Nodes (39): autoprefixer, eslint, eslint-config-next, @eslint/eslintrc, devDependencies, autoprefixer, eslint, eslint-config-next (+31 more)

### Community 1 - "package.json"
Cohesion: 0.06
Nodes (30): displaySerif, inter, metadata, SiteBackground(), SmoothScroll(), d3-force, d3-selection, d3-zoom (+22 more)

### Community 2 - "What You Must Do When Invoked"
Cohesion: 0.07
Nodes (28): ./*, dom, dom.iterable, esnext, next-env.d.ts, .next/types/**/*.ts, node_modules, **/*.ts (+20 more)

### Community 3 - "What You Must Do When Invoked"
Cohesion: 0.07
Nodes (26): For /graphify add and --watch, For /graphify query, For the commit hook and native CLAUDE.md integration, For --update and --cluster-only, /graphify, Honesty Rules, Interpreter guard for subcommands, Part A - Structural extraction for code files (+18 more)

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
Cohesion: 0.40
Nodes (9): clamp01(), createBarkTextures(), createFallingPetalGeometry(), getBranchWindVectors(), getLimbWindAmplitude(), getPetalVertexColor(), getWindFlutterRamp(), getWindRamp() (+1 more)

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

### Community 33 - "CanopyOcclusion"
Cohesion: 0.35
Nodes (3): CanopyOcclusion, makeInsideTest(), planReleaseOrder()

### Community 34 - "createSakuraBlossomGeometry"
Cohesion: 0.09
Nodes (23): createRobotCameraState(), CAMERA_AIM_BEHIND_KEYS, CAMERA_AIM_HEIGHT, CAMERA_AZIMUTH, CAMERA_DISTANCE_KEYS, CAMERA_HEIGHT_KEYS, CAMERA_OFFSET_CLOSE, cameraProbe (+15 more)

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

### Community 47 - "clamp01"
Cohesion: 0.40
Nodes (4): Boundaries, Compile-Only Verification, Rule, Workflow

### Community 49 - "polyfills.js"
Cohesion: 0.04
Nodes (38): ab, byColor, chassisInstances, chassisMeshCache, chassisPrims, chassisTris, colorIndex, colorReg (+30 more)

### Community 50 - "smoothstep"
Cohesion: 0.05
Nodes (41): applyPetalTranslucency(), BareThreeCanvasProps, BLOSSOM_CALYX_COLOR, BLOSSOM_CENTER_COLOR, BlossomPlacement, BranchFrame, BranchWindVectors, CanopyLobe (+33 more)

### Community 51 - "TreeTuner.tsx"
Cohesion: 0.06
Nodes (50): BloomCursor(), BurstOptions, clamp01(), COLOURS, EmitFn, gustEnvelope(), Petal, petalOutline() (+42 more)

### Community 53 - "Preserve Typography"
Cohesion: 0.40
Nodes (4): Hard Rule, Preserve Typography, Verification, Workflow

### Community 54 - "thinkerFragments.ts"
Cohesion: 0.07
Nodes (35): ACCESSOR_ITEM_SIZE, AccessorValues, BreakPhase, CapBuildStats, CapLoop, CapNode, CellBuild, COMPONENT_BYTE_SIZE (+27 more)

### Community 55 - "loadThinkerGeometry"
Cohesion: 0.04
Nodes (38): blob, chassisDraws, chassisIdx, chassisMesh, chassisPos, drawCount, F2G, f3d (+30 more)

### Community 56 - "CanopyLobe"
Cohesion: 0.09
Nodes (32): assembleRig(), BallPhysicsModule, BallState, buildPlaceholderBall(), buildPlaceholderBallPhysics(), buildPlaceholderDriftPath(), buildPlaceholderGoal(), buildPlaceholderRobot() (+24 more)

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
Nodes (13): HERO_POSE, HeroIntro(), HeroIntroProps, LOADING_POSE, narrationDrift(), Line, Narration(), Run (+5 more)

### Community 65 - "scopeLocalMesh"
Cohesion: 0.19
Nodes (21): bakePrimitives(), ball, budgetedMesh(), budgetLoop(), buildBall(), buildGoal(), collectInstances(), compact() (+13 more)

### Community 72 - "carveCell"
Cohesion: 0.29
Nodes (11): boundingPlanes(), carveCell(), cleanLoop(), clipToHalfSpace(), cutPolygons(), getPlaneBasis(), idOf(), sectionOf() (+3 more)

### Community 73 - "buildSolidThinkerChunks"
Cohesion: 0.33
Nodes (9): buildSolidThinkerChunks(), hash01(), makeFlatArrays(), planSeeds(), randomUnitVector(), sampleGradedSeeds(), signedHash(), sizeFieldAt() (+1 more)

### Community 74 - "fractureIntoPieces"
Cohesion: 0.33
Nodes (7): componentKey(), countOpenGeometryEdges(), fractureIntoPieces(), makePiece(), makeSourcePiece(), polygonArea(), splitConnectedComponents()

### Community 75 - "fbm2"
Cohesion: 0.20
Nodes (6): box, center, PUB, size, tris3d, v

### Community 76 - "createSakuraBlossomGeometry"
Cohesion: 0.17
Nodes (10): applyBlossomWind(), Branch, createPetalDetailTexture(), createSakuraBlossomGeometry(), createSakuraBudGeometry(), getBranchFrame(), lerp(), makeRng() (+2 more)

### Community 77 - "budgetedMesh"
Cohesion: 0.50
Nodes (4): budgetedMesh(), budgetLoop(), compact(), simplify()

### Community 78 - "Branch"
Cohesion: 0.06
Nodes (54): args, carried(), finalPose, FPS, frames, HERE, inTrough, maxSteps (+46 more)

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
Cohesion: 0.16
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
Nodes (70): sampleBoughSpawn(), Bloom, BLOSSOM_CENTER, Branch, BranchRule(), BranchRuleProps, buildBranch(), easeOut() (+62 more)

### Community 123 - "cam2model.mts"
Cohesion: 0.15
Nodes (9): makeContactTree(), args, band(), body, f, hi, lo, rows (+1 more)

### Community 124 - "camsmooth.mts"
Cohesion: 0.23
Nodes (11): AIMY, anchor(), at(), AZ, BEHIND, DIST, f, keyed() (+3 more)

### Community 125 - "idxrender.mjs"
Cohesion: 0.20
Nodes (9): angle, buf, depth, H, img, names, px(), py() (+1 more)

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
Cohesion: 0.18
Nodes (16): resolveSceneQuality(), anchorProgress(), AnchorRecord, createPlacement(), disposeObject(), KEY_LIGHT_POSITION, LenisLike, RIM_LIGHT_POSITION (+8 more)

### Community 140 - "sakuraBlossomMarks.ts"
Cohesion: 0.21
Nodes (14): BLOSSOM_TINT_BRIGHT, BLOSSOM_TINT_PALE, BLOSSOM_TINT_ROSE, BLOSSOM_TINT_SOFT, buildBudArrays(), makeRng(), makeSakuraBlossomMarks(), Mark (+6 more)

### Community 141 - "thinkerChunks.ts"
Cohesion: 0.18
Nodes (12): buildInWorker(), buildOnMainThread(), CAMERA_OFFSET, FIGURE_MIN, FIGURE_SIZE, FLIGHT_DRIFT_VIEW, flightDirectionInFigureSpace(), inFigureSpace() (+4 more)

### Community 142 - "sakuraStage.ts"
Cohesion: 0.18
Nodes (8): Quality, ScreenToWorld, StageElement, StageElementFactory, StageLights, StagePlacement, StageQuality, StageViewport

### Community 143 - ".append"
Cohesion: 0.33
Nodes (3): applyBranchWind(), BranchGeometryBuilder, OccupiedPoint

### Community 144 - "HomeSections.tsx"
Cohesion: 0.21
Nodes (7): FractureText(), hashed(), HomeSections(), LenisLike, LocalTime(), nowInToronto(), PlateContent

### Community 145 - "siteContent.ts"
Cohesion: 0.20
Nodes (7): metadata, LenisLike, currently, HERO_NARRATION, sectionLinks, workEntries, WorkEntry

### Community 146 - "ChunkedThinker"
Cohesion: 0.35
Nodes (11): makeChunkGeometries(), breakupAt(), CameraRig(), ChunkedThinker(), keyed(), smoothPhase(), StageFloor(), StageLights() (+3 more)

### Community 147 - "SubpageShell.tsx"
Cohesion: 0.24
Nodes (6): metadata, elsewhere, SubpageShell(), SubpageShellProps, TransitionLink(), TransitionLinkProps

### Community 148 - "page.tsx"
Cohesion: 0.29
Nodes (4): CRT_ASSETS, LenisLike, SectionLink(), socialLinks

### Community 149 - "page.tsx"
Cohesion: 0.29
Nodes (3): metadata, selected, stack

### Community 150 - "Brief: the ball's journey and the scoring animation, as real physics"
Cohesion: 0.29
Nodes (6): Acceptance checks (Node audit, no browser), Brief: the ball's journey and the scoring animation, as real physics, Materials, roughly, The five stages to reproduce, The hard constraint: it must be scrubbable, What the sim has to get right that the current version fakes

### Community 152 - "thinkerFragments.worker.ts"
Cohesion: 0.40
Nodes (4): BuildSolidChunkOptions, chunkTransferables(), scope, WorkerScope

## Knowledge Gaps
- **733 isolated node(s):** `[outPrefix = "shot", fractionsArg = "0", waitArg = "1500"]`, `fractions`, `settleMs`, `t0`, `vhs` (+728 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **40 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `SmoothScroll()` connect `package.json` to `.update`?**
  _High betweenness centrality (0.049) - this node is a cross-community bridge._
- **Why does `dependencies` connect `package.json` to `compilerOptions`?**
  _High betweenness centrality (0.043) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `WeepingCherryTreeCanvas()` (e.g. with `.key()` and `w()`) actually correct?**
  _`WeepingCherryTreeCanvas()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `[outPrefix = "shot", fractionsArg = "0", waitArg = "1500"]`, `fractions`, `settleMs` to the rest of the system?**
  _733 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `compilerOptions` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.062388591800356503 - nodes in this community are weakly interconnected._
- **Should `What You Must Do When Invoked` be split into smaller, more focused modules?**
  _Cohesion score 0.06896551724137931 - nodes in this community are weakly interconnected._