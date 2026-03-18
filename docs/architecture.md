# Ask Twice — 代码架构设计

> **版本**：v2.0 | **更新日期**：2026年3月18日

━━━━━━━━━━━━━━━━━━━━━

## 一、项目整体结构

```
asktwice/
│
├── docs/                         # 文档资料
│   ├── prd.md                    # 产品需求文档
│   ├── architecture.md           # 本文档
│   ├── competitive_analysis.md   # 竞品分析
│   ├── feasibility_analysis.md   # 可行性分析
│   ├── intro.md                  # 项目介绍
│   └── aurascape.md              # Aurascape 研究
│
├── extension/                    # Chrome 浏览器插件（前端）
│   ├── manifest.json             # Manifest V3 配置
│   ├── icons/                    # 插件图标
│   ├── popup/                    # 插件弹出页（最近验证 + 跳转 dashboard）
│   ├── dashboard.html / .js      # 验证历史独立页面
│   ├── content/                  # Content Script（注入到 AI 页面）
│   │   ├── index.js              # 入口：初始化 + 调度
│   │   ├── extractor.js          # AI 回答文本提取器
│   │   ├── platforms/            # 平台适配层
│   │   │   ├── config.js         # 平台 selector 配置表
│   │   │   ├── doubao.js         # 豆包适配
│   │   │   └── chatgpt.js        # ChatGPT 适配
│   │   ├── ui/                   # 注入页面的 UI 组件
│   │   │   ├── selection-bubble.js  # 划词验证气泡（核心交互入口）
│   │   │   ├── float-button.js      # 浮标按钮
│   │   │   └── result-card.js       # 内联结果卡片
│   │   └── styles/
│   │       └── inject.css        # 注入页面的全局样式
│   ├── background/
│   │   └── service-worker.js     # API 通信、缓存、用量管理
│   └── shared/                   # 前端共享模块
│       ├── api.js / storage.js / constants.js / utils.js
│
└── server/                       # 后端 API 服务
    ├── requirements.txt
    ├── .env / .env.example
    ├── main.py                   # FastAPI 入口
    ├── api/
    │   ├── verify.py             # POST /api/verify（核心验证）
    │   └── usage.py              # GET  /api/usage（用量查询）
    ├── services/                 # 核心业务逻辑
    │   ├── claim_analyzer.py     # 声明理解 + 补全 + 领域识别 ★ 新
    │   ├── cross_verifier.py     # LLM 交叉验证 ★ 新
    │   ├── source_verifier.py    # 来源验证（领域感知）
    │   ├── conflict_detector.py  # 利益冲突检测
    │   ├── score_calculator.py   # 综合评分（领域加权）
    │   └── llm_client.py         # LLM API 封装
    ├── models/
    │   ├── request.py            # VerifyRequest（含对话历史）
    │   └── response.py           # VerifyResponse（含领域/交叉验证）
    ├── config/
    │   └── settings.py           # 环境变量 + 权威域名配置
    └── utils/
        ├── cache.py              # 内存缓存
        └── search.py             # Brave Search API 封装
```

━━━━━━━━━━━━━━━━━━━━━

## 二、核心验证流程（v2.0 领域感知版）

```
用户在 AI 页面选中一段文字
       │
       ▼
前端收集：selectedText + 完整对话历史（最近 5 轮）
       │ chrome.runtime.sendMessage
       ▼
Service Worker: 缓存检查 → 调后端 API
       │ fetch POST /api/verify
       ▼
┌─────────────────────────────────────────────────┐
│  后端 verify.py 核心流程                          │
│                                                  │
│  ① 缓存检查（以 selected_text hash 为 key）       │
│     └── 命中 → 直接返回                           │
│                                                  │
│  ② claim_analyzer.py — 声明分析（1 次 LLM）       │
│     ├── 基于对话上下文补全选中内容为完整语义         │
│     ├── 多声明 → 拆分（最多 3 条）                 │
│     └── 每条声明 → 领域识别 + 严谨度 + 佐证类型     │
│                                                  │
│  ③ 并发执行（asyncio.gather）                     │
│     ├── source_verifier — 来源验证（按领域调分）    │
│     ├── cross_verifier — LLM 交叉验证（独立判断）  │
│     └── conflict_detector — 利益冲突检测           │
│                                                  │
│  ④ score_calculator — 综合评分                    │
│     ├── 搜索/交叉按 evidence_type 混合加权         │
│     ├── 各声明按 rigour 加权平均                   │
│     └── 利益冲突惩罚                              │
│                                                  │
│  ⑤ 缓存结果 + 返回                               │
└─────────────────────────────────────────────────┘
       │
       ▼
前端展示：浮窗卡片（领域标签 + 交叉验证 + 来源链接）
```

━━━━━━━━━━━━━━━━━━━━━

## 三、领域感知评分机制

### 3.1 领域识别

