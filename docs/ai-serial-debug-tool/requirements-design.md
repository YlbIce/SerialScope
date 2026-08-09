# AI智能串口调试工具 —— 需求规划书 & 方案设计书

> 本文档是用户提供的产品愿景与总体设计锚点（2026-08-09 归档为仓库需求/设计基线）。
> 它用于指导后续增量变更，不替代 `changes/<change-id>/` 中任何具体 L2/L3 变更包。
> 归档动作为 L0（文档落库）；具体功能的实现、验收、证据与审核按 AGENTS.md 分档流程进行。

---

## 第一部分：需求规划书

### 1. 项目概述

**项目名称**：AI智能串口调试工具（AI-Powered Serial Debug Tool）

**项目背景**：当前嵌入式开发、物联网设备调试过程中，工程师需要手动完成规约解析、命令构造、校验计算、数据解读等重复性工作，效率低下且易出错。随着大语言模型能力的成熟，将AI能力引入串口调试工具，可实现从"人工操作"到"智能辅助"的范式升级。

**项目愿景**：打造一款AI原生的串口调试工具，让工程师用自然语言描述调试需求，工具自动完成规约解析、命令生成、数据解析与命名，大幅提升调试效率。

### 2. 目标用户

| 用户类型 | 典型场景 | 核心诉求 |
|---------|---------|---------|
| 嵌入式工程师 | 调试MCU/外设通信协议 | 快速解析规约、自动生成测试命令 |
| 物联网开发者 | 调试IoT设备AT指令/Modbus | 自动计算校验、可视化数据解析 |
| 硬件测试工程师 | 批量设备功能验证 | 自动化命令序列、回归测试 |
| 技术支持工程师 | 现场故障排查 | 快速理解未知协议、智能诊断 |

### 3. 功能性需求

#### 3.1 基础串口通信功能（P0）

| 需求编号 | 需求描述 | 优先级 |
|---------|---------|--------|
| F-001 | 自动枚举并显示可用串口列表 | P0 |
| F-002 | 支持配置波特率、数据位、停止位、校验位、流控 | P0 |
| F-003 | 支持打开/关闭串口连接 | P0 |
| F-004 | 支持HEX和文本两种模式的数据收发 | P0 |
| F-005 | 支持数据收发日志的记录与导出 | P1 |
| F-006 | 支持多串口会话管理 | P2 |

#### 3.2 AI智能规约解析功能（P0）

| 需求编号 | 需求描述 | 优先级 |
|---------|---------|--------|
| F-007 | 用户可输入/上传规约文档（文本/Markdown/PDF） | P0 |
| F-008 | AI自动提取帧头、帧尾、长度域、命令域、数据域、校验域的位置与格式 | P0 |
| F-009 | AI自动识别校验算法类型（CRC8/CRC16/CRC32/校验和/XOR等） | P0 |
| F-010 | 系统根据AI解析结果自动生成分帧配置，实现自适应分帧 | P0 |
| F-011 | 支持用户对AI解析结果进行人工校正与确认 | P1 |

#### 3.3 AI自动生成命令列表功能（P0）

| 需求编号 | 需求描述 | 优先级 |
|---------|---------|--------|
| F-012 | AI根据规约自动生成完整的读写命令列表 | P0 |
| F-013 | 用户可通过自然语言描述生成特定命令（如"生成读取温度的指令"） | P0 |
| F-014 | 每条命令自动关联对应的响应解析模板 | P1 |
| F-015 | 支持将常用命令保存为命令集，便于复用 | P1 |

#### 3.4 自动校验计算功能（P0）

| 需求编号 | 需求描述 | 优先级 |
|---------|---------|--------|
| F-016 | 发送数据时自动计算并填充校验字段 | P0 |
| F-017 | 接收数据时自动验证校验字段的正确性 | P0 |
| F-018 | 支持多种校验算法（CRC8/CRC16-Modbus/CRC32/校验和/XOR/LRC） | P0 |
| F-019 | 支持用户自定义校验算法（脚本方式） | P2 |

