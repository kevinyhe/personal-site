# Graph Report - landing  (2026-07-05)

## Corpus Check
- 36 files · ~333,146 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 367 nodes · 570 edges · 35 communities (22 shown, 13 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `93cecafb`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_compilerOptions|compilerOptions]]
- [[_COMMUNITY_package.json|package.json]]
- [[_COMMUNITY_What You Must Do When Invoked|What You Must Do When Invoked]]
- [[_COMMUNITY_What You Must Do When Invoked|What You Must Do When Invoked]]
- [[_COMMUNITY_What You Must Do When Invoked|What You Must Do When Invoked]]
- [[_COMMUNITY_.createRuntime|.createRuntime]]
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
- [[_COMMUNITY_SpatialHash|SpatialHash]]
- [[_COMMUNITY_HexagonLogoOverlay.tsx|HexagonLogoOverlay.tsx]]

## God Nodes (most connected - your core abstractions)
1. `WeepingCherryGenerator` - 44 edges
2. `lerp()` - 22 edges
3. `clamp01()` - 19 edges
4. `compilerOptions` - 16 edges
5. `smoothstep()` - 13 edges
6. `What You Must Do When Invoked` - 12 edges
7. `What You Must Do When Invoked` - 12 edges
8. `getGroundHeight()` - 11 edges
9. `createMossFoliage()` - 11 edges
10. `createFallenPetals()` - 11 edges

## Surprising Connections (you probably didn't know these)
- `createFallenPetals()` --calls--> `createFallingPetalGeometry()`  [EXTRACTED]
  components/BareThreeCanvas.tsx → components/BareThreeCanvas.tsx  _Bridges community 6 → community 34_

## Import Cycles
- None detected.

## Communities (35 total, 13 thin omitted)

### Community 0 - "compilerOptions"
Cohesion: 0.10
Nodes (19): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+11 more)

### Community 1 - "package.json"
Cohesion: 0.07
Nodes (29): dependencies, gsap, lenis, next, react, react-dom, three, @types/three (+21 more)

### Community 2 - "What You Must Do When Invoked"
Cohesion: 0.07
Nodes (26): For /graphify add and --watch, For /graphify query, For the commit hook and native CLAUDE.md integration, For --update and --cluster-only, /graphify, Honesty Rules, Interpreter guard for subcommands, Part A - Structural extraction for code files (+18 more)

### Community 3 - "What You Must Do When Invoked"
Cohesion: 0.08
Nodes (24): For /graphify add and --watch, For /graphify query, For the commit hook and native CLAUDE.md integration, For --update and --cluster-only, /graphify, Honesty Rules, Interpreter guard for subcommands, Part A - Structural extraction for code files (+16 more)

### Community 4 - "What You Must Do When Invoked"
Cohesion: 0.12
Nodes (3): applyBlossomWind(), applyBranchWind(), WeepingCherryGenerator

### Community 5 - ".createRuntime"
Cohesion: 0.11
Nodes (10): addBranchGrowAttribute(), applyVersionBlossomReveal(), applyVersionBranchReveal(), Branch, BranchGeometryBuilder, VersionBranchSystem, VersionBranchTarget, VersionEvent (+2 more)

### Community 6 - "devDependencies"
Cohesion: 0.17
Nodes (6): createFallingPetalGeometry(), createSakuraBlossomGeometry(), dampSpring(), FallingPetalSystem, randomPointInUnitSphere(), VersionPetalBurstSystem

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

### Community 28 - "page.tsx"
Cohesion: 0.11
Nodes (6): benchmarkRows, navLinks, operatingSignals, pricingPlans, WeepingCherryTreeCanvas(), HeroIntroProps

### Community 33 - "SpatialHash"
Cohesion: 0.27
Nodes (3): getBranchFrame(), SpatialHash, UP

### Community 34 - "HexagonLogoOverlay.tsx"
Cohesion: 0.07
Nodes (51): BareThreeCanvasProps, BlossomCluster, BlossomSupportIndex, BlossomSupportSample, BlossomSurfaceBranch, BranchFrame, BranchWindUniforms, CanopyLobe (+43 more)

## Knowledge Gaps
- **166 isolated node(s):** `instrumentSerif`, `metadata`, `navLinks`, `operatingSignals`, `benchmarkRows` (+161 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **13 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `WeepingCherryGenerator` connect `What You Must Do When Invoked` to `SpatialHash`, `HexagonLogoOverlay.tsx`?**
  _High betweenness centrality (0.065) - this node is a cross-community bridge._
- **Why does `SpatialHash` connect `SpatialHash` to `HexagonLogoOverlay.tsx`?**
  _High betweenness centrality (0.012) - this node is a cross-community bridge._
- **Why does `lerp()` connect `HexagonLogoOverlay.tsx` to `SpatialHash`, `What You Must Do When Invoked`, `.createRuntime`?**
  _High betweenness centrality (0.012) - this node is a cross-community bridge._
- **What connects `instrumentSerif`, `metadata`, `navLinks` to the rest of the system?**
  _166 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `compilerOptions` be split into smaller, more focused modules?**
  _Cohesion score 0.1 - nodes in this community are weakly interconnected._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.06666666666666667 - nodes in this community are weakly interconnected._
- **Should `What You Must Do When Invoked` be split into smaller, more focused modules?**
  _Cohesion score 0.07407407407407407 - nodes in this community are weakly interconnected._