由 LLM 动态判断，不使用硬编码分类。返回：

| 字段 | 说明 | 示例 |
|------|------|------|
| `domain` | 知识领域（精确到子领域） | "临床医学-泌尿科" |
| `rigour` | 严谨度 1-10 | 8（医学高要求） |
| `evidence_type` | 佐证类型 | `authoritative` |
| `search_query` | 优化后的搜索词 | "前列腺钙化灶 饮水量 推荐" |

### 3.2 佐证类型与评分权重

| evidence_type | 适用领域 | 搜索权重 | 交叉权重 |
|---------------|---------|---------|---------|
| `authoritative` | 医学、法律、金融 | 70% | 30% |
| `empirical` | 科学、工程 | 60% | 40% |
| `consensus` | 编程实践、生活技巧 | 40% | 60% |
| `subjective` | 审美、偏好 | 20% | 80% |

### 3.3 来源验证动态参数

| 参数 | rigour ≥ 8 | 5-7 | ≤ 4 |
|------|-----------|------|------|
| 无来源默认分 | 15 | 25 | 40 |
| 权威度最低要求 | 4 | 3 | 2 |
| 权威度权重 | 70% | 60% | 40% |
| 匹配度权重 | 30% | 40% | 60% |

### 3.4 交叉验证（Ask Twice 核心理念）

独立的 LLM 调用，**不给它看原始 AI 回答**，只给：
- 用户的原始问题
- 要验证的声明
- 所属领域

返回：是否认同 + 置信度 + 修正建议 + 推理过程

━━━━━━━━━━━━━━━━━━━━━

## 四、数据模型（v2.0）

### 4.1 请求

```python
class ConversationMessage(BaseModel):
    role: str       # "user" | "assistant"
    content: str

class VerifyRequest(BaseModel):
    text: str = ""                    # AI 回答原文（兼容旧请求）
    selected_text: str = ""           # 用户选中的文字
    conversation: list[ConversationMessage] = []  # 对话历史
    platform: str = "unknown"
    language: str = "zh"
    depth: str = "standard"
    features: list[str] = ["source_verify", "conflict_detect", "cross_verify"]
```

### 4.2 响应

```python
class ClaimResult(BaseModel):
    id: int
    text: str                       # 补全后的完整声明
    original_text: str = ""         # 用户原始选中
    type: str = "fact"
    domain: str = ""                # 领域
    rigour: int = 5                 # 严谨度 1-10
    evidence_type: str = "consensus"
    score: int = 50
    reason: str = ""
    sources: list[SourceInfo] = []
    cross_check: CrossCheckResult = CrossCheckResult()

class CrossCheckResult(BaseModel):
    agrees: bool = True
    confidence: int = 50
    correction: str = ""
    reasoning: str = ""
```

━━━━━━━━━━━━━━━━━━━━━

## 五、前端划词验证交互

```
用户在 AI 页面选中文字 (≥5 字)
       │
       ▼ mouseup 事件
selection-bubble.js:
  1. 收集 selectedText
  2. 遍历聊天列表收集对话历史（最近 5 轮）
  3. 在鼠标释放位置显示 Ask Twice 图标
       │
       ▼ 用户点击图标
  4. 发送 VERIFY_REQUEST 消息（含 text + selectedText + conversation）
       │
       ▼ service-worker.js
  5. 缓存检查 → 调后端 → 缓存结果
  6. 返回 VERIFY_RESULT
       │
       ▼
  7. 显示浮窗结果卡片
     ├── 综合评分 + 等级颜色
     ├── 各声明: 领域标签 + 分数 + 理由 + 交叉验证
     └── 来源链接（可点击跳转）
  8. 保存到验证历史（chrome.storage.local）
```

━━━━━━━━━━━━━━━━━━━━━

## 六、技术栈

| 组件 | 技术 |
|------|------|
| 浏览器插件 | Chrome Extension Manifest V3 |
| 后端框架 | Python FastAPI + Uvicorn |
| LLM | OpenAI GPT-4o-mini（via modelverse.cn） |
| 搜索 | Brave Search API |
| 缓存 | 内存 dict（前后端各一层） |
| 部署 | localhost:8001（开发环境） |

━━━━━━━━━━━━━━━━━━━━━

## 七、关键设计决策

| # | 决策 | 理由 |
|---|------|------|
| 1 | 声明理解+领域识别合并一次 LLM | 减少延迟和成本 |
| 2 | 按领域动态调整评分标准 | 医学/法律要求权威来源，生活建议可放宽 |
| 3 | LLM 交叉验证不给原文 | 保证独立性，避免被原始回答引导 |
| 4 | 搜索/交叉按 evidence_type 加权 | 主观性强的领域交叉验证更有价值 |
| 5 | 对话历史最多 5 轮 | 平衡 token 消耗和上下文完整性 |
| 6 | 端口 8001 | 避免与其他本地服务端口冲突 |
