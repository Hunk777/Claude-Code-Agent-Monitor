/**
 * @file Office.tsx
 * @description Retro 2D game-style office view. Classifies agents by a layered strategy:
 *              1) agent.type === "main" → Main
 *              2) subagent_type matches Claude built-ins (Explore/general-purpose/compaction)
 *              3) name/task field keyword matching → ECC specialized departments
 *              4) Fallback → Other Staff
 *              Departments are always visible with role descriptions.
 */

import { useEffect, useState, useMemo, useCallback } from "react";
import { RefreshCw, Building2, X, Clock, Wrench, Activity as ActivityIcon } from "lucide-react";
import { api } from "../lib/api";
import { eventBus } from "../lib/eventBus";
import type { Agent, AgentStatus, DashboardEvent } from "../lib/types";

type DeptId =
  | "main"
  | "research"
  | "taskforce"
  | "maintenance"
  | "editorial"
  | "planning"
  | "architect"
  | "review"
  | "language"
  | "testing"
  | "build"
  | "quality"
  | "skill"
  | "ops"
  | "other";

interface Department {
  id: DeptId;
  name: string;
  nameJa: string;
  role: string;
  emoji: string;
  accent: string;
  bgTint: string;
  border: string;
  wallColor: string;
  floorColor: string;
  expectedMembers: string[];
  // keywordMatchers run against (subagent_type + " " + name + " " + task).toLowerCase()
  keywordMatchers: RegExp[];
}

const DEPARTMENTS: Department[] = [
  {
    id: "main",
    name: "Main Office",
    nameJa: "本社",
    role: "あなた自身の作業机（メインエージェント）",
    emoji: "🏠",
    accent: "text-amber-300",
    bgTint: "bg-amber-500/10",
    border: "border-amber-500/60",
    wallColor: "#78350f",
    floorColor: "#7c2d12",
    expectedMembers: ["main"],
    keywordMatchers: [],
  },
  {
    id: "research",
    name: "Research & Discovery",
    nameJa: "調査部",
    role: "ファイル探索・コードベース読解（Explore）",
    emoji: "🔭",
    accent: "text-cyan-300",
    bgTint: "bg-cyan-500/10",
    border: "border-cyan-500/60",
    wallColor: "#155e75",
    floorColor: "#0e7490",
    expectedMembers: ["Explore"],
    keywordMatchers: [],
  },
  {
    id: "taskforce",
    name: "Task Force",
    nameJa: "特務部",
    role: "多目的な個別タスク実行（general-purpose）",
    emoji: "⚡",
    accent: "text-yellow-300",
    bgTint: "bg-yellow-500/10",
    border: "border-yellow-500/60",
    wallColor: "#854d0e",
    floorColor: "#a16207",
    expectedMembers: ["general-purpose"],
    keywordMatchers: [],
  },
  {
    id: "maintenance",
    name: "Maintenance",
    nameJa: "保全部",
    role: "コンテキスト圧縮・メモリ整理（compaction）",
    emoji: "🧹",
    accent: "text-stone-300",
    bgTint: "bg-stone-500/10",
    border: "border-stone-500/60",
    wallColor: "#44403c",
    floorColor: "#57534e",
    expectedMembers: ["compaction"],
    keywordMatchers: [],
  },
  {
    id: "planning",
    name: "Planning",
    nameJa: "計画部",
    role: "タスク分解・実装順序設計",
    emoji: "📋",
    accent: "text-sky-300",
    bgTint: "bg-sky-500/10",
    border: "border-sky-500/60",
    wallColor: "#075985",
    floorColor: "#0369a1",
    expectedMembers: ["planner", "code-explorer"],
    keywordMatchers: [/\bplanner\b/, /code-explorer/, /\/plan\b/],
  },
  {
    id: "architect",
    name: "Architecture",
    nameJa: "設計部",
    role: "システム・コード設計、ADR 記録",
    emoji: "🏛",
    accent: "text-indigo-300",
    bgTint: "bg-indigo-500/10",
    border: "border-indigo-500/60",
    wallColor: "#3730a3",
    floorColor: "#4338ca",
    expectedMembers: ["architect", "code-architect", "a11y-architect"],
    keywordMatchers: [/\barchitect/, /\badr\b/, /hexagonal/],
  },
  {
    id: "review",
    name: "Code Review",
    nameJa: "レビュー部",
    role: "コード品質・セキュリティ監査",
    emoji: "🔍",
    accent: "text-violet-300",
    bgTint: "bg-violet-500/10",
    border: "border-violet-500/60",
    wallColor: "#5b21b6",
    floorColor: "#6d28d9",
    expectedMembers: ["code-reviewer", "security-reviewer"],
    keywordMatchers: [/code-reviewer/, /security-reviewer/, /security-review\b/],
  },
  {
    id: "language",
    name: "Language Reviewers",
    nameJa: "言語専門部",
    role: "Python/Rust/Go 等、言語別レビュー",
    emoji: "🌐",
    accent: "text-fuchsia-300",
    bgTint: "bg-fuchsia-500/10",
    border: "border-fuchsia-500/60",
    wallColor: "#86198f",
    floorColor: "#a21caf",
    expectedMembers: ["python-reviewer", "typescript-reviewer", "rust-reviewer", "go-reviewer"],
    keywordMatchers: [/(python|typescript|rust|go|java|kotlin|cpp|csharp|flutter|swift)-reviewer/],
  },
  {
    id: "testing",
    name: "Testing & QA",
    nameJa: "テスト部",
    role: "TDD・E2E・カバレッジ",
    emoji: "🧪",
    accent: "text-emerald-300",
    bgTint: "bg-emerald-500/10",
    border: "border-emerald-500/60",
    wallColor: "#065f46",
    floorColor: "#047857",
    expectedMembers: ["tdd-guide", "e2e-runner"],
    keywordMatchers: [/\btdd/, /\be2e\b/, /\btest\b/],
  },
  {
    id: "build",
    name: "Build & Fix",
    nameJa: "ビルド修理部",
    role: "ビルドエラー解決・依存修復",
    emoji: "🛠",
    accent: "text-orange-300",
    bgTint: "bg-orange-500/10",
    border: "border-orange-500/60",
    wallColor: "#9a3412",
    floorColor: "#c2410c",
    expectedMembers: ["build-error-resolver"],
    keywordMatchers: [/build-error/, /build-resolver/, /build-fix/],
  },
  {
    id: "quality",
    name: "Quality Control",
    nameJa: "品質管理部",
    role: "リファクタ・簡素化・隠れバグ発見",
    emoji: "♻️",
    accent: "text-teal-300",
    bgTint: "bg-teal-500/10",
    border: "border-teal-500/60",
    wallColor: "#115e59",
    floorColor: "#0f766e",
    expectedMembers: ["refactor-cleaner", "code-simplifier", "silent-failure-hunter"],
    keywordMatchers: [/refactor/, /simplif/, /silent-failure/],
  },
  {
    id: "skill",
    name: "Skills Lab",
    nameJa: "スキル研究室",
    role: "スキル作成・評価・ハーネス",
    emoji: "📖",
    accent: "text-lime-300",
    bgTint: "bg-lime-500/10",
    border: "border-lime-500/60",
    wallColor: "#365314",
    floorColor: "#4d7c0f",
    expectedMembers: ["skill-creator", "agent-eval", "harness-construction"],
    keywordMatchers: [/\bskill-/, /agent-eval/, /harness-construction/],
  },
  {
    id: "ops",
    name: "Operations",
    nameJa: "運営部",
    role: "連絡・ドキュメント・メタ運用",
    emoji: "⚙️",
    accent: "text-rose-300",
    bgTint: "bg-rose-500/10",
    border: "border-rose-500/60",
    wallColor: "#9f1239",
    floorColor: "#be123c",
    expectedMembers: ["chief-of-staff", "doc-updater", "docs-lookup", "harness-optimizer", "performance-optimizer"],
    keywordMatchers: [/chief-of-staff/, /doc-updater/, /docs-lookup/, /harness-optim/, /performance-optim/],
  },
  {
    id: "editorial",
    name: "Content Writing",
    nameJa: "編集部",
    role: "教材・ドキュメント執筆、章の書き直し・追加・校正",
    emoji: "📝",
    accent: "text-pink-300",
    bgTint: "bg-pink-500/10",
    border: "border-pink-500/60",
    wallColor: "#831843",
    floorColor: "#9d174d",
    expectedMembers: [],
    keywordMatchers: [
      /^rebuild\s+ch\s+/i,
      /^create\s+ch\s+/i,
      /^add\s+objectives\s+to\s+ch\s+/i,
      /^retry\s+rebuild/i,
      /^update\s+ch\s+/i,
    ],
  },
  {
    id: "other",
    name: "Other Staff",
    nameJa: "その他",
    role: "分類外のエージェント",
    emoji: "👥",
    accent: "text-gray-300",
    bgTint: "bg-gray-500/10",
    border: "border-gray-500/60",
    wallColor: "#374151",
    floorColor: "#4b5563",
    expectedMembers: [],
    keywordMatchers: [],
  },
];

