# Graph Report - landing  (2026-07-04)

## Corpus Check
- 33 files · ~29,449 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 221 nodes · 209 edges · 33 communities (20 shown, 13 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `6f0733fc`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_compilerOptions|compilerOptions]]
- [[_COMMUNITY_package.json|package.json]]
- [[_COMMUNITY_What You Must Do When Invoked|What You Must Do When Invoked]]
- [[_COMMUNITY_What You Must Do When Invoked|What You Must Do When Invoked]]
- [[_COMMUNITY_What You Must Do When Invoked|What You Must Do When Invoked]]
- [[_COMMUNITY_graphify|/graphify]]
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
- [[_COMMUNITY_next.config.ts|next.config.ts]]
- [[_COMMUNITY_postcss.config.mjs|postcss.config.mjs]]
- [[_COMMUNITY_tailwind.config.ts|tailwind.config.ts]]
- [[_COMMUNITY_HexagonLogoOverlay.tsx|HexagonLogoOverlay.tsx]]

## God Nodes (most connected - your core abstractions)
1. `compilerOptions` - 16 edges
2. `What You Must Do When Invoked` - 12 edges
3. `What You Must Do When Invoked` - 12 edges
4. `/graphify` - 11 edges
5. `/graphify` - 10 edges
6. `graphify reference: extra exports and benchmark` - 8 edges
7. `graphify reference: extra exports and benchmark` - 8 edges
8. `createTree()` - 7 edges
9. `scripts` - 6 edges
10. `rand()` - 5 edges

## Surprising Connections (you probably didn't know these)
- None detected - all connections are within the same source files.

## Import Cycles
- None detected.

## Communities (33 total, 13 thin omitted)

### Community 0 - "compilerOptions"
Cohesion: 0.10
Nodes (19): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+11 more)

### Community 1 - "package.json"
Cohesion: 0.12
Nodes (15): dependencies, next, react, react-dom, three, @types/three, name, private (+7 more)

### Community 2 - "What You Must Do When Invoked"
Cohesion: 0.13
Nodes (15): Part A - Structural extraction for code files, Part B - Semantic extraction (parallel subagents), Part C - Merge AST + semantic into final extraction, Step 0 - GitHub repos and multi-path merge (only if a URL or several paths), Step 1 - Ensure graphify is installed, Step 2.5 - Video and audio (only if video files detected), Step 2 - Detect files, Step 3 - Extract entities and relationships (+7 more)

### Community 3 - "What You Must Do When Invoked"
Cohesion: 0.13
Nodes (15): Part A - Structural extraction for code files, Part B - Semantic extraction (parallel subagents), Part C - Merge AST + semantic into final extraction, Step 0 - GitHub repos and multi-path merge (only if a URL or several paths), Step 1 - Ensure graphify is installed, Step 2.5 - Video and audio (only if video files detected), Step 2 - Detect files, Step 3 - Extract entities and relationships (+7 more)

### Community 4 - "What You Must Do When Invoked"
Cohesion: 0.17
Nodes (11): For /graphify add and --watch, For /graphify query, For the commit hook and native CLAUDE.md integration, For --update and --cluster-only, /graphify, Honesty Rules, Interpreter guard for subcommands, PowerShell 5.1: Vertical scrolling stops working (+3 more)

### Community 5 - "/graphify"
Cohesion: 0.17
Nodes (12): devDependencies, autoprefixer, eslint, eslint-config-next, @eslint/eslintrc, playwright, postcss, tailwindcss (+4 more)

### Community 6 - "devDependencies"
Cohesion: 0.20
Nodes (9): For /graphify add and --watch, For /graphify query, For the commit hook and native CLAUDE.md integration, For --update and --cluster-only, /graphify, Honesty Rules, Interpreter guard for subcommands, Usage (+1 more)

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

### Community 34 - "HexagonLogoOverlay.tsx"
Cohesion: 0.11
Nodes (24): BareThreeCanvas(), BlossomAnchor, BlossomCluster, BranchPath, BUD_COUNT, createBlossomClusters(), createBudGeometry(), createPetalGeometry() (+16 more)

## Knowledge Gaps
- **145 isolated node(s):** `instrumentSerif`, `metadata`, `UP`, `OPEN_FLOWER_COUNT`, `LOOSE_BLOSSOM_PETAL_COUNT` (+140 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **13 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `What You Must Do When Invoked` connect `What You Must Do When Invoked` to `What You Must Do When Invoked`?**
  _High betweenness centrality (0.011) - this node is a cross-community bridge._
- **Why does `devDependencies` connect `/graphify` to `package.json`?**
  _High betweenness centrality (0.010) - this node is a cross-community bridge._
- **Why does `What You Must Do When Invoked` connect `What You Must Do When Invoked` to `devDependencies`?**
  _High betweenness centrality (0.009) - this node is a cross-community bridge._
- **What connects `instrumentSerif`, `metadata`, `UP` to the rest of the system?**
  _145 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `compilerOptions` be split into smaller, more focused modules?**
  _Cohesion score 0.1 - nodes in this community are weakly interconnected._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.125 - nodes in this community are weakly interconnected._
- **Should `What You Must Do When Invoked` be split into smaller, more focused modules?**
  _Cohesion score 0.13333333333333333 - nodes in this community are weakly interconnected._