#### 3.5 自动数据命名与解析功能（P0）

| 需求编号 | 需求描述 | 优先级 |
|---------|---------|--------|
| F-020 | AI自动为数据帧中的每个字段分配有意义的名称 | P0 |
| F-021 | 接收数据时自动按字段名称解析并展示 | P0 |
| F-022 | 支持结构化展示（表格/树形/JSON格式） | P1 |
| F-023 | 支持将解析结果导出为CSV/JSON | P2 |

#### 3.6 AI交互与辅助功能（P1）

| 需求编号 | 需求描述 | 优先级 |
|---------|---------|--------|
| F-024 | 支持自然语言交互（如"帮我分析这个日志有什么异常"） | P1 |
| F-025 | AI自动检测通信异常并给出诊断建议 | P1 |
| F-026 | 支持会话录制与回放 | P2 |
| F-027 | 支持多轮对话上下文记忆 | P1 |

### 4. 非功能性需求

| 需求编号 | 需求描述 | 指标 |
|---------|---------|------|
| NF-001 | 跨平台支持 | Windows 10+、macOS 11+、Ubuntu 20.04+ |
| NF-002 | 串口通信实时性 | 数据收发延迟 < 10ms |
| NF-003 | AI推理响应时间 | 规约解析 < 30s，命令生成 < 10s |
| NF-004 | 支持同时管理 | ≥ 4个串口会话 |
| NF-005 | 数据安全性 | 串口数据不上传云端（AI调用可选用本地模型或API） |
| NF-006 | 可扩展性 | 支持插件机制扩展协议解析器 |
| NF-007 | 易用性 | 新用户10分钟内完成首次规约配置 |

### 5. 约束与限制

- **架构约束**：C++后端 + Electron前端（已有框架）
- **AI模型**：优先支持本地部署模型（如Ollama/llama.cpp）和云端API（DeepSeek/Claude/GPT）
- **串口库**：C++后端使用CSerialPort，Electron通过Node.js原生模块调用
- **MCP协议**：可选支持MCP（Model Context Protocol），使AI助手可直接操控串口

---

## 第二部分：方案设计书

