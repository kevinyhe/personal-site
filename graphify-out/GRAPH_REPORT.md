# Graph Report - arbor-web  (2026-08-17)

## Corpus Check
- 61 files · ~52,696 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 550 nodes · 775 edges · 53 communities (37 shown, 16 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `b4593216`
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
- .append
- CanopyLobe
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
- smoothstep
- SpatialHash
- Preserve Typography
- ProblemStatementTransition.tsx
- AGENTS.md

## God Nodes (most connected - your core abstractions)
1. `WeepingCherryGenerator` - 38 edges
2. `lerp()` - 18 edges
3. `clamp01()` - 16 edges
4. `compilerOptions` - 16 edges
5. `validate()` - 14 edges
6. `compress_file()` - 12 edges
7. `smoothstep()` - 12 edges
8. `What You Must Do When Invoked` - 12 edges
9. `What You Must Do When Invoked` - 12 edges
10. `WeepingCherryTreeCanvas()` - 11 edges

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

## Communities (53 total, 16 thin omitted)

### Community 0 - "compilerOptions"
Cohesion: 0.07
Nodes (29): autoprefixer, eslint, eslint-config-next, @eslint/eslintrc, devDependencies, autoprefixer, eslint, eslint-config-next (+21 more)

### Community 1 - "package.json"
Cohesion: 0.06
Nodes (30): d3-force, d3-selection, d3-zoom, gsap, lenis, next, dependencies, d3-force (+22 more)

### Community 2 - "What You Must Do When Invoked"
Cohesion: 0.07
Nodes (28): ./*, dom, dom.iterable, esnext, next-env.d.ts, .next/types/**/*.ts, node_modules, **/*.ts (+20 more)

### Community 3 - "What You Must Do When Invoked"
Cohesion: 0.07
Nodes (26): For /graphify add and --watch, For /graphify query, For the commit hook and native CLAUDE.md integration, For --update and --cluster-only, /graphify, Honesty Rules, Interpreter guard for subcommands, Part A - Structural extraction for code files (+18 more)

### Community 4 - "What You Must Do When Invoked"
Cohesion: 0.13
Nodes (9): applyBlossomWind(), Branch, createSakuraBlossomGeometry(), createSakuraBudGeometry(), getBranchFrame(), lerp(), sampleBlossomTint(), UP (+1 more)

### Community 5 - "WeepingCherryTreeCanvas"
Cohesion: 0.18
Nodes (13): createPetalDetailTexture(), dampSpring(), disposeMaterialTextures(), easeOutCubic(), makeRng(), resolveSceneQuality(), WeepingCherryTreeCanvas(), addViewportChangeListener() (+5 more)

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
Cohesion: 0.27
Nodes (12): clamp01(), createBarkTextures(), createFallingPetalGeometry(), getBranchWindVectors(), getLimbWindAmplitude(), getPetalVertexColor(), getTwigWindAmplitude(), getTwigWindFlutter() (+4 more)

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
Cohesion: 0.40
Nodes (3): instrumentSerif, inter, metadata

### Community 28 - ".update"
Cohesion: 0.39
Nodes (3): arborGustEnvelope(), FallingPetalSystem, randomPointInUnitSphere()

### Community 33 - ".append"
Cohesion: 0.36
Nodes (3): applyBranchWind(), BranchGeometryBuilder, OccupiedPoint

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

### Community 47 - "clamp01"
Cohesion: 0.40
Nodes (4): Boundaries, Compile-Only Verification, Rule, Workflow

### Community 50 - "smoothstep"
Cohesion: 0.07
Nodes (29): BareThreeCanvasProps, BLOSSOM_CALYX_COLOR, BLOSSOM_CENTER_COLOR, BLOSSOM_TINT_BRIGHT, BLOSSOM_TINT_PALE, BLOSSOM_TINT_ROSE, BLOSSOM_TINT_SOFT, BlossomPlacement (+21 more)

### Community 53 - "Preserve Typography"
Cohesion: 0.40
Nodes (4): Hard Rule, Preserve Typography, Verification, Workflow

### Community 64 - "ProblemStatementTransition.tsx"
Cohesion: 0.29
Nodes (3): menuLinks, socialLinks, HeroIntroProps

## Knowledge Gaps
- **260 isolated node(s):** `inter`, `instrumentSerif`, `metadata`, `socialLinks`, `menuLinks` (+255 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **16 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `WeepingCherryGenerator` connect `What You Must Do When Invoked` to `.append`, `smoothstep`, `WeepingCherryTreeCanvas`, `clamp01`?**
  _High betweenness centrality (0.016) - this node is a cross-community bridge._
- **Why does `devDependencies` connect `compilerOptions` to `package.json`?**
  _High betweenness centrality (0.008) - this node is a cross-community bridge._
- **What connects `inter`, `instrumentSerif`, `metadata` to the rest of the system?**
  _260 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `compilerOptions` be split into smaller, more focused modules?**
  _Cohesion score 0.06896551724137931 - nodes in this community are weakly interconnected._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.06451612903225806 - nodes in this community are weakly interconnected._
- **Should `What You Must Do When Invoked` be split into smaller, more focused modules?**
  _Cohesion score 0.06896551724137931 - nodes in this community are weakly interconnected._
- **Should `What You Must Do When Invoked` be split into smaller, more focused modules?**
  _Cohesion score 0.07407407407407407 - nodes in this community are weakly interconnected._