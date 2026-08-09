# Tasks: add-device-test-workbench

## 场景—验证映射

| 验收场景 | 测试/检查名 | 命令或步骤 | 缺口/失败可见现象 |
| --- | --- | --- | --- |
| 流程图与宏节点编辑 | React Flow 生产 UI | 节点/边创建、保存、重载 | 节点、条件边或宏引用丢失。 |
| 条件读写成功 | COM10/COM11 + 模拟对端 | 新增 `npm run test:device-workbench` | 条件分支、步骤结果或报告错误。 |
| 双实例模拟下位机 | 可见工作台 + 子 Electron + COM10/COM11 | `npm run test:workbench-dual-simulator` | 子实例未就绪、半帧未聚合、无 RX 应答或流程失败。 |
| 规则/变量/循环安全 | 流程运行时 + 可见 React UI | `npm run test:flow-runtime`、`npm run test:react-workbench-ui` | 规则永不命中、变量模板错误、循环耗尽后继续写入。 |
| 结构化字段条件 | 运行时 + 可见 React UI + COM10/COM11 | `test:flow-runtime`、`test:react-workbench-ui`、`test:device-workbench` | Modbus 寄存器地址/字段类型不可配置，或自定义字节偏移误判。 |
| 报告重放与导出 | 可见 React UI | `npm run test:react-workbench-ui` | 宏/流程版本未保存、报告不可重放或 CSV/HTML 缺失。 |
| 超时/循环保护 | 生产 Electron UI + 无应答 | 同一自动化场景 | 后续写入继续执行、循环越界或失败原因不清晰。 |
| 现有收发/模拟器回归 | 生产回归 | `npm run test:production-simulator` | 既有能力退化。 |

## Checklist

- [x] 审计现有宏、规则、模拟器与日志模型
- [x] 实现共享用例模型和 React Flow 编辑器
- [x] 实现带 ID/版本宏引用、规则库、单用例执行器、断言与报告/重放
- [x] 添加生产前端与虚拟串口映射验证
- [x] 写入 evidence.md
- [x] L2 阶段独立只读审核（conditionally-approved；P1=0、P2=1，保持活动，不得归档）

## Explicit not-run / blocked

- 真实设备用例执行：未获设备、连接参数和安全报文授权。