### 1. 总体架构

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            Electron 前端 (Renderer)                         │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐      │
│  │ 串口控制面板  │ │ 数据收发视图  │ │ 规约配置界面  │ │ AI对话面板   │      │
│  └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘      │
│  ┌──────────────────────────────────────────────────────────────────┐      │
│  │              状态管理 (Zustand/Redux)                            │      │
│  └──────────────────────────────────────────────────────────────────┘      │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │ IPC (inter-process communication)
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            Electron 主进程 (Main)                           │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐      │
│  │ IPC Handler  │ │ MCP Server   │ │ 会话管理器   │ │ 日志管理器   │      │
│  └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘      │
│  ┌──────────────────────────────────────────────────────────────────┐      │
│  │              Node.js Addon (C++ Native Module)                   │      │
│  └──────────────────────────────────────────────────────────────────┘      │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │ N-API / FFI
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            C++ 后端 (Native Layer)                         │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐      │
│  │ 串口驱动层   │ │ 协议解析引擎  │ │ 校验计算引擎  │ │ AI适配层    │      │
│  │ (CSerialPort)│ │ (分帧/字段)   │ │ (CRC/校验和) │ │ (API调用)   │      │
│  └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘      │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐                      │
│  │ 命令管理器   │ │ 数据缓存     │ │ 配置持久化   │                      │
│  └──────────────┘ └──────────────┘ └──────────────┘                      │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │ HTTP / WebSocket
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            AI 服务层                                        │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐                      │
│  │ 本地LLM      │ │ 云端API      │ │ RAG检索增强  │                      │
│  │ (Ollama)     │ │ (DeepSeek等) │ │ (规约向量库) │                      │
│  └──────────────┘ └──────────────┘ └──────────────┘                      │
└─────────────────────────────────────────────────────────────────────────────┘
```

**架构说明**：

- **分层设计**：前端展示层（Electron Renderer）、主进程层（Electron Main）、原生层（C++ Native）、AI服务层
- **进程隔离**：串口读写等I/O密集型操作在C++层完成，UI渲染在Electron层，互不阻塞
- **通信机制**：前端与主进程通过IPC通信，主进程与C++后端通过N-API/FFI调用
- **AI集成**：支持MCP协议标准，可与Claude Desktop、Cursor等MCP客户端无缝对接

### 2. 模块详细设计

#### 2.1 C++后端模块

**2.1.1 串口驱动层（Serial Driver）**

- **技术选型**：CSerialPort跨平台串口库
- **核心功能**：
  - 串口枚举（跨平台：Windows COMx、Linux /dev/tty*、macOS /dev/cu.*）
  - 串口打开/关闭/重配置
  - 异步读写（事件驱动/非阻塞）
  - 状态监控（连接状态、错误状态）
- **接口设计**：
```cpp
class SerialDriver {
public:
    std::vector<PortInfo> enumeratePorts();
    bool open(const PortConfig& config);
    void close();
    bool write(const std::vector<uint8_t>& data);
    size_t read(std::vector<uint8_t>& buffer, size_t maxLen);
    void setReadCallback(ReadCallback callback);
    PortStatus getStatus();
};
```

**2.1.2 协议解析引擎（Protocol Parser）**

- **核心功能**：
  - 基于AI生成的配置文件进行自适应分帧
  - 支持"特征码+动态帧长"双重识别机制
  - 字段提取与类型转换（整型/浮点/BCD/ASCII等）
  - 帧缓存与粘包处理
- **分帧配置结构**：
```cpp
struct FrameConfig {
    std::vector<uint8_t> header;        // 帧头特征码
    std::vector<uint8_t> footer;        // 帧尾特征码（可选）
    int lengthFieldOffset;              // 长度域偏移
    int lengthFieldSize;                // 长度域字节数
    bool lengthIncludesHeader;          // 长度是否包含头
    int minFrameSize;                   // 最小帧长
    int maxFrameSize;                   // 最大帧长
    ChecksumType checksumType;          // 校验类型
    int checksumOffset;                 // 校验域偏移
    std::vector<FieldDef> fields;       // 字段定义列表
};
```
- **字段定义结构**：
```cpp
struct FieldDef {
    std::string name;                   // 字段名称（AI生成）
    int offset;                         // 偏移量
    int size;                           // 字节数
    FieldType type;                     // uint8/uint16/uint32/float/string/bcd
    Endianness endian;                  // 大小端
    std::string unit;                   // 单位（AI生成）
    double scale;                       // 缩放系数
};
```

**2.1.3 校验计算引擎（Checksum Engine）**

- **支持的校验算法**：
  - CRC8（多种多项式）
  - CRC16（Modbus、CCITT、XMODEM等）
  - CRC32
  - 累加和（8位/16位）
  - XOR校验
  - LRC（纵向冗余校验）
- **接口设计**：
```cpp
class ChecksumEngine {
public:
    std::vector<uint8_t> calculate(const std::vector<uint8_t>& data,
                                    ChecksumType type);
    bool verify(const std::vector<uint8_t>& frame,
                ChecksumType type, int offset);
    std::vector<ChecksumType> getSupportedTypes();
};
```

**2.1.4 命令管理器（Command Manager）**

- **核心功能**：
  - 存储AI生成的命令列表
  - 命令模板管理（增删改查）
  - 命令参数化（支持变量替换）
  - 命令序列执行（支持延时、条件跳转）
- **命令结构**：
```cpp
struct Command {
    std::string id;
    std::string name;                   // 命令名称（AI生成）
    std::string description;            // 描述（AI生成）
    std::vector<uint8_t> frameTemplate; // 帧模板（含占位符）
    std::vector<CommandParam> params;   // 参数定义
    ResponseTemplate response;          // 响应模板
    bool autoVerify;                    // 是否自动校验响应
};
```

**2.1.5 AI适配层（AI Adapter）**

- **核心功能**：
  - 与AI服务通信（HTTP/REST或WebSocket）
  - 规约文本的预处理与上下文构建
  - AI响应的解析与结构化转换
  - 支持流式响应（SSE）
- **接口设计**：
```cpp
class AIAdapter {
public:
    // 规约解析
    ParseResult parseProtocol(const std::string& protocolText);
    // 命令生成
    std::vector<Command> generateCommands(const ParseResult& protocol);
    // 字段命名
    std::vector<FieldDef> nameFields(const FrameConfig& config);
    // 自然语言交互
    std::string chat(const std::string& userInput, const SessionContext& ctx);
};
```

**2.1.6 配置持久化（Config Persistence）**

- 使用SQLite或JSON文件存储：
  - 设备规约配置（按设备型号索引）
  - 命令集（可导出/导入）
  - 用户偏好设置
  - 通信历史记录

#### 2.2 Electron主进程模块

**2.2.1 IPC Handler**

- 管理渲染进程与主进程之间的通信通道
- 定义标准化的IPC消息协议
- 处理请求的路由与响应

**2.2.2 MCP Server（可选增强）**

- 实现Model Context Protocol标准
- 将串口能力暴露为MCP工具
- 支持AI助手（Claude Desktop、Cursor等）直接操控串口
- **MCP工具列表**（参考ser2mcp设计）：
  - `list_ports`：枚举串口
  - `open_connection`：打开串口
  - `send_data`：发送数据
  - `read_data`：读取数据
  - `send_and_expect`：发送并等待响应
  - `configure_connection`：重配置

**2.2.3 会话管理器**

- 管理多个串口会话（每个会话独立）
- 会话状态跟踪
- 会话间数据隔离

**2.2.4 日志管理器**

- 收发数据的记录与存储
- 日志的筛选与检索
- 日志导出（TXT/CSV/JSON）

#### 2.3 Electron前端模块

**2.3.1 技术选型**

| 组件 | 选型 | 说明 |
|------|------|------|
| UI框架 | React / Vue 3 | 根据现有技术栈 |
| 状态管理 | Zustand / Pinia | 轻量级状态管理 |
| 样式 | Tailwind CSS / Ant Design | |
| 图表 | ECharts / Chart.js | 数据可视化（波形图） |
| 终端 | xterm.js | 日志终端显示 |

**2.3.2 核心界面**

1. **串口控制面板**：端口选择、参数配置、连接控制
2. **数据收发视图**：
   - 发送区（支持HEX/文本切换、命令快捷按钮）
   - 接收区（原始数据+解析数据分栏显示）
3. **规约配置界面**：
   - 规约文本输入/上传区
   - AI解析进度与结果展示
   - 解析结果人工校正界面
4. **AI对话面板**：
   - 自然语言输入
   - AI响应展示
   - 上下文对话管理
5. **命令管理面板**：
   - 命令列表展示
   - 命令编辑与参数配置
   - 一键发送

### 3. AI集成方案

#### 3.1 AI调用流程

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  用户输入   │────▶│  提示词工程  │────▶│  AI模型调用 │────▶│  结果解析   │
│ 规约文本    │     │  (上下文构建) │     │  (API/本地) │     │  (结构化)   │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
                                                                      │
                                                                      ▼
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  配置生效   │◀────│  用户确认   │◀────│  结果展示   │◀────│  配置生成   │
│  (应用配置) │     │  (校正/确认) │     │  (可视化)   │     │  (JSON配置) │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
```