// Per-agent role descriptions (Japanese). Falls back to department role if unknown.
const AGENT_ROLES: Record<string, string> = {
  // --- ECC 主要エージェント ---
  planner: "複雑な機能の実装計画を作成。タスク分解、依存関係把握、リスク特定。書き込み権限なし（計画段階で実装に飛ばないよう設計）。",
  "code-reviewer": "コード品質・セキュリティ・保守性レビュー。CRITICAL/HIGH/MEDIUM/LOW 分類で指摘。全コード変更で MUST BE USED。",
  "security-reviewer": "セキュリティ特化レビュー。秘密、SSRF、injection、unsafe crypto、OWASP Top 10 を検出。修正実行権限あり（即座に塞ぐ設計）。",
  "tdd-guide": "テスト先行開発を強制。Red → Red 検証 → Green → Green 検証 → Refactor → Coverage 80%+ の 6 ステップ。",
  architect: "システム全体の設計。4 フェーズ (Current State / Requirements / Design / Trade-Off) で ADR を作成。Opus + 読取専用。",
  "code-architect": "コードレベル設計。モジュール構造、責務分離、インターフェース設計。",
  "a11y-architect": "アクセシビリティ (WCAG) 設計。画面/入力/色/フォーカス管理。",
  "code-explorer": "設計前の既存コード調査・理解。コードベース探索に特化。",
  "build-error-resolver": "ビルド/型エラー解決。最小 diff、アーキテクチャ改変なし、ビルドを緑に戻すことに特化。",
  "e2e-runner": "E2E テスト生成・実行。Vercel Agent Browser 優先、Playwright フォールバック。Flaky 検出・quarantine。",
  "refactor-cleaner": "死コード・未使用 export・重複の除去。knip/depcheck/ts-prune 等の実ツール統合。",
  "code-simplifier": "複雑さ削減。clarity over cleverness、behavior 保持、recently modified code に集中。",
  "silent-failure-hunter": "隠れた失敗の発見。空 catch、inadequate logging、dangerous fallbacks を zero tolerance で追う。",
  "chief-of-staff": "メッセージ triage。Gmail/Slack/LINE/Messenger/Calendar 統合。4-Tier 分類 (skip/info/meeting/action)。Opus。",
  "doc-updater": "コード変更に追従してドキュメント更新。API/setup/config docs の同期。",
  "docs-lookup": "ドキュメント検索・該当箇所提示。",
  "harness-optimizer": "Claude Code 環境 (~/.claude/) の最適化提案。CLAUDE.md 肥大、重複 hook、未使用 skill を検出。",
  "performance-optimizer": "パフォーマンス分析・最適化。アルゴリズム/DB/ネットワーク/メモリ/レンダリングの 5 領域深掘り。",

  // --- 言語別 reviewer ---
  "python-reviewer": "Python 特化レビュー。PEP 8、型ヒント、Pythonic patterns、mutable default args 罠、YAML unsafe load 等。",
  "typescript-reviewer": "TypeScript 特化レビュー。型安全 (any 禁止、non-null 濫用)、async 正しさ (floating promise)、idiomatic。",
  "rust-reviewer": "Rust 特化レビュー。ownership、lifetimes、unsafe ブロック、unwrap 本番禁止、iterator 推奨。",
  "go-reviewer": "Go 特化レビュー。idiomatic patterns、error handling、並行性、defer 活用。",
  "java-reviewer": "Java 特化レビュー。exception 処理、null 安全、Spring idiom、immutability。",
  "kotlin-reviewer": "Kotlin 特化レビュー。null 安全、coroutine 安全、Clean Architecture 整合性。",
  "cpp-reviewer": "C++ 特化レビュー。メモリ安全、modern idiom、並行性、RAII。",
  "csharp-reviewer": "C# 特化レビュー。async/await、LINQ、null 参照、nullable reference types。",
  "flutter-reviewer": "Flutter 特化レビュー。widget lifecycle、state management、performance。",
  "swift-reviewer": "Swift 特化レビュー。optional 扱い、value vs reference、concurrency。",

  // --- Claude Code 内蔵 ---
  Explore: "コードベース探索専任。キーワード検索、ファイル発見、「あのコードどこだっけ」の解決役。主エージェントの context を膨らませずに調査。",
  "general-purpose": "多目的な個別タスク実行。明示的な役割なし、プロンプト指示に応じて柔軟に動く。特務部。",
  compaction: "コンテキスト圧縮・自動要約。メモリが肥大化した際に古い会話を要約して置換。保全部。",
  "claude-code-guide": "Claude Code の機能（hooks、slash commands、MCP、settings）についてのガイド役。",
  Plan: "実装戦略の設計。アーキテクチャ計画、ステップ分解、重要ファイル特定、トレードオフ検討。",
  "statusline-setup": "Claude Code のステータスライン設定補助。",
  main: "あなた自身のメイン Claude Code セッション。あなたが直接対話している相手。全ての subagent の親。",
};

