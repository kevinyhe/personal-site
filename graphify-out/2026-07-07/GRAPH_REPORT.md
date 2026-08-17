# Graph Report - landing  (2026-07-07)

## Corpus Check
- 71 files · ~559,294 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 755 nodes · 1100 edges · 63 communities (42 shown, 21 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 3 edges (avg confidence: 0.5)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `66236dde`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_compilerOptions|compilerOptions]]
- [[_COMMUNITY_package.json|package.json]]
- [[_COMMUNITY_What You Must Do When Invoked|What You Must Do When Invoked]]
- [[_COMMUNITY_What You Must Do When Invoked|What You Must Do When Invoked]]
- [[_COMMUNITY_What You Must Do When Invoked|What You Must Do When Invoked]]
- [[_COMMUNITY_VersionBranchSystem|VersionBranchSystem]]
- [[_COMMUNITY_devDependencies|devDependencies]]
- [[_COMMUNITY_graphify|/graphify]]
- [[_COMMUNITY_graphify reference extra exports and benchmark|graphify reference: extra exports and benchmark]]
- [[_COMMUNITY_graphify reference extra exports and benchmark|graphify reference: extra exports and benchmark]]
- [[_COMMUNITY_graphify reference query, path, explain|graphify reference: query, path, explain]]
- [[_COMMUNITY_graphify reference query, path, explain|graphify reference: query, path, explain]]
- [[_COMMUNITY_eslint.config.mjs|eslint.config.mjs]]
- [[_COMMUNITY_graphify reference add a URL and watch a folder|graphify reference: add a URL and watch a folder]]
- [[_COMMUNITY_graphify reference commit hook and native CLAUDE.md integration|graphify reference: commit hook and native CLAUDE.md integration]]
- [[_COMMUNITY_graphify reference incremental update and cluster-only|graphify reference: incremental update and cluster-only]]
- [[_COMMUNITY_graphify reference add a URL and watch a folder|graphify reference: add a URL and watch a folder]]
- [[_COMMUNITY_graphify reference commit hook and native CLAUDE.md integration|graphify reference: commit hook and native CLAUDE.md integration]]
- [[_COMMUNITY_graphify reference incremental update and cluster-only|graphify reference: incremental update and cluster-only]]
- [[_COMMUNITY_layout.tsx|layout.tsx]]
- [[_COMMUNITY_graphify reference GitHub clone and cross-repo merge|graphify reference: GitHub clone and cross-repo merge]]
- [[_COMMUNITY_graphify reference transcribe video and audio|graphify reference: transcribe video and audio]]
- [[_COMMUNITY_graphify reference GitHub clone and cross-repo merge|graphify reference: GitHub clone and cross-repo merge]]
- [[_COMMUNITY_graphify reference transcribe video and audio|graphify reference: transcribe video and audio]]
- [[_COMMUNITY_AGENTS|AGENTS.md]]
- [[_COMMUNITY_CLAUDE|CLAUDE.md]]
- [[_COMMUNITY_CLAUDE|CLAUDE.md]]
- [[_COMMUNITY_extraction-spec|extraction-spec.md]]
- [[_COMMUNITY_page.tsx|page.tsx]]
- [[_COMMUNITY_next.config.ts|next.config.ts]]
- [[_COMMUNITY_postcss.config.mjs|postcss.config.mjs]]
- [[_COMMUNITY_tailwind.config.ts|tailwind.config.ts]]
- [[_COMMUNITY_ReasoningTreeSection.tsx|ReasoningTreeSection.tsx]]
- [[_COMMUNITY_HexagonLogoOverlay.tsx|HexagonLogoOverlay.tsx]]
- [[_COMMUNITY_compress.py|compress.py]]
- [[_COMMUNITY_validate.py|validate.py]]
- [[_COMMUNITY_README|README.md]]
- [[_COMMUNITY_SKILL|SKILL.md]]
- [[_COMMUNITY_Caveman Help|Caveman Help]]
- [[_COMMUNITY_Caveman Compress|Caveman Compress]]
- [[_COMMUNITY_SKILL|SKILL.md]]
- [[_COMMUNITY_caveman-commit|caveman-commit]]
- [[_COMMUNITY_caveman-review|caveman-review]]
- [[_COMMUNITY_caveman-stats|caveman-stats]]
- [[_COMMUNITY___init__.py|__init__.py]]
- [[_COMMUNITY_CloudToWhiteTransition.tsx|CloudToWhiteTransition.tsx]]
- [[_COMMUNITY_clamp01|clamp01]]
- [[_COMMUNITY_DangerTextEffect.ts|DangerTextEffect.ts]]
- [[_COMMUNITY_smoothstep|smoothstep]]
- [[_COMMUNITY_clamp01|clamp01]]
- [[_COMMUNITY_Preserve Typography|Preserve Typography]]
- [[_COMMUNITY_createBarkTextures|createBarkTextures]]
- [[_COMMUNITY_.constructor|.constructor]]
- [[_COMMUNITY_MiniGlAttribute|MiniGlAttribute]]
- [[_COMMUNITY_MiniGlMaterial|MiniGlMaterial]]
- [[_COMMUNITY_.resize|.resize]]
- [[_COMMUNITY_MiniGlUniform|MiniGlUniform]]
- [[_COMMUNITY_.initGradient|.initGradient]]
- [[_COMMUNITY_Gradient|Gradient]]
- [[_COMMUNITY_FallingPetalSystem|FallingPetalSystem]]
- [[_COMMUNITY_gradient.d.ts|gradient.d.ts]]