#### 3.2 AI提示词设计（核心）

**规约解析提示词模板**：

```
你是一个专业的串口通信协议解析专家。请分析以下协议规约文本，提取关键信息并以JSON格式输出。

规约文本：
{protocol_text}

请输出以下JSON结构：
{
  "frame_format": {
    "header": [帧头字节序列，如 [0xAA, 0x55]],
    "footer": [帧尾字节序列，如无则为null],
    "length_field": {"offset": 长度域偏移, "size": 长度域字节数, "includes_header": true/false},
    "min_size": 最小帧长,
    "max_size": 最大帧长
  },
  "checksum": {
    "type": "CRC16_MODBUS|CRC8|XOR|SUM|LRC|NONE",
    "offset": 校验域偏移,
    "size": 校验域字节数
  },
  "fields": [
    {"name": "字段名", "offset": 偏移, "size": 字节数, "type": "uint8|uint16|uint32|float|string|bcd", "endian": "little|big", "unit": "单位", "description": "描述"}
  ],
  "commands": [
    {"name": "命令名", "code": [命令码字节], "description": "描述", "response_fields": ["响应字段列表"]}
  ]
}
```

**命令生成提示词模板**：

```
基于以下协议规约，生成完整的读写命令列表。每个命令需包含命令名称、命令码、参数列表、预期响应格式。

规约信息：
{protocol_json}

请输出命令列表JSON。
```