// Generic Claude Code subagent types — lower priority than specific ECC agent names
const GENERIC_SUBAGENT_TYPES = new Set([
  "general-purpose",
  "explore",
  "compaction",
  "claude-code-guide",
  "plan",
  "statusline-setup",
]);

// Extract a specific role description from name patterns (e.g. "Rebuild Ch 15 tdd-workflow").
// Returns null if no pattern matches.
function roleFromNamePattern(name: string): string | null {
  const m1 = name.match(/^rebuild\s+ch\s+([0-9.]+)\s+(.*)$/i);
  if (m1) return `📝 章書き換え作業：第 ${m1[1]} 章「${m1[2]}」を Ch 04 水準で再構築する執筆タスク。`;
  const m2 = name.match(/^create\s+ch\s+([0-9.]+)\s+(.*)$/i);
  if (m2) return `📝 新規章執筆：第 ${m2[1]} 章「${m2[2]}」を新たに書き起こすタスク。`;
  const m3 = name.match(/^add\s+objectives\s+to\s+ch\s+(.*)$/i);
  if (m3) return `📝 章編集：第 ${m3[1]} 章に「到達目標」セクションを追加する作業。`;
  const m4 = name.match(/^retry\s+rebuild\s+(?:ch\s+)?(.*)$/i);
  if (m4) return `📝 再試行：前回失敗した「${m4[1]}」の再書き直しタスク。`;
  const m5 = name.match(/^update\s+ch\s+([0-9.]+)\s+(.*)$/i);
  if (m5) return `📝 章更新：第 ${m5[1]} 章「${m5[2]}」の部分更新。`;
  const m6 = name.match(/^dummy\s+(research|task|demo)/i);
  if (m6) return `🧪 動作確認用のダミータスク（実運用ではなく監視システムのテスト目的）。`;
  return null;
}