## God Nodes (most connected - your core abstractions)
1. `WeepingCherryGenerator` - 44 edges
2. `lerp()` - 24 edges
3. `clamp01()` - 19 edges
4. `Gradient` - 19 edges
5. `compilerOptions` - 16 edges
6. `validate()` - 14 edges
7. `Gradient` - 14 edges
8. `VersionBranchSystem` - 14 edges
9. `compress_file()` - 12 edges
10. `smoothstep()` - 12 edges

## Surprising Connections (you probably didn't know these)
- `compress_file()` --calls--> `validate()`  [EXTRACTED]
  .agents/skills/caveman-compress/scripts/compress.py → .agents/skills/caveman-compress/scripts/validate.py
- `benchmark_pair()` --calls--> `validate()`  [EXTRACTED]
  .agents/skills/caveman-compress/scripts/benchmark.py → .agents/skills/caveman-compress/scripts/validate.py
- `main()` --calls--> `backup_dir_for()`  [EXTRACTED]
  .agents/skills/caveman-compress/scripts/cli.py → .agents/skills/caveman-compress/scripts/compress.py
- `main()` --calls--> `compress_file()`  [EXTRACTED]
  .agents/skills/caveman-compress/scripts/cli.py → .agents/skills/caveman-compress/scripts/compress.py
- `main()` --calls--> `detect_file_type()`  [EXTRACTED]
  .agents/skills/caveman-compress/scripts/cli.py → .agents/skills/caveman-compress/scripts/detect.py

## Import Cycles
- None detected.

## Communities (63 total, 21 thin omitted)

### Community 0 - "compilerOptions"
Cohesion: 0.10
Nodes (19): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+11 more)

### Community 1 - "package.json"
Cohesion: 0.06
Nodes (35): dependencies, d3-force, d3-selection, d3-zoom, gsap, lenis, next, react (+27 more)

### Community 2 - "What You Must Do When Invoked"
Cohesion: 0.07
Nodes (26): For /graphify add and --watch, For /graphify query, For the commit hook and native CLAUDE.md integration, For --update and --cluster-only, /graphify, Honesty Rules, Interpreter guard for subcommands, Part A - Structural extraction for code files (+18 more)

### Community 3 - "What You Must Do When Invoked"
Cohesion: 0.08
Nodes (24): For /graphify add and --watch, For /graphify query, For the commit hook and native CLAUDE.md integration, For --update and --cluster-only, /graphify, Honesty Rules, Interpreter guard for subcommands, Part A - Structural extraction for code files (+16 more)

### Community 4 - "What You Must Do When Invoked"
Cohesion: 0.10
Nodes (7): applyBlossomWind(), Branch, createSakuraBlossomGeometry(), getBranchWindStrength(), lerp(), SpatialHash, WeepingCherryGenerator