#### 3.3 AI模型选型

| 部署方式 | 推荐模型 | 适用场景 |
|---------|---------|---------|
| 本地部署 | DeepSeek-R1-Distill-Qwen-7B / Llama 3.1 8B | 数据敏感、离线环境 |
| 云端API | DeepSeek API / Claude API / GPT-4 | 解析精度要求高 |
| 混合模式 | 本地轻量模型+云端大模型 | 平衡成本与效果 |

#### 3.4 RAG增强（可选）

- 将常见协议（Modbus、AT指令、自定义协议等）的规约文档向量化
- 构建规约知识库
- 解析时检索相似规约作为Few-shot示例

### 4. 数据流设计

#### 4.1 数据发送流程

```
用户操作（点击命令/输入数据）
    ↓
前端构造发送请求（含命令ID或原始数据）
    ↓
IPC → 主进程
    ↓
C++后端接收请求
    ↓
命令管理器查找命令模板（如适用）
    ↓
参数填充 → 完整帧组装
    ↓
校验计算引擎 → 填充校验字段
    ↓
串口驱动 → 发送数据
    ↓
结果返回 → 前端展示
```

#### 4.2 数据接收流程

```
串口硬件 → 数据到达
    ↓
串口驱动（事件驱动/非阻塞读）
    ↓
环形缓冲区
    ↓
协议解析引擎 → 分帧检测（特征码+长度域）
    ↓
校验验证 → 通过/失败
    ↓
字段解析 → 按字段定义提取数据
    ↓
数据命名 → 字段名称映射
    ↓
结构化数据 → 前端展示（原始HEX + 解析结果）
    ↓
（可选）AI分析 → 异常检测/智能诊断
```

### 5. 接口设计

#### 5.1 C++ → Electron（N-API接口）

```cpp
// 暴露给Node.js的接口
Napi::Object Init(Napi::Env env, Napi::Object exports) {
    exports.Set("enumeratePorts", Napi::Function::New(env, EnumeratePorts));
    exports.Set("openPort", Napi::Function::New(env, OpenPort));
    exports.Set("closePort", Napi::Function::New(env, ClosePort));
    exports.Set("writeData", Napi::Function::New(env, WriteData));
    exports.Set("readData", Napi::Function::New(env, ReadData));
    exports.Set("parseProtocol", Napi::Function::New(env, ParseProtocol));
    exports.Set("generateCommands", Napi::Function::New(env, GenerateCommands));
    exports.Set("calculateChecksum", Napi::Function::New(env, CalculateChecksum));
    exports.Set("applyConfig", Napi::Function::New(env, ApplyConfig));
    return exports;
}
```

#### 5.2 Electron主进程 ↔ 渲染进程（IPC协议）

```typescript
// IPC消息类型定义
interface IPCMessage {
  type: 'SERIAL_LIST' | 'SERIAL_OPEN' | 'SERIAL_WRITE' | 'SERIAL_READ' |
        'PROTOCOL_PARSE' | 'COMMAND_GENERATE' | 'AI_CHAT' |
        'CONFIG_SAVE' | 'CONFIG_LOAD';
  payload: any;
  requestId: string;
}

interface IPCResponse {
  requestId: string;
  success: boolean;
  data?: any;
  error?: string;
}
```