// Detect explicit role-play markers in task ("act as X", "あなたは X として").
function detectRolePlay(agent: Agent): { role: string; matched: string } | null {
  const task = agent.task || "";
  const m = task.match(
    /\b(?:act as|acting as|you are a?|you're a?)\s+([a-z][a-z0-9-]+(?:-[a-z0-9]+)*)|あなたは\s*([a-z][a-z0-9-]+)\s*として/i
  );
  if (!m) return null;
  const matched = (m[1] || m[2] || "").toLowerCase();
  for (const [key, role] of Object.entries(AGENT_ROLES)) {
    const k = key.toLowerCase();
    if (k === matched || matched.startsWith(k) || k.startsWith(matched)) {
      return { role, matched: key };
    }
  }
  return null;
}

function getAgentRole(agent: Agent, dept: Department): string {
  // Tier 0: Main agent
  if (agent.type === "main") {
    return AGENT_ROLES["main"] || `${dept.nameJa}所属：${dept.role}`;
  }

  const st = (agent.subagent_type || "").toLowerCase();
  const name = (agent.name || "").toLowerCase();

  // Tier 1: specific subagent_type (not generic) — authoritative ECC agent
  if (st && !GENERIC_SUBAGENT_TYPES.has(st)) {
    for (const [key, role] of Object.entries(AGENT_ROLES)) {
      if (st === key.toLowerCase()) return role;
    }
  }

  // Tier 2: exact name match on AGENT_ROLES keys
  if (name) {
    for (const [key, role] of Object.entries(AGENT_ROLES)) {
      if (name === key.toLowerCase()) return role;
    }
  }

  // Tier 3: name pattern extraction (Rebuild Ch X / Create Ch Y / etc.)
  // This produces a role description derived from the name WITHOUT guessing specialty.
  const fromName = roleFromNamePattern(name);
  if (fromName) return fromName;

  // Tier 4: explicit role-play marker in task ("act as X")
  const rolePlay = detectRolePlay(agent);
  if (rolePlay) {
    return `${rolePlay.role}\n\n（task 内の明示的なロールプレイ指示「${rolePlay.matched}」として振る舞うよう依頼されています）`;
  }

  // Tier 5: generic subagent_type — return honest generic description
  if (st) {
    for (const [key, role] of Object.entries(AGENT_ROLES)) {
      if (st === key.toLowerCase()) return role;
    }
  }

  // Tier 6: department-based fallback — last resort
  return `${dept.nameJa}所属：${dept.role}\n\n※ この agent は分類ルールで確定できませんでした。task 本文（下記）を確認してください。`;
}

function classify(agent: Agent): DeptId {
  // Tier 1: Main agents
  if (agent.type === "main") return "main";

  // Tier 2: Claude Code built-in subagent types (exact match)
  const st = (agent.subagent_type || "").toLowerCase();
  if (st === "explore") return "research";
  if (st === "compaction") return "maintenance";

  const name = (agent.name || "").toLowerCase();
  const task = (agent.task || "").toLowerCase();

  // Tier 3: name-pattern detection for editorial (documentation writing tasks)
  // These take priority over task-keyword matching because a task that TALKS ABOUT "tdd"
  // is not itself a TDD agent — it's a writer writing about TDD.
  const editorialDept = DEPARTMENTS.find((d) => d.id === "editorial");
  if (editorialDept) {
    for (const rx of editorialDept.keywordMatchers) {
      if (rx.test(name)) return "editorial";
    }
  }

  // Tier 4: subagent_type is a specific ECC agent name — most authoritative
  if (st && st !== "general-purpose" && st !== "plan") {
    for (const dept of DEPARTMENTS) {
      if (dept.id === "main" || dept.id === "other" || dept.id === "editorial") continue;
      for (const rx of dept.keywordMatchers) {
        if (rx.test(st)) return dept.id;
      }
    }
  }

  // Tier 5: name is an ECC agent name (strong signal, e.g. user explicitly named a subagent)
  for (const dept of DEPARTMENTS) {
    if (dept.id === "main" || dept.id === "other" || dept.id === "editorial") continue;
    for (const rx of dept.keywordMatchers) {
      if (rx.test(name)) return dept.id;
    }
  }

  // Tier 6: explicit role-play in task ("act as X", "you are a X", "あなたは X として")
  // Only here do we consider task content, and only when there's an explicit marker.
  const rolePlayRx = /\b(?:act as|acting as|you are a?|you're a?)\s+([a-z][a-z0-9-]+(?:-[a-z0-9]+)*)|あなたは\s*([a-z][a-z0-9-]+)\s*として/i;
  const rolePlayMatch = agent.task?.match(rolePlayRx);
  if (rolePlayMatch) {
    const role = (rolePlayMatch[1] || rolePlayMatch[2] || "").toLowerCase();
    for (const dept of DEPARTMENTS) {
      if (dept.id === "main" || dept.id === "other" || dept.id === "editorial") continue;
      for (const rx of dept.keywordMatchers) {
        if (rx.test(role)) return dept.id;
      }
    }
  }

  // Tier 7: Plan subagent_type → architect dept (Claude Code Plan is for architecture planning)
  if (st === "plan") return "architect";

  // Tier 8: general-purpose fallback → taskforce
  if (st === "general-purpose") return "taskforce";

  // Tier 9: Unknown
  // Suppress unused variable warning
  void task;
  return "other";
}

function emojiForAgent(agent: Agent): string {
  const name = (agent.subagent_type || agent.name || "").toLowerCase();
  const task = (agent.task || "").toLowerCase();
  const combined = name + " " + task;
  if (/planner/.test(combined)) return "📋";
  if (/architect/.test(combined)) return "🏛";
  if (/explorer|\bexplore\b/.test(combined)) return "🔭";
  if (/security/.test(combined)) return "🛡";
  if (/python/.test(combined)) return "🐍";
  if (/typescript|tsx/.test(combined)) return "📘";
  if (/rust/.test(combined)) return "🦀";
  if (/\bgo-/.test(combined)) return "🐹";
  if (/java/.test(combined)) return "☕";
  if (/kotlin/.test(combined)) return "🤖";
  if (/cpp|c\+\+/.test(combined)) return "⚙️";
  if (/flutter/.test(combined)) return "💙";
  if (/reviewer/.test(combined)) return "🔍";
  if (/tdd/.test(combined)) return "✅";
  if (/e2e/.test(combined)) return "🌐";
  if (/build/.test(combined)) return "🔨";
  if (/refactor/.test(combined)) return "♻️";
  if (/simplif/.test(combined)) return "✂️";
  if (/silent-failure/.test(combined)) return "🕵";
  if (/skill/.test(combined)) return "📖";
  if (/eval/.test(combined)) return "📊";
  if (/harness/.test(combined)) return "🎛";
  if (/chief-of-staff/.test(combined)) return "🧑‍💼";
  if (/doc-updater|doc-lookup/.test(combined)) return "📝";
  if (/performance/.test(combined)) return "⚡";
  if (/compact/.test(combined)) return "🧹";
  if (/general-purpose/.test(combined)) return "🛠";
  if (agent.type === "main") return "🧑‍💻";
  return "🤖";
}

function statusStyle(status: AgentStatus) {
  switch (status) {
    case "working":
      return {
        ring: "border-emerald-400",
        shadow: "shadow-[4px_4px_0_0_#10b981,0_0_18px_rgba(52,211,153,0.55)]",
        dot: "bg-emerald-400",
        dotPulse: true,
        labelColor: "text-emerald-300",
        label: "WORKING",
        bob: "animate-[bob_0.8s_ease-in-out_infinite]",
      };
    case "connected":
      return {
        ring: "border-sky-400",
        shadow: "shadow-[4px_4px_0_0_#0ea5e9]",
        dot: "bg-sky-400",
        dotPulse: true,
        labelColor: "text-sky-300",
        label: "CONNECTED",
        bob: "",
      };
    case "completed":
      return {
        ring: "border-gray-400",
        shadow: "shadow-[4px_4px_0_0_#9ca3af]",
        dot: "bg-gray-300",
        dotPulse: false,
        labelColor: "text-gray-300",
        label: "DONE",
        bob: "",
      };
    case "error":
      return {
        ring: "border-rose-500",
        shadow: "shadow-[4px_4px_0_0_#e11d48,0_0_18px_rgba(225,29,72,0.55)]",
        dot: "bg-rose-500",
        dotPulse: true,
        labelColor: "text-rose-300",
        label: "ERROR",
        bob: "animate-pulse",
      };
    case "idle":
    default:
      return {
        ring: "border-gray-600",
        shadow: "shadow-[3px_3px_0_0_#4b5563]",
        dot: "bg-gray-500",
        dotPulse: false,
        labelColor: "text-gray-400",
        label: "IDLE",
        bob: "",
      };
  }
}

function Desk({ agent, onClick }: { agent: Agent; onClick: (a: Agent) => void }) {
  const displayName = agent.name || agent.subagent_type || "(agent)";
  const emoji = emojiForAgent(agent);
  const st = statusStyle(agent.status);
  const task = agent.task || agent.current_tool || "";
  return (
    <div
      onClick={() => onClick(agent)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onClick(agent); }}
      className={`relative flex flex-col items-center transition-transform hover:scale-110 hover:z-10 cursor-pointer ${st.bob}`}
      style={{ width: 100 }}
      title={`${displayName}\n${st.label}${task ? ` · ${task.slice(0, 100)}` : ""}\n(クリックで詳細)`}
    >
      {agent.status === "working" && (
        <div className="absolute -top-6 text-lg animate-bounce select-none drop-shadow">💭</div>
      )}

      <div
        className={`relative w-full bg-[#1f2937] border-4 ${st.ring} ${st.shadow} flex flex-col items-center py-2`}
        style={{ imageRendering: "pixelated" }}
      >
        <span
          className={`absolute -top-2 -right-2 w-3 h-3 rounded-full ${st.dot} border-2 border-black`}
        />
        <div className="text-3xl leading-none drop-shadow-[2px_2px_0_rgba(0,0,0,0.7)]" aria-hidden>
          {emoji}
        </div>
        <div className="w-10 h-1 bg-amber-800 mt-1" />
      </div>

      <div className="w-full h-3 bg-gradient-to-b from-amber-700 to-amber-900 border-x-4 border-b-4 border-amber-950" />
      <div className="w-[110%] h-1.5 bg-amber-950" />

      <div className="mt-1.5 px-1 py-0.5 bg-[#0f172a] border border-gray-700">
        <div className="text-[10px] font-mono font-bold text-gray-100 leading-tight truncate max-w-[92px] text-center">
          {displayName}
        </div>
      </div>
      <div className={`text-[9px] mt-0.5 font-mono ${st.labelColor} tracking-wider`}>
        {st.label}
      </div>
    </div>
  );
}

function EmptyDesk({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center opacity-35" style={{ width: 100 }}>
      <div
        className="relative w-full bg-[#1f2937] border-4 border-dashed border-gray-700 flex flex-col items-center py-2"
        style={{ imageRendering: "pixelated" }}
      >
        <div className="text-3xl leading-none grayscale" aria-hidden>🪑</div>
        <div className="w-10 h-1 bg-gray-700 mt-1" />
      </div>
      <div className="w-full h-3 bg-gray-800 border-x-4 border-b-4 border-gray-900" />
      <div className="w-[110%] h-1.5 bg-gray-900" />
      <div className="mt-1.5 px-1 py-0.5 bg-[#0f172a] border border-gray-700">
        <div className="text-[9px] font-mono text-gray-600 text-center max-w-[92px] truncate">
          {label}
        </div>
      </div>
      <div className="text-[8px] mt-0.5 font-mono text-gray-700 tracking-wider">EMPTY</div>
    </div>
  );
}

function Room({
  dept,
  agents,
  limit,
  onDeskClick,
}: {
  dept: Department;
  agents: Agent[];
  limit: number;
  onDeskClick: (a: Agent) => void;
}) {
  const visible = agents.slice(0, limit);
  const overflow = Math.max(0, agents.length - limit);
  const placeholders = dept.expectedMembers
    .filter(
      (m) =>
        !agents.some((a) => {
          const nm = ((a.subagent_type || a.name || "") + " " + (a.task || "")).toLowerCase();
          return nm.includes(m.toLowerCase());
        })
    )
    .slice(0, 4);

  return (
    <div
      className={`relative border-4 ${dept.border} p-4 flex flex-col overflow-hidden`}
      style={{
        minHeight: 280,
        backgroundImage: `
          linear-gradient(135deg, ${dept.floorColor}33 25%, transparent 25%, transparent 50%, ${dept.floorColor}33 50%, ${dept.floorColor}33 75%, transparent 75%, transparent),
          linear-gradient(${dept.wallColor}40, ${dept.floorColor}30)
        `,
        backgroundSize: "20px 20px, 100% 100%",
        imageRendering: "pixelated",
        boxShadow: `inset 0 0 0 2px rgba(255,255,255,0.05), 6px 6px 0 0 ${dept.wallColor}`,
      }}
    >
      <div className="relative mb-3 self-start">
        <div
          className="px-3 py-2 border-4 border-black font-mono font-bold text-sm tracking-wider"
          style={{
            background: dept.wallColor,
            color: "#fff",
            textShadow: "2px 2px 0 rgba(0,0,0,0.6)",
            boxShadow: "3px 3px 0 0 rgba(0,0,0,0.5)",
          }}
        >
          <span className="text-lg mr-2" aria-hidden>
            {dept.emoji}
          </span>
          {dept.nameJa}
          <span className="ml-2 opacity-60 text-xs">({dept.name})</span>
        </div>
        <div className={`mt-1 text-[11px] ${dept.accent} font-mono`}>{dept.role}</div>
      </div>

      <div
        className="absolute top-3 right-3 px-2 py-1 bg-black/60 border-2 border-white/20 font-mono text-[11px] text-white"
        style={{ boxShadow: "2px 2px 0 0 rgba(0,0,0,0.5)" }}
      >
        {agents.length} STAFF
      </div>

      <div className="flex flex-wrap gap-3 mt-2">
        {visible.map((a) => (
          <Desk key={a.id} agent={a} onClick={onDeskClick} />
        ))}
        {overflow > 0 && (
          <div
            className="flex flex-col items-center justify-center bg-[#1f2937] border-4 border-gray-600 text-gray-300 font-mono text-[11px]"
            style={{ width: 100, minHeight: 100, boxShadow: "3px 3px 0 0 #4b5563" }}
            title={`${overflow} more agents not shown`}
          >
            <div className="text-2xl">+{overflow}</div>
            <div className="text-[9px] mt-1 tracking-wider">MORE</div>
          </div>
        )}
        {visible.length === 0 && placeholders.length === 0 && <EmptyDesk label="vacant" />}
        {placeholders.map((p) => (
          <EmptyDesk key={p} label={p} />
        ))}
      </div>
    </div>
  );
}

function formatDuration(startIso: string, endIso: string | null): string {
  if (!startIso) return "-";
  const s = new Date(startIso).getTime();
  const e = endIso ? new Date(endIso).getTime() : Date.now();
  const sec = Math.max(0, (e - s) / 1000);
  if (sec < 60) return `${sec.toFixed(1)}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ${Math.floor(sec % 60)}s`;
  return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`;
}

function formatTimeHHMMSS(iso: string): string {
  if (!iso) return "--:--:--";
  const d = new Date(iso);
  return d.toLocaleTimeString("en-GB", { hour12: false });
}

function AgentDetailModal({ agent, onClose }: { agent: Agent; onClose: () => void }) {
  const [events, setEvents] = useState<DashboardEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const displayName = agent.name || agent.subagent_type || "(agent)";
  const emoji = emojiForAgent(agent);
  const st = statusStyle(agent.status);
  const deptId = classify(agent);
  const otherDept = DEPARTMENTS[DEPARTMENTS.length - 1]!;
  const dept: Department = DEPARTMENTS.find((d) => d.id === deptId) ?? otherDept;
  const role = getAgentRole(agent, dept);

  const loadEvents = useCallback(async () => {
    try {
      // Fetch session events, then filter to this agent
      const res = await api.events.list({ session_id: agent.session_id, limit: 200 });
      const mine = res.events.filter((e) => e.agent_id === agent.id);
      setEvents(mine);
    } finally {
      setLoadingEvents(false);
    }
  }, [agent.id, agent.session_id]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  // Live update on WS events
  useEffect(() => {
    return eventBus.subscribe((msg) => {
      if (msg.type === "new_event" || msg.type === "agent_updated") {
        if (agent.status === "working" || agent.status === "connected") {
          loadEvents();
        }
      }
    });
  }, [agent.id, agent.status, loadEvents]);

  const task = agent.task || "";
  const currentTool = agent.current_tool || "";
  const parentText = agent.parent_agent_id ? `親: ${agent.parent_agent_id.slice(0, 8)}` : "ルートエージェント";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col bg-[#0f172a] border-4 border-black"
        style={{
          boxShadow: "8px 8px 0 0 rgba(0,0,0,0.7), inset 0 0 0 2px rgba(255,255,255,0.1)",
          imageRendering: "pixelated",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header bar */}
        <div
          className={`flex items-start gap-3 p-4 border-b-4 border-black ${st.ring}`}
          style={{ background: "linear-gradient(180deg, #1e293b 0%, #0f172a 100%)" }}
        >
          <div className="text-5xl leading-none drop-shadow-[2px_2px_0_rgba(0,0,0,0.8)]">
            {emoji}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-mono font-bold text-lg text-white truncate" title={displayName}>
              {displayName}
            </div>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className={`px-2 py-0.5 border-2 border-black font-mono text-[10px] ${st.labelColor} bg-black/50`}>
                {st.label}
              </span>
              <span className="text-[11px] text-gray-400 font-mono">
                type: {agent.type}
              </span>
              {agent.subagent_type && (
                <span className="text-[11px] text-gray-400 font-mono">
                  · {agent.subagent_type}
                </span>
              )}
            </div>
            <div className="text-[10px] text-gray-500 font-mono mt-1">{parentText}</div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 flex items-center justify-center bg-rose-500 border-4 border-black text-white hover:bg-rose-400"
            style={{ boxShadow: "3px 3px 0 0 rgba(0,0,0,0.7)" }}
            title="閉じる"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 font-mono text-[12px] text-gray-200">
          {/* TASK (primary info — what this agent was actually asked to do) */}
          {task && (
            <Panel title="🎯 実行中タスク（実態）" color="border-amber-500/80">
              <div className="text-amber-100 whitespace-pre-wrap break-words text-[12px] leading-relaxed max-h-40 overflow-y-auto">
                {task}
              </div>
              {currentTool && agent.status === "working" && (
                <div className="mt-2 pt-2 border-t border-amber-500/30 text-[11px]">
                  <span className="text-amber-400/70">使用中ツール: </span>
                  <span className="text-emerald-300 font-bold">{currentTool}</span>
                </div>
              )}
            </Panel>
          )}

          {/* Role (department + specific) */}
          <div
            className={`border-4 border-black p-3`}
            style={{
              background: dept.wallColor,
              boxShadow: "4px 4px 0 0 rgba(0,0,0,0.6)",
            }}
          >
            <div className="flex items-center gap-2 mb-2">
              <span className="text-2xl leading-none">{dept.emoji}</span>
              <span className="text-white font-bold text-[13px] tracking-wider">
                {dept.nameJa}
              </span>
              <span className="text-white/60 text-[10px]">({dept.name})</span>
            </div>
            <div className="text-white text-[12px] leading-relaxed bg-black/30 border-2 border-black/50 p-2 whitespace-pre-wrap">
              <div className="text-[10px] text-white/60 mb-1 tracking-wider">役割 ROLE:</div>
              {role}
            </div>
          </div>

          {/* Timing */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <StatCell label="開始" value={formatTimeHHMMSS(agent.started_at)} icon={<Clock className="w-3 h-3" />} />
            <StatCell label="終了" value={agent.ended_at ? formatTimeHHMMSS(agent.ended_at) : "(稼働中)"} icon={<Clock className="w-3 h-3" />} />
            <StatCell label="経過" value={formatDuration(agent.started_at, agent.ended_at)} icon={<ActivityIcon className="w-3 h-3" />} />
            <StatCell label="ツール呼出" value={`${events.filter(e => e.tool_name).length} 回`} icon={<Wrench className="w-3 h-3" />} />
          </div>

          {/* Event timeline */}
          <Panel
            title={`📜 ツール呼び出し履歴 (${events.length} 件)`}
            color="border-violet-500/60"
          >
            {loadingEvents ? (
              <div className="text-gray-500 text-[11px]">Loading events...</div>
            ) : events.length === 0 ? (
              <div className="text-gray-500 text-[11px] italic">このエージェントのイベント記録なし</div>
            ) : (
              <div className="space-y-1.5 max-h-80 overflow-y-auto">
                {events.slice(0, 50).map((e) => {
                  const isPre = e.event_type === "PreToolUse";
                  const isPost = e.event_type === "PostToolUse";
                  const tColor = isPre ? "text-sky-300" : isPost ? "text-emerald-300" : "text-gray-400";
                  return (
                    <div
                      key={e.id}
                      className="flex items-start gap-2 border-l-2 border-gray-700 pl-2 py-1"
                    >
                      <span className="text-[10px] text-gray-500 font-mono mt-0.5 shrink-0">
                        {formatTimeHHMMSS(e.created_at)}
                      </span>
                      <span className={`text-[11px] font-bold ${tColor} shrink-0 w-[90px]`}>
                        {e.event_type}
                      </span>
                      {e.tool_name && (
                        <span className="text-[11px] text-amber-200 font-semibold shrink-0">
                          {e.tool_name}
                        </span>
                      )}
                      {e.summary && (
                        <span className="text-[11px] text-gray-300 truncate">{e.summary}</span>
                      )}
                    </div>
                  );
                })}
                {events.length > 50 && (
                  <div className="text-[10px] text-gray-500 text-center pt-2">
                    ... {events.length - 50} 件省略
                  </div>
                )}
              </div>
            )}
          </Panel>

          {/* Raw metadata */}
          {agent.metadata && (
            <Panel title="🧾 メタデータ (raw)" color="border-gray-600/60">
              <pre className="text-[10px] text-gray-400 whitespace-pre-wrap break-words overflow-x-auto max-h-40">
                {agent.metadata}
              </pre>
            </Panel>
          )}

          {/* IDs */}
          <div className="pt-2 border-t-2 border-gray-800 text-[10px] text-gray-600 space-y-0.5">
            <div>agent_id: {agent.id}</div>
            <div>session_id: {agent.session_id}</div>
            {agent.parent_agent_id && <div>parent_id: {agent.parent_agent_id}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCell({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="bg-[#1f2937] border-2 border-gray-700 px-2 py-1.5" style={{ boxShadow: "2px 2px 0 0 rgba(0,0,0,0.5)" }}>
      <div className="flex items-center gap-1 text-[9px] text-gray-500 uppercase tracking-wider">
        {icon}
        {label}
      </div>
      <div className="text-[12px] text-gray-100 font-bold mt-0.5">{value}</div>
    </div>
  );
}

function Panel({ title, color, children }: { title: string; color: string; children: React.ReactNode }) {
  return (
    <div className={`border-l-4 ${color} bg-[#111827] p-3`}>
      <div className="text-[11px] text-gray-400 mb-2 font-bold tracking-wider">{title}</div>
      {children}
    </div>
  );
}

export function Office() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"all" | "active">("active");
  const [limitPerRoom, setLimitPerRoom] = useState(12);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.agents.list({ limit: 1000 });
      setAgents(res.agents);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    return eventBus.subscribe((msg) => {
      if (msg.type === "agent_created" || msg.type === "agent_updated") {
        load();
      }
    });
  }, [load]);

  // Apply status filter
  const filtered = useMemo(() => {
    if (statusFilter === "active") {
      return agents.filter((a) => a.status === "working" || a.status === "connected" || a.status === "idle" || a.status === "error");
    }
    return agents;
  }, [agents, statusFilter]);

  const byDept = useMemo(() => {
    const map: Record<DeptId, Agent[]> = {
      main: [],
      research: [],
      taskforce: [],
      maintenance: [],
      editorial: [],
      planning: [],
      architect: [],
      review: [],
      language: [],
      testing: [],
      build: [],
      quality: [],
      skill: [],
      ops: [],
      other: [],
    };
    for (const a of filtered) {
      map[classify(a)].push(a);
    }
    // Sort each dept: working first, then connected, idle, completed, error last
    const order: AgentStatus[] = ["working", "connected", "idle", "error", "completed"];
    for (const k of Object.keys(map) as DeptId[]) {
      map[k].sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status));
    }
    return map;
  }, [filtered]);

  const totals = {
    total: filtered.length,
    working: filtered.filter((a) => a.status === "working").length,
    idle: filtered.filter((a) => a.status === "idle").length,
    error: filtered.filter((a) => a.status === "error").length,
  };

  return (
    <div className="animate-fade-in">
      <style>{`
        @keyframes bob {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-3px); }
        }
        .office-title {
          font-family: 'Courier New', monospace;
          letter-spacing: 2px;
          text-shadow: 3px 3px 0 rgba(0,0,0,0.6);
        }
      `}</style>

      {/* Arcade title bar */}
      <div
        className="relative mb-6 p-5 border-4 border-black flex flex-wrap items-center justify-between gap-3"
        style={{
          background: "linear-gradient(180deg, #1e3a8a 0%, #0f172a 100%)",
          boxShadow: "6px 6px 0 0 rgba(0,0,0,0.5), inset 0 0 0 2px rgba(255,255,255,0.1)",
          imageRendering: "pixelated",
        }}
      >
        <div className="flex items-center gap-4">
          <div
            className="w-12 h-12 bg-amber-400 border-4 border-black flex items-center justify-center"
            style={{ boxShadow: "3px 3px 0 0 rgba(0,0,0,0.7)" }}
          >
            <Building2 className="w-6 h-6 text-black" />
          </div>
          <div>
            <h1 className="office-title text-xl font-bold text-white">🏢 AGENT OFFICE</h1>
            <p className="text-[11px] font-mono text-sky-200 mt-1 tracking-wider">
              STAFF: {totals.total} · WORKING: {totals.working} · IDLE: {totals.idle}
              {totals.error > 0 && ` · ERROR: ${totals.error}`}
            </p>
          </div>
        </div>
        <button
          onClick={load}
          className="px-4 py-2 bg-amber-400 border-4 border-black font-mono font-bold text-black text-sm hover:bg-amber-300 active:translate-x-[2px] active:translate-y-[2px]"
          style={{ boxShadow: "3px 3px 0 0 rgba(0,0,0,0.7)" }}
        >
          <RefreshCw className="w-4 h-4 inline mr-1" /> RELOAD
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6 items-center">
        <div className="flex font-mono text-[11px] border-2 border-gray-700 overflow-hidden">
          <button
            onClick={() => setStatusFilter("active")}
            className={`px-3 py-2 ${statusFilter === "active" ? "bg-amber-500 text-black" : "bg-[#1f2937] text-gray-300 hover:bg-gray-800"}`}
          >
            ACTIVE ONLY
          </button>
          <button
            onClick={() => setStatusFilter("all")}
            className={`px-3 py-2 ${statusFilter === "all" ? "bg-amber-500 text-black" : "bg-[#1f2937] text-gray-300 hover:bg-gray-800"}`}
          >
            ALL HISTORY
          </button>
        </div>

        <div className="flex font-mono text-[11px] border-2 border-gray-700 overflow-hidden">
          <span className="px-2 py-2 bg-[#0f172a] text-gray-400 tracking-wider">
            PER ROOM:
          </span>
          {[6, 12, 24, 48].map((n) => (
            <button
              key={n}
              onClick={() => setLimitPerRoom(n)}
              className={`px-3 py-2 ${limitPerRoom === n ? "bg-sky-500 text-black" : "bg-[#1f2937] text-gray-300 hover:bg-gray-800"}`}
            >
              {n}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-2 ml-auto font-mono text-[11px]">
          {[
            { color: "bg-emerald-400", label: "WORKING" },
            { color: "bg-sky-400", label: "CONNECTED" },
            { color: "bg-gray-300", label: "DONE" },
            { color: "bg-gray-500", label: "IDLE" },
            { color: "bg-rose-500", label: "ERROR" },
          ].map((s) => (
            <div
              key={s.label}
              className="flex items-center gap-2 px-2 py-1 bg-[#1f2937] border-2 border-gray-700"
            >
              <span className={`w-3 h-3 ${s.color} border border-black`} />
              <span className="text-gray-300 tracking-wider">{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Departments always visible */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {DEPARTMENTS.map((dept) => (
          <Room
            key={dept.id}
            dept={dept}
            agents={byDept[dept.id]}
            limit={limitPerRoom}
            onDeskClick={(a) => setSelectedAgent(a)}
          />
        ))}
      </div>

      {/* Agent detail modal */}
      {selectedAgent && (
        <AgentDetailModal
          agent={(agents.find((a) => a.id === selectedAgent.id) || selectedAgent)}
          onClose={() => setSelectedAgent(null)}
        />
      )}

      {/* Footer legend */}
      <div
        className="mt-8 p-4 bg-[#1f2937] border-2 border-gray-700 font-mono text-[11px] text-gray-400"
        style={{ boxShadow: "4px 4px 0 0 rgba(0,0,0,0.5)" }}
      >
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          <div>🪑 デスク = 1 エージェント</div>
          <div>🟢 緑の光 = 作業中 (Working)</div>
          <div>💭 吹き出し = 考え中</div>
          <div>🏛 看板 = 部署の担当領域</div>
          <div>🔵 青枠 = 接続中 (Connected)</div>
          <div>⚫ 灰 = 待機中 (Idle)</div>
          <div className="col-span-full mt-2 text-gray-500">
            フィルタ: ACTIVE ONLY = 現在稼働中 / ALL HISTORY = 全履歴
          </div>
          <div className="col-span-full text-gray-500">
            PER ROOM = 各部署の表示上限。超過分は +N MORE で示される
          </div>
        </div>
      </div>

      {loading && agents.length === 0 && (
        <div className="mt-6 text-center text-gray-500 text-xs font-mono">Loading staff list...</div>
      )}
    </div>
  );
}