### Community 5 - "VersionBranchSystem"
Cohesion: 0.24
Nodes (7): applyVersionBlossomReveal(), applyVersionBranchReveal(), getBranchFrame(), getWindRamp(), UP, VersionBranchSystem, VersionEvent

### Community 6 - "devDependencies"
Cohesion: 0.12
Nodes (16): ArrayUniformValue, AttributeConfig, CloudTransitionDetail, cssHexToColor(), FALLBACK_COLORS, GradientOptions, normalizeColor(), normalizeCssHex() (+8 more)

### Community 7 - "/graphify"
Cohesion: 0.22
Nodes (8): graphify reference: extra exports and benchmark, Step 6b - Wiki (only if --wiki flag), Step 7 - Neo4j export (only if --neo4j or --neo4j-push flag), Step 7a - FalkorDB export (only if --falkordb or --falkordb-push flag), Step 7b - SVG export (only if --svg flag), Step 7c - GraphML export (only if --graphml flag), Step 7d - MCP server (only if --mcp flag), Step 8 - Token reduction benchmark (only if total_words > 5000)

### Community 8 - "graphify reference: extra exports and benchmark"
Cohesion: 0.22
Nodes (8): graphify reference: extra exports and benchmark, Step 6b - Wiki (only if --wiki flag), Step 7 - Neo4j export (only if --neo4j or --neo4j-push flag), Step 7a - FalkorDB export (only if --falkordb or --falkordb-push flag), Step 7b - SVG export (only if --svg flag), Step 7c - GraphML export (only if --graphml flag), Step 7d - MCP server (only if --mcp flag), Step 8 - Token reduction benchmark (only if total_words > 5000)

### Community 9 - "graphify reference: extra exports and benchmark"
Cohesion: 0.33
Nodes (5): For /graphify explain, For /graphify path, graphify reference: query, path, explain, Step 0 — Constrained query expansion (REQUIRED before traversal), Step 1 — Traversal

### Community 10 - "graphify reference: query, path, explain"
Cohesion: 0.33
Nodes (5): For /graphify explain, For /graphify path, graphify reference: query, path, explain, Step 0 — Constrained query expansion (REQUIRED before traversal), Step 1 — Traversal

### Community 11 - "graphify reference: query, path, explain"
Cohesion: 0.50
Nodes (3): For /graphify add, For --watch, graphify reference: add a URL and watch a folder

### Community 12 - "eslint.config.mjs"
Cohesion: 0.40
Nodes (4): compat, __dirname, eslintConfig, __filename

### Community 13 - "graphify reference: add a URL and watch a folder"
Cohesion: 0.50
Nodes (3): For git commit hook, For native CLAUDE.md integration, graphify reference: commit hook and native CLAUDE.md integration

### Community 14 - "graphify reference: commit hook and native CLAUDE.md integration"
Cohesion: 0.50
Nodes (3): For --cluster-only, For --update (incremental re-extraction), graphify reference: incremental update and cluster-only

### Community 15 - "graphify reference: incremental update and cluster-only"
Cohesion: 0.50
Nodes (3): For /graphify add, For --watch, graphify reference: add a URL and watch a folder

### Community 16 - "graphify reference: add a URL and watch a folder"
Cohesion: 0.50
Nodes (3): For git commit hook, For native CLAUDE.md integration, graphify reference: commit hook and native CLAUDE.md integration

### Community 17 - "graphify reference: commit hook and native CLAUDE.md integration"
Cohesion: 0.50
Nodes (3): For --cluster-only, For --update (incremental re-extraction), graphify reference: incremental update and cluster-only

### Community 19 - "layout.tsx"
Cohesion: 0.40
Nodes (3): instrumentSans, instrumentSerif, metadata

### Community 28 - "page.tsx"
Cohesion: 0.07
Nodes (15): benchmarkRows, navLinks, pricingPlans, WeepingCherryTreeCanvas(), HeroIntroProps, clamp01(), dispatchVersionProgress(), OutgoingSlide (+7 more)

### Community 33 - "ReasoningTreeSection.tsx"
Cohesion: 0.09
Nodes (24): BlossomTransitionDetail, clamp01(), cloneEdges(), cloneNodes(), edgeKey(), getNodeId(), getVisibleGraph(), GraphEdge (+16 more)