#### 5.3 AI服务接口（HTTP）

```typescript
// AI服务API
interface AIAPI {
  // 规约解析
  POST /api/parse-protocol
  Request: { protocolText: string; context?: string }
  Response: { frameConfig: FrameConfig; fields: FieldDef[]; confidence: number }

  // 命令生成
  POST /api/generate-commands
  Request: { protocolConfig: ProtocolConfig; userPrompt?: string }
  Response: { commands: Command[] }

  // 自然语言对话
  POST /api/chat
  Request: { message: string; sessionId: string; context: SessionContext }
  Response: { reply: string; actions?: Action[] }
}
```

### 6. 技术栈总览

| 层级 | 技术选型 | 说明 |
|------|---------|------|
| 前端框架 | Electron + React/Vue | 跨平台桌面应用 |
| 前端状态 | Zustand/Pinia | 轻量状态管理 |
| UI组件 | Ant Design / TDesign | 企业级组件库 |
| 串口库(C++) | CSerialPort | 轻量级跨平台串口库 |
| Node.js绑定 | N-API / node-addon-api | 稳定的ABI接口 |
| 校验算法 | 自研CRC/校验和库 | 支持多种算法 |
| AI集成 | HTTP/REST + SSE | 支持流式响应 |
| MCP协议 | 自研MCP Server | 可选，增强AI集成 |
| 配置存储 | SQLite / JSON | 本地持久化 |
| 日志 | spdlog (C++) / winston (Node) | 结构化日志 |
| 构建工具 | CMake (C++) / Vite (前端) | 跨平台构建 |

### 7. 开发计划

| 阶段 | 周期 | 里程碑 | 交付物 |
|------|------|--------|--------|
| 阶段一：基础框架 | 4周 | 完成Electron+ C++通信框架搭建 | 可运行的Hello World应用 |
| 阶段二：串口通信 | 3周 | 串口枚举、打开、读写功能 | 基础串口调试功能 |
| 阶段三：校验引擎 | 2周 | 多种校验算法实现 | 校验计算与验证模块 |
| 阶段四：AI集成 | 4周 | 规约解析、命令生成、字段命名 | AI智能解析功能 |
| 阶段五：协议解析引擎 | 3周 | 自适应分帧、字段解析 | 完整协议解析能力 |
| 阶段六：前端界面 | 4周 | 全部UI界面开发 | 完整可视化界面 |
| 阶段七：MCP Server | 2周 | MCP协议实现 | AI助手集成能力 |
| 阶段八：测试与优化 | 3周 | 功能测试、性能优化 | 稳定可用版本 |

**总计：约25周（6个月）**

### 8. 风险与应对

| 风险 | 影响 | 应对措施 |
|------|------|---------|
| AI解析规约准确率不足 | 核心功能不可用 | 引入人工校正环节；提供Few-shot示例；支持多轮对话澄清 |
| 大模型幻觉导致错误配置 | 设备通信异常 | 沙箱测试机制；配置生效前用户确认 |
| AI推理延迟影响体验 | 用户体验差 | 采用流式响应；解析结果缓存；本地轻量模型加速 |
| 串口实时性不足 | 高速数据丢包 | 环形缓冲+事件驱动；C++层处理I/O |
| 跨平台兼容性问题 | 部分平台不可用 | CSerialPort已支持主流平台；充分测试 |

### 9. 总结

本方案基于C++后端 + Electron前端架构，通过集成大语言模型能力，实现了一个AI智能串口调试工具的完整设计。核心创新点在于：

1. **AI驱动的规约解析**：将自然语言描述的协议规约自动转化为结构化的分帧配置
2. **智能命令生成**：根据规约自动生成完整的读写命令列表
3. **自动校验计算**：多种校验算法自动适配与计算
4. **智能数据命名**：为原始数据自动赋予有意义的字段名称
5. **MCP协议支持**：使AI助手可直接操控串口设备