### Community 34 - "HexagonLogoOverlay.tsx"
Cohesion: 0.06
Nodes (32): BareThreeCanvasProps, BLOSSOM_FOLLOW_CAMERA_POSITION, BlossomCluster, BlossomSupportIndex, BlossomSupportSample, BlossomSurfaceBranch, BranchFrame, BranchWindUniforms (+24 more)

### Community 35 - "compress.py"
Cohesion: 0.12
Nodes (27): main(), print_usage(), backup_dir_for(), build_compress_prompt(), build_fix_prompt(), call_claude(), compress_file(), is_sensitive_path() (+19 more)

### Community 36 - "validate.py"
Cohesion: 0.16
Nodes (22): benchmark_pair(), count_tokens(), main(), print_table(), Path, count_bullets(), extract_code_blocks(), extract_headings() (+14 more)

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

### Community 46 - "CloudToWhiteTransition.tsx"
Cohesion: 0.08
Nodes (23): clamp01(), CLOUD_LAYERS, CloudBounds, CloudInstance, CloudLayerConfig, CloudToWhiteTransition(), CloudToWhiteTransitionProps, easeInOutCubic() (+15 more)

### Community 47 - "clamp01"
Cohesion: 0.40
Nodes (4): Boundaries, Compile-Only Verification, Rule, Workflow

### Community 49 - "DangerTextEffect.ts"
Cohesion: 0.09
Nodes (20): canUseWebGL(), collectText(), colorToVector(), DangerTextEffect, DangerTextEffectInstance, DangerTextTarget, DEFAULT_OPTIONS, EffectPadding (+12 more)

### Community 50 - "smoothstep"
Cohesion: 0.21
Nodes (19): createFallenPetals(), createGround(), createMossBladeGeometry(), createMossCardAlphaTexture(), createMossFoliage(), createMossTextures(), createMoundGeometry(), createReferenceHouseAndRocks() (+11 more)

### Community 51 - "clamp01"
Cohesion: 0.33
Nodes (3): createFallingPetalGeometry(), FallingPetalSystem, randomPointInUnitSphere()

### Community 53 - "Preserve Typography"
Cohesion: 0.40
Nodes (4): Hard Rule, Preserve Typography, Verification, Workflow

### Community 61 - "Gradient"
Cohesion: 0.12
Nodes (6): activeGradients, e(), Gradient, initGradientCanvas(), MiniGl, normalizeColor()

### Community 62 - "FallingPetalSystem"
Cohesion: 0.18
Nodes (7): applyBranchWind(), BranchGeometryBuilder, clamp01(), createBarkTextures(), dampSpring(), easeInOutCubic(), easeOutCubic()

## Knowledge Gaps
- **310 isolated node(s):** `instrumentSans`, `instrumentSerif`, `metadata`, `navLinks`, `benchmarkRows` (+305 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **21 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `WeepingCherryGenerator` connect `What You Must Do When Invoked` to `HexagonLogoOverlay.tsx`, `VersionBranchSystem`, `FallingPetalSystem`, `.constructor`?**
  _High betweenness centrality (0.028) - this node is a cross-community bridge._
- **Why does `DangerTextEffect` connect `DangerTextEffect.ts` to `CloudToWhiteTransition.tsx`?**
  _High betweenness centrality (0.007) - this node is a cross-community bridge._
- **Why does `VersionEvent` connect `VersionBranchSystem` to `HexagonLogoOverlay.tsx`, `page.tsx`?**
  _High betweenness centrality (0.006) - this node is a cross-community bridge._
- **What connects `Caveman compress scripts.  This package provides tools to compress natural lan`, `Split YAML frontmatter from body. Returns (frontmatter, body).      Memory fil`, `Resolve the out-of-tree backup directory for a given source file.      Backups` to the rest of the system?**
  _322 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `compilerOptions` be split into smaller, more focused modules?**
  _Cohesion score 0.1 - nodes in this community are weakly interconnected._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.05555555555555555 - nodes in this community are weakly interconnected._
- **Should `What You Must Do When Invoked` be split into smaller, more focused modules?**
  _Cohesion score 0.07407407407407407 - nodes in this community are weakly interconnected._